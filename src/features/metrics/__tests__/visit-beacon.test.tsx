/**
 * 접속 비콘 송신기 테스트 (08-core/10-metrics.md §3) — 부팅·라우트 변경 트리거,
 * 30초 창 스킵, fetch 폴백(jsdom은 sendBeacon 미구현 — 폴백 경로가 MSW로 검증된다).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { http, HttpResponse } from 'msw'

import { server } from '@/api/mocks/server'
import { resetVisitBeaconStateForTest, sendVisitBeacon } from '../beacon'
import { VisitBeacon } from '../visit-beacon'

let beaconRequests: { path: string; referrer?: string }[] = []

beforeEach(() => {
  beaconRequests = []
  resetVisitBeaconStateForTest()
  server.use(
    http.post('*/api/v1/core/metrics/visit', async ({ request }) => {
      const body = (await request.json()) as { path: string; referrer?: string }
      beaconRequests.push(body)
      return new HttpResponse(null, { status: 204 })
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('sendVisitBeacon', () => {
  it('같은 경로는 30초 창 내 재전송을 스킵한다 — 서버 이중 방어', () => {
    vi.useFakeTimers()

    expect(sendVisitBeacon({ path: '/workspaces' })).toBe(true)
    expect(sendVisitBeacon({ path: '/workspaces' })).toBe(false)

    vi.advanceTimersByTime(31_000)
    expect(sendVisitBeacon({ path: '/workspaces' })).toBe(true)
  })

  it('다른 경로는 창과 무관하게 송신한다', () => {
    expect(sendVisitBeacon({ path: '/workspaces' })).toBe(true)
    expect(sendVisitBeacon({ path: '/workspaces/77' })).toBe(true)
  })

  it('fetch 폴백으로 실제 요청이 나간다 — 경로·리퍼러 본문', async () => {
    sendVisitBeacon({ path: '/terms', referrer: 'https://www.google.com/search?q=erd' })

    await vi.waitFor(() => expect(beaconRequests).toHaveLength(1))
    expect(beaconRequests[0]).toEqual({
      path: '/terms',
      referrer: 'https://www.google.com/search?q=erd',
    })
  })
})

describe('VisitBeacon', () => {
  function Probe() {
    const location = useLocation()
    const navigate = useNavigate()
    return (
      <>
        <VisitBeacon />
        <span data-testid="where">{location.pathname}</span>
        <button type="button" onClick={() => void navigate('/community')}>
          go
        </button>
      </>
    )
  }

  it('마운트(부팅) 1회 + 라우트 변경마다 송신한다', async () => {
    render(
      <MemoryRouter initialEntries={['/workspaces']}>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )

    await vi.waitFor(() => expect(beaconRequests.map((r) => r.path)).toEqual(['/workspaces']))

    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    await vi.waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/community'))
    await vi.waitFor(() =>
      expect(beaconRequests.map((r) => r.path)).toEqual(['/workspaces', '/community']),
    )
  })
})
