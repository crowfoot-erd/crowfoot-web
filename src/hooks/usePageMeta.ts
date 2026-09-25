/**
 * 라우트별 HTML head 문서 제목·메타 관리 (04-front/storyboard/00-common.md §3.11)
 *
 * SPA는 모든 라우트가 같은 index.html을 받는다 — 공개 페이지가 검색 결과·링크 공유 미리보기에서
 * 각자의 제목·설명·canonical을 갖도록 effect에서 head를 덮어쓴다. 언마운트 시 index.html 기본값으로
 * 되돌려(최초 effect 진입 시 캡처) 훅을 쓰지 않는 보호 페이지는 기본 제목을 유지하게 한다.
 * StrictMode의 이중 effect(설정→복원→재설정)에도 최종 상태는 항상 설정값이라 안전하다.
 *
 * 언어(§3.11) — 현재 UI 언어를 따라 canonical·og:url에 prefix(/en·/ja·/zh — ko는 없음)를
 * 붙이고 og:locale·html lang을 갱신한다. 호출부는 무수정(훅이 언어를 읽는다).
 * 프리렌더 산출(/en/index.html 등)도 같은 규칙의 정적 사본이다.
 */
import { useEffect } from 'react'

import { LANGUAGE_PREFIXES, currentLanguage, htmlLang, type Language } from '@/lib/i18n'

/** 운영 프론트 도메인 (00-environment/tech-stack.md §1.8) — canonical·og:url 조립 기준 */
export const SITE_ORIGIN = 'https://crowfoot.java21.net'

const DEFAULT_ROBOTS = 'index, follow'
const NOINDEX_ROBOTS = 'noindex, nofollow'

/** og:locale — 언어별 로케일 표기 (html lang과 다르게 지역 결합형) */
const OG_LOCALES: Record<Language, string> = {
  ko: 'ko_KR',
  en: 'en_US',
  ja: 'ja_JP',
  zh: 'zh_CN',
}

export interface PageMeta {
  /** 문서 제목 — 접미사「 — Crowfoot」은 호출부에서 i18n(common.appName)으로 조합한다(랜딩은 브랜드 선행 예외) */
  title?: string
  /** meta description·og:description — 넘기지 않으면 index.html 기본값 유지 */
  description?: string
  /** 라우트 경로(예: /release-notes/13) — SITE_ORIGIN+언어 prefix와 붙여 canonical·og:url을 만든다 */
  canonicalPath?: string
  /** true면 robots를 noindex, nofollow로 — 색인 금지 페이지(share·login·404 등, sitemap 제외 규칙과 동일 세트) */
  noindex?: boolean
  /** og:type — 기본 website, 게시글 뷰어는 article */
  ogType?: string
}

type HeadElement = HTMLMetaElement | HTMLLinkElement

function ensureMeta(attr: 'name' | 'property', key: string): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (existing) return existing
  const created = document.createElement('meta')
  created.setAttribute(attr, key)
  document.head.appendChild(created)
  return created
}

function ensureCanonical(): HTMLLinkElement {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (existing) return existing
  const created = document.createElement('link')
  created.setAttribute('rel', 'canonical')
  document.head.appendChild(created)
  return created
}

/** 관리 대상 selector 목록 — 복원(cleanup)의 기준 */
const MANAGED_SELECTORS = [
  'meta[name="description"]',
  'meta[name="robots"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:type"]',
  'meta[property="og:url"]',
  'meta[property="og:locale"]',
  'link[rel="canonical"]',
] as const

interface HeadBaseline {
  title: string
  htmlLang: string
  entries: ReadonlyArray<{ selector: string; content: string | null }>
}

// index.html이 갖고 있던 기본값 — 최초 effect 진입 시 한 번만 캡처해 재사용한다
let baseline: HeadBaseline | null = null

function captureBaseline(): HeadBaseline {
  if (!baseline) {
    baseline = {
      title: document.title,
      htmlLang: document.documentElement.lang,
      entries: MANAGED_SELECTORS.map((selector) => ({
        selector,
        content: document.head.querySelector<HeadElement>(selector)?.getAttribute('content') ?? null,
      })),
    }
  }
  return baseline
}

function restoreBaseline({ title, htmlLang, entries }: HeadBaseline, restoreLang: boolean): void {
  document.title = title
  // 언어 표기는 이 훅이 쓴 경우(canonicalPath 있는 공개 페이지)에만 되돌린다 —
  // 무효화 후 재설정 사이에 LocaleRoute가 문서 언어를 관리하는 결과를 덮어쓰지 않게
  if (restoreLang) document.documentElement.lang = htmlLang
  for (const { selector, content } of entries) {
    const el = document.head.querySelector<HeadElement>(selector)
    if (!el) continue
    // 기본에 없던 요소는 이 훅이 만든 것 — 제거하고, 있던 요소는 원래 내용으로 되돌린다
    if (content === null) el.remove()
    else el.setAttribute('content', content)
  }
}

export function usePageMeta({ title, description, canonicalPath, noindex, ogType }: PageMeta = {}): void {
  // 언어는 훅이 직접 읽는다 — 호출부 8곳 무수정, 언어 전환 시 effect가 다시 돈다
  const language = currentLanguage()
  useEffect(() => {
    const snapshot = captureBaseline()
    if (title !== undefined) {
      document.title = title
      ensureMeta('property', 'og:title').setAttribute('content', title)
    }
    if (description !== undefined) {
      ensureMeta('name', 'description').setAttribute('content', description)
      ensureMeta('property', 'og:description').setAttribute('content', description)
    }
    // robots는 항상 명시 — noindex 미지정 페이지도 기본값으로 확정해 복원 규칙을 단순하게 둔다
    ensureMeta('name', 'robots').setAttribute('content', noindex ? NOINDEX_ROBOTS : DEFAULT_ROBOTS)
    if (canonicalPath !== undefined) {
      const url = `${SITE_ORIGIN}${LANGUAGE_PREFIXES[language]}${canonicalPath}`
      ensureCanonical().setAttribute('href', url)
      ensureMeta('property', 'og:url').setAttribute('content', url)
    }
    if (ogType !== undefined) {
      ensureMeta('property', 'og:type').setAttribute('content', ogType)
    }
    // 언어 표기 — canonical을 쓰는 공개 페이지만 갱신(보호 페이지는 기본값 유지)
    if (canonicalPath !== undefined) {
      document.documentElement.lang = htmlLang(language)
      ensureMeta('property', 'og:locale').setAttribute('content', OG_LOCALES[language])
    }
    return () => restoreBaseline(snapshot, canonicalPath !== undefined)
  }, [title, description, canonicalPath, noindex, ogType, language])
}
