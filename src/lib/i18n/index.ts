/**
 * i18n (storyboard 00-common §3.3 — ko 기본·en 지원)
 *
 * - 언어 결정: localStorage 'crowfoot.lang' > navigator.languages(ko|en) > 'ko'
 * - 모든 화면 문구는 리소스에만 존재 — 코드 하드코딩 금지
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './en.json'
import ko from './ko.json'

export const LANGUAGE_STORAGE_KEY = 'crowfoot.lang'
export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export function detectLanguage(): Language {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored === 'ko' || stored === 'en') return stored

  const preferred = window.navigator.languages ?? [window.navigator.language]
  for (const tag of preferred) {
    if (tag.toLowerCase().startsWith('ko')) return 'ko'
    if (tag.toLowerCase().startsWith('en')) return 'en'
  }
  return 'ko'
}

export function setLanguage(language: Language): void {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  document.documentElement.lang = language
  void i18n.changeLanguage(language)
}

void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
  },
  lng: detectLanguage(),
  fallbackLng: 'ko',
  interpolation: { escapeValue: false }, // React는 이미 이스케이프한다
  returnEmptyString: false, // 빈 키는 미정의 취급 → fallback
})

document.documentElement.lang = i18n.language

export default i18n
