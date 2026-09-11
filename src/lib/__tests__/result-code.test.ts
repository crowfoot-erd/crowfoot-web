/**
 * resultCode → 표시 문구 매핑 단위 테스트 (frontend-testing.md A2)
 *
 * 서버 resultMessage는 폐기하고 항상 i18n 리소스로 변환 — 미정의 코드는 GENERIC 폴백.
 */
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import '@/lib/i18n'
import { errorMessage, resultCodeMessage } from '@/lib/result-code'

describe('resultCode 문구 매핑', () => {
  it('returns the resource string for a defined resultCode', () => {
    // given·when: WORKSPACE_NOT_FOUND 정의됨
    const message = resultCodeMessage('WORKSPACE_NOT_FOUND')

    // then: resources ko.json의 문구
    expect(message).toBe('워크스페이스를 찾을 수 없습니다.')
  })

  it('falls back to the GENERIC message for an undefined resultCode', () => {
    // given: 리소스에 없는 코드
    const message = resultCodeMessage('SOME_FUTURE_CODE')

    // then: GENERIC 문구로 폴백 (서버 메시지 아님)
    expect(message).toBe('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
  })

  it('prioritizes the network message for network failures', () => {
    // given: 네트워크 실패 ApiError
    const error = new ApiError('NETWORK_ERROR', 0, 'NETWORK_ERROR', { isNetworkError: true })

    // then
    expect(errorMessage(error)).toBe('네트워크 연결을 확인해 주세요.')
  })

  it('maps ApiError by resultCode and unknown objects to GENERIC', () => {
    // given
    const apiError = new ApiError('PERMISSION_DENIED', 403, 'PERMISSION_DENIED')
    const unknownError = new Error('서버가 보낸 메시지')

    // then
    expect(errorMessage(apiError)).toBe('이 작업은 워크스페이스 소유자만 할 수 있습니다.')
    expect(errorMessage(unknownError)).toBe('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
  })
})
