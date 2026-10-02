/**
 * 사용 가이드 /guide — 로그인 없이 누구나 읽는 공개 문서 (04-front/00-overview.md)
 *
 * - 본문은 언어별 마크다운 파일(src/content/guide/{ko,en,ja,zh}.md)이다. UI 언어를 따르고,
 *   언어를 바꾸면 그 언어의 파일을 내려받는다(파일마다 별도 청크)
 * - 본문의 `{{키}}`는 그 언어의 화면 문구(번역 파일)로 바꿔 보여 준다 — 버튼·메뉴 이름이 화면과 어긋나지 않는다
 * - 왼쪽 목차는 본문의 `## ` 제목에서 만든다. 누르면 그 절로 스크롤한다.
 *   본문을 내리면 지금 읽는 절이 목차에서 강조된다
 * - 본문은 릴리스 노트와 같은 MarkdownViewer를 쓴다. 그림은 언어별로 따로 있다(public/guide-assets/{언어}/ —
 *   scripts/capture-guide.test.ts가 만든다). 그림을 누르면 새 창에서 원래 크기로 열린다
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
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

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold hover:opacity-80">
            <Logo className="size-6" />
            {t('common.appName')}
          </Link>
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
                    'w-full rounded border-l-2 px-2 py-1 text-left hover:bg-muted hover:text-foreground',
                    index === active
                      ? 'border-primary bg-muted font-medium text-foreground'
                      : 'border-transparent text-muted-foreground',
                  )}
                >
                  {heading}
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
            className="[&_h2]:scroll-mt-20 [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_img]:border"
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
