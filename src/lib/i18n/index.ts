/**
 * i18n (storyboard 00-common §3.3 — ko·en·ja·zh(간체) 4개 언어)
 *
 * - 언어 결정 우선순위: URL prefix(/en·/ja·/zh) > localStorage(수동 변경 흔적) > navigator > ko
 * - 루트(/)는 감지 언어로 리다이렉트하지 않는다 — ko 프리렌더 산출물 보호(크롤러 우발 색인 방지)
 * - 콘텐츠 폴백: ja·zh는 en을 거쳐 ko로 (서버 해석 체인과 동일한 방향)
 * - 모든 화면 문구는 리소스에만 존재 — 코드 하드코딩 금지
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './en.json'
import ja from './ja.json'
import ko from './ko.json'
import zh from './zh.json'

export const LANGUAGE_STORAGE_KEY = 'crowfoot.lang'
export const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'zh'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

export { isLanguage }

/** 언어별 URL prefix — ko는 prefix 없음(루트가 ko다). 라우터 재구조(W2)가 같은 상수를 쓴다 */
export const LANGUAGE_PREFIXES: Record<Language, string> = {
  ko: '',
  en: '/en',
  ja: '/ja',
  zh: '/zh',
}

/** 경로의 언어 prefix 해석 — /en·/ja·/zh(및 하위 경로)면 그 언어, 그 외(루트=ko 포함)는 null */
export function languageFromPath(pathname: string): Language | null {
  const match = /^\/(en|ja|zh)(?:\/|$)/.exec(pathname)
  return match ? (match[1] as Language) : null
}

/** html lang 속성값 — zh는 간체 명시(zh-Hans), 나머지는 언어 코드 그대로 */
export function htmlLang(language: Language): string {
  return language === 'zh' ? 'zh-Hans' : language
}

/** Intl 로케일 — format·time-ago·toast-ui가 쓴다 */
export const INTL_LOCALES: Record<Language, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
  zh: 'zh-CN',
}

/** 콘텐츠 폴백 언어 체인 — 요청 언어 직후부터 순서대로 시도한다(끝에 임의 첫값).
 *  서버 LocalizedTexts 해석(§2.1 — 요청언어 → en → ko → 첫값)과 같은 방향: 시스템 사전 라벨
 *  resolveLabel·커뮤니티 availableLangs 폴백 판정이 공유한다 */
export const CONTENT_FALLBACK_LANGS: readonly ['en', 'ko'] = ['en', 'ko']

/** 현재 적용 언어 — i18n 초기화 전 포함 항상 유효 값(기본 ko) */
export function currentLanguage(): Language {
  const tag = (i18n.resolvedLanguage ?? i18n.language ?? 'ko').split('-')[0].toLowerCase()
  return isLanguage(tag) ? tag : 'ko'
}

export function detectLanguage(): Language {
  const fromPath = languageFromPath(window.location.pathname)
  if (fromPath) return fromPath

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (isLanguage(stored)) return stored

  const preferred = window.navigator.languages ?? [window.navigator.language]
  for (const tag of preferred) {
    const lower = tag.toLowerCase()
    // zh-Hans·zh-CN·zh-SG·zh-TW·zh-Hant 전부 간체(zh)로 통일한다 — 제품은 간체만 제공한다
    if (lower.startsWith('ko')) return 'ko'
    if (lower.startsWith('en')) return 'en'
    if (lower.startsWith('ja')) return 'ja'
    if (lower.startsWith('zh')) return 'zh'
  }
  return 'ko'
}

export function setLanguage(language: Language): void {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  document.documentElement.lang = htmlLang(language)
  void i18n.changeLanguage(language)
}

void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
    ja: { translation: ja },
    zh: { translation: zh },
  },
  lng: detectLanguage(),
  fallbackLng: {
    ja: ['en', 'ko'],
    zh: ['en', 'ko'],
    en: ['ko'],
    default: ['ko'],
  },
  interpolation: { escapeValue: false }, // React는 이미 이스케이프한다
  returnEmptyString: false, // 빈 키는 미정의 취급 → fallback
})

document.documentElement.lang = htmlLang(currentLanguage())

export default i18n
