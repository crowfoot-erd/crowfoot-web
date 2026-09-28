/**
 * S-14 알림 페이지 테스트 (storyboard 02-user 본문 Section 9 → 08-core/11-notification.md §5)
 *
 * given: /core/notifications 응답을 MSW로 정의(fixtures.notifications)
 * when: /community/notifications 진입·행 클릭·페이징·구 경로(/notifications) 접근
 * then: 표 렌더(유형 문구·문서 링크)·읽음 PATCH 후 문서 이동·빈 상태·다음 페이지 호출·
 *       구 경로 치환(쿼리 보존) — v1.25 커뮤니티 메뉴 이전
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fixtures, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { NotificationsPage } from '@/pages/notifications'
import { AppRoutes } from '@/routes/app-routes'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderPage(route = '/community/notifications') {
  asAuthenticated() // 회원전용 — Bearer가 실려야 200
  return renderWithProviders(
    <>
      <Route path="/community/notifications" element={<NotificationsPage />} />
      <Route path="/workspaces/:workspaceId/models/:modelId" element={<LocationDisplay />} />
    </>,
    { route },
  )
}

describe('S-14 알림', () => {
  it('renders notifications with type phrases, document links and the total count', async () => {
    renderPage()

    expect(await screen.findByText('총 3개')).toBeVisible()
    expect(screen.getByText('오너님이 내 댓글에 답했습니다')).toBeVisible()
    expect(screen.getByText('지나가던 DBA님이 주문 서비스 ERD에 댓글을 남겼습니다')).toBeVisible()
    expect(screen.getByText('marco님이 crowfoot-erd을 좋아합니다')).toBeVisible()
    expect(screen.getAllByRole('link', { name: '주문 서비스 ERD' })).toHaveLength(2) // 두 행이 같은 문서를 가리킨다
    screen.getAllByRole('link', { name: '주문 서비스 ERD' }).forEach((link) =>
      expect(link).toHaveAttribute('href', '/workspaces/4/models/501'),
    )
    expect(screen.getByRole('link', { name: 'crowfoot-erd' })).toHaveAttribute(
      'href',
      '/workspaces/4/models/318',
    )
    // 유형 배지 3종 — 행 클릭과 구분되는 표기
    expect(screen.getAllByText('댓글')).toHaveLength(1)
    expect(screen.getAllByText('좋아요')).toHaveLength(1)
    expect(screen.getAllByText('답글')).toHaveLength(1)
    // 모두 읽음 — 안읽음이 있을 때만 노출
    expect(screen.getByRole('button', { name: '모두 읽음' })).toBeEnabled()
  })

  it('marks the row read and navigates to the document on row click', async () => {
    const calls: string[] = []
    server.use(
      http.patch('/api/v1/core/notifications/:id/read', ({ params }) => {
        calls.push(String(params.id))
        return HttpResponse.json(ok({}))
      }),
    )
    renderPage()

    await userEvent.click(await screen.findByText('marco님이 crowfoot-erd을 좋아합니다'))

    await waitFor(() => expect(calls).toEqual(['61']))
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/workspaces/4/models/318'),
    )
  })

  it('moves to the next page via the offset pager — URL ?page=로 정착', async () => {
    const requested: number[] = []
    server.use(
      http.get('/api/v1/core/notifications', ({ request }) => {
        const params = new URL(request.url).searchParams
        requested.push(Number(params.get('page') ?? '1'))
        const page = Number(params.get('page') ?? '1') || 1
        const size = Number(params.get('size') ?? '20') || 20
        const all = fixtures.notifications.responses
        return HttpResponse.json(
          ok({
            page,
            size,
            totalPages: 2,
            totalCount: all.length + size, // 2페이지 확보를 위한 가상 총수
            responses: page === 1 ? all : all.slice(0, 1), // 2페이지에도 행이 있어야 페이저가 살아 있다
          }),
        )
      }),
    )
    renderPage()

    const next = await screen.findByRole('button', { name: '다음' })
    await userEvent.click(next)

    // then: 2페이지 조회가 나가고 페이징 표시가 2페이지로 정착한다
    await waitFor(() => expect(requested).toContain(2))
    await waitFor(() => expect(screen.getByText('2 / 2 페이지')).toBeVisible())
  })

  it('shows the empty state when no notifications exist — 모두 읽음도 숨김', async () => {
    server.use(
      http.get('/api/v1/core/notifications', () =>
        HttpResponse.json(ok({ responses: [], totalCount: 0, page: 1, size: 20, totalPages: 1 })),
      ),
    )
    renderPage()

    expect(await screen.findByText('새 알림이 없습니다')).toBeVisible()
    expect(screen.queryByRole('button', { name: '모두 읽음' })).not.toBeInTheDocument()
  })

  it('구 경로 /notifications는 /community/notifications로 치환 — 커뮤니티 사이드바와 함께', async () => {
    asAuthenticated()
    renderWithProviders(<AppRoutes />, { route: '/notifications', wrapRoutes: false })

    // then: 리다이렉트 후 목록이 렌더되고 좌측 커뮤니티 메뉴에 알림 항목이 있다
    expect(await screen.findByText('총 3개')).toBeVisible()
    expect(screen.getByRole('link', { name: '알림' })).toHaveAttribute(
      'href',
      '/community/notifications',
    )
  })

  it('구 경로 치환은 쿼리(?page=)도 보존한다', async () => {
    asAuthenticated()
    renderWithProviders(<AppRoutes />, { route: '/notifications?page=2', wrapRoutes: false })

    // then: fixtures는 1페이지분(3건)뿐 — ?page=2가 넘어왔다면 빈 페이지가 나온다
    expect(await screen.findByText('새 알림이 없습니다')).toBeVisible()
    expect(screen.queryByText('총 3개')).not.toBeInTheDocument()
  })
})
