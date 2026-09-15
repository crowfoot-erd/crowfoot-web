/**
 * 랜딩/소개 페이지 — 게스트의 / 첫 화면 (오픈소스 공개 대응, 2026-09-15)
 *
 * - 히어로(2행 강조) + 3단계 흐름(그리기→다듬기→실행) + 특징 6종 + 공유 문서 갤러리(새 창) + CTA
 * - 인증 상태로 접속하면 /dashboard로 보낸다 (사용자의 앱 홈)
 * - 우하단 언어·테마 토글 — 로그인 페이지와 동일 배치
 */
import { Navigate, Link } from 'react-router-dom'
import { Cable, Code2, Database, Layers, ShieldCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageSelect } from '@/components/language-select'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSharedGallery } from '@/features/models/hooks'
import { formatDate } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

/** 특징 카드 정의 — 핵심(무료 매니지드 DB)이 먼저 온다. 아이콘은 중립 도형만 (lucide v1 브랜드 아이콘 없음) */
const FEATURES = [
  { key: 'managed', icon: Database },
  { key: 'editor', icon: Layers },
  { key: 'collaboration', icon: Users },
  { key: 'connections', icon: Cable },
  { key: 'roles', icon: ShieldCheck },
  { key: 'opensource', icon: Code2 },
] as const

export function LandingPage() {
  const { t } = useTranslation()
  const status = useSessionStore((state) => state.status)
  const { data: gallery } = useSharedGallery()
  const galleryItems = gallery?.items ?? []

  // 이미 로그인한 사용자 — 소개 대신 앱 홈으로
  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Logo className="size-6" />
          {t('common.appName')}
          <span className="text-sm font-normal text-muted-foreground">{t('common.appTagline')}</span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">{t('landing.cta.login')}</Link>
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-20 px-4 py-16">
        {/* 히어로 */}
        <section className="flex flex-col items-center gap-5 text-center">
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            {t('landing.badge')}
          </span>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight md:text-5xl">
            {t('landing.hero.title')}
            <br />
            {/* 강조 라인 — 그라디언트로 후크를 준다 (장식은 CSS로 — 스토리보드 §3.10) */}
            <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
              {t('landing.hero.titleAccent')}
            </span>
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">{t('landing.hero.description')}</p>
          {/* 핵심 강조 — 무료 매니지드 DB 조건 */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {(['engines', 'quota', 'free'] as const).map((key) => (
              <span
                key={key}
                className="rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground"
              >
                {t(`landing.highlight.${key}`)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/login">{t('landing.cta.start')}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="https://github.com/crowfoot-erd" target="_blank" rel="noreferrer">
                <Code2 aria-hidden />
                {t('landing.cta.github')}
              </a>
            </Button>
          </div>
        </section>

        {/* 3단계 흐름 — 그리기 → 함께 다듬기 → 실행 (히어로 메시지의 전개) */}
        <section aria-label={t('landing.steps.label')} className="grid w-full gap-6 sm:grid-cols-3">
          {(['draw', 'refine', 'run'] as const).map((key, index) => (
            <div key={key} className="flex flex-col gap-2 border-t pt-4">
              <span className="text-xs font-semibold tracking-widest text-primary">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="font-medium">{t(`landing.steps.${key}.title`)}</h3>
              <p className="text-sm text-muted-foreground">
                {t(`landing.steps.${key}.description`)}
              </p>
            </div>
          ))}
        </section>

        {/* 특징 6종 */}
        <section aria-labelledby="landing-features" className="w-full">
          <h2 id="landing-features" className="mb-6 text-center text-2xl font-semibold">
            {t('landing.features.heading')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon }) => (
              <Card key={key}>
                <CardContent className="flex flex-col gap-2 p-5">
                  <Icon aria-hidden className="size-5 text-primary" />
                  <h3 className="font-medium">{t(`landing.features.${key}.title`)}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t(`landing.features.${key}.description`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 공유된 문서 갤러리 — 현재 공유 중인 문서가 있을 때만 (조회 중·빈 목록·실패는 조용히 숨김) */}
        {galleryItems.length > 0 && (
          <section aria-labelledby="landing-gallery" className="w-full">
            <h2 id="landing-gallery" className="mb-6 text-center text-2xl font-semibold">
              {t('landing.gallery.heading')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* 공개 뷰어는 새 창으로 — 랜딩 흐름은 그대로 둔다 */}
              {galleryItems.map(
                ({ shareToken, modelName, description, databaseType, updatedAt }) => (
                  <Link
                    key={shareToken}
                    to={`/share/${shareToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <Card className="h-full transition-colors group-hover:border-primary/50">
                      <CardContent className="flex h-full flex-col gap-2 p-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                            {databaseType}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(updatedAt)}
                          </span>
                        </div>
                        <h3 className="font-medium">{modelName}</h3>
                        {description && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ),
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 text-xs text-muted-foreground">
          <span>{t('common.footer')}</span>
          <span className="flex items-center gap-3">
            <Link to="/terms" className="hover:underline">
              {t('landing.footer.terms')}
            </Link>
            <span>{t('landing.footer.opensource')}</span>
          </span>
        </div>
      </footer>

      {/* 우하단 고정 — 언어·테마 */}
      <div className="fixed bottom-4 right-4 flex items-center gap-1">
        <ThemeToggle />
        <LanguageSelect />
      </div>
    </div>
  )
}
