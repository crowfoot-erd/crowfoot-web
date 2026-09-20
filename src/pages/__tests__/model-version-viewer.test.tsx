/**
 * 버전 기록 뷰어 테스트 (08-core/02-model.md §1.11) — storyboard 02-user
 *
 * given: /core/workspaces/101/models/501/history/{version} 상세 응답을 MSW로 정의
 * when: 라우트로 직접 진입 (101 = OWNER → 복원 가능)
 * then: 헤더(v{N}·메모·작성자)·읽기 전용 캔버스·복원(ConfirmDialog → 새 버전 → 문서로
 * 이동)·404 안내. 현재 버전(v3)은 복원 버튼이 없다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route } from 'react-router-dom'

import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { ModelVersionViewerPage } from '@/pages/model-version-viewer'
import { ModelViewerPage } from '@/pages/model-viewer'
import { resetEditorStore } from '@/features/editor/store/editor-store'
import { renderWithProviders } from '@/test/test-app'

// 복원 성공·실패 토스트 발화 자체가 검증 대상 — 렌더러는 목으로 대체한다
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

afterEach(() => {
  resetEditorStore()
  window.localStorage.clear() // 임시 저장 키가 새면 다음 수화가 복원해 버린다
  vi.restoreAllMocks()
  toastMock.success.mockClear()
  toastMock.error.mockClear()
})

function renderViewer(version: number | string) {
  return renderWithProviders(
    <>
      <Route path="/workspaces/:workspaceId/models/:modelId/history/:version" element={<ModelVersionViewerPage />} />
      <Route path="/workspaces/:workspaceId/models/:modelId" element={<ModelViewerPage />} />
    </>,
    { route: `/workspaces/101/models/501/history/${version}` },
  )
}

describe('버전 기록 뷰어', () => {
  it('해당 시점 스냅샷을 읽기 전용으로 연다 — 헤더에 v1·메모·작성자', async () => {
    renderViewer(1)

    // 헤더 — 문서명·v1(현재 아님)·DB 종류·작성자·버전 메모 (fixtures 501 v1)
    expect(await screen.findByRole('heading', { name: '주문 서비스 ERD' })).toBeVisible()
    expect(screen.getByText('v1')).toBeVisible()
    expect(screen.queryByText('현재')).toBeNull() // 현재는 v3
    expect(screen.getByText(/부트스트랩 관리자/)).toBeVisible()
    expect(screen.getByText('등급 컬럼 추가')).toBeVisible() // v1 메모

    // 읽기 전용 캔버스 — 저장 버튼은 비활성(공개 뷰어 모드 툴바)
    await waitFor(() => expect(screen.getByText('읽기 전용')).toBeVisible())
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  it('현재 버전(v3)은 배지를 붙이고 복원 버튼을 노출하지 않는다', async () => {
    renderViewer(3)

    expect(await screen.findByRole('heading', { name: '주문 서비스 ERD' })).toBeVisible()
    expect(await screen.findByText('현재')).toBeVisible()
    expect(screen.queryByRole('button', { name: '이 버전으로 되돌리기' })).toBeNull()
    expect(screen.getByRole('button', { name: '문서로 돌아가기' })).toBeVisible()
  })

  it('복원 — 확인 다이얼로그 → 새 버전 저장 → 문서로 이동', async () => {
    renderViewer(1)

    fireEvent.click(await screen.findByRole('button', { name: '이 버전으로 되돌리기' }))

    // 확인 다이얼로그 — 복원 대상 버전 안내
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('버전 복원')).toBeVisible()
    expect(within(dialog).getByText(/버전 1의 문서를 새 버전으로 저장합니다/)).toBeVisible()

    fireEvent.click(within(dialog).getByRole('button', { name: '이 버전으로 되돌리기' }))

    // 성공 — 새 버전(v4) 안내 + 문서(에디터)로 이동해 편집 가능 모드로 연다
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('버전 4로 되돌렸습니다'),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeVisible())
  })

  it('복원 충돌(409) — 안내 후 확인 다이얼로그를 닫는다', async () => {
    server.use(
      http.post('/api/v1/core/workspaces/101/models/501/versions/1/restore', () =>
        fail('VERSION_CONFLICT', 409),
      ),
    )
    renderViewer(1)

    fireEvent.click(await screen.findByRole('button', { name: '이 버전으로 되돌리기' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '이 버전으로 되돌리기' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    // 충돌 시 다이얼로그를 닫고 문서에서 최신 상태로 다시 시도하게 한다
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('없는 버전 — 안내 문구와 문서로 돌아가기', async () => {
    renderViewer(99)

    expect(await screen.findByText('버전 기록을 찾을 수 없습니다')).toBeVisible()
    const back = screen.getByRole('link', { name: '문서로 돌아가기' }) as HTMLAnchorElement
    expect(back.getAttribute('href')).toBe('/workspaces/101/models/501')
  })
})
