/**
 * 버전 기록 다이얼로그 테스트 (08-core/02-model.md §1.11)
 *
 * MSW fixtures.versions(501 v0~v3)로 목록 순서·현재 배지·메모/자동 요약 렌더(특수형 포함)·
 * 인라인 메모 편집(PATCH 왕복)·페이징·빈 목록을 검증한다. 저장(PUT)이 버전 기록에
 * 스냅샷을 append 하는 연속 시나리오는 MSW 실제 핸들러에 PUT을 날린 뒤 목록을 연다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'

import { fail, fixtures, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { VersionHistoryDialog } from '@/features/editor/components/VersionHistoryDialog'
import { parseContent } from '@/features/editor/model/content-io'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { renderWithProviders } from '@/test/test-app'

// 메모 저장 토스트 발화 자체가 검증 대상 — 렌더러는 목으로 대체한다
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

afterEach(() => {
  resetEditorStore()
  vi.restoreAllMocks()
  toastMock.success.mockClear()
})

/** 편집기 세션 수화 — 다이얼로그의 현재 버전 배지는 스토어 baseVersion을 본다 */
function seedSession(): void {
  const parsed = parseContent(fixtures.sync.documentContent)
  useEditorStore.getState().hydrate({
    modelId: '501',
    baseVersion: 3,
    document: { model: parsed.model, diagram: parsed.diagram },
  })
}

function renderDialog(canEdit = true) {
  return renderWithProviders(
    <VersionHistoryDialog
      open
      onOpenChange={vi.fn()}
      workspaceId="101"
      modelId="501"
      modelName="주문 서비스 ERD"
      canEdit={canEdit}
    />,
    { wrapRoutes: false },
  )
}

/** 목록이 그려질 때까지 기다린 뒤 ul을 반환한다 */
async function openList() {
  return await screen.findByTestId('version-history-list')
}

/** 버전 행(li)들 — 요약 항목의 중첩 li는 제외하고 ul의 직계 자식만 */
function rowsOf(list: HTMLElement): HTMLElement[] {
  return Array.from(list.children) as HTMLElement[]
}

describe('VersionHistoryDialog — 목록 렌더', () => {
  it('최신순(v3→v0)으로 행을 내놓고 현재 버전(v3)에 배지를 붙인다', async () => {
    seedSession()
    renderDialog()

    const list = await openList()
    const rows = rowsOf(list)
    expect(rows.map((row) => row.dataset.version)).toEqual(['3', '2', '1', '0'])

    // 현재 배지는 v3 행에만 — 세션(baseVersion 3) 기준
    expect(within(rows[0]).getByText('현재')).toBeVisible()
    expect(within(rows[1]).queryByText('현재')).toBeNull()
  })

  it('자동 변경 요약을 형태별로 렌더한다 — 복원·레이아웃·구조 diff·리버스 생성', async () => {
    seedSession()
    renderDialog()

    const list = await openList()
    const [v3, v2, v1, v0] = rowsOf(list)

    // v3 — 복원 특수형
    expect(within(v3).getByText('버전 1에서 복원')).toBeVisible()
    // v2 — 레이아웃 전용
    expect(within(v2).getByText('레이아웃 변경만 있음')).toBeVisible()
    // v1 — 메모 우선 + 구조 diff 개수 요약·항목(users.grade 컬럼 추가)
    expect(within(v1).getByText('등급 컬럼 추가')).toBeVisible()
    expect(within(v1).getByText('추가 2 · 변경 0 · 삭제 0 · 이동 0')).toBeVisible()
    expect(within(v1).getByText('users.grade')).toBeVisible()
    // v0 — 리버스 생성 특수형
    expect(within(v0).getByText('DB 가져오기로 생성 — 테이블 2개 · 관계 1개')).toBeVisible()
  })

  it('SQL Import 태생 v0는 source:sql 요약을 "SQL 가져오기로 생성"으로 렌더한다 (§1.12)', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/versions', () =>
        HttpResponse.json(
          ok({
            page: 1,
            size: 20,
            totalPages: 1,
            totalCount: 1,
            responses: [
              {
                version: 0,
                changeSummary: '{"created":true,"source":"sql","tables":3,"relationships":1}',
                memo: null,
                createdBy: { userId: '2', name: '부트스트랩 관리자' },
                createdAt: '2026-09-17T00:00:00Z',
              },
            ],
          }),
        ),
      ),
    )
    renderDialog()

    const list = await openList()
    const rows = rowsOf(list)
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('SQL 가져오기로 생성 — 테이블 3개 · 관계 1개')).toBeVisible()
  })

  it('행마다 작성자·일시과 버전 뷰어 조회 링크를 노출한다', async () => {
    seedSession()
    renderDialog()

    const list = await openList()
    const [v3, v2] = rowsOf(list)
    expect(within(v3).getByText(/부트스트랩 관리자/)).toBeVisible()
    expect(within(v2).getByText(/kim/)).toBeVisible()

    const link = within(v2).getByRole('link', { name: /조회/ }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/workspaces/101/models/501/history/2')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('비교 링크 — 직전 버전을 기준으로 비교 모드로 연다. v0는 링크가 없다', async () => {
    seedSession()
    renderDialog()

    const list = await openList()
    const [v3, v2, v1, v0] = rowsOf(list)

    const compareV2 = within(v2).getByRole('link', { name: /비교/ }) as HTMLAnchorElement
    expect(compareV2.getAttribute('href')).toBe('/workspaces/101/models/501/history/2?compare=1')
    expect(within(v3).getByRole('link', { name: /비교/ }).getAttribute('href')).toBe(
      '/workspaces/101/models/501/history/3?compare=2',
    )
    expect(within(v1).getByRole('link', { name: /비교/ }).getAttribute('href')).toBe(
      '/workspaces/101/models/501/history/1?compare=0',
    )
    // v0는 직전 버전이 없다 — 비교 링크 없음
    expect(within(v0).queryByRole('link', { name: /비교/ })).toBeNull()
  })

  it('버전 기록이 없으면 빈 안내를 보여준다', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/versions', () =>
        HttpResponse.json(ok({ page: 1, size: 20, totalPages: 1, totalCount: 0, responses: [] })),
      ),
    )
    renderDialog()

    expect(await screen.findByText('저장 기록이 없습니다')).toBeVisible()
    expect(screen.queryByTestId('version-history-list')).toBeNull()
  })

  it('목록 조회 실패 — 안내 문구와 결과 코드를 표시한다', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/versions', () =>
        fail('INTERNAL_SERVER_ERROR', 500),
      ),
    )
    renderDialog()

    expect(await screen.findByText('버전 기록을 불러오지 못했습니다')).toBeVisible()
  })
})

describe('VersionHistoryDialog — 메모 편집', () => {
  it('인라인 편집 → PATCH → 목록 갱신 — 빈 문자열은 삭제(null)', async () => {
    seedSession()
    renderDialog()

    const list = await openList()
    // v3은 메모 없음 — 편집으로 메모를 단다
    const v3 = rowsOf(list)[0]
    fireEvent.click(within(v3).getByRole('button', { name: '메모 편집' }))

    const textarea = within(v3).getByLabelText('메모 편집')
    fireEvent.change(textarea, { target: { value: '출시 직전 상태' } })
    fireEvent.click(within(v3).getByRole('button', { name: '메모 저장' }))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('메모를 저장했습니다'))
    // 무효화 → 재조회된 목록에 새 메모가 보인다
    const refreshed = rowsOf(await openList())[0]
    expect(within(refreshed).getByText('출시 직전 상태')).toBeVisible()
  })

  it('메모를 비우고 저장하면 삭제된다(null) — 요약만 남는다', async () => {
    seedSession()
    renderDialog()

    const list = await openList()
    // v1은 메모('등급 컬럼 추가')가 있다 — 비워서 삭제
    const v1 = rowsOf(list)[2]
    fireEvent.click(within(v1).getByRole('button', { name: '메모 편집' }))

    const textarea = within(v1).getByLabelText('메모 편집')
    fireEvent.change(textarea, { target: { value: '' } })
    fireEvent.click(within(v1).getByRole('button', { name: '메모 저장' }))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    const refreshed = rowsOf(await openList())[2]
    expect(within(refreshed).queryByText('등급 컬럼 추가')).toBeNull()
    // 요약은 그대로 — v1의 구조 diff 항목
    expect(within(refreshed).getByText('users.grade')).toBeVisible()
  })

  it('canEdit=false(뷰어)면 메모 편집 버튼이 없다 — 조회만 가능', async () => {
    seedSession()
    renderDialog(false)

    const list = await openList()
    expect(screen.queryByRole('button', { name: '메모 편집' })).toBeNull()
    expect(within(list).getAllByRole('link', { name: /조회/ })).toHaveLength(4)
  })
})

describe('VersionHistoryDialog — 페이징·저장 연동', () => {
  it('totalPages > 1이면 이전/다음으로 페이지를 넘긴다', async () => {
    seedSession()
    // 1페이지 v1·2페이지 v0 — 픽스처를 2페이지로 쪼개 응답한다
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/versions', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page')) || 1
        const row = (version: number) => fixtures.versions['501'].find((e) => e.version === version)!
        return HttpResponse.json(
          ok({
            page,
            size: 3,
            totalPages: 2,
            totalCount: 4,
            responses: page === 1 ? [row(1)] : [row(0)],
          }),
        )
      }),
    )
    renderDialog()

    const first = await openList()
    expect(rowsOf(first).map((row) => row.dataset.version)).toEqual(['1'])
    expect(screen.getByText('1 / 2 페이지')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    // 페이지 전환은 새 쿼리 키 — 로딩을 거쳐 ul이 재마운트된다(이전 참조 무효)
    await waitFor(() =>
      expect(rowsOf(screen.getByTestId('version-history-list')).map((row) => row.dataset.version)).toEqual(['0']),
    )
    // 2페이지에서 이전 비활성 아님 → 되돌아간다
    expect(screen.getByRole('button', { name: '이전' })).toBeEnabled()
  })

  it('저장(PUT) 성공이 버전 기록에 스냅샷을 append 한다 — 다이얼로그를 다시 열면 v4가 최상단', async () => {
    seedSession()
    // MSW 실제 PUT 핸들러(§1.5) — 성공 시 version 진행 + changeSummary 스냅샷 append
    const put = await fetch('/api/v1/core/workspaces/101/models/501/content', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseVersion: 3,
        content: fixtures.sync.documentContent,
        changeSummary: JSON.stringify({
          items: [{ kind: 'table', action: 'add', table: 'coupons', name: 'coupons', detail: 'columns 0' }],
          layoutOnly: false,
          truncated: false,
        }),
      }),
    })
    expect(put.status).toBe(200)

    renderDialog()
    const list = await openList()
    const rows = rowsOf(list)
    expect(rows.map((row) => row.dataset.version)).toEqual(['4', '3', '2', '1', '0'])
    // 저장 시점 요약이 새 행에 그대로 붙는다 — 항목 렌더는 "테이블.이름"
    expect(within(rows[0]).getByText('coupons.coupons')).toBeVisible()
    expect(within(rows[0]).getByText('추가 1 · 변경 0 · 삭제 0 · 이동 0')).toBeVisible()
    // 배지는 세션(baseVersion 3) 기준 — v3 행에 붙고 v4(미갱신)에는 없다
    expect(within(rows[1]).getByText('현재')).toBeVisible()
    expect(within(rows[0]).queryByText('현재')).toBeNull()
  })
})

describe('VersionHistoryDialog — 메모 검색', () => {
  it('검색어(300ms 디바운스)로 메모 부분 일치 필터 — ‘등급’이면 v1만 남는다', async () => {
    seedSession()
    renderDialog()
    await openList()

    fireEvent.change(screen.getByTestId('version-search-input'), { target: { value: '등급' } })

    // 디바운스(300ms) → 새 쿼리 키 조회 → 필터된 목록.
    // 키가 바뀌는 동안 ul이 재마운트되므로 waitFor 안에서 새로 잡는다(이전 참조 무효)
    await waitFor(() =>
      expect(rowsOf(screen.getByTestId('version-history-list')).map((row) => row.dataset.version)).toEqual(['1']),
    )
    expect(within(rowsOf(screen.getByTestId('version-history-list'))[0]).getByText('등급 컬럼 추가')).toBeVisible()
  })

  it('검색어를 비우면 전체 목록으로 되돌아간다', async () => {
    seedSession()
    renderDialog()
    await openList()

    fireEvent.change(screen.getByTestId('version-search-input'), { target: { value: '등급' } })
    await waitFor(() =>
      expect(rowsOf(screen.getByTestId('version-history-list')).map((row) => row.dataset.version)).toEqual(['1']),
    )

    fireEvent.change(screen.getByTestId('version-search-input'), { target: { value: '' } })
    await waitFor(() =>
      expect(
        rowsOf(screen.getByTestId('version-history-list')).map((row) => row.dataset.version),
      ).toEqual(['3', '2', '1', '0']),
    )
  })

  it('검색어가 바뀌면 페이지를 1로 되돌린다', async () => {
    seedSession()
    // 검색 반영 + size 3 강제(4행 → 2페이지) — 페이지 리셋 확인용
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/versions', ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get('page')) || 1
        const keyword = (url.searchParams.get('keyword') ?? '').trim().toLowerCase()
        const row = (version: number) => fixtures.versions['501'].find((e) => e.version === version)!
        const filtered = !keyword
          ? [row(3), row(2), row(1), row(0)]
          : [row(3), row(2), row(1), row(0)].filter((r) => (r.memo ?? '').toLowerCase().includes(keyword))
        return HttpResponse.json(
          ok({
            page,
            size: 3,
            totalPages: Math.max(1, Math.ceil(filtered.length / 3)),
            totalCount: filtered.length,
            responses: filtered.slice((page - 1) * 3, page * 3).map((r) => ({
              version: r.version,
              changeSummary: r.changeSummary,
              memo: r.memo,
              createdBy: r.createdBy,
              createdAt: r.createdAt,
            })),
          }),
        )
      }),
    )
    renderDialog()
    await openList()

    // 2페이지로 이동 → 검색어 입력 → 결과 궤적이 달라져 1페이지로 되돌아간다
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() =>
      expect(rowsOf(screen.getByTestId('version-history-list')).map((row) => row.dataset.version)).toEqual(['0']),
    )

    fireEvent.change(screen.getByTestId('version-search-input'), { target: { value: '등급' } })
    await waitFor(() =>
      expect(rowsOf(screen.getByTestId('version-history-list')).map((row) => row.dataset.version)).toEqual(['1']),
    )
    // 필터 결과가 한 페이지 — 페이징 UI가 사라진 것 자체가 1페이지 귀환 증거
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull()
  })

  it('뷰어(canEdit=false)에서도 검색할 수 있다 — 조회 계열 동작이다', async () => {
    seedSession()
    renderDialog(false)
    await openList()

    fireEvent.change(screen.getByTestId('version-search-input'), { target: { value: '등급' } })

    await waitFor(() =>
      expect(rowsOf(screen.getByTestId('version-history-list')).map((row) => row.dataset.version)).toEqual(['1']),
    )
  })
})
