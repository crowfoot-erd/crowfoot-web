/**
 * 랜딩/소개 페이지 — 게스트의 / 첫 화면 (오픈소스 공개 대응, 2026-09-15)
 *
 * - 히어로(2행 강조) + 3단계 흐름(그리기→다듬기→실행) + 특징 6종 + 통합 공유 갤러리(인기 3 박스+최근, 새 창)
 *   + 만든 사이트(쇼케이스 6, 08-core/19-site-showcase.md Section 6) + 최근 릴리스(공개 — 문서 하단, 새 창)
 * - 인증 상태에서도 열람 가능(리다이렉트 없음) — CTA는 로그인/앱 진입으로 전환, 헤더에 앱 셸과 같은 사용자 메뉴(정보·로그아웃)
 * - 헤더 우측 언어·테마 토글(로그인 버튼 옆) — 우하단 고정은 발견성이 낮아 이동(v1.16, 글로벌 진입점)
 */
import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  Bot,
  Cable,
  ClipboardList,
  Clock,
  Code2,
  Database,
  Eye,
  FileCode2,
  FileDown,
  Flame,
  Heart,
  History,
  Layers,
  LibraryBig,
  ListChecks,
  Rows3,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DbmsIcon } from '@/components/dbms-icon'
import { dbmsLabel } from '@/features/editor/model/dbms'
import { PublicFooter, PublicHeader, publicPath } from '@/components/public-chrome'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePublicReleaseNotes } from '@/features/community/hooks'
import { useSharedGallery } from '@/features/models/hooks'
import { ShowcaseGrid } from '@/features/showcase/components/showcase-card'
import { useLandingShowcase } from '@/features/showcase/hooks'
import { usePageMeta } from '@/hooks/usePageMeta'
import { currentLanguage } from '@/lib/i18n'
import { formatDate } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

/** 특징 카드 정의 — 핵심(무료 매니지드 DB)이 먼저 온다. 아이콘은 중립 도형만 (lucide v1 브랜드 아이콘 없음).
 *  카드 하나가 검색 의도 하나에 대응한다(ERD 에디터·협업·리버스·DDL·검증·버전·예제·공유·내보내기) —
 *  문구는 i18n landing.features.{key} (04-front/storyboard/00-common.md §3.11) */
/** 히어로 아래의 제품 화면 — 사용 가이드 그림의 이름(public/guide-assets/{언어}/) */
const LANDING_SHOTS = ['editor-overview', 'editor-requirements', 'workspace-mcp', 'data-tab'] as const
/** 슬라이드의 장 — 첫 장은 AI 연동(MCP) 소개, 나머지는 제품 화면 */
const LANDING_SLIDES = ['mcp', ...LANDING_SHOTS] as const

/* 랜딩의 색 — 히어로의 에메랄드→하늘색을 모든 구역이 같이 쓴다 (2026-10-02 사용자 요청 — 색감과 아이콘 색을 히어로에 맞춘다) */
/** 강조 글자 — 그라디언트 */
const ACCENT_TEXT = 'bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 bg-clip-text text-transparent'
/** 아이콘 칩 — 옅은 에메랄드 바탕 */
const ICON_CHIP =
  'inline-flex size-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
/** 주 행동 버튼 */
const CTA_CLASS =
  'bg-gradient-to-r from-emerald-600 to-teal-600 font-semibold text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-500 hover:to-teal-500'
/** 구역 제목과 그 아래 색 막대 */
const SECTION_HEADING = 'mb-8 text-center text-3xl font-extrabold tracking-tight'
const SECTION_BAR = 'mx-auto mt-3 block h-1 w-12 rounded-full bg-gradient-to-r from-emerald-500 to-sky-500'
/** "모두 보기" 링크 */
const MORE_LINK = 'inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-300'

/** 다른 ERD 툴과 갈리는 점 — 히어로 아래 카드 셋 */
const EDGES = [
  { key: 'db', icon: Database },
  { key: 'mcp', icon: Bot },
  { key: 'trace', icon: ClipboardList },
] as const

/** 무료 데이터베이스 구역의 요점 */
const FREE_DB_POINTS = ['free', 'instant', 'deploy', 'browse'] as const
/** 접속 정보 카드에 보여 주는 보기 값 — 실제 발급 정보의 모양 */
const FREE_DB_SAMPLE = [
  ['engine', 'MySQL 8'],
  ['host', 's4.java21.net'],
  ['port', '13306'],
  ['database', 'cf_u1_d1'],
  ['user', 'cf_u1'],
  ['password', '••••••••••••'],
] as const

/** 히어로의 요청 예시 — AI에게 하는 말 */
const HERO_PROMPTS = ['p1', 'p2', 'p3'] as const

/**
 * 히어로의 요청 예시 — AI에게 하는 말을 타자 치듯 한 글자씩 보여 주고, 다 치면 잠깐 두었다가 다음 말로 넘어간다.
 * 움직임을 줄이도록 설정한 사용자에게는 첫 문장을 그대로 보여 준다. 읽는 프로그램에는 전체 문장을 준다
 */
function HeroPrompt({ prompts, label, who }: { prompts: string[]; label: string; who: string }) {
  const [reduced] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [index, setIndex] = useState(0)
  const [length, setLength] = useState(0)
  const text = prompts[index % prompts.length] ?? ''
  useEffect(() => {
    if (reduced) return
    if (length < text.length) {
      const timer = window.setTimeout(() => setLength((current) => current + 1), 60)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % prompts.length)
      setLength(0)
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [reduced, length, text.length, prompts.length])
  return (
    <div
      role="img"
      aria-label={`${label}: ${prompts.join(' / ')}`}
      data-testid="landing-hero-prompt"
      className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-emerald-500/30 bg-card px-5 py-4 text-left shadow-xl shadow-emerald-500/10"
    >
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
      >
        <Bot className="size-3.5" />
        {who}
      </span>
      <span aria-hidden className="min-w-0 flex-1 truncate font-mono text-sm md:text-base">
        {reduced ? text : text.slice(0, length)}
        <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-emerald-500" />
      </span>
      <kbd
        aria-hidden
        className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline"
      >
        Enter ↵
      </kbd>
    </div>
  )
}

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
  // 만든 사이트 — 서버가 최근 등록순 6건(size=6)을 내린다. 빈 목록·실패는 섹션을 숨긴다
  const { data: showcase } = useLandingShowcase()
  const showcaseItems = showcase?.items ?? []
  const { data: releaseNotes } = usePublicReleaseNotes()
  const releaseNoteItems = releaseNotes?.items ?? []

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <PublicHeader />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-20 break-keep px-4 py-16">
        {/* 히어로 — 첫 화면에서 눈에 들어오게: 색 번짐 배경, 큰 제목과 색 강조, AI에게 하는 말을 타자 치듯 보여 주는 요청 예시,
            색을 준 큰 행동 버튼 (2026-10-02 사용자 요청 — 가입해서 써 보고 싶게) */}
        <section className="relative isolate flex w-full flex-col items-center gap-6 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 left-1/2 -z-10 h-[460px] w-[min(960px,100vw)] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(16_185_129/0.22),rgb(14_165_233/0.10)_55%,transparent)] blur-2xl"
          />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Sparkles aria-hidden className="size-3.5" />
            {t('landing.badge')}
          </span>
          <h1 className="max-w-4xl text-balance text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl md:text-6xl">
            {t('landing.hero.title')}
            <br />
            {/* 강조 줄 — 색 그라디언트로 눈길을 준다 (장식은 CSS로 — 스토리보드 §3.10) */}
            <span className={ACCENT_TEXT}>
              {t('landing.hero.titleAccent')}
            </span>
          </h1>
          <HeroPrompt
            prompts={HERO_PROMPTS.map((key) => t(`landing.hero.prompts.${key}`))}
            label={t('landing.hero.promptLabel')}
            who={t('landing.hero.promptWho')}
          />
          <p className="max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            {t('landing.hero.description')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className={`h-12 px-8 text-base ${CTA_CLASS}`}
            >
              <Link to={authenticated ? '/dashboard' : '/login'} data-testid="landing-cta-start">
                {authenticated ? t('landing.cta.goApp') : t('landing.cta.start')}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12">
              <a href="https://github.com/crowfoot-erd" target="_blank" rel="noreferrer">
                <Code2 aria-hidden />
                {t('landing.cta.github')}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12">
              <a href={guideHref} target="_blank" rel="noopener noreferrer">
                <BookOpenText aria-hidden />
                {t('guide.title')}
              </a>
            </Button>
          </div>
          {/* 가입 문턱을 낮추는 한 줄 — 무료 조건을 행동 버튼 바로 아래에 둔다 (게스트에게만) */}
          {!authenticated && (
            <p className="text-xs text-muted-foreground" data-testid="landing-cta-note">
              {t('landing.cta.note')}
            </p>
          )}
          {/* 다른 ERD 툴과 갈리는 세 가지 — 실제 DB까지, 내 AI 연결, 요구사항 추적 (2026-10-02 사용자 요청) */}
          <ul className="mt-4 grid w-full gap-4 text-left md:grid-cols-3" data-testid="landing-edge">
            {EDGES.map(({ key, icon: Icon }) => (
              <li key={key} className="rounded-xl border bg-card/70 p-5 shadow-sm backdrop-blur">
                <span className={`mb-3 ${ICON_CHIP}`}>
                  <Icon aria-hidden className="size-5" />
                </span>
                <h2 className="text-base font-semibold">{t(`landing.edge.${key}.title`)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t(`landing.edge.${key}.body`)}</p>
              </li>
            ))}
          </ul>
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
                      ? 'rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm shadow-emerald-500/30'
                      : 'rounded-full border px-4 py-1.5 text-sm text-muted-foreground hover:border-emerald-500/50 hover:text-foreground'
                  }
                >
                  {name === 'mcp' ? t('landing.shots.mcp') : t(`landing.shots.${name}.caption`)}
                </button>
              ))}
            </div>
            {/* 슬라이드 트랙 — 첫 장은 AI 연동(MCP) 소개, 그 뒤로 제품 화면 넷. 가로로 이어 놓고 옆으로 민다
                (끊기지 않게 transform 전환). 보이지 않는 장은 inert로 두어 초점이 가지 않는다 */}
            <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-muted/30 shadow-xl shadow-emerald-500/10">
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
                  className="w-full shrink-0 bg-gradient-to-br from-emerald-500/10 via-background to-sky-500/10 p-6 text-left md:p-10"
                >
                  <div className="grid h-full items-center gap-8 md:grid-cols-2">
                    <div className="flex flex-col gap-4">
                      <span className="flex w-fit items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
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
                            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>
                              <span className="font-medium">{t(`landing.mcp.points.${key}.title`)}</span>
                              <span className="text-muted-foreground"> — {t(`landing.mcp.points.${key}.description`)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <Button asChild className={CTA_CLASS}>
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

        {/* 무료 개발용 데이터베이스 — 슬라이드 다음에 크게 알린다(2026-10-02 사용자 요청 — 무료 DB는 큰 장점이다).
            오른쪽은 발급된 데이터베이스의 접속 정보 모양(값은 보기 예시) */}
        <section
          aria-labelledby="landing-free-db"
          data-testid="landing-free-db"
          className="w-full overflow-hidden rounded-2xl border bg-gradient-to-br border-emerald-500/20 from-sky-500/10 via-background to-emerald-500/10 p-6 text-left shadow-xl shadow-emerald-500/10 md:p-10"
        >
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                <Database aria-hidden className="size-3.5" />
                {t('landing.freeDb.badge')}
              </span>
              <h2 id="landing-free-db" className="whitespace-pre-line text-3xl font-bold tracking-tight md:text-4xl">
                {t('landing.freeDb.heading')}
              </h2>
              <p className="text-base text-muted-foreground">{t('landing.freeDb.description')}</p>
              <ul className="flex flex-col gap-2 text-sm">
                {FREE_DB_POINTS.map((key) => (
                  <li key={key} className="flex gap-2">
                    <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {t(`landing.freeDb.points.${key}`)}
                  </li>
                ))}
              </ul>
              <div>
                <Button asChild size="lg" className={`h-11 ${CTA_CLASS}`}>
                  <Link to={authenticated ? '/dashboard' : '/login'} data-testid="landing-free-db-cta">
                    {t('landing.freeDb.cta')}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
            <div aria-hidden className="rounded-xl border bg-card p-5 font-mono text-xs shadow-xl md:text-sm">
              <div className="mb-3 flex items-center justify-between font-sans">
                <span className="text-sm font-semibold">{t('landing.freeDb.cardTitle')}</span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  ● {t('landing.freeDb.cardStatus')}
                </span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                {FREE_DB_SAMPLE.map(([name, value]) => (
                  <Fragment key={name}>
                    <dt className="text-muted-foreground">{name}</dt>
                    <dd className="truncate">{value}</dd>
                  </Fragment>
                ))}
              </dl>
              <div className="mt-4 overflow-x-auto whitespace-nowrap rounded-md bg-zinc-950 px-3 py-2 text-zinc-100">
                <span className="text-zinc-500">$ </span>mysql -h s4.java21.net -P 13306 -u cf_u1 -p
              </div>
            </div>
          </div>
        </section>

        {/* 3단계 흐름 — 그리기 → 함께 다듬기 → 실행 (히어로 메시지의 전개) */}
        <section aria-label={t('landing.steps.label')} className="grid w-full gap-6 sm:grid-cols-3">
          {(['draw', 'refine', 'run'] as const).map((key, index) => (
            <div key={key} className="flex flex-col gap-2 border-t-2 border-emerald-500/30 pt-4">
              <span className={`w-fit text-2xl font-extrabold tracking-tight ${ACCENT_TEXT}`}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-lg font-semibold">{t(`landing.steps.${key}.title`)}</h3>
              <p className="text-sm text-muted-foreground">
                {t(`landing.steps.${key}.description`)}
              </p>
            </div>
          ))}
        </section>

        {/* 특징 6종 */}
        <section aria-labelledby="landing-features" className="w-full">
          <h2 id="landing-features" className={SECTION_HEADING}>
            {t('landing.features.heading')}
            <span aria-hidden className={SECTION_BAR} />
</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon }) => (
              <Card key={key} className="transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md">
                <CardContent className="flex flex-col gap-2 p-5">
                  <span className={ICON_CHIP}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="font-semibold">{t(`landing.features.${key}.title`)}</h3>
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
              className={MORE_LINK}
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
            <h2 id="landing-gallery" className={SECTION_HEADING}>
              {t('landing.gallery.heading')}
              <span aria-hidden className={SECTION_BAR} />
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
                        <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:border-emerald-500/50 group-hover:shadow-md">
                          <CardContent className="flex h-full flex-col gap-3 p-6">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
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
            {/* 공유 문서 전체 — 검색과 페이지가 있는 목록 화면으로 간다 */}
            <p className="mt-6 text-center text-sm">
              <Link
                to={publicPath('/shared')}
                data-testid="landing-gallery-more"
                className={MORE_LINK}
              >
                {t('landing.gallery.more')}
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </p>
          </section>
        )}

        {/* 만든 사이트 — 공유 갤러리 아래(08-core/19-site-showcase.md Section 6). 등록된 사이트가 있을 때만
            (조회 중·빈 목록·실패는 조용히 숨김, 갤러리와 같은 규칙). 공유하지 않은 문서도 사이트 카드는 나온다 */}
        {showcaseItems.length > 0 && (
          <section aria-labelledby="landing-showcase" className="w-full" data-testid="landing-showcase">
            <h2 id="landing-showcase" className={SECTION_HEADING}>
              {t('landing.showcase.heading')}
              <span aria-hidden className={SECTION_BAR} />
            </h2>
            <ShowcaseGrid sites={showcaseItems} testId="landing-showcase-list" />
            {/* 전체 목록 — "더 보기"로 다음 페이지를 붙이는 화면으로 간다 */}
            <p className="mt-6 text-center text-sm">
              <Link
                to={publicPath('/showcase')}
                data-testid="landing-showcase-more"
                className={MORE_LINK}
              >
                {t('landing.showcase.more')}
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </p>
          </section>
        )}

        {/* 최근 릴리스 — 문서 하단(갤러리 뒤). 공개 릴리스 노트가 있을 때만 (조회 중·빈 목록·실패는 조용히 숨김, 갤러리와 같은 규칙) */}
        {releaseNoteItems.length > 0 && (
          <section aria-labelledby="landing-release-notes" className="w-full" data-testid="landing-release-notes">
            <h2 id="landing-release-notes" className={SECTION_HEADING}>
              {t('landing.releaseNotes.heading')}
              <span aria-hidden className={SECTION_BAR} />
</h2>
            <ul className="mx-auto flex max-w-2xl flex-col">
              {/* 공개 뷰어는 새 창 — 랜딩 흐름 유지(갤러리 카드와 같은 규칙). 제목 → 날짜, 왼쪽 정렬 */}
              {releaseNoteItems.map(({ postId, title, createdAt }) => (
                <li key={postId}>
                  <Link
                    to={`/release-notes/${postId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-emerald-500/10"
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
            {/* 릴리스 노트 전체 — 목차가 있는 공개 화면으로 간다 */}
            <p className="mt-4 text-center text-sm">
              <Link
                to={publicPath('/release-notes')}
                data-testid="landing-release-notes-more"
                className={MORE_LINK}
              >
                {t('landing.releaseNotes.more')}
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </p>
          </section>
        )}
      </main>

      <PublicFooter />
    </div>
  )
}
