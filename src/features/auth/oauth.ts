/**
 * OAuth 로그인 시작/복원 (storyboard 01-auth §2~§3)
 *
 * - 시작: sessionStorage에 provider·next 저장 후 풀페이지 이동(302 — auth_flow 쿠키 심기에 필수)
 * - 콜백: 저장된 provider를 읽어 즉시 제거(재사용·재교환 방지)
 * - next는 게이트웨이가 아닌 SPA가 세션스토리지로 보존한다 (§4.2 — 원래 경로 복귀)
 *
 * 로그인 시작은 API 기점(VITE_API_BASE_URL)으로 이동한다 — 개발은 Vite 프록시(빈 값)로 same-origin,
 * 운영은 API 서브도메인(crowfoot-api.java21.net). 상대경로로 두면 웹 nginx가 SPA를 돌려준다.
 */
import { API_BASE_URL } from '@/api/client'

export const OAUTH_PROVIDER_STORAGE_KEY = 'oauth.provider'
export const OAUTH_NEXT_STORAGE_KEY = 'oauth.next'

export function startOAuthLogin(provider: string, next?: string): void {
  window.sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, provider)
  if (next) {
    window.sessionStorage.setItem(OAUTH_NEXT_STORAGE_KEY, next)
  } else {
    window.sessionStorage.removeItem(OAUTH_NEXT_STORAGE_KEY)
  }
  window.location.href = `${API_BASE_URL}/api/v1/auth/oauth2/${provider}`
}

/** 저장된 provider 반환 — 읽고 나면 즉시 제거한다 (재사용 방지) */
export function consumeOAuthProvider(): string | null {
  const provider = window.sessionStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY)
  window.sessionStorage.removeItem(OAUTH_PROVIDER_STORAGE_KEY)
  return provider
}

/** 저장된 복귀 경로 반환 — provider와 함께 소비된다 */
export function consumeOAuthNext(): string | null {
  const next = window.sessionStorage.getItem(OAUTH_NEXT_STORAGE_KEY)
  window.sessionStorage.removeItem(OAUTH_NEXT_STORAGE_KEY)
  return next
}
