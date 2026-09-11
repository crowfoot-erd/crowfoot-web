/**
 * S-06 워크스페이스 멤버 탭 테스트 (frontend-testing.md B6)
 *
 * Owner/비Owner 노출 차이 — 변경 액션(추가 버튼·행 메뉴)은 Owner만,
 * 비Owner는 읽기 전용 표. OWNER 부여 행에는 메뉴 대신 안내 문구.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '@/api/mocks/server'
import { MembersTab } from '@/features/workspaces/components/members-tab'
import { renderWithProviders } from '@/test/test-app'

const membershipsFixture = {
  totalCount: 3,
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
      granteeType: 'USER',
      role: 'EDITOR',
      grantedBy: { userId: '2', name: '부트스트랩 관리자' },
      grantedAt: '2026-01-05T00:00:00Z',
      user: { userId: '9', email: 'nine@example.com', name: '아홉' },
      team: null,
    },
    {
      membershipId: '3',
      granteeType: 'TEAM',
      role: 'VIEWER',
      grantedBy: { userId: '2', name: '부트스트랩 관리자' },
      grantedAt: '2026-01-06T00:00:00Z',
      user: null,
      team: { teamId: '201', name: '결제 플랫폼팀', memberCount: 2 },
    },
  ],
}

function mockMemberships() {
  server.use(
    http.get('/api/v1/core/workspaces/101/memberships', () =>
      HttpResponse.json({
        header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
        ...membershipsFixture,
      }),
    ),
  )
}

function renderMembersTab(isOwner: boolean) {
  return renderWithProviders(
    <MembersTab workspaceId="101" workspaceName="개인 ERD" isOwner={isOwner} />,
    { wrapRoutes: false },
  )
}

describe('워크스페이스 멤버 탭', () => {
  it('shows management actions for the Owner — add button, role menu, revoke', async () => {
    mockMemberships()

    // given: Owner
    renderMembersTab(true)

    // then: 멤버 추가 버튼 + 행 3건 (OWNER 행 제외 2건에 작업 메뉴)
    expect(await screen.findByRole('button', { name: /멤버 추가/ })).toBeVisible()
    // OWNER 행 이름 + grantedBy 2건 = 최소 3회 등장
    expect((await screen.findAllByText('부트스트랩 관리자')).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('아홉')).toBeVisible()
    expect(screen.getAllByRole('button', { name: '작업' })).toHaveLength(2)

    // when: EDITOR 행 메뉴 열기
    await userEvent.click(screen.getAllByRole('button', { name: '작업' })[0])

    // then: 역할 3종(OWNER 제외) + 회수
    expect(await screen.findByRole('menu')).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'EDITOR' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'COMMENTER' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'VIEWER' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'OWNER' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '회수' })).toBeInTheDocument()

    // OWNER 부여 행은 안내 문구
    expect(screen.getByText('소유자(OWNER)는 변경·회수할 수 없습니다.')).toBeInTheDocument()
  })

  it('renders read-only for non-Owners — no add button, no row menus', async () => {
    mockMemberships()

    // given: 비Owner (EDITOR)
    renderMembersTab(false)

    // then: 표는 렌더되지만 변경 액션 없음
    expect((await screen.findAllByText('부트스트랩 관리자')).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('아홉')).toBeVisible()
    expect(screen.queryByRole('button', { name: /멤버 추가/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '작업' })).not.toBeInTheDocument()
    // 작업 컬럼 헤더도 없음
    expect(screen.queryByText('작업')).not.toBeInTheDocument()
  })

  it('links TEAM grantee rows to the team detail', async () => {
    mockMemberships()
    renderMembersTab(false)

    // then: 팀 행은 팀 상세 링크
    const teamLink = await screen.findByRole('link', { name: /결제 플랫폼팀/ })
    expect(teamLink).toHaveAttribute('href', '/teams/201')
  })
})
