/**
 * DB 동기화 다이얼로그 — 비교(MSW 왕복)·차분 목록·빈 결과·적용(스토어 반영·보존)·되돌리기 1회 복구
 * (05-editor/04-dbms-engineering.md §3.3)
 *
 * 문서 측 상태는 fixtures.sync.documentContent(사용자 편집 상태 — 강조색·메모·전용 컬럼)로
 * 수화하고, 스키마 조회는 MSW 기본 핸들러(fixtures.sync.syncSchema — DB 드리프트)를 쓴다.
 * 적용은 서버 저장이 아니라 commitAll(되돌리기 1회)이므로 스토어 주장으로 검증한다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'

import { fail, fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { SyncDialog } from '@/features/editor/components/SyncDialog'
import { parseContent } from '@/features/editor/model/content-io'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { renderWithProviders } from '@/test/test-app'

// 적용 토스트 발화 자체가 검증 대상 — 렌더러는 목으로 대체한다
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

afterEach(() => {
  resetEditorStore()
  window.localStorage.clear() // 임시 저장 키가 새면 다음 수화가 복원해 버린다
  vi.restoreAllMocks()
  toastMock.success.mockClear()
  toastMock.warning.mockClear()
})

/** 문서 측(사용자 편집 상태)으로 스토어를 수화한다 */
function seedDocument(content: string): void {
  const parsed = parseContent(content)
  useEditorStore.getState().hydrate({
    modelId: '501',
    baseVersion: 3,
    document: { model: parsed.model, diagram: parsed.diagram },
  })
}

function renderDialog() {
  return renderWithProviders(
    <SyncDialog
      open
      onOpenChange={vi.fn()}
      workspaceId="101"
      modelName="주문 서비스 ERD"
      sourceConnectionId="301"
    />,
    { wrapRoutes: false },
  )
}

/** 커넥션 목록(301) 로드까지 기다린 뒤 비교를 누른다 — 그 전에는 비교 버튼이 비활성이다 */
async function compare(): Promise<void> {
  await screen.findByText('app@db.dev.example.com:5432/orders')
  fireEvent.click(screen.getByTestId('sync-compare'))
}

describe('SyncDialog — 비교', () => {
  it('원천 커넥션 요약을 표시하고 비교하면 차분 목록을 그룹으로 보여준다', async () => {
    seedDocument(fixtures.sync.documentContent)
    renderDialog()

    // 원천 커넥션(301 개발 PG) 요약 — 목록 로드 후
    expect(await screen.findByText('app@db.dev.example.com:5432/orders')).toBeVisible()

    await compare()

    const counts = await screen.findByTestId('sync-counts')
    expect(counts).toHaveTextContent('추가 2 · 변경 4 · 삭제 1')

    const list = screen.getByTestId('sync-diff-list')
    // 테이블 그룹 — products(신규)·users·orders (products는 그룹 헤더+항목 이름에 겹친다)
    expect(within(list).getAllByText('products').length).toBeGreaterThan(0)
    for (const table of ['users', 'orders']) {
      expect(within(list).getByText(table)).toBeVisible()
    }
    // 대표 항목 — 문서 전용 컬럼 삭제·DB 신규 컬럼·정밀도 변경·FK onDelete 변경·신규 테이블
    expect(within(list).getByText('grade')).toBeVisible()
    expect(within(list).getByText('memo')).toBeVisible()
    expect(within(list).getByText('email')).toBeVisible()
    expect(within(list).getByText('fk_orders_users')).toBeVisible()
    expect(within(list).getAllByText('테이블 추가')).toHaveLength(1)
  })

  it('문서가 DB와 일치하면 변경 사항 없음을 안내한다', async () => {
    seedDocument(fixtures.sync.syncSchema.content) // DB 상태 그대로 수화
    renderDialog()

    await compare()

    expect(await screen.findByTestId('sync-no-changes')).toBeVisible()
    expect(screen.queryByTestId('sync-apply')).not.toBeInTheDocument()
  })

  it('스키마 조회 실패 — 오류 안내를 표시한다', async () => {
    seedDocument(fixtures.sync.documentContent)
    server.use(
      http.post('/api/v1/core/workspaces/101/connections/301/schema', () =>
        fail('CONNECTION_UNREACHABLE', 502),
      ),
    )
    renderDialog()

    await compare()

    expect(await screen.findByText('스키마 조회에 실패했습니다')).toBeVisible()
  })

  it('건너뛴 객체가 있으면 경고 토스트를 띄운다', async () => {
    seedDocument(fixtures.sync.documentContent)
    server.use(
      http.post('/api/v1/core/workspaces/101/connections/301/schema', () =>
        HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
          response: { ...fixtures.sync.syncSchema, skipped: ['weird_view'] },
        }),
      ),
    )
    renderDialog()

    await compare()

    await screen.findByTestId('sync-diff-list')
    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(
        expect.stringContaining('weird_view'),
      ),
    )
  })
})

describe('SyncDialog — 적용', () => {
  it('commitAll로 반영한다 — 문서 전용 속성은 보존, 되돌리기 1회로 복구', async () => {
    seedDocument(fixtures.sync.documentContent)
    const before = useEditorStore.getState().present
    renderDialog()

    await compare()
    fireEvent.click(await screen.findByTestId('sync-apply'))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    const state = useEditorStore.getState()
    expect(state.past).toHaveLength(1) // 묶음 커밋 — 되돌리기 1회

    // DB 반영 — 컬럼 삭제·추가·패치, 신규 테이블, FK onDelete
    const users = state.present.model.tables.find((t) => t.physicalName === 'users')
    const orders = state.present.model.tables.find((t) => t.physicalName === 'orders')
    const products = state.present.model.tables.find((t) => t.physicalName === 'products')
    expect(users?.columns.map((c) => c.physicalName)).not.toContain('grade')
    expect(users?.columns.find((c) => c.physicalName === 'email')?.length).toBe(320)
    expect(orders?.columns.find((c) => c.physicalName === 'memo')?.length).toBe(200)
    expect(orders?.columns.find((c) => c.physicalName === 'amount')?.precision).toBe(12)
    expect(orders?.columns.find((c) => c.physicalName === 'status')?.defaultValue).toBe('CREATED')
    expect(products).toBeDefined()
    const rel = state.present.model.relationships.find((r) => r.fkName === 'fk_orders_users')
    expect(rel?.onDelete).toBe('CASCADE')

    // 문서 전용 속성 보존 — 강조색·메모·논리명·코멘트성 컬럼 속성
    expect(state.present.diagram.nodes[users!.id]?.color).toBe('violet')
    expect(users?.logicalName).toBe('사용자')
    expect(users?.columns.find((c) => c.physicalName === 'email')?.logicalName).toBe('이메일')
    const note = state.present.diagram.notes[0]
    expect(note?.text).toBe('회원 등급은 문서에서만 관리')
    expect(note?.linkedTableId).toBe(users!.id)

    // 되돌리기 1회 — 적용 전 문서로 그대로 복구
    useEditorStore.getState().undo()
    const restored = useEditorStore.getState().present
    expect(restored).toEqual(before)
  })
})
