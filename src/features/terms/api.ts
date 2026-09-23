/**
 * 워크스페이스 용어 사전 API (08-core/01-workspace.md §4) — 목록·upsert·삭제.
 * 논리명 자동 추론이 내장 사전에 우선해 참조하는 커스텀 사전이다.
 */
import { apiDelete, apiGetList, apiPost } from '@/api/client'
import type { WorkspaceTerm } from '@/api/types'

export function fetchWorkspaceTerms(workspaceId: string, signal?: AbortSignal) {
  return apiGetList<WorkspaceTerm>(`/api/v1/core/workspaces/${workspaceId}/terms`, undefined, signal)
}

/** 등록·수정 upsert — (workspace_id, term) 자연키라 서버가 항상 200을 내린다 */
export function upsertWorkspaceTerm(workspaceId: string, body: { term: string; label: string }) {
  return apiPost<WorkspaceTerm>(`/api/v1/core/workspaces/${workspaceId}/terms`, body)
}

export function deleteWorkspaceTerm(workspaceId: string, termId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/terms/${termId}`)
}
