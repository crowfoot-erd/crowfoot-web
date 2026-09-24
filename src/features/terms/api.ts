/**
 * 용어 사전 API (08-core/01-workspace.md §4·§4.5) — 표준 사전(워크스페이스)·시스템 사전(전역).
 * 논리명 자동 추론이 시스템 사전을 바닥으로, 표준 사전 등록이 우선해 참조한다.
 * 타입은 DBMS 종류별 맵(키 = database_types 코드)로 주고받는다.
 */
import { apiDelete, apiGetList, apiGetPage, apiPost, type RequestOptions } from '@/api/client'
import type { SystemTerm, WorkspaceTerm } from '@/api/types'

export function fetchWorkspaceTerms(workspaceId: string, signal?: AbortSignal) {
  return apiGetList<WorkspaceTerm>(`/api/v1/core/workspaces/${workspaceId}/terms`, undefined, signal)
}

/** 등록·수정 upsert — (workspace_id, term) 자연키라 서버가 항상 200을 내린다 */
export function upsertWorkspaceTerm(
  workspaceId: string,
  body: { term: string; label: string; types?: Record<string, string> | null },
) {
  return apiPost<WorkspaceTerm>(`/api/v1/core/workspaces/${workspaceId}/terms`, body)
}

export function deleteWorkspaceTerm(workspaceId: string, termId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/terms/${termId}`)
}

/* ---------- 시스템 사전 (§4.5 — 전역, 일반 사용자 읽기 전용) ---------- */

/** 시스템 사전 표시용 페이지 조회 조건 — page 1부터, size ≤100(기본 20).
 *  letter는 알파벳 이니셜('a'~'z' 또는 '#' = 알파벳 외), keyword는 토큰·labels 값 부분 일치 */
export interface SystemTermPageParams {
  page: number
  size: number
  letter?: string
  keyword?: string
}

function systemTermQuery(params: SystemTermPageParams): RequestOptions['query'] {
  const query: Record<string, string> = { page: String(params.page), size: String(params.size) }
  if (params.letter) query.letter = params.letter
  if (params.keyword) query.keyword = params.keyword
  return query
}

/** 사용자 목록 한 페이지 — 인증 전체(역할 검사 없음), term 오름차순 */
export function fetchSystemTermsPage(params: SystemTermPageParams, signal?: AbortSignal) {
  return apiGetPage<SystemTerm>('/api/v1/core/system-terms', systemTermQuery(params), signal)
}

/** 관리자 목록 한 페이지 — AdminGuard(감사 ADMIN_SYSTEM_TERMS_LISTED는 서버가 남긴다) */
export function fetchAdminSystemTermsPage(params: SystemTermPageParams, signal?: AbortSignal) {
  return apiGetPage<SystemTerm>('/api/v1/core/admin/system-terms', systemTermQuery(params), signal)
}

/** 시스템 사전 등록·수정 upsert — term 전역 자연키라 항상 200. labels는 언어→라벨 맵(최소 1개),
 *  types는 DBMS별 맵(키가 database_types 등록 코드가 아니면 서버가 400) */
export function upsertAdminSystemTerm(body: {
  term: string
  labels: Record<string, string>
  types?: Record<string, string> | null
}) {
  return apiPost<SystemTerm>('/api/v1/core/admin/system-terms', body)
}

export function deleteAdminSystemTerm(termId: string) {
  return apiDelete<void>(`/api/v1/core/admin/system-terms/${termId}`)
}
