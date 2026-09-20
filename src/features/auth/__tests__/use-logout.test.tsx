/**
 * useLogout 라우팅 테스트 (frontend-testing.md B2)
 *
 * given: 인증 세션 + 보호 라우트 가드로 감싼 화면, /(랜딩)·/login 스텁 라우트
 * when: 로그아웃 실행 (MSW 204)
 * then: 로컬 세션 폐기 + 문서 단위 이동으로 /(시작 페이지) — /login이 아니다.
 *       가드(unauthenticated → /login?next=)가 SPA navigate을 가로채는 경쟁이
 *       있어 실제 구현은 window.location.assign('/')를 쓴다(가드를 타지 않는다).
 *       문서 교체 직전 마지막 리렌더에서도 가드가 /login을 그리는 섬광이 남아
 *       beginLogout() 플래그로 가드를 억제한다 — 이 테스트가 그 계약을 lock한다.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLogout } from '@/features/auth'
import { ProtectedRoute } from '@/routes/protected-route'
import { useSessionStore } from '@/stores/session'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

/** window.location 대체 — assign 호출 감지 (풀페이지 이동 검증, login.test.tsx 관례) */
const assign = vi.fn()
const originalLocation = window.location

/** useLogout을 밖으로 노출하는 프로브 — 헤더 사용자 메뉴와 동일한 호출 경로 */
function LogoutProbe() {
  const logout = useLogout()
  return (
    <button type="button" onClick={() => logout.mutate()}>
      로그아웃
    </button>
  )
}

describe('useLogout', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign },
      writable: true,
    })
  })
  afterAll(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  beforeEach(() => {
    resetSessionState()
    asAuthenticated()
    assign.mockClear()
  })

  it('로그아웃하면 로컬 세션을 폐기하고 문서 단위로 시작 페이지(/)로 이동한다', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<LogoutProbe />} />
        </Route>
        <Route path="/" element={<div>landing-stub</div>} />
        <Route path="/login" element={<div>login-stub</div>} />
      </Routes>,
      { route: '/dashboard', wrapRoutes: false },
    )

    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    // 로컬 세션 폐기 + 시작 페이지(랜딩 /)로 문서 이동 — /login이 아니라 가드도 타지 않는다
    expect(useSessionStore.getState().status).toBe('unauthenticated')
    expect(useSessionStore.getState().loggingOut).toBe(true)
    expect(assign).toHaveBeenCalledWith('/')
    expect(assign).not.toHaveBeenCalledWith(expect.stringContaining('/login'))

    // 섬광 방어 — 문서 교체 직전 화면에 /login이 그려지지 않는다 (가드가 null을 렌더)
    expect(screen.queryByText('login-stub')).not.toBeInTheDocument()
  })
})
