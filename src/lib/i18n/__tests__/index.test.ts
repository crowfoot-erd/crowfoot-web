/**
 * i18n 코어 테스트 (storyboard 00-common §3.3) — 언어 결정 우선순위·경로 해석.
 *
 * detectLanguage는 호출 시점에 location·localStorage·navigator를 다시 읽는다 —
 * 각 케이스에서 상태를 시딩해 우선순위(URL prefix > 수동 흔적 > navigator > ko)를 검증한다.
 * zh 계열 태그(zh-CN·zh-TW·zh-Hant)는 전부 간체(zh)로 통일되는 것이 글로벌 계약이다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  CONTENT_FALLBACK_LANGS,
  LANGUAGE_STORAGE_KEY,
  detectLanguage,
  htmlLang,
  languageFromPath,
  setLanguage,
} from '@/lib/i18n'

const ORIGINAL_LANGUAGES = Object.getOwnPropertyDescriptor(window.navigator, 'languages')
const ORIGINAL_LANGUAGE = Object.getOwnPropertyDescriptor(window.navigator, 'language')

/** navigator 언어 시딩 — jsdom 기본값(en-US)을 케이스별로 교체한다 */
function setNavigatorLanguages(...tags: string[]): void {
  Object.defineProperty(window.navigator, 'languages', { value: tags, configurable: true })
  Object.defineProperty(window.navigator, 'language', { value: tags[0] ?? 'en-US', configurable: true })
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.pushState(null, '', '/')
})

afterEach(() => {
  // navigator·URL·언어 상태 원복 — 파일 뒤의 다른 테스트가 jsdom 기본을 본다
  if (ORIGINAL_LANGUAGES) Object.defineProperty(window.navigator, 'languages', ORIGINAL_LANGUAGES)
  if (ORIGINAL_LANGUAGE) Object.defineProperty(window.navigator, 'language', ORIGINAL_LANGUAGE)
  window.localStorage.clear()
  window.history.pushState(null, '', '/')
})

describe('languageFromPath — URL prefix 해석', () => {
  it('언어 prefix를 언어로 돌려준다', () => {
    expect(languageFromPath('/en')).toBe('en')
    expect(languageFromPath('/en/')).toBe('en')
    expect(languageFromPath('/en/terms')).toBe('en')
    expect(languageFromPath('/ja/workspaces/101/models/201')).toBe('ja')
    expect(languageFromPath('/zh/release-notes/13')).toBe('zh')
  })

  it('무prefix(ko 영역)·유사 경로는 null이다', () => {
    expect(languageFromPath('/')).toBeNull()
    expect(languageFromPath('/terms')).toBeNull()
    expect(languageFromPath('/workspaces/101')).toBeNull()
    // /english·/entropy 처럼 prefix 뒤에 붙은 문자열은 다른 경로다 — 매칭되지 않는다
    expect(languageFromPath('/english')).toBeNull()
    expect(languageFromPath('/entropy')).toBeNull()
    expect(languageFromPath('/ko/terms')).toBeNull() // ko는 prefix가 없다
  })
})

describe('htmlLang — zh는 간체 명시', () => {
  it('zh만 zh-Hans, 나머지는 코드 그대로다', () => {
    expect(htmlLang('zh')).toBe('zh-Hans')
    expect(htmlLang('ko')).toBe('ko')
    expect(htmlLang('en')).toBe('en')
    expect(htmlLang('ja')).toBe('ja')
  })
})

describe('detectLanguage — 우선순위', () => {
  it('URL prefix가 최우선이다 — 흔적·브라우저 설정을 덮는다', () => {
    window.history.pushState(null, '', '/ja/teams')
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    setNavigatorLanguages('en-US')

    expect(detectLanguage()).toBe('ja')
  })

  it('수동 변경 흔적(localStorage)이 navigator보다 우선한다', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    setNavigatorLanguages('en-US')

    expect(detectLanguage()).toBe('zh')
  })

  it('zh 계열 태그는 전부 간체(zh)로 통일한다 — zh-CN·zh-TW·zh-Hant', () => {
    for (const tag of ['zh-CN', 'zh-TW', 'zh-Hant', 'zh-Hans', 'zh-SG', 'zh']) {
      setNavigatorLanguages(tag)
      expect(detectLanguage(), tag).toBe('zh')
    }
  })

  it('navigator 태그 prefix로 ko·en·ja를 고른다', () => {
    setNavigatorLanguages('ko-KR')
    expect(detectLanguage()).toBe('ko')

    setNavigatorLanguages('ja-JP', 'en-US')
    expect(detectLanguage()).toBe('ja')

    setNavigatorLanguages('en-US', 'ko-KR')
    expect(detectLanguage()).toBe('en')
  })

  it('지원하지 않는 언어·빈 흔적값은 폴백 ko다', () => {
    setNavigatorLanguages('fr-FR')
    expect(detectLanguage()).toBe('ko')

    // 무효 흔적값은 흔적이 아니다 — navigator까지 못 미치면 ko
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'english')
    setNavigatorLanguages('fr-FR')
    expect(detectLanguage()).toBe('ko')
  })
})

describe('setLanguage — 수동 변경 흔적', () => {
  it('localStorage에 흔적을 남기고 html lang을 갱신한다', () => {
    setLanguage('zh')

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('zh')
    expect(document.documentElement.lang).toBe('zh-Hans')
  })
})

describe('CONTENT_FALLBACK_LANGS — 콘텐츠 폴백 체인', () => {
  it('서버 해석과 같은 방향이다 — en을 거쳐 ko', () => {
    expect([...CONTENT_FALLBACK_LANGS]).toEqual(['en', 'ko'])
  })
})
