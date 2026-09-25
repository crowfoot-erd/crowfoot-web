/**
 * 이용약관 페이지 — 무료 매니지드 DB 영속성 비보장 고지 (2026-09-15)
 *
 * - 게스트·인증 모두 접근 가능한 공개 문서 (랜딩 푸터 링크 → /terms)
 * - 본문은 i18n terms.sections(returnObjects) — 화면 문구는 리소스에만
 * - 헤더 우측 언어·테마 토글 — 공개 페이지 공통 배치(v1.16 이동)
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LanguageSelect } from '@/components/language-select'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { usePageMeta } from '@/hooks/usePageMeta'

/** i18n terms.sections 한 단위 — heading + paragraphs */
interface TermsSection {
  heading: string
  paragraphs: string[]
}

export function TermsPage() {
  const { t } = useTranslation()
  // 설명은 서비스 기본(index.html) 유지 — 약관 문구가 검색 설명으로는 부적절해서
  usePageMeta({ title: `${t('terms.title')} — ${t('common.appName')}` })
  const sections = t('terms.sections', { returnObjects: true }) as TermsSection[]

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold hover:opacity-80">
          <Logo className="size-6" />
          {t('common.appName')}
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LanguageSelect />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{t('terms.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('terms.updated')}</p>

        <div className="mt-10 flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="mb-3 text-lg font-semibold">{section.heading}</h2>
              <div className="flex flex-col gap-2">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">
            {t('terms.back')}
          </Link>
          <span>{t('common.footer')}</span>
        </div>
      </footer>
    </div>
  )
}
