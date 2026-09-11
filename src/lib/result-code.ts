/**
 * resultCode → 표시 문구 (storyboard 00-common §3.6)
 *
 * 서버 resultMessage는 화면에 표시하지 않는다 — 항상 resultCode를 i18n 키로 변환.
 * 정의되지 않은 코드는 GENERIC 문구로 폴백. 5xx·네트워크 실패도 동일 안내.
 */
import { isApiError } from '@/api/client'
import i18n from '@/lib/i18n'

export function resultCodeMessage(resultCode: string): string {
  return i18n.t(`errors.message.${resultCode}`, { defaultValue: i18n.t('errors.message.GENERIC') })
}

/** 오류 객체 → 표시 문구 (ApiError / 네트워크 실패 / 알 수 없음) */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.isNetworkError) return i18n.t('errors.message.NETWORK_ERROR')
    return resultCodeMessage(error.resultCode)
  }
  return i18n.t('errors.message.GENERIC')
}
