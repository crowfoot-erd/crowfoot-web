/**
 * 만든 사이트 목록 화면 테스트 (08-core/19-site-showcase.md Section 3.5·3.7·6)
 *
 * given: 공개 목록(0부터 페이지)·신고 응답을 MSW로 정의, 게스트/로그인 세션
 * when: /showcase 렌더, "더 보기", 썸네일 실패, 신고
 * then: 카드(사이트 열기 rel·ERD 보기는 공유 중일 때만·대체 그림), 다음 페이지 이어 붙이기,
 *       로그인 사용자는 사유와 함께 신고 POST, 게스트는 로그인 안내
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { ShowcasePage } from '@/pages/showcase'
import { asAuthenticated, asGuest, renderWithProviders, resetSessionState } from '@/test/test-app'

/** 15건 — 12건씩 두 페이지. 짝수 행만 공유 중, 3의 배수 행만 썸네일이 있다 */
const SITES = Array.from({ length: 15 }, (_, index) => ({
  siteId: String(100 - index),
  url: `https://site${index + 1}.example.com/path`,
  title: `사이트 ${index + 1}`,
  description: index === 0 ? '첫 사이트 소개' : null,
  siteName: index === 1 ? 'Second' : null,
  faviconUrl: null,
  thumbnailUrl: index % 3 === 0 ? `/api/v1/core/showcase/sites/${100 - index}/thumbnail?v=1` : null,
  modelName: `문서 ${index + 1}`,
  databaseType: 'mysql',
  ...(index % 2 === 0 ? { shareToken: `token-${index + 1}` } : {}),
  createdAt: '2026-10-08T07:40:00Z',
}))

function mockList(requests: URLSearchParams[] = []) {
  server.use(
    http.get('/api/v1/core/showcase/sites', ({ request }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      const page = Number(params.get('page') ?? '0')
      const size = Number(params.get('size') ?? '12')
      return HttpResponse.json(
        ok({
          page,
          size,
          totalPages: Math.ceil(SITES.length / size),
          responses: SITES.slice(page * size, (page + 1) * size),
          totalCount: SITES.length,
        }),
      )
    }),
  )
}

function renderPage() {
  return renderWithProviders(
    <Route
      path="/showcase"
      element={
        <>
          <ShowcasePage />
          <Toaster />
        </>
      }
    />,
    { route: '/showcase' },
  )
}

afterEach(() => resetSessionState())

describe('만든 사이트 목록', () => {
  it('머리와 바닥, 제목과 카드 그리드를 보여 주고 "더 보기"로 다음 페이지를 붙인다', async () => {
    asGuest()
    const requests: URLSearchParams[] = []
    mockList(requests)
    renderPage()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Crowfoot으로 만든 사이트' })).toBeInTheDocument()

    const list = await screen.findByTestId('showcase-list')
    expect(within(list).getAllByTestId('showcase-card')).toHaveLength(12)
    expect(screen.getByTestId('showcase-count')).toHaveTextContent('15개')
    expect(requests[0].get('page')).toBe('0')
    expect(requests[0].get('size')).toBe('12')

    fireEvent.click(screen.getByTestId('showcase-load-more'))
    await waitFor(() => expect(within(list).getAllByTestId('showcase-card')).toHaveLength(15))
    expect(requests[1].get('page')).toBe('1')
    // 마지막 페이지 뒤에는 버튼이 없다
    expect(screen.queryByTestId('showcase-load-more')).not.toBeInTheDocument()
  })

  it('카드 — 사이트 열기는 새 창·nofollow ugc, ERD 보기는 공유 중일 때만, 썸네일이 없거나 실패하면 대체 그림', async () => {
    asGuest()
    mockList()
    renderPage()

    const cards = await screen.findAllByTestId('showcase-card')
    const first = cards[0]
    expect(within(first).getByRole('heading', { name: '사이트 1' })).toBeInTheDocument()
    expect(first).toHaveTextContent('site1.example.com')
    expect(first).toHaveTextContent('첫 사이트 소개')
    const open = within(first).getByTestId('showcase-open-site')
    expect(open).toHaveAttribute('href', 'https://site1.example.com/path')
    expect(open).toHaveAttribute('target', '_blank')
    expect(open).toHaveAttribute('rel', 'nofollow ugc noopener noreferrer')
    expect(within(first).getByTestId('showcase-view-erd')).toHaveAttribute('href', '/share/token-1')
    // 썸네일 경로는 API 기점을 붙여 쓴다
    const thumbnail = within(first).getByTestId('showcase-thumbnail')
    expect(thumbnail).toHaveAttribute('src', '/api/v1/core/showcase/sites/100/thumbnail?v=1')

    // 공유하지 않은 문서 — ERD 보기 없음. 썸네일 없음 — 사이트 이름으로 그린 대체 그림
    const second = cards[1]
    expect(within(second).queryByTestId('showcase-view-erd')).not.toBeInTheDocument()
    expect(within(second).getByTestId('showcase-thumbnail-fallback')).toHaveTextContent('Second')
    // 사이트 이름이 없으면 호스트
    expect(within(cards[2]).getByTestId('showcase-thumbnail-fallback')).toHaveTextContent('site3.example.com')

    // 썸네일을 불러오지 못하면 대체 그림으로 바뀐다
    fireEvent.error(thumbnail)
    expect(within(first).queryByTestId('showcase-thumbnail')).not.toBeInTheDocument()
    expect(within(first).getByTestId('showcase-thumbnail-fallback')).toHaveTextContent('site1.example.com')
  })

  it('빈 목록이면 안내 문구를 보여 준다', async () => {
    asGuest()
    server.use(
      http.get('/api/v1/core/showcase/sites', () =>
        HttpResponse.json(ok({ page: 0, size: 12, totalPages: 0, responses: [], totalCount: 0 })),
      ),
    )
    renderPage()
    expect(await screen.findByTestId('showcase-empty')).toHaveTextContent('아직 등록된 사이트가 없습니다.')
  })

  it('로그인 사용자는 사유를 적어 신고하고 토스트를 본다', async () => {
    asAuthenticated()
    mockList()
    let reported: { siteId: string; body: unknown } | null = null
    server.use(
      http.post('/api/v1/core/showcase/sites/:siteId/reports', async ({ params, request }) => {
        reported = { siteId: String(params.siteId), body: await request.json() }
        return HttpResponse.json(ok({ response: { reported: true } }))
      }),
    )
    const user = userEvent.setup()
    renderPage()

    const cards = await screen.findAllByTestId('showcase-card')
    await user.click(within(cards[0]).getByRole('button', { name: '사이트 1 신고' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('사유(선택)'), '광고입니다')
    await user.click(within(dialog).getByRole('button', { name: '신고' }))

    expect(await screen.findByText('신고했습니다. 검토하겠습니다.')).toBeInTheDocument()
    expect(reported).toEqual({ siteId: '100', body: { reason: '광고입니다' } })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('게스트가 신고를 누르면 로그인 안내만 하고 요청하지 않는다', async () => {
    asGuest()
    mockList()
    let called = false
    server.use(
      http.post('/api/v1/core/showcase/sites/:siteId/reports', () => {
        called = true
        return HttpResponse.json(ok({ response: { reported: true } }))
      }),
    )
    const user = userEvent.setup()
    renderPage()

    const cards = await screen.findAllByTestId('showcase-card')
    await user.click(within(cards[0]).getByTestId('showcase-report'))

    expect(await screen.findByText('신고하려면 로그인하세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(called).toBe(false)
  })
})
