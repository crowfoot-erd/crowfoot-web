/**
 * API 클라이언트 단위 테스트 (frontend-testing.md A1·A2·C4)
 *
 * given: MSW 핸들러로 응답 형태를 정의
 * when: api 함수 호출
 * then: 공통 포맷 파싱·ApiError·401 갱신 단일 플라이트 규칙 검증
 */
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  apiDelete,
  apiGet,
  apiGetPage,
  apiPost,
  clearAccessToken,
  isApiError,
  SESSION_EXPIRED_EVENT,
  setAccessToken,
} from '@/api/client'
import { server } from '@/api/mocks/server'

function envelopeOk(body: object) {
  return HttpResponse.json({
    header: { isSuccessful: true, resultCode: 'SUCCESS', resultMessage: 'SUCCESS' },
    ...body,
  })
}

function envelopeFail(resultCode: string, status: number, errors?: object[]) {
  return HttpResponse.json(
    {
      header: { isSuccessful: false, resultCode, resultMessage: '서버 메시지' },
      ...(errors ? { errors } : {}),
    },
    { status },
  )
}

describe('API 클라이언트', () => {
  afterEach(() => {
    clearAccessToken()
    vi.restoreAllMocks()
  })

  describe('retries the original request once via single-flight refresh when receiving a 401 AUTH_TOKEN_EXPIRED (C4)', () => {
    it('retries the original request with the new token after a successful refresh', async () => {
      setAccessToken('expired-token')

      let meCalls = 0
      server.use(
        http.get('/api/v1/core/accounts/me', ({ request }) => {
          meCalls += 1
          const auth = request.headers.get('Authorization')
          if (auth === 'Bearer expired-token') {
            return envelopeFail('AUTH_TOKEN_EXPIRED', 401)
          }
          return envelopeOk({ response: { userId: '1' } })
        }),
        http.post('/api/v1/auth/refresh-token', () =>
          envelopeOk({ response: { accessToken: 'new-token', tokenType: 'Bearer', expiresIn: 3600 } }),
        ),
      )

      // when
      const me = await apiGet<{ userId: string }>('/api/v1/core/accounts/me')

      // then
      expect(me?.userId).toBe('1')
      expect(meCalls).toBe(2)
    })

    it('merges concurrent refreshes into a single request (single-flight)', async () => {
      setAccessToken('expired-token')

      let refreshCalls = 0
      server.use(
        http.get('/api/v1/core/accounts/me/workspaces', () => envelopeFail('AUTH_TOKEN_EXPIRED', 401)),
        http.post('/api/v1/auth/refresh-token', async () => {
          refreshCalls += 1
          await new Promise((resolve) => setTimeout(resolve, 50))
          return envelopeOk({ response: { accessToken: 'new-token', tokenType: 'Bearer', expiresIn: 3600 } })
        }),
      )

      // when — 두 요청이 동시에 401을 받는다
      await expect(
        Promise.all([
          apiGet('/api/v1/core/accounts/me/workspaces').catch(() => 'failed'),
          apiGet('/api/v1/core/accounts/me/workspaces').catch(() => 'failed'),
        ]),
      ).resolves.toHaveLength(2)

      // then — refresh는 1번만 호출됐다
      expect(refreshCalls).toBe(1)
    })

    it('fires a session-expired event without retrying when refresh fails with 401', async () => {
      setAccessToken('expired-token')

      let meCalls = 0
      server.use(
        http.get('/api/v1/core/accounts/me', () => {
          meCalls += 1
          return envelopeFail('AUTH_TOKEN_EXPIRED', 401)
        }),
        http.post('/api/v1/auth/refresh-token', () => envelopeFail('AUTH_TOKEN_INVALID', 401)),
      )

      const expiredListener = vi.fn()
      window.addEventListener(SESSION_EXPIRED_EVENT, expiredListener)

      // when
      await expect(apiGet('/api/v1/core/accounts/me')).rejects.toSatisfy((error: unknown) =>
        isApiError(error) && error.resultCode === 'AUTH_TOKEN_EXPIRED',
      )

      // then
      expect(meCalls).toBe(1)
      expect(expiredListener).toHaveBeenCalledTimes(1)
      window.removeEventListener(SESSION_EXPIRED_EVENT, expiredListener)
    })

    it('fires a session-expired event on receiving a fatal 401 (AUTH_SESSION_REVOKED)', async () => {
      setAccessToken('revoked-token')
      server.use(
        http.get('/api/v1/core/accounts/me', () => envelopeFail('AUTH_SESSION_REVOKED', 401)),
      )

      const expiredListener = vi.fn()
      window.addEventListener(SESSION_EXPIRED_EVENT, expiredListener)

      await expect(apiGet('/api/v1/core/accounts/me')).rejects.toSatisfy((error: unknown) =>
        isApiError(error) && error.resultCode === 'AUTH_SESSION_REVOKED',
      )
      expect(expiredListener).toHaveBeenCalledTimes(1)
      window.removeEventListener(SESSION_EXPIRED_EVENT, expiredListener)
    })
  })

  describe('common format parsing', () => {
    it('returns the response object on success', async () => {
      server.use(
        http.get('/api/v1/core/workspaces/1', () =>
          envelopeOk({ response: { workspaceId: '1', name: 'erd-study' } }),
        ),
      )

      const workspace = await apiGet<{ workspaceId: string; name: string }>('/api/v1/core/workspaces/1')
      expect(workspace).toEqual({ workspaceId: '1', name: 'erd-study' })
    })

    it('returns undefined on 204 with no body', async () => {
      server.use(http.delete('/api/v1/core/workspaces/1', () => new HttpResponse(null, { status: 204 })))

      await expect(apiDelete('/api/v1/core/workspaces/1')).resolves.toBeUndefined()
    })

    it('throws an ApiError containing resultCode·status·errors on failure', async () => {
      server.use(
        http.post('/api/v1/core/workspaces', () =>
          envelopeFail('INVALID_REQUEST', 400, [{ field: 'name', code: 'NotBlank', message: '필수' }]),
        ),
      )

      const error = await apiPost('/api/v1/core/workspaces', { name: '' }).catch((cause: unknown) => cause)
      expect(isApiError(error)).toBe(true)
      if (isApiError(error)) {
        expect(error.resultCode).toBe('INVALID_REQUEST')
        expect(error.status).toBe(400)
        expect(error.errors).toEqual([{ field: 'name', code: 'NotBlank', message: '필수' }])
      }
    })

    it('wraps non-JSON responses as SERVICE_UNAVAILABLE (temporary error)', async () => {
      server.use(
        http.get('/api/v1/core/workspaces/1', () => new HttpResponse('<html>gateway error</html>', { status: 502 })),
      )

      const error = await apiGet('/api/v1/core/workspaces/1').catch((cause: unknown) => cause)
      expect(isApiError(error) && error.resultCode).toBe('SERVICE_UNAVAILABLE')
    })

    it('marks network failures as isNetworkError', async () => {
      server.use(http.get('/api/v1/core/workspaces/1', () => HttpResponse.error()))

      const error = await apiGet('/api/v1/core/workspaces/1').catch((cause: unknown) => cause)
      expect(isApiError(error) && error.isNetworkError).toBe(true)
      expect(isApiError(error) && error.resultCode).toBe('NETWORK_ERROR')
    })

    it('extracts paging fields (page/size/totalPages/totalCount) with apiGetPage', async () => {
      server.use(
        http.get('/api/v1/core/admin/users', ({ request }) => {
          const page = new URL(request.url).searchParams.get('page')
          expect(page).toBe('2')
          return envelopeOk({ page: 2, size: 20, totalPages: 4, totalCount: 73, responses: [{ userId: '9' }] })
        }),
      )

      const result = await apiGetPage<{ userId: string }>('/api/v1/core/admin/users', { page: 2 })
      expect(result).toEqual({
        items: [{ userId: '9' }],
        totalCount: 73,
        page: 2,
        size: 20,
        totalPages: 4,
      })
    })
  })
})
