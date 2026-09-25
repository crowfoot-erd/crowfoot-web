/**
 * 릴리스 노트 공개 뷰어 테스트 (08-core/08-community.md §3.11)
 *
 * lazy MarkdownViewer는 가벼운 stub으로 대체(페이지 로직 검증이 목적 —
 * toast-ui 렌더 자체는 e2e·수동 스파이크 영역, post-detail 관례).
 * 무인증 열람·존재 은닉(다른 게시판 post-id·없는 글 404)을 검증한다.
 * head 메타(제목·canonical·오류 noindex — 00-common §3.11)도 함께 검증한다.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/lib/i18n'
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

  // 이하 2케이스는 UI 언어를 바꾼다 — 파일 단위 격리지만 후속 파일 내 오염만 막는다
  afterEach(() => {
    void i18n.changeLanguage('ko')
  })

  it('게스트 — 여러 언어 글은 콘텐츠 언어 전환기로 ?lang=en을 재조회한다', async () => {
    const user = userEvent.setup()
    renderViewer('902') // fixtures — availableLangs ['ko','en']

    // then: 기본은 UI 언어(ko) — 전환기는 available 2개 이상일 때만 노출
    expect(await screen.findByText('v1.4.0 — 커뮤니티 게시판')).toBeVisible()
    const group = screen.getByRole('group', { name: '본문 언어' })
    expect(within(group).getByRole('button', { name: '한국어' })).toHaveAttribute('aria-pressed', 'true')

    // when: English로 전환
    await user.click(within(group).getByRole('button', { name: 'English' }))

    // then: en 해석으로 재조회 — 영어 제목·본문
    expect(await screen.findByText('v1.4.0 — Community board')).toBeVisible()
    expect(screen.getByTestId('markdown-viewer')).toHaveTextContent('# Overview')
    expect(screen.queryByTestId('release-note-fallback')).not.toBeInTheDocument()
  })

  it('게스트 — 요청 언어 본문이 없으면 다른 언어로 표시하고 폴백 배지를 띄운다', async () => {
    await i18n.changeLanguage('ja') // UI 언어 ja — 902는 ko/en뿐(서버 폴백 en)
    renderViewer('902')

    // then: en 폴백 원문 + 폴백 배지(ja 문구, 언어명은 자칭 라벨)
    expect(await screen.findByText('v1.4.0 — Community board')).toBeVisible()
    expect(screen.getByTestId('release-note-fallback')).toHaveTextContent(
      '日本語の本文がないため、別の言語で表示しています。',
    )
  })
})
