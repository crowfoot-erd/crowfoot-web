/**
 * S-03 워크스페이스 진입 테스트 (storyboard 02-user §2)
 *
 * given: me/workspaces 응답을 MSW로 정의
 * when: /workspaces 진입
 * then: 마지막으로 선택한 워크스페이스(없으면 목록 첫 항목) 상세로 이동, 없으면 빈 상태(생성 CTA)를 렌더한다
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { fail, fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { WorkspacesPage } from '@/pages/workspaces'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function DetailProbe() {
  const { workspaceId } = useParams()
  return <div>WS DETAIL {workspaceId}</div>
}

function renderWorkspaces() {
  return renderWithProviders(
    <>
      <Route path="/workspaces" element={<WorkspacesPage />} />
      <Route path="/workspaces/:workspaceId" element={<DetailProbe />} />
    </>,
    { route: '/workspaces' },
  )
}

describe('워크스페이스 진입', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('redirects to the last selected workspace when remembered', async () => {
    window.localStorage.setItem('crowfoot.lastWorkspaceId', '102')

    renderWorkspaces()

    // then: 기억된 102(결제팀 공용) 상세로 이동
    expect(await screen.findByText('WS DETAIL 102')).toBeVisible()
  })

  it('falls back to the first workspace when nothing is remembered', async () => {
    renderWorkspaces()

    // then: 목록 첫 항목(101 개인 ERD) 상세로 이동
    expect(await screen.findByText('WS DETAIL 101')).toBeVisible()
    expect(screen.queryByText('WS DETAIL 102')).not.toBeInTheDocument()
  })

  it('falls back to the first workspace when the remembered one is gone', async () => {
    // 기억된 999는 목록에 없음(삭제됨) → 첫 항목으로 폴백
    window.localStorage.setItem('crowfoot.lastWorkspaceId', '999')

    renderWorkspaces()

    // then
    expect(await screen.findByText('WS DETAIL 101')).toBeVisible()
  })

  it('shows the empty state with create CTA when no workspaces', async () => {
    server.use(
      http.get('/api/v1/core/accounts/me/workspaces', () =>
        HttpResponse.json(ok({ page: 1, size: 20, totalPages: 0, totalCount: 0, responses: [] })),
      ),
    )

    renderWorkspaces()

    // then: 빈 문구 + 생성 버튼
    expect(await screen.findByText('워크스페이스가 없습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: /새 워크스페이스/ })).toBeVisible()
  })

  it('shows the error state with retry on failure', async () => {
    server.use(
      http.get('/api/v1/core/accounts/me/workspaces', () => fail('SERVICE_UNAVAILABLE', 503)),
    )

    renderWorkspaces()

    // then: 에러 문구 + 재시도 버튼
    const retry = await screen.findByRole('button', { name: /다시 시도/ })
    expect(retry).toBeVisible()

    // when: 재시도 — 복구하면 첫 항목 상세로 이동
    server.use(http.get('/api/v1/core/accounts/me/workspaces', () => HttpResponse.json(ok(fixtures.myWorkspaces))))
    await userEvent.click(retry)

    // then
    expect(await screen.findByText('WS DETAIL 101')).toBeVisible()
  })
})
