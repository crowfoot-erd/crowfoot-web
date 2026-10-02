/**
 * 랜딩/소개 페이지 — 게스트의 / 첫 화면 (오픈소스 공개 대응, 2026-09-15)
 *
 * - 히어로(2행 강조) + 3단계 흐름(그리기→다듬기→실행) + 특징 6종 + 통합 공유 갤러리(인기 3 박스+최근, 새 창) + 최근 릴리스(공개 — 문서 하단, 새 창)
 * - 인증 상태에서도 열람 가능(리다이렉트 없음) — CTA는 로그인/앱 진입으로 전환, 헤더에 앱 셸과 같은 사용자 메뉴(정보·로그아웃)
 * - 헤더 우측 언어·테마 토글(로그인 버튼 옆) — 우하단 고정은 발견성이 낮아 이동(v1.16, 글로벌 진입점)
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Cable, ClipboardList, Clock, Code2, Rows3, Sparkles, Database, Eye, FileCode2, FileDown, Flame, Heart, History, Layers, LibraryBig, ListChecks, Share2, ShieldCheck, Users, BookOpenText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DbmsIcon } from '@/components/dbms-icon'
import { dbmsLabel } from '@/features/editor/model/dbms'
import { LanguageSelect } from '@/components/language-select'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { UserMenu } from '@/layouts/components/user-menu'
import { usePublicReleaseNotes } from '@/features/community/hooks'
import { useSharedGallery } from '@/features/models/hooks'
import { usePageMeta } from '@/hooks/usePageMeta'
import { currentLanguage } from '@/lib/i18n'
import { formatDate } from '@/lib/format'
import { APP_VERSION } from '@/lib/version'
import { useSessionStore } from '@/stores/session'

/** 특징 카드 정의 — 핵심(무료 매니지드 DB)이 먼저 온다. 아이콘은 중립 도형만 (lucide v1 브랜드 아이콘 없음).
 *  카드 하나가 검색 의도 하나에 대응한다(ERD 에디터·협업·리버스·DDL·검증·버전·예제·공유·내보내기) —
 *  문구는 i18n landing.features.{key} (04-front/storyboard/00-common.md §3.11) */
/** 히어로 아래의 제품 화면 — 사용 가이드 그림의 이름(public/guide-assets/{언어}/) */
const LANDING_SHOTS = ['editor-overview', 'editor-requirements', 'workspace-mcp', 'data-tab'] as const
/** 슬라이드의 장 — 첫 장은 AI 연동(MCP) 소개, 나머지는 제품 화면 */
const LANDING_SLIDES = ['mcp', ...LANDING_SHOTS] as const

/** 슬라이드가 넘어가는 간격 */
const SHOT_INTERVAL_MS = 5000

/** MCP 구역의 요점 */
const MCP_POINTS = [
  { key: 'requirements', icon: ClipboardList },
  { key: 'design', icon: Layers },
  { key: 'deploy', icon: Database },
  { key: 'sample', icon: Rows3 },
] as const
/** 대화 예시 — 요청과 결과가 번갈아 온다 */
const MCP_EXAMPLE = ['ask1', 'done1', 'ask2', 'done2', 'ask3', 'done3'] as const

const FEATURES = [
  { key: 'managed', icon: Database },
  { key: 'editor', icon: Layers },
  { key: 'collaboration', icon: Users },
  { key: 'connections', icon: Cable },
  { key: 'sql', icon: FileCode2 },
  { key: 'validation', icon: ListChecks },
  { key: 'history', icon: History },
  { key: 'library', icon: LibraryBig },
  { key: 'share', icon: Share2 },
  { key: 'export', icon: FileDown },
  { key: 'roles', icon: ShieldCheck },
  { key: 'opensource', icon: Code2 },
] as const

export function LandingPage() {
  const { t } = useTranslation()
  // 히어로 이미지 — 언어·테마에 맞는 한 장만 싣는다(두 장을 깔고 CSS로 숨기면 둘 다 내려받는다)
  /** 히어로 아래에서 보여 줄 제품 화면 — 탭으로 고른다 */
  const [shot, setShot] = useState<(typeof LANDING_SLIDES)[number]>('mcp')
  // 슬라이드 — 5초마다 다음 장으로 넘어간다. 마우스를 올리면 멈추고, 탭을 직접 고르면 그 뒤로는 넘기지 않는다.
  // 움직임을 줄이도록 설정한 사용자에게는 넘기지 않는다
  const [hovering, setHovering] = useState(false)
  const [picked, setPicked] = useState(false)
  useEffect(() => {
    if (hovering || picked) return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      setShot((current) => LANDING_SLIDES[(LANDING_SLIDES.indexOf(current) + 1) % LANDING_SLIDES.length])
    }, SHOT_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [hovering, picked])
  const shotIndex = LANDING_SLIDES.indexOf(shot)
  /** 사용 가이드 — 새 창으로 연다. 지금 언어의 주소로 보낸다(ko는 접두 없음) */
  const guideHref = currentLanguage() === 'ko' ? '/guide' : `/${currentLanguage()}/guide`
  // 랜딩은 브랜드 선행 제목(다른 페이지의「화면 제목 — Crowfoot」규칙 예외).
  // 프리렌더가 정적 head에 넣는 문구(landing.seo.*)와 같은 값을 쓴다 — 크롤러가 JS 실행 전후로
  // 서로 다른 제목·설명을 보지 않게 한다(scripts/prerender.mjs)
  usePageMeta({
    title: t('landing.seo.title'),
    description: t('landing.seo.description'),
  })
  const status = useSessionStore((state) => state.status)
  // 인증 상태에서도 랜딩 열람 가능 — CTA 행선지만 전환된다
  const authenticated = status === 'authenticated'
  const { data: gallery } = useSharedGallery()
  // 갤러리는 서버가 이미 정렬·선별해 준다 — 전 워크스페이스 공유(템플릿 포함)를 조회수 상위 3(인기) 우선
  // + 나머지 최근 공유순으로 최대 18건(인기 3+최근 15). 선두 3건이 인기 박스 구간이다(서버 POPULAR_LIMIT와 같은 값)
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
          {/* 사용 가이드 — 로그인하지 않아도 어떤 기능이 있는지 볼 수 있다(/guide) */}
          <Button asChild variant="ghost" size="sm">
            <a href={guideHref} target="_blank" rel="noopener noreferrer" data-testid="landing-guide-link">
              {t('guide.title')}
            </a>
          </Button>
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
            {(['engines', 'quota', 'free', 'mcp'] as const).map((key) => (
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
            <Button asChild size="lg" variant="outline">
              <a href={guideHref} target="_blank" rel="noopener noreferrer">
                <BookOpenText aria-hidden />
                {t('guide.title')}
              </a>
            </Button>
          </div>
        </section>

        {/* 슬라이드 — 히어로 바로 아래. 첫 장이 AI 연동(MCP) 소개다(2026-10-02 사용자 요청 — MCP를 강조하고 화면 슬라이드와 합친다) */}
        <section className="w-full" aria-label={t('landing.shots.label')}>
          {/* 제품 화면 — 슬라이드. 화면 한 장을 크게 보여 주고 몇 초마다 다음 화면으로 넘긴다. 위의 탭으로 직접 고른다
              (2026-10-02 사용자 요청 — 큰 그림 한 장 대신 여러 화면을 롤링. 작게 늘어놓으면 글자가 보이지 않는다).
              그림은 사용 가이드의 것을 쓴다(언어별). 그림을 누르면 새 창에서 원래 크기로 연다 */}
          <div
            className="w-full"
            data-testid="landing-shots"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onFocus={() => setHovering(true)}
            onBlur={() => setHovering(false)}
          >
            <div role="tablist" aria-label={t('landing.shots.label')} className="mb-3 flex flex-wrap items-center justify-center gap-2">
              {LANDING_SLIDES.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={shot === name}
                  onClick={() => {
                    setShot(name)
                    setPicked(true)
                  }}
                  className={
                    shot === name
                      ? 'rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground'
                      : 'rounded-full border px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground'
                  }
                >
                  {name === 'mcp' ? t('landing.shots.mcp') : t(`landing.shots.${name}.caption`)}
                </button>
              ))}
            </div>
            {/* 슬라이드 트랙 — 첫 장은 AI 연동(MCP) 소개, 그 뒤로 제품 화면 넷. 가로로 이어 놓고 옆으로 민다
                (끊기지 않게 transform 전환). 보이지 않는 장은 inert로 두어 초점이 가지 않는다 */}
            <div className="overflow-hidden rounded-2xl border bg-muted/30 shadow-lg">
              <div
                data-testid="landing-shots-track"
                data-index={shotIndex}
                className="flex transition-transform duration-700 ease-in-out motion-reduce:transition-none"
                style={{ transform: `translateX(-${shotIndex * 100}%)` }}
              >
                {/* 첫 장 — AI와 함께 설계(MCP — v1.31·v1.32). 요청과 결과의 예시를 대화 모양으로 보여 준다 */}
                <div
                  data-testid="landing-mcp"
                  aria-label={t('landing.shots.mcp')}
                  inert={shotIndex !== 0}
                  className="w-full shrink-0 bg-gradient-to-br from-primary/10 via-background to-background p-6 text-left md:p-10"
                >
                  <div className="grid h-full items-center gap-8 md:grid-cols-2">
                    <div className="flex flex-col gap-4">
                      <span className="flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                        <Sparkles aria-hidden className="size-3.5" />
                        {t('landing.mcp.badge')}
                      </span>
                      <h2 className="text-3xl font-bold tracking-tight">
                        {t('landing.mcp.title')}
                      </h2>
                      <p className="text-base text-muted-foreground">{t('landing.mcp.description')}</p>
                      <ul className="grid gap-2.5">
                        {MCP_POINTS.map(({ key, icon: Icon }) => (
                          <li key={key} className="flex items-start gap-2.5 text-sm">
                            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                            <span>
                              <span className="font-medium">{t(`landing.mcp.points.${key}.title`)}</span>
                              <span className="text-muted-foreground"> — {t(`landing.mcp.points.${key}.description`)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <Button asChild>
                          <a href={`${guideHref}#20.1`} target="_blank" rel="noopener noreferrer" data-testid="landing-mcp-guide">
                            {t('landing.mcp.cta')}
                            <ArrowUpRight aria-hidden />
                          </a>
                        </Button>
                        <span className="text-xs text-muted-foreground">{t('landing.mcp.clients')}</span>
                      </div>
                    </div>
                    {/* 대화 예시 — 요청(›)과 결과(✓). 실제 화면이 아니라 쓰임새를 보여 주는 글이다 */}
                    <div className="rounded-xl border bg-zinc-950 p-4 font-mono text-[13px] leading-relaxed text-zinc-100 shadow-lg" aria-label={t('landing.mcp.exampleLabel')}>
                      {MCP_EXAMPLE.map((key, index) => (
                        <p key={key} className={index % 2 === 0 ? 'mt-3 first:mt-0' : 'pl-4 text-emerald-400'}>
                          <span aria-hidden className={index % 2 === 0 ? 'mr-2 text-zinc-500' : 'mr-2'}>
                            {index % 2 === 0 ? '›' : '✓'}
                          </span>
                          {t(`landing.mcp.example.${key}`)}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
                {LANDING_SHOTS.map((name, index) => {
                  const src = `/guide-assets/${currentLanguage()}/${name}.webp`
                  return (
                    <a
                      key={name}
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full shrink-0 items-center bg-background"
                      inert={index + 1 !== shotIndex}
                    >
                      <img
                        src={src}
                        alt={t(`landing.shots.${name}.alt`)}
                        decoding="async"
                        className="block aspect-[5/3] w-full object-contain"
                      />
                    </a>
                  )
                })}
              </div>
            </div>
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
          {/* 모든 기능의 자세한 설명은 사용 가이드에 있다 — 화면별 메뉴와 사용법 */}
          <p className="mt-6 text-center text-sm">
            <a
              href={guideHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {t('landing.features.more')}
              <ArrowUpRight aria-hidden className="size-4" />
            </a>
          </p>
        </section>

        {/* 통합 공유 갤러리 — 현재 공유 중인 문서가 있을 때만 (조회 중·빈 목록·실패는 조용히 숨김).
            전 워크스페이스 공유(템플릿 문서 포함)가 한 목록에 온다 — 템플릿 전용 섹션은 폐지됐다.
            카드는 문서 메타(제목·설명)를 그대로 — 현지화 문서도 원문 언어로 나온다(v1.24부터
            워크스페이스 템플릿 다이얼로그도 같은 규칙) */}
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
              {popularItems.map(({ modelName, description, shareToken, databaseType, updatedAt, reactionCount, viewCount }) => {
                return (
                  <Link
                    key={shareToken}
                    to={`/share/${shareToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    {/* 인기 강조는 red 계열 — "뜨거운" 문서라는 신호(디자인 토큰 밖의 국소 악센트) */}
                    <Card className="h-full border-red-500/40 bg-red-500/5 transition-colors group-hover:border-red-500/60">
                      <CardContent className="flex h-full flex-col gap-3 p-6">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                            <Flame aria-hidden className="size-3" />
                            {t('landing.gallery.popularBadge')}
                          </span>
                          <span className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                            <DbmsIcon databaseType={databaseType} className="size-3" />
                            {dbmsLabel(databaseType)}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold">{modelName}</h3>
                        {description && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
                        )}
                        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          {/* 반응 수가 인기 산정 1순위(v1.21) — 능동 신호를 red로, 조회 수는 보조 */}
                          <span className="flex items-center gap-2">
                            <span className="flex items-center gap-1 font-medium tabular-nums text-red-600 dark:text-red-400">
                              <Heart aria-hidden className="size-3.5 fill-current" />
                              {t('landing.gallery.reactions', { count: reactionCount })}
                            </span>
                            <span className="flex items-center gap-1 tabular-nums">
                              <Eye aria-hidden className="size-3.5" />
                              {t('landing.gallery.views', { count: viewCount })}
                            </span>
                          </span>
                          {formatDate(updatedAt)}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
            {/* 최근 공유 — 인기 3을 제외한 나머지, 서버가 최근 발급순으로 내려준다.
                카드 구성은 인기 박스와 같은 꼴(배지 → 제목 → 설명 → 풋터 메타)로 맞췄다 —
                차이는 악센트뿐: red "뜨거운" 신호 대신 Clock 배지(최근=새 소식, 2026-09-28 사용자 요청) */}
            {recentItems.length > 0 && (
              <>
                <h3 className="mb-3 mt-10 text-sm font-semibold text-muted-foreground">
                  {t('landing.gallery.recent')}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="landing-gallery-recent">
                  {recentItems.map(({ modelName, description, shareToken, databaseType, updatedAt, reactionCount, viewCount }) => {
                    return (
                      <Link
                        key={shareToken}
                        to={`/share/${shareToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group"
                      >
                        <Card className="h-full transition-colors group-hover:border-primary/50">
                          <CardContent className="flex h-full flex-col gap-3 p-6">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                <Clock aria-hidden className="size-3" />
                                {t('landing.gallery.recentBadge')}
                              </span>
                              <span className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                                <DbmsIcon databaseType={databaseType} className="size-3" />
                                {dbmsLabel(databaseType)}
                              </span>
                            </div>
                            <h3 className="text-base font-semibold">{modelName}</h3>
                            {description && (
                              <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
                            )}
                            <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              {/* 반응 수(v1.21) + 공개 조회 수 — 인기 카드와 같은 풋터, 색 악센트 없이 */}
                              <span className="flex items-center gap-2">
                                <span className="flex items-center gap-1 tabular-nums">
                                  <Heart aria-hidden className="size-3.5" />
                                  {t('landing.gallery.reactions', { count: reactionCount })}
                                </span>
                                <span className="flex items-center gap-1 tabular-nums">
                                  <Eye aria-hidden className="size-3.5" />
                                  {t('landing.gallery.views', { count: viewCount })}
                                </span>
                              </span>
                              {formatDate(updatedAt)}
                            </div>
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
            <a href={guideHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {t('landing.footer.guide')}
            </a>
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
