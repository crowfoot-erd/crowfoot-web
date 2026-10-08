/**
 * 사이트 쇼케이스 관리 화면 테스트 (08-core/19-site-showcase.md Section 3.8·3.9)
 *
 * given: /core/admin/showcase/sites 응답을 MSW로 정의(기본 핸들러 — 보이는 사이트 1·자동 숨김 1)
 * when: 화면 렌더·숨김 필터·숨김 스위치
 * then: 신고 수·자동 숨김 배지·캡처 실패·문서 식별자, 필터가 hidden 쿼리로 실린다, 스위치는 PATCH + 토스트
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { AdminShowcasePage } from '@/pages/admin/showcase'
import { renderWithProviders } from '@/test/test-app'

function renderPage(route = '/admin/showcase') {
  return renderWithProviders(
    <Route
      path="/admin/showcase"
      element={
        <>
          <AdminShowcasePage />
          <Toaster />
        </>
      }
    />,
    { route },
  )
}

describe('사이트 쇼케이스 관리 화면', () => {
  it('숨긴 사이트까지 신고 수·숨김 사유·캡처 실패·문서 식별자와 함께 보여 준다', async () => {
    renderPage()

    const rows = await screen.findAllByTestId('admin-showcase-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('예제 블로그')
    expect(rows[0]).toHaveTextContent('https://blog.example.com')
    expect(rows[0]).toHaveTextContent('워크스페이스 100 · 문서 501')
    expect(within(rows[0]).getByRole('switch', { name: '예제 블로그 숨김' })).not.toBeChecked()

    expect(rows[1]).toHaveTextContent('스팸 사이트')
    expect(rows[1]).toHaveTextContent('신고 누적으로 숨김')
    expect(rows[1]).toHaveTextContent('캡처 실패: CAPTURE_FAILED')
    expect(rows[1]).toHaveTextContent('3')
    expect(within(rows[1]).getByRole('switch', { name: '스팸 사이트 숨김' })).toBeChecked()
  })

  it('숨김 필터를 고르면 hidden 쿼리로 다시 조회한다', async () => {
    const requests: URLSearchParams[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/api/v1/core/admin/showcase/sites')) requests.push(new URL(request.url).searchParams)
    })
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByTestId('admin-showcase-row')
    expect(requests[0].has('hidden')).toBe(false)
    expect(requests[0].get('page')).toBe('0')

    await user.click(screen.getByRole('button', { name: '숨긴 사이트' }))
    await waitFor(() => expect(screen.getAllByTestId('admin-showcase-row')).toHaveLength(1))
    expect(requests.at(-1)?.get('hidden')).toBe('true')
    expect(screen.getByRole('button', { name: '숨긴 사이트' })).toHaveAttribute('aria-pressed', 'true')
    server.events.removeAllListeners()
  })

  it('숨김 스위치는 바로 PATCH하고 토스트를 띄운다', async () => {
    const patches: { siteId: string; body: unknown }[] = []
    server.use(
      http.patch('/api/v1/core/admin/showcase/sites/:siteId', async ({ params, request }) => {
        patches.push({ siteId: String(params.siteId), body: await request.json() })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('switch', { name: '예제 블로그 숨김' }))
    expect(await screen.findByText('사이트를 숨겼습니다')).toBeInTheDocument()
    expect(patches).toEqual([{ siteId: '12', body: { hidden: true } }])

    await user.click(screen.getByRole('switch', { name: '스팸 사이트 숨김' }))
    expect(await screen.findByText('사이트를 다시 보이게 했습니다')).toBeInTheDocument()
    expect(patches[1]).toEqual({ siteId: '9', body: { hidden: false } })
  })
})
