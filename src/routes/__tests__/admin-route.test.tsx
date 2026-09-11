/**
 * 관리자 가드 테스트 (frontend-testing.md B7 — storyboard 03-admin §2)
 *
 * 비관리자의 /admin/* 직접 접근은 리다이렉트가 아닌 **404 렌더** —
 * 관리자 기능의 존재 자체를 숨긴다 (§4.2 존재 은닉).
 */
import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { server } from '@/api/mocks/server'
import { AdminRoute } from '@/routes/admin-route'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

const meFixture = (admin: boolean) => ({
  userId: '2',
  email: 'bootstrap@example.com',
  name: '부트스트랩 관리자',
  providers: ['github'],
  admin,
  createdAt: '2026-01-02T00:00:00Z',
})

function renderAdminArea() {
  return renderWithProviders(
    <Route element={<AdminRoute />}>
      <Route path="/admin/users" element={<div>사용자 관리 화면</div>} />
    </Route>,
    { route: '/admin/users' },
  )
}

describe('관리자 가드', () => {
  it('renders the admin screen for an admin user', async () => {
    // given: 인증된 관리자
    asAuthenticated()
    server.use(
      http.get('/api/v1/core/accounts/me', () =>
        HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
          response: meFixture(true),
        }),
      ),
    )

    renderAdminArea()

    // then
    expect(await screen.findByText('사용자 관리 화면')).toBeVisible()
  })

  it('renders 404 (not a redirect) when the user is not an admin', async () => {
    // given: 인증된 일반 사용자
    asAuthenticated()
    server.use(
      http.get('/api/v1/core/accounts/me', () =>
        HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
          response: meFixture(false),
        }),
      ),
    )

    renderAdminArea()

    // then: 관리자 화면이 아니라 404 문구 — 관리자 메뉴가 존재함을 드러내지 않는다
    expect((await screen.findAllByText('페이지를 찾을 수 없습니다')).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('사용자 관리 화면')).not.toBeInTheDocument()
    // 브라우저 주소창은 그대로 /admin/users — 리다이렉트 아님
    expect(window.location.pathname).not.toBe('/login')
  })
})
