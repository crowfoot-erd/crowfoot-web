/**
 * 이용약관 동의 보관 — 로그인 화면 게이트 (2026-09-15)
 *
 * - 무료 매니지드 DB 영속성 비보장 고지(/terms)의 인지 확보 — 최초 로그인 1회 동의
 * - 브라우저 로컬 기록(서버 기록 아님) — 약관 개정이 재동의를 요구하면 키 버전을 올린다(v1 → v2)
 */
export const TERMS_CONSENT_STORAGE_KEY = 'crowfoot.terms.v1'

export function hasConsentedTerms(): boolean {
  return window.localStorage.getItem(TERMS_CONSENT_STORAGE_KEY) === 'agreed'
}

export function consentTerms(): void {
  window.localStorage.setItem(TERMS_CONSENT_STORAGE_KEY, 'agreed')
}
