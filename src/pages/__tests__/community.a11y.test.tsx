/**
 * 커뮤니티 화면 접근성 검사 (frontend-testing.md B4 — jest-axe)
 *
 * 게시판 목록(FEEDBACK)과 게시글 상세(FEEDBACK — 코멘트 섹션 포함).
 * MarkdownViewer는 stub으로 대체(레이아웃·래이블 검증이 목적).
 */
import { screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { CommunityBoardPage } from '@/pages/community/board'
import { CommunityPostDetailPage } from '@/pages/community/post-detail'
import { renderWithProviders } from '@/test/test-app'

vi.mock('@/features/community/components/markdown-viewer', () => ({
  default: ({ markdown }: { markdown: string }) => <div data-testid="markdown-viewer">{markdown}</div>,
}))

describe('커뮤니티 접근성 (jest-axe)', () => {
  it('feedback board page has no axe violations', async () => {
    const { container } = renderWithProviders(
      <Route path="/community/feedback" element={<CommunityBoardPage board="FEEDBACK" />} />,
      { route: '/community/feedback' },
    )
    await screen.findByText('ERD 내보내기 포맷 제안')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('feedback post detail page has no axe violations', async () => {
    const { container } = renderWithProviders(
      <Route path="/community/posts/:postId" element={<CommunityPostDetailPage />} />,
      { route: '/community/posts/802' },
    )
    await screen.findByTestId('comment-input')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
