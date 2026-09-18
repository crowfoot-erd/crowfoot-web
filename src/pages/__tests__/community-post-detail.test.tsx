/**
 * 커뮤니티 게시글 상세 테스트 (08-core/08-community.md)
 *
 * lazy MarkdownViewer는 가벼운 stub으로 대체(페이지 로직 검증이 목적 —
 * toast-ui 렌더 자체는 e2e·수동 스파이크 영역).
 * FEEDBACK 코멘트 섹션 노출·릴리스 노트 미노출·수정/삭제 권한 게이트를 검증한다.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { CommunityPostDetailPage } from '@/pages/community/post-detail'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

vi.mock('@/features/community/components/markdown-viewer', () => ({
  default: ({ markdown }: { markdown: string }) => <div data-testid="markdown-viewer">{markdown}</div>,
}))

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderDetail(postId: string) {
  asAuthenticated() // me 쿼리 활성화 — 수정·삭제 첨부(작성자 or 관리자) 판정
  return renderWithProviders(
    <>
      <Route path="/community/posts/:postId" element={<CommunityPostDetailPage />} />
      <Route path="/community/feedback" element={<div>FEEDBACK BOARD</div>} />
      <Route path="/community/release-notes" element={<div>RELEASE BOARD</div>} />
    </>,
    { route: `/community/posts/${postId}` },
  )
}

function overrideMe(admin: boolean, userId = '2') {
  server.use(
    http.get('/api/v1/core/accounts/me', () =>
      HttpResponse.json(ok({ response: { ...fixtures.me, admin, userId } })),
    ),
  )
}

describe('커뮤니티 게시글 상세', () => {
  it('renders a FEEDBACK post with markdown content and the comment section', async () => {
    renderDetail('802')

    // then: 제목·배지·본문(마크다운 원문)·코멘트 2건 + 작성 폼
    expect(await screen.findByText('ERD 내보내기 포맷 제안')).toBeVisible()
    expect(screen.getByText('제안 및 신고')).toBeVisible()
    const viewer = await screen.findByTestId('markdown-viewer')
    expect(viewer).toHaveTextContent('## 제안 배경')
    expect(screen.getByText('좋은 제안입니다. PostgreSQL 우선 지원을 검토하겠습니다.')).toBeVisible()
    expect(screen.getByTestId('comment-input')).toBeVisible()
  })

  it('hides the comment section on a RELEASE_NOTE post', async () => {
    renderDetail('902')

    // then: 릴리스 노트는 읽기 전용 — 코멘트 섹션 없음
    expect(await screen.findByText('v1.4.0 — 커뮤니티 게시판'))
    expect(screen.queryByTestId('comment-section')).not.toBeInTheDocument()
  })

  it('shows edit and delete to an administrator even when not the author', async () => {
    renderDetail('802')

    // then: kim의 글이지만 관리자(fixtures.me)는 중재 가능
    expect(await screen.findByRole('link', { name: /수정/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /삭제/ })).toBeVisible()
  })

  it('hides edit and delete from a non-author non-administrator', async () => {
    overrideMe(false, '9')
    renderDetail('802')

    // then: 작성자(kim=3)도 관리자도 아닌 사용자 — 첨부 미노출
    expect(await screen.findByText('ERD 내보내기 포맷 제안'))
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /수정/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /삭제/ })).not.toBeInTheDocument()
    })
  })

  it('deletes a post after confirmation and returns to the board', async () => {
    const user = userEvent.setup()
    renderDetail('802')

    // when: 삭제 확인(ConfirmDialog 기본 확인 버튼)
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    await user.click(await screen.findByRole('button', { name: '확인' }))

    // then: 게시판(작성 글의 board)으로 이동
    expect(await screen.findByText('FEEDBACK BOARD')).toBeVisible()
  })

  it('shows the error state when the post is missing', async () => {
    renderDetail('999')

    // then: 404 — 게시글 없음 문구
    expect(await screen.findByText('게시글을 찾을 수 없습니다.')).toBeVisible()
  })
})
