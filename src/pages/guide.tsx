/**
 * 사용 가이드 /guide — 로그인 없이 누구나 읽는 공개 문서 (04-front/00-overview.md)
 *
 * - 본문은 언어별 마크다운 파일(src/content/guide/{ko,en,ja,zh}.md)이다. UI 언어를 따르고,
 *   언어를 바꾸면 그 언어의 파일을 내려받는다(파일마다 별도 청크)
 * - 본문의 `{{키}}`는 그 언어의 화면 문구(번역 파일)로 바꿔 보여 준다 — 버튼·메뉴 이름이 화면과 어긋나지 않는다
 * - 왼쪽 목차는 본문의 `## ` 제목에서 만든다. 누르면 그 절로 스크롤한다.
 *   본문을 내리면 지금 읽는 절이 목차에서 강조된다
 * - 위쪽 찾기 칸: 본문에서 글자를 찾아 표시하고(CSS Custom Highlight — 본문 DOM을 고치지 않는다),
 *   Enter·Shift+Enter로 다음·이전 결과로 옮긴다. 목차에는 절마다 찾은 수가 붙는다
 * - 본문은 릴리스 노트와 같은 MarkdownViewer를 쓴다. 그림은 언어별로 따로 있다(public/guide-assets/{언어}/ —
 *   scripts/capture-guide.test.ts가 만든다). 그림을 누르면 새 창에서 원래 크기로 열린다
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LanguageSelect } from '@/components/language-select'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { usePageMeta } from '@/hooks/usePageMeta'
import { currentLanguage, type Language } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// toast-ui 청크 분리 — 메인 번들에 포함하지 않는다(release-note-viewer 관례)
const MarkdownViewer = lazy(() => import('@/features/community/components/markdown-viewer'))

/** 언어별 본문 — 고른 언어의 파일만 내려받는다 */
const LOADERS: Record<Language, () => Promise<{ default: string }>> = {
  ko: () => import('@/content/guide/ko.md?raw'),
  en: () => import('@/content/guide/en.md?raw'),
  ja: () => import('@/content/guide/ja.md?raw'),
  zh: () => import('@/content/guide/zh.md?raw'),
}

/** 본문의 `{{키}}`를 화면 문구로 바꾼다. 번역 파일에 없는 키는 그대로 둔다(테스트가 잡는다) */
export function resolveLabels(markdown: string, translate: (key: string) => string): string {
  return markdown.replace(/\{\{([\w.]+)\}\}/g, (token, key: string) => {
    const label = translate(key)
    // 문구 안의 세로줄(기수 표기 "(|<)" 등)은 표의 칸 구분으로 읽히지 않게 이스케이프한다
    return label === key ? token : label.replaceAll('|', '\\|')
  })
}

/** 고정 헤더 아래의 기준선(px) — 제목이 이 선을 지나면 그 절을 읽는 중으로 본다 */
const ACTIVE_LINE = 96

/** 지금 읽는 절의 번호 — 기준선을 지난 마지막 제목. 맨 아래에 닿으면 마지막 절(짧은 끝 절은 기준선에 못 닿는다) */
export function activeHeading(tops: number[], atBottom: boolean): number {
  if (tops.length === 0) return 0
  if (atBottom) return tops.length - 1
  let index = 0
  tops.forEach((top, i) => {
    if (top <= ACTIVE_LINE) index = i
  })
  return index
}

/** 찾은 곳 하나 — 글자 마디 안의 범위와 그 글자가 속한 절(h2) 번호. 첫 절 앞의 머리글은 -1 */
export interface GuideMatch {
  node: Text
  start: number
  end: number
  section: number
}

/** 한 번에 표시하는 결과의 상한 — 한 글자 검색처럼 결과가 너무 많을 때 화면이 느려지지 않게 한다 */
const MATCH_LIMIT = 1000

/** 본문에서 글자를 찾는다 — 대소문자를 가리지 않는다. 문서 순서대로 돌려준다 */
export function findMatches(root: Element, query: string): GuideMatch[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []
  const matches: GuideMatch[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let section = -1
  for (let node = walker.nextNode(); node !== null && matches.length < MATCH_LIMIT; node = walker.nextNode()) {
    if (node instanceof Element) {
      if (node.tagName === 'H2') section += 1
      continue
    }
    const text = (node.textContent ?? '').toLowerCase()
    for (let at = text.indexOf(needle); at !== -1 && matches.length < MATCH_LIMIT; at = text.indexOf(needle, at + needle.length)) {
      matches.push({ node: node as Text, start: at, end: at + needle.length, section })
    }
  }
  return matches
}

/** 찾은 곳을 본문에 표시한다 — 지원하는 브라우저에서만(없어도 찾기와 이동은 된다) */
function paintMatches(matches: GuideMatch[], current: number) {
  if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') return
  const toRange = (match: GuideMatch) => {
    const range = new Range()
    range.setStart(match.node, match.start)
    range.setEnd(match.node, match.end)
    return range
  }
  CSS.highlights.delete('guide-search')
  CSS.highlights.delete('guide-search-current')
  if (matches.length === 0) return
  CSS.highlights.set('guide-search', new Highlight(...matches.map(toRange)))
  if (matches[current]) CSS.highlights.set('guide-search-current', new Highlight(toRange(matches[current])))
}

/** 본문의 `## ` 제목 — 목차로 쓴다 */
export function guideHeadings(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim())
}

export default function GuidePage() {
  const { t, i18n } = useTranslation()
  const language = currentLanguage()
  const [loaded, setLoaded] = useState<{ language: Language; markdown: string } | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)

  usePageMeta({
    title: `${t('guide.title')} — ${t('common.appName')}`,
    description: t('guide.description'),
    canonicalPath: '/guide',
  })

  useEffect(() => {
    let cancelled = false
    void (LOADERS[language] ?? LOADERS.ko)().then((module) => {
      if (!cancelled) setLoaded({ language, markdown: module.default })
    })
    return () => {
      cancelled = true
    }
    // i18n.language가 바뀌면 다시 읽는다(currentLanguage가 그 값을 따른다)
  }, [language, i18n.language])

  const markdown = useMemo(
    () => (loaded?.language === language ? resolveLabels(loaded.markdown, (key) => t(key)) : null),
    [loaded, language, t],
  )
  const headings = useMemo(() => (markdown ? guideHeadings(markdown) : []), [markdown])

  /** 지금 읽는 절 — 화면 위쪽 기준선을 지난 마지막 h2 */
  const [active, setActive] = useState(0)

  /** 목차 — 본문에서 n번째 h2를 찾아 그 자리로 옮긴다(뷰어가 제목에 id를 붙이지 않는다) */
  const scrollTo = (index: number) => {
    articleRef.current?.querySelectorAll('h2')[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (markdown === null) return
    let frame = 0
    const update = () => {
      frame = 0
      const tops = [...(articleRef.current?.querySelectorAll('h2') ?? [])].map((heading) => heading.getBoundingClientRect().top)
      setActive(activeHeading(tops, window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2))
    }
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [markdown])

  /* ---------- 찾기 ---------- */
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GuideMatch[]>([])
  const [current, setCurrent] = useState(0)

  // 찾을 글자나 본문이 바뀌면 다시 찾는다(본문은 뷰어가 늦게 그리므로 글자를 칠 때의 DOM을 읽는다)
  useEffect(() => {
    const article = articleRef.current
    setMatches(article && markdown !== null ? findMatches(article, query) : [])
    setCurrent(0)
  }, [query, markdown])

  useEffect(() => {
    paintMatches(matches, current)
    return () => paintMatches([], 0)
  }, [matches, current])

  /** 다음(+1)·이전(-1) 결과로 옮긴다 — 끝에서 처음으로 돈다 */
  const step = (delta: number) => {
    if (matches.length === 0) return
    const next = (current + delta + matches.length) % matches.length
    setCurrent(next)
    matches[next].node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /** 절마다 찾은 수 — 목차에 붙인다 */
  const sectionCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const match of matches) counts.set(match.section, (counts.get(match.section) ?? 0) + 1)
    return counts
  }, [matches])
  const searching = query.trim() !== ''

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link to="/" aria-label={t('common.appName')} className="flex shrink-0 items-center gap-2 text-lg font-semibold hover:opacity-80">
            <Logo className="size-6" />
            {/* 좁은 화면에서는 이름을 숨겨 찾기 칸에 자리를 준다 */}
            <span className="hidden sm:inline">{t('common.appName')}</span>
          </Link>
          {/* 찾기 — 본문에서 글자를 찾는다. Enter 다음, Shift+Enter 이전, Esc 지우기 */}
          <div role="search" className="mx-2 flex min-w-0 max-w-md flex-1 items-center gap-1 rounded-md border bg-background px-2 sm:mx-3">
            <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  step(event.shiftKey ? -1 : 1)
                } else if (event.key === 'Escape') {
                  setQuery('')
                }
              }}
              placeholder={t('guide.search.placeholder')}
              aria-label={t('guide.search.placeholder')}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {searching ? (
              <>
                <span aria-live="polite" data-testid="guide-search-count" className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {matches.length === 0 ? t('guide.search.none') : `${current + 1} / ${matches.length}`}
                </span>
                <button type="button" onClick={() => step(-1)} disabled={matches.length === 0} aria-label={t('guide.search.prev')} title={t('guide.search.prev')} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
                  <ChevronUp aria-hidden className="size-4" />
                </button>
                <button type="button" onClick={() => step(1)} disabled={matches.length === 0} aria-label={t('guide.search.next')} title={t('guide.search.next')} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
                  <ChevronDown aria-hidden className="size-4" />
                </button>
                <button type="button" onClick={() => setQuery('')} aria-label={t('guide.search.clear')} title={t('guide.search.clear')} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X aria-hidden className="size-4" />
                </button>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LanguageSelect />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-4 py-8">
        <nav aria-label={t('guide.contents')} className="sticky top-20 hidden h-fit w-56 shrink-0 md:block">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('guide.contents')}</p>
          <ul className="grid gap-1 text-sm">
            {headings.map((heading, index) => (
              <li key={heading}>
                <button
                  type="button"
                  onClick={() => scrollTo(index)}
                  aria-current={index === active ? 'location' : undefined}
                  className={cn(
                    'flex w-full items-start gap-2 rounded border-l-2 px-2 py-1 text-left hover:bg-muted hover:text-foreground',
                    index === active
                      ? 'border-primary bg-muted font-medium text-foreground'
                      : 'border-transparent text-muted-foreground',
                    // 찾는 중에는 결과가 없는 절을 흐리게 한다
                    searching && !sectionCounts.has(index) && 'opacity-40',
                  )}
                >
                  <span className="min-w-0 flex-1">{heading}</span>
                  {sectionCounts.has(index) ? (
                    <span data-testid="guide-toc-count" className="mt-0.5 shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-medium leading-5 text-primary-foreground tabular-nums">
                      {sectionCounts.get(index)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          <h1 className="mb-6 text-2xl font-bold tracking-tight">{t('guide.title')}</h1>
          {/* 그림을 누르면 새 창에서 원래 크기로 연다 — 본문 폭에 맞춰 줄어든 화면 글자를 읽기 위해서다 */}
          <article
            ref={articleRef}
            data-testid="guide-article"
            // 절(h2)과 소제목(h3) 위에 여백을 넉넉히 둔다 — 뷰어 기본값은 앞 문단에 바짝 붙는다(뷰어 스타일보다 우선하게 !)
            className="[&_h2]:scroll-mt-20 [&_h2]:mt-16! [&_h2]:mb-5! [&_h2:first-of-type]:mt-8! [&_h3]:mt-10! [&_h3]:mb-3! [&_img]:my-3! [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_img]:border"
            onClick={(event) => {
              const target = event.target
              if (target instanceof HTMLImageElement) window.open(target.src, '_blank', 'noopener,noreferrer')
            }}
          >
            {markdown === null ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <MarkdownViewer key={language} markdown={markdown} />
              </Suspense>
            )}
          </article>
        </main>
      </div>
    </div>
  )
}
