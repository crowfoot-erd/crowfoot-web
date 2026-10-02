/**
 * 사용 가이드 /guide — 공개 문서, 언어별 본문, 목차
 *
 * 본문 표시는 MarkdownViewer(toast-ui)가 한다 — jsdom에서는 무거워 가벼운 대역으로 바꾼다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/lib/i18n'
import GuidePage, { activeHeading, guideHeadings, resolveLabels } from '@/pages/guide'
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
    await waitFor(() => expect(within(article).getByRole('heading', { level: 2, name: '1. 화면 구성 한눈에 보기' })).toBeVisible())

    const toc = screen.getByRole('navigation', { name: '목차' })
    expect(within(toc).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '1. 화면 구성 한눈에 보기',
      '2. 시작하기',
      '3. 워크스페이스',
      '4. ERD 문서 만들기',
      '5. 에디터 화면과 도구 모음',
      '6. 테이블과 컬럼',
      '7. 관계',
      '8. 메모, 그룹, 복사',
      '9. 표준 — 단어, 용어, 도메인 타입',
      '10. SQL과 데이터베이스',
      '11. 데이터 브라우저',
      '12. 검증',
      '13. 공유와 댓글',
      '14. 버전 기록',
      '15. 함께 편집하기',
      '16. 팀',
      '17. 커뮤니티와 알림',
      '18. 관리자',
      '19. 단축키',
      '20. 자주 묻는 것',
    ])
  })

  it('목차를 누르면 그 절로 옮긴다', async () => {
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.textContent ?? '')
    }
    renderGuide()
    const toc = await screen.findByRole('navigation', { name: '목차' })
    fireEvent.click(await within(toc).findByRole('button', { name: '9. 표준 — 단어, 용어, 도메인 타입' }))

    expect(scrolled).toEqual(['9. 표준 — 단어, 용어, 도메인 타입'])
  })

  it('본문을 내리면 지금 읽는 절이 목차에서 강조된다', async () => {
    // jsdom은 문서 높이가 0이라 늘 맨 아래로 본다 — 높이를 준다
    const height = vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(5000)
    renderGuide()
    const toc = await screen.findByRole('navigation', { name: '목차' })
    const article = await screen.findByTestId('guide-article')
    await within(article).findByRole('heading', { level: 2, name: '2. 시작하기' })

    // 셋째 절의 제목까지 기준선 위로 올라간 상태
    article.querySelectorAll('h2').forEach((heading, index) => {
      heading.getBoundingClientRect = () => ({ top: index <= 2 ? -10 : 500 }) as DOMRect
    })
    fireEvent.scroll(window)

    await waitFor(() => expect(within(toc).getByRole('button', { name: '3. 워크스페이스' })).toHaveAttribute('aria-current', 'location'))
    expect(within(toc).getAllByRole('button').filter((button) => button.hasAttribute('aria-current'))).toHaveLength(1)
    height.mockRestore()
  })

  it('지금 읽는 절 — 기준선을 지난 마지막 제목, 맨 아래에서는 마지막 절', () => {
    expect(activeHeading([], false)).toBe(0)
    expect(activeHeading([300, 900], false)).toBe(0)
    expect(activeHeading([-500, 40, 700], false)).toBe(1)
    expect(activeHeading([-900, -300, 400], true)).toBe(2)
  })

  it('언어를 바꾸면 그 언어의 본문으로 바뀐다', async () => {
    renderGuide()
    await screen.findByRole('heading', { level: 2, name: '2. 시작하기' })

    await i18n.changeLanguage('en')

    expect(await screen.findByRole('heading', { level: 2, name: '2. Getting started' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: 'User guide' })).toBeVisible()
  })

  it('본문의 {{키}}는 화면 문구로 바뀐다 — 버튼 이름이 화면과 같다', async () => {
    renderGuide()
    const article = await screen.findByTestId('guide-article')
    await within(article).findByRole('heading', { level: 2, name: '2. 시작하기' })

    expect(article.textContent).not.toMatch(/\{\{[\w.]+\}\}/)
    // 도구 메뉴의 항목 이름 — 번역 파일의 값 그대로
    expect(article.textContent).toContain('논리명 추론')
    expect(resolveLabels('**{{model.editor.toolbar.tools}}** › {{no.such.key}}', (key) => i18n.t(key))).toBe('**도구** › {{no.such.key}}')
    // 문구 안의 세로줄은 표의 칸을 나누지 않게 이스케이프한다
    expect(resolveLabels('| {{model.editor.relationship.multiplicity_ONE_OR_MORE}} |', (key) => i18n.t(key))).toBe('| 하나 이상 (\\|<) |')
  })

  it('그림을 누르면 새 창에서 연다', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderGuide()
    const article = await screen.findByTestId('guide-article')
    const image = document.createElement('img')
    image.src = '/guide-assets/ko/dashboard.webp'
    article.appendChild(image)

    fireEvent.click(image)

    expect(open).toHaveBeenCalledWith(expect.stringContaining('/guide-assets/ko/dashboard.webp'), '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })
})

describe('본문 파일', () => {
  const LANGS = ['ko', 'en', 'ja', 'zh'] as const
  const load = async () =>
    Promise.all(
      LANGS.map(async (lang) => {
        const module = (await import(`@/content/guide/${lang}.md?raw`)) as { default: string }
        return { lang, markdown: module.default }
      }),
    )
  /** 그림 경로 — 언어 폴더만 다르다 */
  const images = (markdown: string) => [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1])
  const tokens = (markdown: string) => [...new Set([...markdown.matchAll(/\{\{([\w.]+)\}\}/g)].map((match) => match[1]))].sort()

  it('네 언어의 본문이 같은 짜임이다 — 절 20개, 같은 소제목 수, 같은 그림', async () => {
    const files = await load()
    const subheadings = (markdown: string) => markdown.split('\n').filter((line) => line.startsWith('### ')).length
    const tableRows = (markdown: string) => markdown.split('\n').filter((line) => line.startsWith('|')).length

    for (const { lang, markdown } of files) {
      expect(guideHeadings(markdown)).toHaveLength(20)
      expect(subheadings(markdown)).toBe(subheadings(files[0].markdown))
      expect(tableRows(markdown)).toBe(tableRows(files[0].markdown))
      // 그림은 언어별 폴더의 같은 이름 파일이다
      expect(images(markdown)).toEqual(images(files[0].markdown).map((path) => path.replace('/guide-assets/ko/', `/guide-assets/${lang}/`)))
      expect(images(markdown).length).toBeGreaterThanOrEqual(60)
    }
  })

  it('본문의 {{키}}는 네 언어의 번역 파일에 모두 있다 — 값을 채워야 하는 문구는 쓰지 않는다', async () => {
    const files = await load()

    for (const { lang, markdown } of files) {
      expect(tokens(markdown)).toEqual(tokens(files[0].markdown))
      for (const key of tokens(markdown)) {
        const label = i18n.getResource(lang, 'translation', key) as unknown
        expect(typeof label, `${lang} ${key}`).toBe('string')
        expect(label as string, `${lang} ${key}`).not.toContain('{{')
      }
    }
  })
})
