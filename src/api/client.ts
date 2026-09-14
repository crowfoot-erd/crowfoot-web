/**
 * 공통 API 클라이언트 (01-architecture/api-design.md, 08-core/00-overview.md Section 3, storyboard 00-common §3.2~3.5)
 *
 * - baseURL: 개발 = 빈 값(Vite 프록시 /api → gateway:8000) / 운영 = VITE_API_BASE_URL
 * - credentials: 'include' 고정 — Refresh httpOnly 쿠키(crowfoot_refresh) 전송
 * - 공통 포맷 파싱: header.isSuccessful → response/responses, false → ApiError(resultCode·HTTP 상태·errors)
 * - 401 AUTH_TOKEN_EXPIRED → refresh 단일 플라이트(공유 Promise) → 원요청 1회 재시도
 * - 치명 401(AUTH_TOKEN_INVALID·AUTH_SESSION_REVOKED, refresh 실패) → 세션 만료 이벤트
 *   (window 'crowfoot:session-expired' + BroadcastChannel 'crowfoot-auth' — 다른 탭 동시 처리)
 */
import type { ApiEnvelope, ListResult, PageResult } from './types'

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

export const SESSION_EXPIRED_EVENT = 'crowfoot:session-expired'
export const AUTH_BROADCAST_CHANNEL = 'crowfoot-auth'

/* ---------- Access 토큰 (메모리만 — 새로고침·탭 종료로 소멸, 스토리지 금지 §3.4) ---------- */

let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}

/* ---------- 오류 ---------- */

export class ApiError extends Error {
  readonly resultCode: string
  readonly status: number
  readonly errors?: ApiEnvelope['errors']
  /** fetch 자체 실패(네트워크) — 재시도 안내 문구 분기용 */
  readonly isNetworkError: boolean

  constructor(resultCode: string, status: number, message: string, options?: { errors?: ApiEnvelope['errors']; isNetworkError?: boolean }) {
    super(message)
    this.name = 'ApiError'
    this.resultCode = resultCode
    this.status = status
    this.errors = options?.errors
    this.isNetworkError = options?.isNetworkError ?? false
  }
}

/** resultCode → 표시 문구 변환 시 서버 resultMessage는 폐기 (§3.6 — 서버 message 비표시) */
function toApiError(payload: ApiEnvelope | null, status: number): ApiError {
  const resultCode = payload?.header?.resultCode ?? 'UNKNOWN'
  return new ApiError(resultCode, status, resultCode, { errors: payload?.errors })
}

/* ---------- 세션 만료 통지 ---------- */

/** 세션 만료 이벤트 발생 — 현재 탭(window) + 다른 탭(BroadcastChannel) */
function fireSessionExpired(resultCode: string): void {
  clearAccessToken()
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { resultCode } }))
  try {
    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL)
    channel.postMessage({ type: 'session-expired', resultCode })
    channel.close()
  } catch {
    // BroadcastChannel 미지원 환경 — 현재 탭 이벤트로만 동작
  }
}

export interface SessionExpiredDetail {
  resultCode: string
}

/** 앱 진입점에서 구독 — 이벤트를 zustand 세션 스토어로 전달한다 */
export function subscribeSessionExpired(listener: (detail: SessionExpiredDetail) => void): () => void {
  const onWindowEvent = (event: Event) => listener((event as CustomEvent<SessionExpiredDetail>).detail)
  window.addEventListener(SESSION_EXPIRED_EVENT, onWindowEvent)

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL)
    channel.onmessage = (event) => {
      if (event.data?.type === 'session-expired') listener({ resultCode: event.data.resultCode })
    }
  } catch {
    channel = null
  }

  return () => {
    window.removeEventListener(SESSION_EXPIRED_EVENT, onWindowEvent)
    channel?.close()
  }
}

/* ---------- Refresh 단일 플라이트 (§3.5) ---------- */

export type RefreshOutcome = 'success' | 'unauthenticated' | 'error'

let refreshInFlight: Promise<RefreshOutcome> | null = null

/**
 * Refresh 토큰으로 Access 재발급 — 동시 호출은 하나의 요청으로 병합된다.
 * 부트스트랩(§3.2)과 401 인터셉터가 함께 사용한다.
 */
export function refreshAccessToken(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<RefreshOutcome> => {
      try {
        const res = await fetch(`${BASE_URL}/api/v1/auth/refresh-token`, {
          method: 'POST',
          credentials: 'include',
        })
        if (res.status === 401) return 'unauthenticated'
        if (!res.ok) return 'error'
        const payload = (await res.json()) as ApiEnvelope
        const token = payload?.response && typeof payload.response === 'object'
          ? (payload.response as { accessToken?: string }).accessToken
          : undefined
        if (payload?.header?.isSuccessful && token) {
          setAccessToken(token)
          return 'success'
        }
        return 'error'
      } catch {
        return 'error'
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

/* ---------- 요청 ---------- */

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE_URL}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function rawRequest(method: Method, path: string, options: RequestOptions): Promise<ApiEnvelope> {
  const headers: Record<string, string> = {}
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError('NETWORK_ERROR', 0, 'NETWORK_ERROR', { isNetworkError: true })
  }

  // 204 No Content — 본문 없음 (삭제·수정 성공)
  if (res.status === 204) {
    return { header: { isSuccessful: true, resultCode: 'OK', resultMessage: '' } }
  }

  let payload: ApiEnvelope
  try {
    payload = (await res.json()) as ApiEnvelope
  } catch {
    // JSON 아님 — 게이트웨이 HTML 오류 페이지 등 → 일시적 오류 취급 (§3.6)
    throw new ApiError('SERVICE_UNAVAILABLE', res.status, 'SERVICE_UNAVAILABLE')
  }

  if (!payload?.header || payload.header.isSuccessful !== true) {
    throw toApiError(payload, res.status)
  }
  return payload
}

/** 치명 401 — 세션 만료 처리 대상인가 (인증 엔드포인트 자신의 401은 제외) */
function isFatalAuthError(error: ApiError): boolean {
  return (
    error.status === 401 &&
    (error.resultCode === 'AUTH_TOKEN_INVALID' || error.resultCode === 'AUTH_SESSION_REVOKED')
  )
}

async function requestEnvelope(method: Method, path: string, options: RequestOptions): Promise<ApiEnvelope> {
  try {
    return await rawRequest(method, path, options)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && error.resultCode === 'AUTH_TOKEN_EXPIRED') {
      // Access 만료 → refresh 1회(단일 플라이트) → 원요청 재시도 (§3.5)
      const outcome = await refreshAccessToken()
      if (outcome === 'success') return rawRequest(method, path, options)
      fireSessionExpired(outcome === 'unauthenticated' ? 'AUTH_TOKEN_INVALID' : 'AUTH_TOKEN_EXPIRED')
      throw error
    }
    if (error instanceof ApiError && isFatalAuthError(error)) {
      fireSessionExpired(error.resultCode)
    }
    throw error
  }
}

/* ---------- 공개 함수: 단일 객체 / 목록 / 페이징 목록 ---------- */

/** response 필드 반환 (204·목록 성공 시 undefined 가능) */
export async function apiGet<T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal): Promise<T | undefined> {
  const envelope = await requestEnvelope('GET', path, { query, signal })
  return envelope.response as T | undefined
}

export async function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T | undefined> {
  const envelope = await requestEnvelope('POST', path, { body, signal })
  return envelope.response as T | undefined
}

/** 생성·수정·삭제 — 201+Location/204 모두 undefined 반환 */
export async function apiPatch<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T | undefined> {
  const envelope = await requestEnvelope('PATCH', path, { body, signal })
  return envelope.response as T | undefined
}

export async function apiPut<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T | undefined> {
  const envelope = await requestEnvelope('PUT', path, { body, signal })
  return envelope.response as T | undefined
}

export async function apiDelete<T>(path: string, signal?: AbortSignal): Promise<T | undefined> {
  const envelope = await requestEnvelope('DELETE', path, { signal })
  return envelope.response as T | undefined
}

/** responses 배열 + totalCount (페이징 없는 목록 — memberships·teams 등) */
export async function apiGetList<T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal): Promise<ListResult<T>> {
  const envelope = await requestEnvelope('GET', path, { query, signal })
  return {
    items: Array.isArray(envelope.responses) ? (envelope.responses as T[]) : [],
    totalCount: envelope.totalCount ?? 0,
  }
}

/** responses + page/size/totalPages (오프셋 페이징 — admin/users 등) */
export async function apiGetPage<T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal): Promise<PageResult<T>> {
  const envelope = await requestEnvelope('GET', path, { query, signal })
  return {
    items: Array.isArray(envelope.responses) ? (envelope.responses as T[]) : [],
    totalCount: envelope.totalCount ?? 0,
    page: envelope.page ?? 1,
    size: envelope.size ?? 0,
    totalPages: envelope.totalPages ?? 1,
  }
}

/** envelope 원문 반환 — 공통 목록 파서가 버리는 확장 필드(limitSummary 등)가 필요한 목록용 */
export async function apiGetEnvelope(path: string, query?: RequestOptions['query'], signal?: AbortSignal): Promise<ApiEnvelope> {
  return requestEnvelope('GET', path, { query, signal })
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
