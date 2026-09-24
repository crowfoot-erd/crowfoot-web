/**
 * 용어 사전 패널 테스트 — 두 탭(표준·시스템)·비표준 검증 출처·재정의 프리필·권한 게이트
 * (용어 사전 패널, 05-editor/02-ui.md)
 *
 * 표준 사전은 MSW 목업(fixtures.terms: member→회원, user→사용자). 문서는 스토어에 직접
 * 시딩한다. 목업은 픽스처 불변 원칙이라 등록·삭제 후 목록이 원본(2건)으로 돌아온다 —
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

/** 물리명 토큰이 모두 사전에 있는 문서 — 비표준 0건 */
function seedCleanDoc() {
  seedDoc([
    createTable('order', { columns: [createColumn({ physicalName: 'user_id' })] }),
  ])
}

const termInput = () => screen.getByPlaceholderText('user_id')
const labelInput = () => screen.getByPlaceholderText('예: 사용자')

/** POST upsert 스파이 — 요청 본문을 남기고 정상 응답을 돌려준다 */
function spyUpsert() {
  const posts: Array<{ term: string; label: string }> = []
  server.use(
    http.post(TERMS_URL, async ({ request }) => {
      posts.push((await request.json()) as { term: string; label: string })
      return HttpResponse.json(
        ok({
          response: { termId: '499', workspaceId: '101', term: 'x', label: 'x', updatedAt: '2026-09-24T00:00:00Z' },
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

  it('등록 폼 제출 → upsert POST 후 목록에 반영 요청을 하고 term 입력만 비워진다(연속 등록)', async () => {
    seedCleanDoc()
    const posts = spyUpsert()
    renderPanel()
    await screen.findByTestId('term-row-member')

    fireEvent.change(termInput(), { target: { value: 'ordr' } })
    fireEvent.change(labelInput(), { target: { value: '주문' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() => expect(posts).toEqual([{ term: 'ordr', label: '주문' }]))
    // term만 비운다 — 라벨은 같은 계열이 많아 남겨둔다
    await waitFor(() => expect(termInput()).toHaveValue(''))
    expect(labelInput()).toHaveValue('주문')
  })

  it('행 클릭 → 수정 프리필, 같은 term 재등록으로 라벨을 바꾼다', async () => {
    seedCleanDoc()
    const posts = spyUpsert()
    renderPanel()
    await screen.findByTestId('term-row-user')

    fireEvent.click(screen.getByTestId('term-row-user'))
    expect(termInput()).toHaveValue('user')
    expect(labelInput()).toHaveValue('사용자')

    fireEvent.change(labelInput(), { target: { value: '회원 계정' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() => expect(posts).toEqual([{ term: 'user', label: '회원 계정' }]))
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

  it('Viewer(canEdit=false)는 목록·검색만 되고 등록 폼·삭제·대량 등록이 없다', async () => {
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
    await screen.findByTestId('term-builtin-order')
  }

  it('BUILTIN_TERMS가 읽기 전용 목록으로 나오고 검색된다', async () => {
    seedCleanDoc()
    renderPanel()
    await screen.findByTestId('term-row-member')
    await openSystemTab()

    expect(screen.getByTestId('term-builtin-order').textContent).toContain('주문')
    expect(screen.queryByTestId('term-row-member')).toBeNull() // 표준 탭 목록은 언마운트

    fireEvent.change(screen.getByTestId('term-system-search'), { target: { value: '주문' } })
    expect(screen.getByTestId('term-builtin-order')).toBeVisible()
    expect(screen.queryByTestId('term-builtin-user')).toBeNull()
  })

  it('표준 사전에 등록된 토큰(member·user)은 재정의됨 배지가 붙는다', async () => {
    seedCleanDoc()
    renderPanel()
    await screen.findByTestId('term-row-member')
    await openSystemTab()

    expect(within(screen.getByTestId('term-builtin-member')).getByText('재정의됨')).toBeVisible()
    expect(within(screen.getByTestId('term-builtin-user')).getByText('재정의됨')).toBeVisible()
    expect(within(screen.getByTestId('term-builtin-order')).queryByText('재정의됨')).toBeNull()
  })

  it('표준으로 재정의 → 표준 탭으로 전환되고 폼이 {term,label}로 프리필된다', async () => {
    seedCleanDoc()
    renderPanel()
    await screen.findByTestId('term-row-member')
    await openSystemTab()

    fireEvent.click(screen.getByTestId('term-redefine-order'))

    // 탭 전환 + 프리필 — 즉시 등록이 아니라 폼 프리필이다
    await waitFor(() => {
      expect(termInput()).toHaveValue('order')
      expect(labelInput()).toHaveValue('주문')
    })
    expect(screen.getByRole('tab', { name: '표준 사전' }).getAttribute('data-state')).toBe('active')
  })
})

describe('TermDictionaryPanel — 비표준 단어 섹션', () => {
  /** member(사전 등록) 테이블에 usr_nm 컬럼 — usr만 사전에 없다 */
  function seedLintDoc() {
    seedDoc([
      createTable('member', {
        columns: [
          createColumn({ physicalName: 'user_id' }),
          createColumn({ physicalName: 'usr_nm' }),
        ],
      }),
    ])
  }

  it('문서 토큰(usr)이 출처(테이블.컬럼)와 함께 나오고 표준 등록이 폼을 프리필한다', async () => {
    seedLintDoc()
    renderPanel()
    const finding = await screen.findByTestId('term-lint-usr')

    expect(finding.textContent).toContain('member.usr_nm')
    expect(finding.textContent).toContain('1곳')
    expect(screen.getByText('비표준 단어 (1)')).toBeVisible()

    fireEvent.click(screen.getByTestId('term-lint-register-usr'))
    await waitFor(() => expect(termInput()).toHaveValue('usr'))
    expect(labelInput()).toHaveValue('') // 라벨은 사용자가 채운다
  })

  it('문서 토큰이 모두 사전에 있으면 비표준 없음 문구를 보여준다', async () => {
    seedCleanDoc()
    renderPanel()

    expect(
      await screen.findByText('비표준 단어가 없습니다 — 문서의 물리명 토큰이 사전에 모두 등록되어 있습니다'),
    ).toBeVisible()
  })
})
