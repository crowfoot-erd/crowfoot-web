/**
 * 용어 사전 API (08-core/01-workspace.md §4·§4.5) — 표준 사전(워크스페이스)·시스템 사전(전역).
 * 논리명 자동 추론이 시스템 사전을 바닥으로, 표준 사전 등록이 우선해 참조한다.
 */
import { apiDelete, apiGetList, apiPost } from '@/api/client'
import type { SystemTerm, WorkspaceTerm } from '@/api/types'

export function fetchWorkspaceTerms(workspaceId: string, signal?: AbortSignal) {
  return apiGetList<WorkspaceTerm>(`/api/v1/core/workspaces/${workspaceId}/terms`, undefined, signal)
}

/** 등록·수정 upsert — (workspace_id, term) 자연키라 서버가 항상 200을 내린다 */
export function upsertWorkspaceTerm(
  workspaceId: string,
  body: { term: string; label: string; type?: string | null },
) {
  return apiPost<WorkspaceTerm>(`/api/v1/core/workspaces/${workspaceId}/terms`, body)
}

export function deleteWorkspaceTerm(workspaceId: string, termId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/terms/${termId}`)
}

/* ---------- 시스템 사전 (§4.5 — 전역, 일반 사용자 읽기 전용) ---------- */

/** 사용자 목록 — 인증 전체(역할 검사 없음). 추론 바닥 사전을 여기서 얻는다 */
export function fetchSystemTerms(signal?: AbortSignal) {
  return apiGetList<SystemTerm>('/api/v1/core/system-terms', undefined, signal)
}

/** 관리자 목록 — AdminGuard(감사 ADMIN_SYSTEM_TERMS_LISTED는 서버가 남긴다) */
export function fetchAdminSystemTerms(signal?: AbortSignal) {
  return apiGetList<SystemTerm>('/api/v1/core/admin/system-terms', undefined, signal)
}

/** 시스템 사전 등록·수정 upsert — term 전역 자연키라 항상 200. labels는 언어→라벨 맵(최소 1개) */
export function upsertAdminSystemTerm(body: {
  term: string
  labels: Record<string, string>
  type?: string | null
}) {
  return apiPost<SystemTerm>('/api/v1/core/admin/system-terms', body)
}

export function deleteAdminSystemTerm(termId: string) {
  return apiDelete<void>(`/api/v1/core/admin/system-terms/${termId}`)
}
