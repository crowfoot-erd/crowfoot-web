/**
 * 용어 사전 패널 테스트 — 두 탭(표준·시스템)·비표준 검사 온디맨드·타입 필드·재정의 프리필·권한 게이트
 * (용어 사전 패널, 05-editor/02-ui.md)
 *
 * 표준 사전은 MSW 목업(fixtures.terms: member→회원, user→사용자 VARCHAR(50)), 시스템 사전은
 * fixtures.systemTerms(email 이메일/VARCHAR(100), id, user, yn, zipcode — 다국어 labels). 문서는
 * 스토어에 직접 시딩한다. 목업은 픽스처 불변 원칙이라 등록·삭제 후 목록이 원본으로 돌아온다 —
 * 요청 반영은 스파이로, 화면 반영은 폼 프리필·삭제 응답으로 검증한다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { fail, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { TermDictionaryPanel } from '@/features/editor/components/TermDictionaryPanel'
import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

const TERMS_URL = '/api/v1/core/workspaces/101/terms'
const SYSTEM_TERMS_URL = '/api/v1/core/system-terms'

afterEach(() => {
  resetEditorStore()
  resetSessionState()
})

function seedDoc(tables: ReturnType<typeof createTable>[]) {
  const content = emptyContent()
  content.model.tables = tables
  useEditorStore.getState().hydrate({
    modelId: '501',
    baseVersion: 1,
    document: { model: content.model, diagram: content.diagram },
  })
}

function renderPanel({ canEdit = true }: { canEdit?: boolean } = {}) {
  return renderWithProviders(
    <TermDictionaryPanel open workspaceId="101" canEdit={canEdit} />,
    { wrapRoutes: false },
  )
}

/** 물리명 토큰이 모두 병합 사전(표준 member + 시스템 user·id)에 있는 문서 — 비표준 0건 */
function seedCleanDoc() {
  seedDoc([
    createTable('member', { columns: [createColumn({ physicalName: 'user_id' })] }),
  ])
}

const termInput = () => screen.getByPlaceholderText('user_id')
const labelInput = () => screen.getByPlaceholderText('예: 사용자')
const typeInput = () => screen.getByPlaceholderText('예: VARCHAR(100) — 선택')

/** POST upsert 스파이 — 요청 본문을 남기고 정상 응답을 돌려준다 */
function spyUpsert() {
  const posts: Array<{ term: string; label: string; type: string | null }> = []
  server.use(
    http.post(TERMS_URL, async ({ request }) => {
      posts.push((await request.json()) as { term: string; label: string; type: string | null })
      return HttpResponse.json(
        ok({
          response: {
            termId: '499',
            workspaceId: '101',
            term: 'x',
            label: 'x',
            type: null,
            updatedAt: '2026-09-24T00:00:00Z',
          },
        }),
      )
    }),
  )
  return posts
}

describe('TermDictionaryPanel — 표준 사전 탭', () => {
  it('term→label 목록이 나오고 검색(토큰·라벨)으로 좁혀진다', async () => {
    seedCleanDoc()
    renderPanel()

    expect(await screen.findByTestId('term-row-member')).toBeVisible()
    expect(screen.getByTestId('term-row-user')).toBeVisible()

    fireEvent.change(screen.getByTestId('term-standard-search'), { target: { value: '회원' } })
    expect(screen.getByTestId('term-row-member')).toBeVisible()
    expect(screen.queryByTestId('term-row-user')).toBeNull()

    fireEvent.change(screen.getByTestId('term-standard-search'), { target: { value: 'user' } })
    expect(screen.getByTestId('term-row-user')).toBeVisible()
    expect(screen.queryByTestId('term-row-member')).toBeNull()
  })

  it('등록 폼 제출(타입 포함) → upsert POST 후 목록에 반영 요청을 하고 term 입력만 비워진다(연속 등록)', async () => {
    seedCleanDoc()
    const posts = spyUpsert()
    renderPanel()
    await screen.findByTestId('term-row-member')

    fireEvent.change(termInput(), { target: { value: 'ordr' } })
    fireEvent.change(labelInput(), { target: { value: '주문' } })
    fireEvent.change(typeInput(), { target: { value: 'VARCHAR(10)' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() =>
      expect(posts).toEqual([{ term: 'ordr', label: '주문', type: 'VARCHAR(10)' }]),
    )
    // term만 비운다 — 라벨·타입은 같은 계열이 많아 남겨둔다
    await waitFor(() => expect(termInput()).toHaveValue(''))
    expect(labelInput()).toHaveValue('주문')
    expect(typeInput()).toHaveValue('VARCHAR(10)')
  })

  it('타입을 비우고 제출하면 null로 전송된다(선택 값)', async () => {
    seedCleanDoc()
    const posts = spyUpsert()
    renderPanel()
    await screen.findByTestId('term-row-member')

    fireEvent.change(termInput(), { target: { value: 'ordr' } })
    fireEvent.change(labelInput(), { target: { value: '주문' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() =>
      expect(posts).toEqual([{ term: 'ordr', label: '주문', type: null }]),
    )
  })

  it('행 클릭 → 수정 프리필(라벨+타입), 같은 term 재등록으로 덮어쓴다', async () => {
    seedCleanDoc()
    const posts = spyUpsert()
    renderPanel()
    await screen.findByTestId('term-row-user')

    fireEvent.click(screen.getByTestId('term-row-user'))
    expect(termInput()).toHaveValue('user')
    expect(labelInput()).toHaveValue('사용자')
    expect(typeInput()).toHaveValue('VARCHAR(50)') // fixtures.terms의 user 타입

    fireEvent.change(labelInput(), { target: { value: '회원 계정' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() =>
      expect(posts).toEqual([{ term: 'user', label: '회원 계정', type: 'VARCHAR(50)' }]),
    )
  })

  it('삭제 버튼 → DELETE 호출 후 목록을 다시 불러온다', async () => {
    seedCleanDoc()
    const deletes: string[] = []
    server.use(
      http.delete(`${TERMS_URL}/:termId`, ({ params }) => {
        deletes.push(String(params.termId))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderPanel()
    await screen.findByTestId('term-row-member')

    fireEvent.click(screen.getByRole('button', { name: '삭제 — member' }))

    await waitFor(() => expect(deletes).toEqual(['401'])) // fixtures.terms의 member termId
  })

  it('Viewer(canEdit=false)는 목록·검색·비표준 검사만 되고 등록 폼·삭제·대량 등록이 없다', async () => {
    seedCleanDoc()
    renderPanel({ canEdit: false })
    await screen.findByTestId('term-row-member')

    expect(screen.getByTestId('term-standard-search')).toBeVisible()
    expect(screen.getByText('열람 전용 — 등록·수정은 편집 권한이 필요합니다')).toBeVisible()
    expect(screen.queryByPlaceholderText('user_id')).toBeNull()
    expect(screen.queryByRole('button', { name: '등록' })).toBeNull()
    expect(screen.queryByRole('button', { name: '대량 등록' })).toBeNull()
    expect(screen.queryByRole('button', { name: '삭제 — member' })).toBeNull()
  })

  it('사전 조회 실패 시 안내 문구와 빈 목록을 보여준다', async () => {
    seedCleanDoc()
    server.use(
      http.get(TERMS_URL, () => fail('INTERNAL_ERROR', 500)),
    )
    renderPanel()

    expect(await screen.findByTestId('term-standard-error')).toBeVisible()
    expect(screen.getByText('사전을 불러오지 못했습니다')).toBeVisible()
  })
})

describe('TermDictionaryPanel — 시스템 사전 탭', () => {
  async function openSystemTab() {
    await userEvent.click(screen.getByRole('tab', { name: '시스템 사전' }))
    await screen.findByTestId('term-builtin-email')
  }

  it('시스템 사전(서버)이 읽기 전용 목록으로 나오고 검색(토큰·해석 라벨)된다', async () => {
    seedCleanDoc()
    renderPanel()
    await screen.findByTestId('term-row-member')
    await openSystemTab()

    // 다국어 labels를 UI 언어(ko)로 해석해 보여준다
    expect(screen.getByTestId('term-builtin-email').textContent).toContain('이메일')
    expect(screen.queryByTestId('term-row-member')).toBeNull() // 표준 탭 목록은 언마운트

    fireEvent.change(screen.getByTestId('term-system-search'), { target: { value: '이메일' } })
    expect(screen.getByTestId('term-builtin-email')).toBeVisible()
    expect(screen.queryByTestId('term-builtin-user')).toBeNull()
  })

  it('표준 사전에 등록된 토큰(user)은 재정의됨 배지가 붙는다', async () => {
    seedCleanDoc()
    renderPanel()
    await screen.findByTestId('term-row-member')
    await openSystemTab()

    expect(within(screen.getByTestId('term-builtin-user')).getByText('재정의됨')).toBeVisible()
    expect(within(screen.getByTestId('term-builtin-email')).queryByText('재정의됨')).toBeNull()
  })

  it('시스템 사전은 열람 전용이다 — 수정 진입(재정의 프리필) 버튼이 없다', async () => {
    seedCleanDoc()
    renderPanel()
    await screen.findByTestId('term-row-member')
    await openSystemTab()

    expect(screen.queryByTestId('term-redefine-email')).toBeNull()
    expect(screen.queryByRole('button', { name: /재정의/ })).toBeNull()
    // 시스템탭에는 쓰기 버튼이 전혀 없다(검색 입력만 있다)
    expect(screen.getByTestId('term-system-search')).toBeVisible()
  })

  it('시스템 사전 조회 실패 시 안내 문구를 보여준다', async () => {
    seedCleanDoc()
    server.use(
      http.get(SYSTEM_TERMS_URL, () => fail('INTERNAL_ERROR', 500)),
    )
    renderPanel()
    await userEvent.click(screen.getByRole('tab', { name: '시스템 사전' }))

    expect(await screen.findByTestId('term-system-error')).toBeVisible()
    expect(screen.getByText('시스템 사전을 불러오지 못했습니다')).toBeVisible()
  })
})

describe('TermDictionaryPanel — 비표준 단어 섹션(요청 시 검사)', () => {
  /** member(표준 등록) 테이블에 usr_email 컬럼 — usr만 병합 사전에 없다(email은 시스템 등록) */
  function seedLintDoc() {
    seedDoc([
      createTable('member', {
        columns: [
          createColumn({ physicalName: 'user_id' }),
          createColumn({ physicalName: 'usr_email' }),
        ],
      }),
    ])
  }

  it('초기에는 검사 결과가 없다 — [비표준 검사] 버튼을 누를 때만 렌더된다', async () => {
    seedLintDoc()
    renderPanel()
    await screen.findByTestId('term-row-member')

    // 빈 목록 시작 — 섹션은 요청 전에 렌더되지 않는다
    expect(screen.queryByTestId('term-lint-section')).toBeNull()
    expect(screen.queryByTestId('term-lint-usr')).toBeNull()

    fireEvent.click(screen.getByTestId('term-lint-toggle'))
    expect(await screen.findByTestId('term-lint-usr')).toBeVisible()

    // 다시 누르면 접는다(문서·사전이 바뀌어도 상시 재계산하지 않는다)
    fireEvent.click(screen.getByTestId('term-lint-toggle'))
    expect(screen.queryByTestId('term-lint-section')).toBeNull()
  })

  it('문서 토큰(usr)이 출처(테이블.컬럼)와 함께 나오고 표준 등록이 폼을 프리필한다', async () => {
    seedLintDoc()
    renderPanel()
    await screen.findByTestId('term-row-member')
    fireEvent.click(screen.getByTestId('term-lint-toggle'))
    const finding = await screen.findByTestId('term-lint-usr')

    expect(finding.textContent).toContain('member.usr_email')
    expect(finding.textContent).toContain('1곳')
    expect(screen.getByText('비표준 단어 (1)')).toBeVisible()

    fireEvent.click(screen.getByTestId('term-lint-register-usr'))
    await waitFor(() => expect(termInput()).toHaveValue('usr'))
    expect(labelInput()).toHaveValue('') // 라벨은 사용자가 채운다
    expect(typeInput()).toHaveValue('')
  })

  it('문서 토큰이 모두 사전에 있으면 비표준 없음 문구를 보여준다', async () => {
    seedCleanDoc()
    renderPanel()
    await screen.findByTestId('term-row-member')
    fireEvent.click(screen.getByTestId('term-lint-toggle'))

    expect(
      await screen.findByText('비표준 단어가 없습니다 — 문서의 물리명 토큰이 사전에 모두 등록되어 있습니다'),
    ).toBeVisible()
  })
})
