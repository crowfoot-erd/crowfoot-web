/**
 * 데이터 브라우저 오류 문구 (09-database-manager/00-data-browser.md §4·§5.5)
 *
 * 데이터베이스가 돌려준 문구가 실리는 코드(QUERY_FAILED·INVALID_VALUE)는 그 문구를 함께 보여 준다 —
 * 사용자가 조건을 고치는 데 필요하다. 그 밖의 코드는 화면 문구로 바꿔 보여 준다.
 */
import { isApiError } from '@/api/client'
import i18n from '@/lib/i18n'
import { errorMessage } from '@/lib/result-code'

/** 데이터베이스 문구를 그대로 전달하는 코드 */
const DATABASE_MESSAGE_CODES = new Set(['QUERY_FAILED', 'INVALID_VALUE'])

export function databaseErrorMessage(error: unknown): string {
  if (isApiError(error) && !error.isNetworkError) {
    if (error.resultCode === 'QUERY_TIMEOUT') return i18n.t('database.error.timeout')
    if (error.resultCode === 'TOO_MANY_REQUESTS') return i18n.t('database.error.tooMany')
    if (DATABASE_MESSAGE_CODES.has(error.resultCode) && error.serverMessage) {
      return `${errorMessage(error)} — ${error.serverMessage}`
    }
  }
  return errorMessage(error)
}

export function isObjectNotFound(error: unknown): boolean {
  return isApiError(error) && error.resultCode === 'OBJECT_NOT_FOUND'
}
