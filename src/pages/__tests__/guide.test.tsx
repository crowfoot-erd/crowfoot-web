/**
 * 사용 가이드 /guide — 공개 문서, 언어별 본문, 목차
 *
 * 본문 표시는 MarkdownViewer(toast-ui)가 한다 — jsdom에서는 무거워 가벼운 대역으로 바꾼다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/lib/i18n'
import GuidePage, { guideHeadings } from '@/pages/guide'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

vi.mock('@/features/community/components/markdown-viewer', () => ({
  default: ({ markdown }: { markdown: string }) => (
    <div data-testid="markdown">
      {markdown.split('\n').map((line, index) =>
        line.startsWith('## ') ? <h2 key={index}>{line.slice(3)}</h2> : <p key={index}>{line}</p>,
      )}
    </div>
  ),
}))

afterEach(async () => {
  resetSessionState()
  await i18n.changeLanguage('ko')
})

const renderGuide = () => renderWithProviders(<Route path="/guide" element={<GuidePage />} />, { route: '/guide' })

describe('사용 가이드', () => {
  it('로그인 없이 열린다 — 본문과 목차(본문의 ## 제목)를 보여 준다', async () => {
    renderGuide()

    expect(await screen.findByRole('heading', { level: 1, name: '사용 가이드' })).toBeVisible()
    const article = await screen.findByTestId('guide-article')
    await waitFor(() => expect(within(article).getByRole('heading', { level: 2, name: '1. 시작하기' })).toBeVisible())

    const toc = screen.getByRole('navigation', { name: '목차' })
    expect(within(toc).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '1. 시작하기',
      '2. ERD 그리기',
      '3. 표준 만들기 — 단어, 용어, 도메인 타입',
      '4. 데이터베이스와 주고받기',
      '5. 데이터 보기',
      '6. 함께 쓰기',
      '7. 점검하기',
      '8. 자주 묻는 것',
    ])
  })

  it('목차를 누르면 그 절로 옮긴다', async () => {
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.textContent ?? '')
    }
    renderGuide()
    const toc = await screen.findByRole('navigation', { name: '목차' })
    fireEvent.click(await within(toc).findByRole('button', { name: '3. 표준 만들기 — 단어, 용어, 도메인 타입' }))

    expect(scrolled).toEqual(['3. 표준 만들기 — 단어, 용어, 도메인 타입'])
  })

  it('언어를 바꾸면 그 언어의 본문으로 바뀐다', async () => {
    renderGuide()
    await screen.findByRole('heading', { level: 2, name: '1. 시작하기' })

    await i18n.changeLanguage('en')

    expect(await screen.findByRole('heading', { level: 2, name: '1. Getting started' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: 'User guide' })).toBeVisible()
  })
})

describe('본문 파일', () => {
  it('네 언어의 본문이 같은 짜임이다 — 절 8개, 이미지 9개, 같은 이미지 파일', async () => {
    const files = await Promise.all(
      (['ko', 'en', 'ja', 'zh'] as const).map(async (lang) => {
        const module = (await import(`@/content/guide/${lang}.md?raw`)) as { default: string }
        return { lang, markdown: module.default }
      }),
    )
    const images = (markdown: string) =>
      [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1].replace(/editor-(ko|en|ja|zh)-light/, 'editor-LANG-light'))

    for (const { markdown } of files) {
      expect(guideHeadings(markdown)).toHaveLength(8)
      expect(images(markdown)).toEqual(images(files[0].markdown))
      expect(images(markdown)).toHaveLength(9)
    }
  })
})
