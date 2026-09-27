/**
 * 내가 좋아요한 공유 문서 테스트 (08-core/02-model.md §1.10.9 → 08-community.md §5)
 *
 * given: /core/accounts/me/share-reactions 응답을 MSW로 정의(fixtures.myShareReactions)
 * when: /community/my-likes 진입
 * then: 문서 행(새 창 링크·설명·DB 배지·카운터 3종·좋아요 시각)·빈·에러 상태
 */
import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fixtures, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { MyShareLikesPage } from '@/pages/community/my-likes'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

function renderPage() {
  asAuthenticated() // 인증 회원 전용 경로 — Bearer가 실려야 200
  return renderWithProviders(<Route path="/community/my-likes" element={<MyShareLikesPage />} />, {
    route: '/community/my-likes',
  })
}

describe('내가 좋아요한 공유 문서', () => {
  it('renders liked documents with counters — 새 창 링크·설명·카운터 3종', async () => {
    renderPage()

    // then: 총 2개 + 문서명 링크(공유 뷰어 새 창) + DB 배지 + 설명
    expect(await screen.findByText('총 2개')).toBeVisible()
    const settle = screen.getByRole('link', { name: '정산 배치 ERD' })
    expect(settle).toHaveAttribute('href', '/share/P0pularT0ken0fSettle2c')
    expect(settle).toHaveAttribute('target', '_blank')
    expect(screen.getByText('일일 정산 집계 파이프라인')).toBeVisible()
    expect(screen.getByText('mysql')).toBeVisible()

    // then: 카운터 3종 — 정산(반응 12·댓글 4·조회 3)·주문(반응 9·조회 128·댓글 3)
    expect(screen.getByText('12')).toBeVisible()
    expect(screen.getByText('4')).toBeVisible()
    expect(screen.getByText('9')).toBeVisible()
    expect(screen.getByText('128')).toBeVisible()
    // 조회 3(정산)과 댓글 3(주문)은 값이 같아 두 번 등장한다
    expect(screen.getAllByText('3')).toHaveLength(2)
  })

  it('shows the empty state when no reactions exist', async () => {
    server.use(
      http.get('/api/v1/core/accounts/me/share-reactions', () =>
        HttpResponse.json(ok({ responses: [], totalCount: 0 })),
      ),
    )
    renderPage()

    expect(await screen.findByText('좋아요한 공유 문서가 없습니다.')).toBeVisible()
  })

  it('shows the error state with retry on failure', async () => {
    server.use(
      http.get('/api/v1/core/accounts/me/share-reactions', () =>
        HttpResponse.json({ ...fixtures.myShareReactions }, { status: 500 }),
      ),
    )
    renderPage()

    expect(await screen.findByRole('button', { name: /다시 시도/ })).toBeVisible()
  })
})
