/**
 * 팀 사이드바 테스트 — /teams/*에서 워크스페이스 트리 대신 소유/소속 분리 리스트
 *
 * given: /core/teams 응답을 MSW로 정의 (isOwner true 1건 + false 1건)
 * when: 사이드바 렌더
 * then: "내가 소유한 팀"·"소속 팀" 두 섹션으로 분리되고 각 팀 링크가 상세로 향한다
 */
import { screen } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { TeamSidebar } from '@/layouts/components/team-sidebar'
import { renderWithProviders } from '@/test/test-app'

describe('팀 사이드바', () => {
  it('separates teams I own from teams I belong to', async () => {
    renderWithProviders(<Route path="/teams" element={<TeamSidebar />} />, { route: '/teams' })

    // then: fixtures — 결제 플랫폼팀(isOwner true)·검색 인프라팀(false)
    expect(await screen.findByText('결제 플랫폼팀')).toBeVisible()
    expect(screen.getByText('검색 인프라팀')).toBeVisible()
    expect(screen.getByText('내가 소유한 팀')).toBeVisible()
    expect(screen.getByText('소속 팀')).toBeVisible()
    expect(screen.getByRole('link', { name: /결제 플랫폼팀/ })).toHaveAttribute('href', '/teams/201')
    expect(screen.getByRole('link', { name: /검색 인프라팀/ })).toHaveAttribute('href', '/teams/202')
  })
})
