/**
 * 사용 가이드 /guide — 로그인 없이 누구나 읽는 공개 문서 (04-front/00-overview.md)
 *
 * - 본문은 언어별 마크다운 파일(src/content/guide/{ko,en,ja,zh}.md)이다. UI 언어를 따르고,
 *   언어를 바꾸면 그 언어의 파일을 내려받는다(파일마다 별도 청크)
 * - 왼쪽 목차는 본문의 `## ` 제목에서 만든다. 누르면 그 절로 스크롤한다
 * - 본문은 릴리스 노트와 같은 MarkdownViewer를 쓴다(이미지는 public/guide-assets)
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

// toast-ui 청크 분리 — 메인 번들에 포함하지 않는다(release-note-viewer 관례)
const MarkdownViewer = lazy(() => import('@/features/community/components/markdown-viewer'))

/** 언어별 본문 — 고른 언어의 파일만 내려받는다 */
const LOADERS: Record<Language, () => Promise<{ default: string }>> = {
  ko: () => import('@/content/guide/ko.md?raw'),
  en: () => import('@/content/guide/en.md?raw'),
  ja: () => import('@/content/guide/ja.md?raw'),
  zh: () => import('@/content/guide/zh.md?raw'),
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

  const markdown = loaded?.language === language ? loaded.markdown : null
  const headings = useMemo(() => (markdown ? guideHeadings(markdown) : []), [markdown])

  /** 목차 — 본문에서 n번째 h2를 찾아 그 자리로 옮긴다(뷰어가 제목에 id를 붙이지 않는다) */
  const scrollTo = (index: number) => {
    articleRef.current?.querySelectorAll('h2')[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
                  className="w-full rounded px-2 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {heading}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          <h1 className="mb-6 text-2xl font-bold tracking-tight">{t('guide.title')}</h1>
          <article ref={articleRef} data-testid="guide-article" className="[&_h2]:scroll-mt-20 [&_img]:rounded-lg [&_img]:border">
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
