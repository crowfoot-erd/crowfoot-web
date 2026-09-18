/**
 * 커뮤니티 게시판 목록 테스트 (08-core/08-community.md)
 *
 * given: /core/community/posts 응답을 MSW로 정의(fixtures.communityPosts)
 * when: /community/release-notes·/community/feedback 진입
 * then: board 필터 목록·소개 글(FEEDBACK만)·"새 글" 권한 게이트·검색·빈·에러 상태
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { CommunityBoardPage } from '@/pages/community/board'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderBoard(board: 'RELEASE_NOTE' | 'FEEDBACK', route?: string) {
  asAuthenticated() // me 쿼리 활성화 — "새 글" 게이트(admin) 판정
  return renderWithProviders(
    <Route path="/community/:boardName" element={<CommunityBoardPage board={board} />} />,
    { route: route ?? `/community/${board === 'RELEASE_NOTE' ? 'release-notes' : 'feedback'}` },
  )
}

/** me 재정의 — 관리자 여부만 교체 */
function overrideMe(admin: boolean) {
  server.use(
    http.get('/api/v1/core/accounts/me', () =>
      HttpResponse.json(ok({ response: { ...fixtures.me, admin } })),
    ),
  )
}

describe('커뮤니티 게시판 목록', () => {
  it('renders FEEDBACK posts with the board intro and comment counts', async () => {
    renderBoard('FEEDBACK')

    // then: FEEDBACK 2건 + 소개 글 + 총 수
    expect(await screen.findByText('ERD 내보내기 포맷 제안')).toBeVisible()
    expect(screen.getByText('편집기 버그 신고')).toBeVisible()
    expect(screen.queryByText('v1.4.0 — 커뮤니티 게시판')).not.toBeInTheDocument()
    expect(screen.getByText('개선 제안이나 발견한 버그를 자유롭게 남겨 주세요. 관리자가 확인하고 답변드립니다.')).toBeVisible()
    expect(screen.getByText('총 2개')).toBeVisible()
  })

  it('renders RELEASE_NOTE posts without the intro and hides comment counts', async () => {
    renderBoard('RELEASE_NOTE')

    // then: RELEASE_NOTE 2건, 소개 글 없음, 코멘트 수 대시
    expect(await screen.findByText('v1.4.0 — 커뮤니티 게시판')).toBeVisible()
    expect(screen.getByText('v1.3.0 — 관리형 데이터베이스')).toBeVisible()
    expect(screen.queryByText('편집기 버그 신고')).not.toBeInTheDocument()
    expect(screen.queryByText(/제안이나 발견한 버그/)).not.toBeInTheDocument()
  })

  it('shows the new-post button to an administrator on RELEASE_NOTE', async () => {
    renderBoard('RELEASE_NOTE')

    // then: fixtures.me은 관리자 — 새 글 버튼 노출(링크 대상에 board 유지)
    expect(await screen.findByRole('link', { name: /새 글/ })).toHaveAttribute(
      'href',
      '/community/posts/new?board=RELEASE_NOTE',
    )
  })

  it('hides the new-post button from a non-administrator on RELEASE_NOTE', async () => {
    overrideMe(false)
    renderBoard('RELEASE_NOTE')

    // then: 릴리스 노트 쓰기는 관리자 전용 — 버튼 미노출
    expect(await screen.findByText('v1.4.0 — 커뮤니티 게시판'))
    expect(screen.queryByRole('link', { name: /새 글/ })).not.toBeInTheDocument()
  })

  it('filters posts by keyword after the debounce', async () => {
    const user = userEvent.setup()
    renderBoard('FEEDBACK')

    const search = await screen.findByLabelText('검색')
    await user.type(search, '내보내기')

    // then: 300ms 디바운스 후 매칭 1건만 남는다
    expect(await screen.findByText('총 1개')).toBeVisible()
    expect(screen.getByText('ERD 내보내기 포맷 제안')).toBeVisible()
    expect(screen.queryByText('편집기 버그 신고')).not.toBeInTheDocument()
  })

  it('shows the search-empty state when nothing matches', async () => {
    const user = userEvent.setup()
    renderBoard('FEEDBACK')

    const search = await screen.findByLabelText('검색')
    await user.type(search, '없는단어')

    expect(await screen.findByText('검색 결과가 없습니다.')).toBeVisible()
  })

  it('shows the all-empty state when the board has no posts', async () => {
    server.use(
      http.get('/api/v1/core/community/posts', () =>
        HttpResponse.json(ok({ responses: [], totalCount: 0, page: 1, size: 20, totalPages: 1 })),
      ),
    )
    renderBoard('FEEDBACK')

    expect(await screen.findByText('게시글이 없습니다.')).toBeVisible()
  })

  it('requests the next page when pagination controls are used', async () => {
    const user = userEvent.setup()
    const requestedPages: string[] = []
    server.use(
      http.get('/api/v1/core/community/posts', ({ request }) => {
        const url = new URL(request.url)
        requestedPages.push(url.searchParams.get('page') ?? '1')
        return HttpResponse.json(
          ok({
            responses: fixtures.communityPosts.responses.filter((post) => post.board === 'FEEDBACK'),
            totalCount: 25,
            page: Number(url.searchParams.get('page') ?? '1'),
            size: 20,
            totalPages: 2,
          }),
        )
      }),
    )
    renderBoard('FEEDBACK')

    // then: totalPages>1 → 다음 버튼 활성, 클릭 시 page=2 재요청
    const next = await screen.findByRole('button', { name: '다음' })
    await user.click(next)
    await waitFor(() => expect(requestedPages.at(-1)).toBe('2'))
  })

  it('shows the error state with retry on failure', async () => {
    server.use(
      http.get('/api/v1/core/community/posts', () =>
        HttpResponse.json({ ...fixtures.communityPosts }, { status: 500 }),
      ),
    )
    renderBoard('FEEDBACK')

    // then: 에러 문구 + 재시도 버튼
    expect(await screen.findByRole('button', { name: /다시 시도/ })).toBeVisible()
  })
})
