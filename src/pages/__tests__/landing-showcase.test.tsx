/**
 * 랜딩 "만든 사이트" 섹션 테스트 (08-core/19-site-showcase.md Section 6)
 *
 * given: 공개 목록(size=6) 응답을 MSW로 정의
 * when: 랜딩 렌더
 * then: 공유 갤러리 아래에 카드와 "더보기"(/showcase), 빈 목록·실패면 섹션을 그리지 않는다
 */
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { fail, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { LandingPage } from '@/pages/landing'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

function renderLanding() {
  return renderWithProviders(<Route path="/" element={<LandingPage />} />)
}

describe('랜딩 — 만든 사이트', () => {
  beforeEach(() => {
    resetSessionState()
  })

  it('공유 갤러리 아래에 카드와 더보기 링크를 보여 주고, 첫 페이지 6건만 부른다', async () => {
    const requests: URLSearchParams[] = []
    server.use(
      http.get('/api/v1/core/showcase/sites', ({ request }) => {
        requests.push(new URL(request.url).searchParams)
        return HttpResponse.json(
          ok({
            page: 0,
            size: 6,
            totalPages: 1,
            totalCount: 1,
            responses: [
              {
                siteId: '12',
                url: 'https://blog.example.com',
                title: '예제 블로그',
                description: '개발 이야기를 씁니다',
                siteName: 'Example',
                faviconUrl: null,
                thumbnailUrl: null,
                modelName: 'blog 1.0',
                databaseType: 'mysql',
                createdAt: '2026-10-08T07:40:00Z',
              },
            ],
          }),
        )
      }),
    )
    renderLanding()

    const section = await screen.findByTestId('landing-showcase')
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Crowfoot으로 만든 사이트')
    expect(within(section).getAllByTestId('showcase-card')).toHaveLength(1)
    expect(within(section).getByText('예제 블로그')).toBeInTheDocument()
    expect(within(section).getByTestId('landing-showcase-more')).toHaveAttribute('href', '/showcase')
    expect(requests[0].get('page')).toBe('0')
    expect(requests[0].get('size')).toBe('6')

    // 공유 갤러리 다음에 온다
    const gallery = await screen.findByTestId('landing-gallery')
    expect(gallery.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('등록된 사이트가 없으면 섹션을 그리지 않는다', async () => {
    let called = false
    server.use(
      http.get('/api/v1/core/showcase/sites', () => {
        called = true
        return HttpResponse.json(ok({ page: 0, size: 6, totalPages: 0, totalCount: 0, responses: [] }))
      }),
    )
    renderLanding()
    await screen.findByTestId('landing-gallery')
    await waitFor(() => expect(called).toBe(true))
    expect(screen.queryByTestId('landing-showcase')).not.toBeInTheDocument()
  })

  it('조회에 실패해도 섹션을 그리지 않는다', async () => {
    let called = false
    server.use(
      http.get('/api/v1/core/showcase/sites', () => {
        called = true
        return fail('SERVICE_UNAVAILABLE', 503)
      }),
    )
    renderLanding()
    await screen.findByTestId('landing-gallery')
    await waitFor(() => expect(called).toBe(true))
    expect(screen.queryByTestId('landing-showcase')).not.toBeInTheDocument()
  })
})
