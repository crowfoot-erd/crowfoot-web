/**
 * 도메인 타입 — 패널·컬럼에 적용·다르게 쓰기·전파 알림 (05-editor/01-core.md §11.1, 05-editor/02-ui.md §16)
 *
 * 서버 응답은 MSW로 정한다(08-core/16-domain-type.md). 문서는 스토어에 직접 심는다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Model } from '@/api/types'
import { fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import type { DomainType } from '@/features/domain-types/api'
import { EditorShell } from '@/features/editor'
import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent, serializeContent } from '@/features/editor/model/content-io'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

const HEADER = { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }
const LIST = '/api/v1/core/workspaces/101/domain-types'

const email = (overrides: Partial<DomainType> = {}): DomainType => ({
  domainTypeId: '11',
  workspaceId: '101',
  name: '이메일',
  dataType: 'VARCHAR',
  length: 191,
  precision: null,
  scale: null,
  nullable: false,
  defaultValue: null,
  description: '로그인에 쓰는 주소',
  version: 1,
  updatedAt: '2026-10-02T00:00:00Z',
  ...overrides,
})

/** 서버의 도메인 타입 목록 — 테스트가 고쳐 쓰면 다음 조회에 반영된다 */
let serverList: DomainType[] = []
const requests: { method: string; body: Record<string, unknown> }[] = []

beforeEach(() => {
  asAuthenticated()
  serverList = [email()]
  requests.length = 0
  server.use(
    http.get(LIST, () => HttpResponse.json({ header: HEADER, responses: serverList, totalCount: serverList.length })),
    http.post(LIST, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      requests.push({ method: 'POST', body })
      const created = { ...email(), ...body, domainTypeId: '12', version: 1 } as DomainType
      serverList = [...serverList, created]
      return HttpResponse.json({ header: HEADER, response: created }, { status: 201 })
    }),
    http.put(`${LIST}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      requests.push({ method: 'PUT', body })
      const current = serverList.find((item) => item.domainTypeId === params.id)
      if (!current || body.baseVersion !== current.version) {
        return HttpResponse.json(
          { header: { isSuccessful: false, resultCode: 'VERSION_CONFLICT', resultMessage: '다른 클라이언트가 먼저 저장했습니다' } },
          { status: 409 },
        )
      }
      const updated = { ...current, ...body, version: current.version + 1 } as DomainType
      serverList = serverList.map((item) => (item.domainTypeId === params.id ? updated : item))
      return HttpResponse.json({ header: HEADER, response: updated })
    }),
    http.delete(`${LIST}/:id`, ({ params }) => {
      requests.push({ method: 'DELETE', body: { id: params.id } })
      serverList = serverList.filter((item) => item.domainTypeId !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )
})

afterEach(() => {
  resetEditorStore()
  resetSessionState()
})

async function renderEditor(canEdit = true) {
  window.localStorage.setItem('crowfoot.editor.explorer-open', 'false')
  const base = fixtures.models.responses[0] as unknown as Model
  renderWithProviders(<EditorShell model={{ ...base, content: serializeContent(emptyContent()) }} canEdit={canEdit} />, {
    wrapRoutes: false,
  })
  await waitFor(() => expect(useEditorStore.getState().modelId).toBe('501'))
}

/** users(id PK, email, backup_email) — linked를 주면 그 컬럼들이 도메인 타입 11을 쓴다 */
function seedUsers(linked: { email?: { version: number; overrides?: string[]; length?: number }; backup?: { version: number } } = {}) {
  const table = createTable('users', { id: 't-users' })
  const link = (version: number, overrides: string[] = []) => ({ id: '11', name: '이메일', version, overrides })
  useEditorStore.getState().commitAll([
    { type: 'table/create', table, position: { x: 0, y: 0 } },
    { type: 'column/add', tableId: 't-users', column: createColumn({ id: 'c-id', physicalName: 'id', dataType: 'BIGINT', nullable: false }) },
    {
      type: 'column/add',
      tableId: 't-users',
      column: createColumn({
        id: 'c-email',
        physicalName: 'email',
        ...(linked.email
          ? { dataType: 'VARCHAR', length: linked.email.length ?? 191, nullable: false, domain: link(linked.email.version, linked.email.overrides) }
          : { dataType: 'TEXT' }),
      }),
    },
    {
      type: 'column/add',
      tableId: 't-users',
      column: createColumn({
        id: 'c-backup',
        physicalName: 'backup_email',
        ...(linked.backup ? { dataType: 'VARCHAR', length: 191, nullable: false, domain: link(linked.backup.version) } : { dataType: 'TEXT' }),
      }),
    },
  ])
}

const column = (id: string) => useEditorStore.getState().present.model.tables[0].columns.find((c) => c.id === id)!

async function openPanel() {
  const trigger = screen.getByRole('button', { name: '도구' })
  fireEvent.pointerDown(trigger, { button: 0 })
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole('menuitem', { name: '도메인 타입' }))
  return screen.findByRole('dialog')
}

describe('도메인 타입 패널', () => {
  it('목록에 타입 표기와 이 문서의 사용 컬럼 수를 보여 준다 — 새로 만들면 서버에 보낸다', async () => {
    await renderEditor()
    seedUsers({ email: { version: 1 }, backup: { version: 1 } })
    const dialog = await openPanel()

    const row = (await within(dialog).findByText('이메일')).closest('tr') as HTMLElement
    expect(within(row).getByText('VARCHAR(191)')).toBeVisible()
    expect(within(row).getByText('로그인에 쓰는 주소')).toBeVisible()
    expect(within(row).getByText('2')).toBeVisible()

    fireEvent.click(within(dialog).getByRole('button', { name: '추가' }))
    fireEvent.change(within(dialog).getByLabelText('이름'), { target: { value: '금액' } })
    fireEvent.change(within(dialog).getByLabelText('타입'), { target: { value: 'DECIMAL' } })
    fireEvent.change(within(dialog).getByLabelText('정밀도'), { target: { value: '15' } })
    fireEvent.change(within(dialog).getByLabelText('스케일'), { target: { value: '2' } })
    fireEvent.click(within(dialog).getByLabelText('NULL 허용'))
    fireEvent.change(within(dialog).getByLabelText('기본값'), { target: { value: '0' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toEqual({
      method: 'POST',
      body: { name: '금액', dataType: 'DECIMAL', length: null, precision: 15, scale: 2, nullable: false, defaultValue: '0', description: null },
    })
    expect(await within(dialog).findByText('금액')).toBeVisible()
  })

  it('고치면 이 문서에서 쓰는 컬럼에 대한 전파 미리보기가 바로 뜬다 — 전파하면 값이 바뀌고 Undo 한 번으로 돌아온다', async () => {
    await renderEditor()
    seedUsers({ email: { version: 1 }, backup: { version: 1 } })
    const dialog = await openPanel()

    fireEvent.click(await within(dialog).findByRole('button', { name: '이메일 수정' }))
    fireEvent.change(within(dialog).getByLabelText('길이'), { target: { value: '255' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].body).toMatchObject({ length: 255, baseVersion: 1 })
    const preview = await screen.findByRole('dialog', { name: '도메인 타입 변경을 컬럼에 반영할까요?' })
    expect(within(preview).getByLabelText('users.email')).toBeChecked()
    expect(within(preview).getAllByText('길이: 191 → 255')).toHaveLength(2)

    fireEvent.click(within(preview).getByRole('button', { name: '선택한 컬럼 2개에 전파' }))
    expect(column('c-email')).toMatchObject({ length: 255, domain: { version: 2, overrides: [] } })
    expect(column('c-backup').length).toBe(255)

    useEditorStore.getState().undo()
    expect(column('c-email')).toMatchObject({ length: 191, domain: { version: 1 } })
  })

  it('그 사이 다른 사람이 고쳤으면 알리고 목록을 다시 읽는다', async () => {
    await renderEditor()
    const dialog = await openPanel()
    fireEvent.click(await within(dialog).findByRole('button', { name: '이메일 수정' }))
    // 다른 사람이 먼저 고쳤다
    serverList = [email({ version: 2, length: 320 })]
    fireEvent.change(within(dialog).getByLabelText('길이'), { target: { value: '255' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(await within(dialog).findByText('VARCHAR(320)')).toBeVisible()
    expect(within(dialog).queryByLabelText('길이')).not.toBeInTheDocument()
  })

  it('지울 때 이 문서의 사용 컬럼 수를 알린다', async () => {
    await renderEditor()
    seedUsers({ email: { version: 1 } })
    const dialog = await openPanel()

    fireEvent.click(await within(dialog).findByRole('button', { name: '이메일 삭제' }))
    const confirm = await screen.findByRole('dialog', { name: '"이메일"을 지울까요?' })
    expect(within(confirm).getByText(/이 문서의 컬럼 1개가 쓰고 있습니다/)).toBeVisible()
    fireEvent.click(within(confirm).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(requests).toEqual([{ method: 'DELETE', body: { id: '11' } }]))
    expect(await within(dialog).findByText('아직 도메인 타입이 없습니다')).toBeVisible()
    // 컬럼의 값과 연결은 그대로다(끊긴 연결로 보인다)
    expect(column('c-email')).toMatchObject({ length: 191, domain: { id: '11' } })
  })

  it('읽기 전용은 목록만 본다', async () => {
    await renderEditor(false)
    const dialog = await openPanel()

    expect(await within(dialog).findByText('이메일')).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: '추가' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '이메일 수정' })).not.toBeInTheDocument()
  })
})

describe('컬럼에서 도메인 타입 쓰기', () => {
  async function openColumn(name: string) {
    fireEvent.doubleClick(await screen.findByLabelText(`컬럼 물리명 — ${name}`))
    await screen.findByText('컬럼 정보')
    return screen.findByLabelText('도메인 타입')
  }

  it('고르면 타입·길이·NULL 허용이 채워지고, 저장하면 연결이 기록되고 노드에 배지가 붙는다', async () => {
    await renderEditor()
    seedUsers()
    const select = await openColumn('email')

    fireEvent.change(select, { target: { value: '11' } })
    expect(screen.getByLabelText('길이')).toHaveValue(191)
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() =>
      expect(column('c-email')).toMatchObject({
        dataType: 'VARCHAR',
        length: 191,
        nullable: false,
        domain: { id: '11', name: '이메일', version: 1, overrides: [] },
      }),
    )
    expect(await screen.findByTitle('도메인 타입: 이메일')).toHaveTextContent('D')
  })

  it('값을 다르게 고치면 "도메인 타입과 다름"을 알리고 overrides에 적는다 — 되돌리기는 도메인 타입 값으로 채운다', async () => {
    await renderEditor()
    seedUsers({ email: { version: 1 } })
    await openColumn('email')

    fireEvent.change(screen.getByLabelText('길이'), { target: { value: '320' } })
    expect(screen.getByTestId('domain-differs')).toHaveTextContent('도메인 타입과 다름: 길이')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(column('c-email')).toMatchObject({ length: 320, domain: { overrides: ['length'] } }))
    expect(await screen.findByTitle('도메인 타입: 이메일 (일부 속성을 다르게 씀)')).toHaveTextContent('D*')

    await openColumn('email')
    fireEvent.click(screen.getByRole('button', { name: '도메인 타입 값으로 되돌리기' }))
    expect(screen.getByLabelText('길이')).toHaveValue(191)
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(column('c-email')).toMatchObject({ length: 191, domain: { overrides: [] } }))
  })

  it('"쓰지 않음"을 고르면 연결만 풀고 값은 그대로다', async () => {
    await renderEditor()
    seedUsers({ email: { version: 1 } })
    const select = await openColumn('email')

    fireEvent.change(select, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(column('c-email').domain).toBeNull())
    expect(column('c-email')).toMatchObject({ dataType: 'VARCHAR', length: 191 })
  })

  it('목록에 없는 도메인 타입은 끊긴 연결로 보인다 — 그대로 저장하면 연결을 건드리지 않는다', async () => {
    serverList = []
    await renderEditor()
    seedUsers({ email: { version: 1 } })
    const select = await openColumn('email')

    expect(select).toHaveValue('11')
    expect(screen.getByRole('option', { name: '연결 끊김: 이메일' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByText('컬럼 정보')).not.toBeInTheDocument())
    expect(column('c-email').domain).toEqual({ id: '11', name: '이메일', version: 1, overrides: [] })
  })
})

describe('사전 용어로 컬럼 채우기 (v1.30 — 08-core/01-workspace.md §4.6)', () => {
  const TERMS = '/api/v1/core/workspaces/101/terms'
  const term = (name: string, label: string, extra: Record<string, unknown> = {}) => ({
    termId: name, workspaceId: '101', term: name, label, types: null, domainTypeId: null, updatedAt: '2026-10-02T00:00:00Z', ...extra,
  })
  beforeEach(() => {
    server.use(
      http.get(TERMS, () =>
        HttpResponse.json({
          header: HEADER,
          responses: [
            term('user', '회원'),
            term('email', '이메일'),
            term('user_email', '회원 이메일', { domainTypeId: '11', types: { postgresql: 'TEXT' } }),
          ],
          totalCount: 3,
        }),
      ),
    )
  })

  it('도메인 타입을 가리키는 용어를 고르면 이름을 채우고 도메인 타입을 연결한 채 적용한다 — types는 쓰지 않는다', async () => {
    await renderEditor()
    seedUsers()
    // 캔버스가 도메인 타입 목록을 읽어 둔 뒤에 고른다(제안은 캐시에서 읽는다)
    const input = await screen.findByLabelText('컬럼 물리명 — backup_email')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'user_e' } })
    const listbox = await screen.findByRole('listbox', { name: '워크스페이스 사전 제안' })
    // 용어 항목에는 타입 표기가 아니라 도메인 타입 이름이 붙는다
    const termOption = (await within(listbox).findByText('user_email')).closest('li') as HTMLElement
    await waitFor(() => expect(within(termOption).getByText('이메일')).toBeVisible())
    expect(within(termOption).queryByText('TEXT')).not.toBeInTheDocument()

    fireEvent.click(termOption)

    await waitFor(() =>
      expect(column('c-backup')).toMatchObject({
        physicalName: 'user_email',
        logicalName: '회원 이메일',
        dataType: 'VARCHAR',
        length: 191,
        nullable: false,
        domain: { id: '11', name: '이메일', version: 1, overrides: [] },
      }),
    )
    // 한 번의 되돌리기로 이름과 타입이 함께 돌아온다
    useEditorStore.getState().undo()
    expect(column('c-backup')).toMatchObject({ physicalName: 'backup_email', dataType: 'TEXT' })
    expect(column('c-backup').domain ?? null).toBeNull()
  })

  it('단어를 고르면 조각만 완성하고, 확정하면 추론한 논리명이 채워진다 — 타입은 그대로다', async () => {
    await renderEditor()
    seedUsers()
    const input = await screen.findByLabelText('컬럼 물리명 — backup_email')
    fireEvent.focus(input)
    await screen.findByRole('listbox', { name: '워크스페이스 사전 제안' })

    fireEvent.change(input, { target: { value: 'user_em' } })
    const listbox = await screen.findByRole('listbox', { name: '워크스페이스 사전 제안' })
    expect(within(listbox).getByTestId('term-preview')).toHaveTextContent('회원 em')
    // 단어 묶음의 email을 고른다(용어 user_email이 아니라)
    const options = within(listbox).getAllByRole('option')
    fireEvent.click(options[options.length - 1])
    expect(input).toHaveValue('user_email')
    fireEvent.blur(input)

    await waitFor(() => expect(column('c-backup').physicalName).toBe('user_email'))
    expect(column('c-backup')).toMatchObject({ logicalName: '회원 이메일', dataType: 'TEXT' })
    expect(column('c-backup').domain ?? null).toBeNull()
  })
})

describe('전파 알림', () => {
  it('맞춘 뒤에 도메인 타입이 바뀐 컬럼이 있으면 띠가 뜬다 — 일부만 골라 전파한다', async () => {
    serverList = [email({ version: 2, length: 255 })]
    await renderEditor()
    seedUsers({ email: { version: 1 }, backup: { version: 1 } })

    const banner = await screen.findByText('도메인 타입이 바뀌었습니다. 컬럼 2개')
    fireEvent.click(within(banner.parentElement as HTMLElement).getByRole('button', { name: '확인하기' }))
    const preview = await screen.findByRole('dialog', { name: '도메인 타입 변경을 컬럼에 반영할까요?' })
    fireEvent.click(within(preview).getByLabelText('users.email'))
    fireEvent.click(within(preview).getByRole('button', { name: '선택한 컬럼 1개에 전파' }))

    // 고른 컬럼은 바뀌고, 고르지 않은 컬럼은 값을 두고 "다르게 씀"이 된다 — 둘 다 다시 묻지 않는다
    expect(column('c-backup')).toMatchObject({ length: 255, domain: { version: 2, overrides: [] } })
    expect(column('c-email')).toMatchObject({ length: 191, domain: { version: 2, overrides: ['length'] } })
    await waitFor(() => expect(screen.queryByText(/도메인 타입이 바뀌었습니다/)).not.toBeInTheDocument())
  })

  it('"전파하지 않음"은 값을 그대로 두고 다시 묻지 않는다 — 다르게 쓰는 속성은 건너뜀으로 보인다', async () => {
    serverList = [email({ version: 2, length: 255, defaultValue: "''" })]
    await renderEditor()
    seedUsers({ email: { version: 1, overrides: ['length'], length: 320 } })

    fireEvent.click(await screen.findByRole('button', { name: '확인하기' }))
    const preview = await screen.findByRole('dialog', { name: '도메인 타입 변경을 컬럼에 반영할까요?' })
    expect(within(preview).getByText('길이: 320 → 255 (다르게 쓰는 속성 — 건너뜀)')).toBeVisible()
    expect(within(preview).getByText("기본값: 없음 → ''")).toBeVisible()
    fireEvent.click(within(preview).getByRole('button', { name: '전파하지 않음' }))

    expect(column('c-email')).toMatchObject({ length: 320, defaultValue: null, domain: { version: 2, overrides: ['length', 'defaultValue'] } })
    await waitFor(() => expect(screen.queryByText(/도메인 타입이 바뀌었습니다/)).not.toBeInTheDocument())
  })

  it('편집 권한이 없으면 띠가 뜨지 않는다', async () => {
    serverList = [email({ version: 2, length: 255 })]
    await renderEditor(false)
    seedUsers({ email: { version: 1 } })

    await screen.findByLabelText('컬럼 물리명 — email')
    expect(screen.queryByText(/도메인 타입이 바뀌었습니다/)).not.toBeInTheDocument()
  })
})
