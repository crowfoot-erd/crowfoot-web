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
    expect(await screen.findByRole('heading', { level: 1, name: 'v1.4.0 — 커뮤니티 게시판' })).toBeVisible()
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { level: 1, name: 'v1.4.0 — 커뮤니티 게시판' })).toBeVisible()
    expect(within(main).getByText('릴리스 노트')).toBeVisible()
    const viewer = await screen.findByTestId('markdown-viewer')
    expect(viewer).toHaveTextContent('# 개요')
    // 머리와 바닥은 랜딩과 같다 — 로고가 시작 페이지로 간다
    expect(within(screen.getByRole('banner')).getByRole('link', { name: /Crowfoot/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()

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

  it('위키 꼴 — 왼쪽 목차에 릴리스 노트가 최신순으로 나오고, 지금 보는 노트가 표시된다', async () => {
    renderViewer('902')

    const toc = await screen.findByRole('navigation', { name: '릴리스 노트' })
    const links = await within(toc).findAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    const current = links.filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('href', '/release-notes/902')
    expect(current[0]).toHaveTextContent('v1.4.0 — 커뮤니티 게시판')
  })

  it('번호 없이 열면(/release-notes) 가장 최근 노트를 보여 준다', async () => {
    renderWithProviders(
      <>
        <Route path="/release-notes" element={<ReleaseNoteViewerPage />} />
        <Route path="/release-notes/:postId" element={<ReleaseNoteViewerPage />} />
      </>,
      { route: '/release-notes' },
    )

    const toc = await screen.findByRole('navigation', { name: '릴리스 노트' })
    const first = (await within(toc).findAllByRole('link'))[0]
    expect(first).toHaveAttribute('aria-current', 'page')
    const title = first.querySelector('span')?.textContent ?? ''
    expect(await within(screen.getByRole('main')).findByRole('heading', { level: 1, name: title })).toBeVisible()
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
    expect(await screen.findByRole('heading', { level: 1, name: 'v1.4.0 — 커뮤니티 게시판' })).toBeVisible()
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
