/**
 * 내가 작성한 공유 문서 댓글 테스트 (08-core/02-model.md §1.10.9 → 08-community.md §5)
 *
 * given: /core/accounts/me/share-comments 응답을 MSW로 정의(fixtures.myShareComments)
 * when: /community/my-comments 진입
 * then: 댓글+ERD 한 행(문서 새 창 링크·DB 배지·답글/수정 배지)·빈·에러 상태
 */
import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fixtures, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { MyShareCommentsPage } from '@/pages/community/my-comments'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

function renderPage() {
  asAuthenticated() // 인증 회원 전용 경로 — Bearer가 실려야 200
  return renderWithProviders(<Route path="/community/my-comments" element={<MyShareCommentsPage />} />, {
    route: '/community/my-comments',
  })
}

describe('내가 작성한 공유 문서 댓글', () => {
  it('renders each comment with its document — 새 창 링크·DB 배지·답글/수정 배지', async () => {
    renderPage()

    // then: 총 2개 + 문서명 링크 2건(공유 뷰어 새 창) + DB 배지
    expect(await screen.findByText('총 2개')).toBeVisible()
    const order = screen.getByRole('link', { name: '주문 서비스 ERD' })
    const settle = screen.getByRole('link', { name: '정산 배치 ERD' })
    expect(order).toHaveAttribute('href', '/share/Sh4reT0ken0fM0del501aaaa')
    expect(order).toHaveAttribute('target', '_blank')
    expect(settle).toHaveAttribute('href', '/share/P0pularT0ken0fSettle2c')
    expect(screen.getByText('postgresql')).toBeVisible()
    expect(screen.getByText('mysql')).toBeVisible()

    // then: 댓글 내용 행 — 원댓글은 수정 표시만, 답글(parentCommentId)은 답글 배지
    expect(screen.getByText('복합 UK 위치가 깔끔합니다.')).toBeVisible()
    expect(screen.getByText('수정됨')).toBeVisible()
    expect(screen.getByText('공유해 주셔서 감사합니다 — 참고했습니다.')).toBeVisible()
    expect(screen.getAllByText('답글')).toHaveLength(1)
  })

  it('does not badge a top-level comment as a reply when parentCommentId is omitted', async () => {
    // given: 실서버 응답 형태 — 원댓글의 parentCommentId는 NON_NULL 직렬화로 필드가 생략된다.
    // 배지 조건이 !== null 엄격 비교라 정규화 없으면 undefined가 답글로 뒤집힌다(2026-09-28)
    server.use(
      http.get('/api/v1/core/accounts/me/share-comments', () =>
        HttpResponse.json(
          ok({
            totalCount: 2,
            responses: [
              {
                commentId: '33',
                content: '생략된 원댓글',
                edited: false,
                createdAt: '2026-09-21T09:30:00Z',
                shareToken: 'Sh4reT0ken0fM0del501aaaa',
                modelName: '주문 서비스 ERD',
                databaseType: 'postgresql',
              },
              {
                commentId: '95',
                parentCommentId: '33',
                content: '명시된 답글',
                edited: false,
                createdAt: '2026-09-26T08:00:00Z',
                shareToken: 'P0pularT0ken0fSettle2c',
                modelName: '정산 배치 ERD',
                databaseType: 'mysql',
              },
            ],
          }),
        ),
      ),
    )
    renderPage()

    // then: 생략된 원댓글은 답글 배지 없이, 값 있는 답글에만 배지 1건
    expect(await screen.findByText('생략된 원댓글')).toBeVisible()
    expect(screen.getByText('명시된 답글')).toBeVisible()
    expect(screen.getAllByText('답글')).toHaveLength(1)
  })

  it('shows the empty state when no member comments exist', async () => {
    server.use(
      http.get('/api/v1/core/accounts/me/share-comments', () =>
        HttpResponse.json(ok({ responses: [], totalCount: 0 })),
      ),
    )
    renderPage()

    expect(await screen.findByText('공유 문서에 작성한 댓글이 없습니다.')).toBeVisible()
  })

  it('shows the error state with retry on failure', async () => {
    server.use(
      http.get('/api/v1/core/accounts/me/share-comments', () =>
        HttpResponse.json({ ...fixtures.myShareComments }, { status: 500 }),
      ),
    )
    renderPage()

    expect(await screen.findByRole('button', { name: /다시 시도/ })).toBeVisible()
  })
})
