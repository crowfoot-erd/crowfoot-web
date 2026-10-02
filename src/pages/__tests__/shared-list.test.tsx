/**
 * 공유 문서 목록 화면 테스트 (08-core/12-share-feedback.md §1.5.1)
 *
 * 검색어·정렬·페이지가 주소와 요청에 실리는지, 머리와 바닥이 랜딩과 같은지 검증한다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SharedListPage } from '@/pages/shared-list'
import { server } from '@/api/mocks/server'
import { renderWithProviders } from '@/test/test-app'

const ITEMS = Array.from({ length: 13 }, (_, index) => ({
  shareToken: `token-${index + 1}`,
  modelName: index === 0 ? '주문 ERD' : `문서 ${index + 1}`,
  description: index === 0 ? '주문과 결제' : null,
  databaseType: 'postgresql',
  updatedAt: '2026-09-16T09:00:00Z',
  sharedAt: '2026-09-15T07:30:00Z',
  reactionCount: index,
  viewCount: index * 2,
}))

/** 서버 흉내 — q로 거르고 12건씩 자른다. 받은 요청을 기록한다 */
function mockList(requests: URLSearchParams[]) {
  server.use(
    http.get('/api/v1/core/shares/list', ({ request }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      const q = params.get('q') ?? ''
      const page = Number(params.get('page') ?? '1')
      const matched = ITEMS.filter((item) => item.modelName.includes(q))
      return HttpResponse.json({
        header: { isSuccessful: true, resultCode: 'SUCCESS', resultMessage: 'SUCCESS' },
        page,
        size: 12,
        totalPages: Math.ceil(matched.length / 12),
        responses: matched.slice((page - 1) * 12, page * 12),
        totalCount: matched.length,
      })
    }),
  )
}

function renderPage(route = '/shared') {
  return renderWithProviders(<Route path="/shared" element={<SharedListPage />} />, { route })
}

describe('공유 문서 목록', () => {
  it('머리와 바닥을 두고 카드 목록을 보여 준다 — 카드는 공유 문서를 새 창에서 연다', async () => {
    const requests: URLSearchParams[] = []
    mockList(requests)
    renderPage()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '공유 문서' })).toBeInTheDocument()

    const list = await screen.findByTestId('shared-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(12)
    const first = within(list).getByRole('link', { name: /주문 ERD/ })
    expect(first).toHaveAttribute('href', '/share/token-1')
    expect(first).toHaveAttribute('target', '_blank')
    expect(screen.getByTestId('shared-count')).toHaveTextContent('13건')
    expect(requests[0].get('sort')).toBe('recent')
    expect(requests[0].get('page')).toBe('1')
    expect(requests[0].get('q')).toBeNull()
  })

  it('다음 페이지로 넘기면 그 페이지를 요청한다', async () => {
    const requests: URLSearchParams[] = []
    mockList(requests)
    renderPage()
    await screen.findByTestId('shared-list')

    const pager = screen.getByTestId('shared-pager')
    expect(pager).toHaveTextContent('1 / 2 페이지')
    expect(within(pager).getByRole('button', { name: '이전' })).toBeDisabled()
    fireEvent.click(within(pager).getByRole('button', { name: '다음' }))

    await waitFor(() => expect(screen.getByTestId('shared-pager')).toHaveTextContent('2 / 2 페이지'))
    await waitFor(() => expect(within(screen.getByTestId('shared-list')).getAllByRole('listitem')).toHaveLength(1))
    expect(requests.at(-1)?.get('page')).toBe('2')
  })

  it('검색어를 넣으면 잠깐 뒤에 그 말로 다시 찾고 첫 페이지로 돌아간다. 없으면 안내한다', async () => {
    const requests: URLSearchParams[] = []
    mockList(requests)
    renderPage('/shared?page=2')
    await screen.findByTestId('shared-list')

    fireEvent.change(screen.getByTestId('shared-search'), { target: { value: '주문' } })
    await waitFor(() => expect(requests.at(-1)?.get('q')).toBe('주문'))
    expect(requests.at(-1)?.get('page')).toBe('1')
    await waitFor(() => expect(within(screen.getByTestId('shared-list')).getAllByRole('listitem')).toHaveLength(1))
    expect(screen.queryByTestId('shared-pager')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('shared-search'), { target: { value: '없는 말' } })
    expect(await screen.findByTestId('shared-empty')).toHaveTextContent('"없는 말"에 맞는 문서가 없습니다.')
  })

  it('정렬을 인기순으로 바꾸면 sort=popular로 요청한다 — 주소의 조건으로 열어도 같다', async () => {
    const requests: URLSearchParams[] = []
    mockList(requests)
    renderPage('/shared?q=문서&sort=popular')
    await screen.findByTestId('shared-list')
    expect(requests[0].get('q')).toBe('문서')
    expect(requests[0].get('sort')).toBe('popular')
    expect(screen.getByTestId('shared-search')).toHaveValue('문서')
    expect(screen.getByRole('button', { name: '인기순' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '최근 공유순' }))
    await waitFor(() => expect(requests.at(-1)?.get('sort')).toBe('recent'))
  })
})
