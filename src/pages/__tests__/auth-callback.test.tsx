/**
 * S-02 OAuth 콜백 컴포넌트 테스트 (frontend-testing.md B3)
 *
 * mount 1회 자동 교환 — 성공(next 이동·토큰 저장)·실패(문구+다시 로그인)·무효 진입(/login)
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAccessToken, getAccessToken } from '@/api/client'
import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { OAUTH_NEXT_STORAGE_KEY, OAUTH_PROVIDER_STORAGE_KEY } from '@/features/auth'
import { AuthCallbackPage } from '@/pages/auth-callback'
import { resetSessionState, renderWithProviders } from '@/test/test-app'

function renderCallback(route: string) {
  return renderWithProviders(
    <>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/" element={<div>랜딩</div>} />
      <Route path="/dashboard" element={<div>대시보드</div>} />
      <Route path="/login" element={<div>로그인 화면</div>} />
      <Route path="/workspaces" element={<div>워크스페이스 화면</div>} />
    </>,
    { route },
  )
}

describe('OAuth 콜백 화면', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    resetSessionState()
    clearAccessToken()
  })

  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('exchanges the code once and moves to next on success', async () => {
    // given: provider·next가 세션스토리지에 저장돼 있다 (로그인 시작 시)
    window.sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, 'github')
    window.sessionStorage.setItem(OAUTH_NEXT_STORAGE_KEY, '/workspaces')

    // when: 인가 코드·state를 받고 마운트
    renderCallback('/auth/callback?code=abc&state=xyz')

    // then: 자동 교환 → 토큰 저장 → next 이동
    expect(await screen.findByText('워크스페이스 화면')).toBeVisible()
    expect(getAccessToken()).toBe('test-access-token')
    // 세션스토리지는 소비 즉시 제거
    expect(window.sessionStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(OAUTH_NEXT_STORAGE_KEY)).toBeNull()
  })

  it('moves to /dashboard as default when next is not stored', async () => {
    window.sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, 'github')

    renderCallback('/auth/callback?code=abc&state=xyz')

    // 기본 행선지는 앱 홈(/dashboard) — 랜딩(/)은 인증 상태에서도 머무르는 페이지가 됐다
    expect(await screen.findByText('대시보드')).toBeVisible()
    expect(screen.queryByText('랜딩')).not.toBeInTheDocument()
  })

  it('shows the failure guidance when the exchange fails', async () => {
    // given: 교환 실패 (게이트웨이 502)
    window.sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, 'github')
    server.use(
      http.post('/api/v1/auth/oauth2/:provider/token', () => fail('AUTH_PROVIDER_ERROR', 502)),
    )

    renderCallback('/auth/callback?code=abc&state=xyz')

    // then: resultCode별 문구 + 다시 로그인
    expect(await screen.findByRole('heading', { name: /로그인에 실패했습니다/ })).toBeVisible()
    expect(screen.getByText(/제공자.*통신에 실패/)).toBeInTheDocument()
    expect(getAccessToken()).toBeNull()

    // when: 다시 로그인
    await userEvent.click(screen.getByRole('link', { name: /다시 로그인/ }))
    expect(await screen.findByText('로그인 화면')).toBeVisible()
  })

  it('shows AUTH_STATE_INVALID when no provider is stored', async () => {
    // given: 세션스토리지가 비었음 (다른 브라우저·직접 URL 진입)
    renderCallback('/auth/callback?code=abc&state=xyz')

    // then
    expect(await screen.findByRole('heading', { name: /로그인에 실패했습니다/ })).toBeVisible()
  })

  it('quietly redirects to /login on invalid entry (no code·state)', async () => {
    // given: 쿼리 파라미터 없이 직접 진입
    window.sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, 'github')

    renderCallback('/auth/callback')

    // then: 조용히 로그인으로
    expect(await screen.findByText('로그인 화면')).toBeVisible()
  })
})
