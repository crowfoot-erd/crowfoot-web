/**
 * 알림 벨 테스트 (storyboard 00-common §3.1 [12] → 08-core/11-notification.md §6)
 *
 * given: /core/notifications·unread-count 응답을 MSW로 정의(fixtures.notifications)
 * when: 벨 렌더·드롭다운 열기·행 클릭·모두 읽음
 * then: 배지(카운트·9+ 캡)·최근 목록 렌더·읽음 PATCH 후 문서 이동·read-all 호출
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fixtures, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { NotificationBell } from '@/layouts/components/notification-bell'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderBell() {
  asAuthenticated() // 회원전용 — Bearer가 실려야 200
  return renderWithProviders(
    <>
      <Route path="/" element={<NotificationBell />} />
      <Route path="/workspaces/:workspaceId/models/:modelId" element={<LocationDisplay />} />
      <Route path="/community/notifications" element={<div>전체 알림 페이지</div>} />
    </>,
    { route: '/' },
  )
}

describe('알림 벨', () => {
  it('shows the unread count badge — 0이면 숨긴다', async () => {
    renderBell()

    expect(await screen.findByTestId('notification-badge')).toHaveTextContent('2') // fixtures 안읽음 2건
  })

  it('caps the badge at 9+ — 카운트가 10을 넘으면 9+로 묶는다', async () => {
    server.use(
      http.get('/api/v1/core/notifications/unread-count', () =>
        HttpResponse.json(ok({ response: 12 })),
      ),
    )
    renderBell()

    expect(await screen.findByTestId('notification-badge')).toHaveTextContent('9+')
  })

  it('opens the dropdown with recent notifications — 유형 문구 3종·모두 읽음·전체 보기', async () => {
    renderBell()

    await userEvent.click(screen.getByRole('button', { name: '알림' }))

    expect(await screen.findByRole('menu')).toBeVisible()
    expect(screen.getByText('오너님이 내 댓글에 답했습니다')).toBeVisible()
    expect(screen.getByText('지나가던 DBA님이 주문 서비스 ERD에 댓글을 남겼습니다')).toBeVisible()
    expect(screen.getByText('marco님이 crowfoot-erd을 좋아합니다')).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '모두 읽음' })).toBeInTheDocument()
    // 전체 보기 행선지 — v1.25 커뮤니티 메뉴 이전(좌측 사이드바와 같은 곳)
    expect(screen.getByRole('menuitem', { name: '전체 보기' })).toHaveAttribute(
      'href',
      '/community/notifications',
    )
  })

  it('marks the notification read and navigates to the document on row click', async () => {
    const calls: string[] = []
    server.use(
      http.patch('/api/v1/core/notifications/:id/read', ({ params }) => {
        calls.push(String(params.id))
        return HttpResponse.json(ok({}))
      }),
    )
    renderBell()

    await userEvent.click(screen.getByRole('button', { name: '알림' }))
    await userEvent.click(await screen.findByText('오너님이 내 댓글에 답했습니다'))

    await waitFor(() => expect(calls).toEqual(['63'])) // 최신 행(id 63) 읽음 처리
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/workspaces/4/models/501'),
    )
  })

  it('calls read-all from the dropdown — 모두 읽음', async () => {
    const calls: string[] = []
    server.use(
      http.post('/api/v1/core/notifications/read-all', () => {
        calls.push('read-all')
        return HttpResponse.json(ok({}))
      }),
    )
    renderBell()

    await userEvent.click(screen.getByRole('button', { name: '알림' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: '모두 읽음' }))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(fixtures.notifications.responses.length).toBeGreaterThan(0) // fixtures 불변 — 슬라이스 원천
  })
})
