/**
 * OAuth 로그인 시작/복원 (storyboard 01-auth §2~§3)
 *
 * - 시작: sessionStorage에 provider·next 저장 후 풀페이지 이동(302 — auth_flow 쿠키 심기에 필수)
 * - 콜백: 저장된 provider를 읽어 즉시 제거(재사용·재교환 방지)
 * - next는 게이트웨이가 아닌 SPA가 세션스토리지로 보존한다 (§4.2 — 원래 경로 복귀)
 */
export const OAUTH_PROVIDER_STORAGE_KEY = 'oauth.provider'
export const OAUTH_NEXT_STORAGE_KEY = 'oauth.next'

export function startOAuthLogin(provider: string, next?: string): void {
  window.sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, provider)
  if (next) {
    window.sessionStorage.setItem(OAUTH_NEXT_STORAGE_KEY, next)
  } else {
    window.sessionStorage.removeItem(OAUTH_NEXT_STORAGE_KEY)
  }
  window.location.href = `/api/v1/auth/oauth2/${provider}`
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
