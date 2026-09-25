/**
 * features/auth 공개 진입점 (env 문서 §2.2 — feature 외부는 여기만 import)
 */
export { fetchMe, fetchProviders, exchangeOAuthCode, logout } from './api'
export type { OAuthTokenResponse } from './api'
export { useAccountLanguage, useLogout, useMe, useProviders, useUpdateMyLocale } from './hooks'
export {
  OAUTH_NEXT_STORAGE_KEY,
  OAUTH_PROVIDER_STORAGE_KEY,
  consumeOAuthNext,
  consumeOAuthProvider,
  startOAuthLogin,
} from './oauth'
export { TERMS_CONSENT_STORAGE_KEY, consentTerms, hasConsentedTerms } from './terms-consent'
