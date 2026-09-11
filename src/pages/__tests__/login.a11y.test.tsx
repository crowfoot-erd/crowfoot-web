/**
 * 대표 화면 접근성 검사 (frontend-testing.md B4 — jest-axe)
 *
 * 로그인(공개 진입 화면)과 멤버탭(인증 화면) — 명확한 위반 없는지 검증.
 */
import { screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { server } from '@/api/mocks/server'
import { MembersTab } from '@/features/workspaces/components/members-tab'
import { LoginPage } from '@/pages/login'
import { renderWithProviders } from '@/test/test-app'

const membershipsFixture = {
  totalCount: 2,
  responses: [
    {
      membershipId: '1',
      granteeType: 'USER',
      role: 'OWNER',
      grantedBy: null,
      grantedAt: '2026-01-02T00:00:00Z',
      user: { userId: '2', email: 'bootstrap@example.com', name: '부트스트랩 관리자' },
      team: null,
    },
    {
      membershipId: '2',
      granteeType: 'TEAM',
      role: 'VIEWER',
      grantedBy: { userId: '2', name: '부트스트랩 관리자' },
      grantedAt: '2026-01-06T00:00:00Z',
      user: null,
      team: { teamId: '201', name: '결제 플랫폼팀', memberCount: 2 },
    },
  ],
}

describe('접근성 (jest-axe)', () => {
  it('login page has no axe violations', async () => {
    const { container } = renderWithProviders(<Route path="/login" element={<LoginPage />} />, {
      route: '/login',
    })
    await screen.findByRole('button', { name: /GitHub/ })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('members tab has no axe violations', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/memberships', () =>
        HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
          ...membershipsFixture,
        }),
      ),
      // AddMemberDialog(멤버 추가)의 팀 목록 — 다이얼로그가 언마운트돼도 사전 로딩될 수 있다
      http.get('/api/v1/core/teams', () =>
        HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
          totalCount: 0,
          responses: [],
        }),
      ),
    )

    const { container } = renderWithProviders(
      <MembersTab workspaceId="101" workspaceName="개인 ERD" isOwner />,
      { wrapRoutes: false },
    )
    await screen.findByText('결제 플랫폼팀')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
