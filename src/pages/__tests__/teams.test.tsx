/**
 * S-07 팀 진입 테스트 (storyboard 02-user §7)
 *
 * given: /core/teams 응답을 MSW로 정의
 * when: /teams 진입
 * then: 소속 팀이 있으면 첫 팀 상세로 이동, 없으면 빈 상태(생성 CTA)를 렌더한다
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { TeamsPage } from '@/pages/teams'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderTeams() {
  return renderWithProviders(
    <>
      <Route path="/teams" element={<TeamsPage />} />
      <Route path="/teams/:teamId" element={<div>TEAM DETAIL</div>} />
    </>,
    { route: '/teams' },
  )
}

describe('팀 진입', () => {
  it('redirects to the first team detail when teams exist', async () => {
    renderTeams()

    // then: fixtures 첫 팀(201) 상세로 이동 — 목록은 렌더되지 않는다
    expect(await screen.findByText('TEAM DETAIL')).toBeVisible()
    expect(screen.queryByText('소속된 팀이 없습니다')).not.toBeInTheDocument()
  })

  it('shows the empty state with create CTA when no teams', async () => {
    server.use(
      http.get('/api/v1/core/teams', () =>
        HttpResponse.json(ok({ page: 1, size: 20, totalPages: 0, totalCount: 0, responses: [] })),
      ),
    )

    renderTeams()

    // then: 빈 문구 + 생성 버튼
    expect(await screen.findByText('소속된 팀이 없습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: /새 팀 만들기/ })).toBeVisible()
  })

  it('shows the error state with retry on failure', async () => {
    server.use(http.get('/api/v1/core/teams', () => HttpResponse.json({ ...fixtures.teams }, { status: 500 })))

    renderTeams()

    // then: 에러 문구 + 재시도 버튼
    const retry = await screen.findByRole('button', { name: /다시 시도/ })
    expect(retry).toBeVisible()

    // when: 재시도 — 복구하면 리다이렉트
    server.use(http.get('/api/v1/core/teams', () => HttpResponse.json(ok(fixtures.teams))))
    await userEvent.click(retry)

    // then
    expect(await screen.findByText('TEAM DETAIL')).toBeVisible()
  })
})
