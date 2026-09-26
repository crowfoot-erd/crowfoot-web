/**
 * 랜딩/소개 페이지 — 게스트의 / 첫 화면 (오픈소스 공개 대응, 2026-09-15)
 *
 * - 히어로(2행 강조) + 3단계 흐름(그리기→다듬기→실행) + 특징 6종 + 통합 공유 갤러리(인기 3 박스+최근, 새 창) + 최근 릴리스(공개 — 문서 하단, 새 창)
 * - 인증 상태에서도 열람 가능(리다이렉트 없음) — CTA는 로그인/앱 진입으로 전환, 헤더에 앱 셸과 같은 사용자 메뉴(정보·로그아웃)
 * - 헤더 우측 언어·테마 토글(로그인 버튼 옆) — 우하단 고정은 발견성이 낮아 이동(v1.16, 글로벌 진입점)
 */
import { Link } from 'react-router-dom'
import { ArrowUpRight, Cable, Code2, Database, Eye, Flame, Layers, ShieldCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageSelect } from '@/components/language-select'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { UserMenu } from '@/layouts/components/user-menu'
import { usePublicReleaseNotes } from '@/features/community/hooks'
import { useSharedGallery } from '@/features/models/hooks'
import { galleryDisplay } from '@/features/models/template-display'
import { usePageMeta } from '@/hooks/usePageMeta'
import { formatDate } from '@/lib/format'
import { APP_VERSION } from '@/lib/version'
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
  // 랜딩은 브랜드 선행 제목(다른 페이지의「화면 제목 — Crowfoot」규칙 예외)
  usePageMeta({
    title: `${t('common.appName')} — ${t('landing.badge')}`,
    description: t('landing.hero.description'),
  })
  const status = useSessionStore((state) => state.status)
  // 인증 상태에서도 랜딩 열람 가능 — CTA 행선지만 전환된다
  const authenticated = status === 'authenticated'
  const { data: gallery } = useSharedGallery()
  // 갤러리는 서버가 이미 정렬·선별해 준다 — 전 워크스페이스 공유(템플릿 포함)를 조회수 상위 3(인기) 우선
  // + 나머지 최근 공유순으로 최대 21건. 선두 3건이 인기 박스 구간이다(서버 계약 POPULAR_LIMIT와 같은 값)
  const galleryItems = gallery?.items ?? []
  const popularItems = galleryItems.slice(0, 3)
  const recentItems = galleryItems.slice(3)
  const { data: releaseNotes } = usePublicReleaseNotes()
  const releaseNoteItems = releaseNotes?.items ?? []

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Logo className="size-6" />
          {t('common.appName')}
          <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
            {t('common.appTagline')}
          </span>
        </div>
        {/* 언어·테마는 행동 버튼 왼쪽 — 인증 상태 — 앱 셸과 같은 사용자 메뉴(정보·로그아웃)를 헤더에 둔다 */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LanguageSelect />
          {authenticated ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">{t('landing.cta.dashboard')}</Link>
              </Button>
              <UserMenu />
            </>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">{t('landing.cta.login')}</Link>
            </Button>
          )}
        </div>
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
              <Link to={authenticated ? '/dashboard' : '/login'}>
                {authenticated ? t('landing.cta.goApp') : t('landing.cta.start')}
              </Link>
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

        {/* 통합 공유 갤러리 — 현재 공유 중인 문서가 있을 때만 (조회 중·빈 목록·실패는 조용히 숨김).
            전 워크스페이스 공유(템플릿 문서 포함)가 한 목록에 온다 — 템플릿 전용 섹션은 폐지됐다.
            카드 표기는 한국어 단일(galleryDisplay) — 문서 자체는 현지화 그대로다 */}
        {galleryItems.length > 0 && (
          <section aria-labelledby="landing-gallery" className="w-full" data-testid="landing-gallery">
            <h2 id="landing-gallery" className="mb-6 text-center text-2xl font-semibold">
              {t('landing.gallery.heading')}
            </h2>
            {/* 인기 박스 — 서버 POPULAR_LIMIT(3)가 내려준 선두 3건을 다른 꼴로 강조한다 */}
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
              {t('landing.gallery.popular')}
            </h3>
            <div className="grid gap-4 sm:grid-cols-3" data-testid="landing-gallery-popular">
              {popularItems.map((item) => {
                const { name, description } = galleryDisplay(item)
                const { shareToken, databaseType, updatedAt, viewCount } = item
                return (
                  <Link
                    key={shareToken}
                    to={`/share/${shareToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <Card className="h-full border-primary/40 bg-primary/5 transition-colors group-hover:border-primary/60">
                      <CardContent className="flex h-full flex-col gap-3 p-6">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <Flame aria-hidden className="size-3" />
                            {t('landing.gallery.popularBadge')}
                          </span>
                          <span className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                            {databaseType}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold">{name}</h3>
                        {description && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
                        )}
                        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          {/* 공개 조회 수 — 인기 구간의 성격 그대로 강조(단순 카운트) */}
                          <span className="flex items-center gap-1 font-medium tabular-nums text-primary">
                            <Eye aria-hidden className="size-3.5" />
                            {t('landing.gallery.views', { count: viewCount })}
                          </span>
                          {formatDate(updatedAt)}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
            {/* 최근 공유 — 인기 3을 제외한 나머지, 서버가 최근 발급순으로 내려준다 */}
            {recentItems.length > 0 && (
              <>
                <h3 className="mb-3 mt-10 text-sm font-semibold text-muted-foreground">
                  {t('landing.gallery.recent')}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {recentItems.map((item) => {
                    const { name, description } = galleryDisplay(item)
                    const { shareToken, databaseType, updatedAt, viewCount } = item
                    return (
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
                              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                {/* 공개 조회 수 — 인기 정렬 원료 그대로 노출(단순 카운트) */}
                                <span className="flex items-center gap-1 tabular-nums">
                                  <Eye aria-hidden className="size-3" />
                                  {t('landing.gallery.views', { count: viewCount })}
                                </span>
                                {formatDate(updatedAt)}
                              </span>
                            </div>
                            <h3 className="font-medium">{name}</h3>
                            {description && (
                              <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {/* 최근 릴리스 — 문서 하단(갤러리 뒤). 공개 릴리스 노트가 있을 때만 (조회 중·빈 목록·실패는 조용히 숨김, 갤러리와 같은 규칙) */}
        {releaseNoteItems.length > 0 && (
          <section aria-labelledby="landing-release-notes" className="w-full" data-testid="landing-release-notes">
            <h2 id="landing-release-notes" className="mb-6 text-center text-2xl font-semibold">
              {t('landing.releaseNotes.heading')}
            </h2>
            <ul className="mx-auto flex max-w-2xl flex-col">
              {/* 공개 뷰어는 새 창 — 랜딩 흐름 유지(갤러리 카드와 같은 규칙). 제목 → 날짜, 왼쪽 정렬 */}
              {releaseNoteItems.map(({ postId, title, createdAt }) => (
                <li key={postId}>
                  <Link
                    to={`/release-notes/${postId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium group-hover:underline">{title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDate(createdAt)}
                    </span>
                    <ArrowUpRight
                      aria-hidden
                      className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-3">
            <span>{t('common.footer')}</span>
            {/* 현재 버전 — 첫 방문에서도 지금 몇 버전인지 알 수 있게 (v1.17) */}
            <span data-testid="landing-current-version" className="tabular-nums">
              {t('landing.footer.currentVersion', { version: APP_VERSION })}
            </span>
          </span>
          <span className="flex items-center gap-3">
            <Link to="/terms" className="hover:underline">
              {t('landing.footer.terms')}
            </Link>
            <span>{t('landing.footer.opensource')}</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
