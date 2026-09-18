/**
 * 대시보드 커뮤니티 최근글 위젯 테스트 (08-core/08-community.md)
 *
 * given: /core/community/posts/recent 응답을 MSW로 정의(fixtures.recentCommunityPosts)
 * when: /dashboard 진입
 * then: 두 게시판 통합 최신글 노출(배지 구분)·빈 상태·에러 상태
 */
import { screen, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { server } from '@/api/mocks/server'
import { DashboardPage } from '@/pages/dashboard'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderDashboard() {
  return renderWithProviders(<Route path="/dashboard" element={<DashboardPage />} />, {
    route: '/dashboard',
  })
}

describe('대시보드 최근글 위젯', () => {
  it('renders the merged recent posts with board badges', async () => {
    renderDashboard()

    // then: 최근글 4건(릴리스 노트+제안 및 신고 혼합, 최신순) + 전체 보기 링크
    const section = await screen.findByTestId('dashboard-recent-posts')
    expect(section).toBeVisible()
    expect(await screen.findByText('v1.4.0 — 커뮤니티 게시판')).toBeVisible()
    expect(screen.getByText('ERD 내보내기 포맷 제안')).toBeVisible()
    expect(screen.getByText('편집기 버그 신고')).toBeVisible()
    expect(screen.getByText('v1.3.0 — 관리형 데이터베이스')).toBeVisible()
    expect(screen.getAllByText('릴리스 노트').length).toBeGreaterThanOrEqual(2)
    expect(within(section).getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/community')
  })

  it('shows the empty state when there are no posts', async () => {
    server.use(
      http.get('/api/v1/core/community/posts/recent', () =>
        HttpResponse.json(ok({ responses: [], totalCount: 0 })),
      ),
    )
    renderDashboard()

    // then: 빈 문구 — 다른 섹션은 정상
    expect(await screen.findByText('아직 게시글이 없습니다.')).toBeVisible()
    expect(screen.getByText('최근 게시글')).toBeVisible()
  })

  it('shows the error state with retry when the widget request fails', async () => {
    server.use(
      http.get('/api/v1/core/community/posts/recent', () =>
        HttpResponse.json({ status: 500 }),
      ),
    )
    renderDashboard()

    // then: 위젯 영역만 에러 — 요약 카드는 정상 렌더
    const section = await screen.findByTestId('dashboard-recent-posts')
    expect(section).toBeVisible()
    expect(await screen.findByRole('button', { name: /다시 시도/ })).toBeVisible()
  })
})
