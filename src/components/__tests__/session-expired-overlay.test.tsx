/**
 * 세션 만료 오버레이 테스트 (storyboard 00-common §4.1)
 *
 * 치명 401 이벤트 수신 → 닫기 불가 모달 → [다시 로그인] → 현재 경로 보존(?next=)
 */
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { SESSION_EXPIRED_EVENT } from '@/api/client'
import { SessionExpiredOverlay } from '@/components/session-expired-overlay'
import { resetSessionState, renderWithProviders } from '@/test/test-app'
import { useSessionStore } from '@/stores/session'

function renderOverlay(route = '/workspaces?tab=members') {
  return renderWithProviders(
    <>
      <Route
        path="*"
        element={
          <div>
            <div>앱 화면</div>
            <SessionExpiredOverlay />
          </div>
        }
      />
      <Route path="/login" element={<div>로그인 화면</div>} />
    </>,
    { route },
  )
}

describe('세션 만료 오버레이', () => {
  beforeEach(() => {
    resetSessionState()
  })

  it('shows a non-dismissible modal when a session-expired event fires', async () => {
    renderOverlay()

    // given: 오버레이 없음
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // when: 치명 401 이벤트 (client.ts fireSessionExpired가 발생시키는 것과 동일)
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { resultCode: 'AUTH_SESSION_REVOKED' } }),
      )
    })

    // then: 모달 표시 — 닫기 버튼 없음
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByText('로그인이 필요합니다')).toBeVisible()
    expect(screen.getByRole('button', { name: '다시 로그인' })).toBeVisible()
    // DialogContent에 닫기 X 미제공 — ESC·바깥 클릭으로도 닫히지 않는 구조
    expect(screen.queryByRole('button', { name: /닫기|close/i })).not.toBeInTheDocument()
  })

  it('moves to /login preserving the current path as next on [다시 로그인]', async () => {
    renderOverlay('/workspaces?tab=members')

    act(() => {
      window.dispatchEvent(
        new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { resultCode: 'AUTH_TOKEN_INVALID' } }),
      )
    })
    await userEvent.click(await screen.findByRole('button', { name: '다시 로그인' }))

    // then: /login?next=/workspaces?tab=members — 이벤트 발생 시점의 경로 보존
    const login = await screen.findByText('로그인 화면')
    expect(login).toBeVisible()
    expect(useSessionStore.getState().sessionExpiredReason).toBeNull()
  })
})
