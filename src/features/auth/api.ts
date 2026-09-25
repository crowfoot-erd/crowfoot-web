/**
 * 인증 API (02-auth/api.md, 08-core/00-overview.md Section 3)
 *
 * - 로그인 시작(/oauth2/{provider})은 풀페이지 내비게이션이라 여기 없음 — LoginPage가 직접 이동
 * - 교환·refresh·logout만 API 함수로 제공
 */
import { apiGet, apiGetList, apiPatch, apiPost } from '@/api/client'
import type { Me, Provider } from '@/api/types'

export interface OAuthTokenResponse {
  accessToken: string
  tokenType: string
  expiresIn: number
}

/** 로그인 버튼 목록 (공개 API — 인증 불필요) */
export function fetchProviders(signal?: AbortSignal) {
  return apiGetList<Provider>('/api/v1/core/providers', undefined, signal)
}

/** 인가 코드 교환 — 콜백에서 1회만 호출 */
export function exchangeOAuthCode(provider: string, code: string, state: string) {
  return apiPost<OAuthTokenResponse>(`/api/v1/auth/oauth2/${provider}/token`, { code, state })
}

/** 내 정보 — 세션 수립 후 1회 (§3.2) */
export function fetchMe(signal?: AbortSignal) {
  return apiGet<Me>('/api/v1/core/accounts/me', undefined, signal)
}

/** 계정 UI 언어 저장(08-core/05-account.md) — 메뉴 변경·첫 로그인 감지 언어 등록 */
export function updateMyLocale(locale: string, signal?: AbortSignal) {
  return apiPatch<Me>('/api/v1/core/accounts/me', { locale }, signal)
}

/** 로그아웃 — Bearer(Access) 포함 → 블랙리스트 등록. 성공/실패 무관 로컬 폐기는 호출부 책임 */
export function logout() {
  return apiPost<void>('/api/v1/auth/logout')
}
