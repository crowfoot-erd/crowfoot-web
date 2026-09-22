/**
 * 릴리스 노트 공개 뷰어 테스트 (08-core/08-community.md §3.11)
 *
 * lazy MarkdownViewer는 가벼운 stub으로 대체(페이지 로직 검증이 목적 —
 * toast-ui 렌더 자체는 e2e·수동 스파이크 영역, post-detail 관례).
 * 무인증 열람·존재 은닉(다른 게시판 post-id·없는 글 404)을 검증한다.
 * head 메타(제목·canonical·오류 noindex — 00-common §3.11)도 함께 검증한다.
 */
import { screen } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ReleaseNoteViewerPage } from '@/pages/release-note-viewer'
import { renderWithProviders } from '@/test/test-app'

vi.mock('@/features/community/components/markdown-viewer', () => ({
  default: ({ markdown }: { markdown: string }) => <div data-testid="markdown-viewer">{markdown}</div>,
}))

function renderViewer(postId: string) {
  // 인증 시딩 없음 — 게스트 열람이 계약
  return renderWithProviders(
    <>
      <Route path="/release-notes/:postId" element={<ReleaseNoteViewerPage />} />
      <Route path="/" element={<div>LANDING</div>} />
    </>,
    { route: `/release-notes/${postId}` },
  )
}

describe('릴리스 노트 공개 뷰어', () => {
  it('게스트 — 릴리스 노트를 마크다운 원문과 함께 렌더한다', async () => {
    renderViewer('902')

    // then: 제목·배지·본문(마크다운 원문) + 홈 링크 — 인증 없는 공개 API
    expect(await screen.findByText('v1.4.0 — 커뮤니티 게시판')).toBeVisible()
    expect(screen.getByText('릴리스 노트')).toBeVisible()
    const viewer = await screen.findByTestId('markdown-viewer')
    expect(viewer).toHaveTextContent('# 개요')
    expect(screen.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/')

    // then: head 메타 — 게시글 제목·canonical·본문 요약(마크다운·표 걷어냄) (00-common §3.11)
    expect(document.title).toBe('v1.4.0 — 커뮤니티 게시판 — Crowfoot')
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://crowfoot.java21.net/release-notes/902',
    )
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      '개요 이번 릴리스의 주요 변경 사항입니다. 항목 내용 기능 커뮤니티 릴리스 노트는 관리자가 작성합니다',
    )
  })

  it('게스트 — 없는 post-id는 404 안내와 홈 링크를 보여준다', async () => {
    renderViewer('999')

    // then: COMMUNITY_POST_NOT_FOUND 메시지
    expect(await screen.findByText('게시글을 찾을 수 없습니다.')).toBeVisible()
    expect(screen.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/')

    // then: 오류 화면은 색인 제외 (00-common §3.11)
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    )
  })

  it('게스트 — 다른 게시판(FEEDBACK) post-id는 404로 존재를 은닉한다', async () => {
    renderViewer('802')

    // then: FEEDBACK 본문이 공개 뷰어에 노출되지 않는다
    expect(await screen.findByText('게시글을 찾을 수 없습니다.')).toBeVisible()
    expect(screen.queryByText('ERD 내보내기 포맷 제안')).not.toBeInTheDocument()
  })
})
