/**
 * 워크스페이스 API (08-core/01-workspace.md·03-membership.md)
 *
 * - 생성(POST)·수정(PATCH)·삭제(DELETE) 성공은 201+생성 리소스 본문 / 204 — client가 정규화
 * - 부여 역할은 OWNER 제외 3종만 (EDITOR/COMMENTER/VIEWER)
 */
import { apiDelete, apiGet, apiGetList, apiPatch, apiPost } from '@/api/client'
import type {
  ListResult,
  Membership,
  MemberCandidate,
  MyWorkspace,
  Workspace,
  WorkspaceRole,
} from '@/api/types'

export const WORKSPACE_ROLES: Exclude<WorkspaceRole, 'OWNER'>[] = ['EDITOR', 'COMMENTER', 'VIEWER']

/** 나의 워크스페이스 목록 — 사이드바·목록·대시보드가 공유 (storyboard §3.1) */
export function fetchMyWorkspaces(signal?: AbortSignal): Promise<ListResult<MyWorkspace>> {
  return apiGetList<MyWorkspace>('/api/v1/core/accounts/me/workspaces', undefined, signal)
}

export function fetchWorkspace(workspaceId: string, signal?: AbortSignal) {
  return apiGet<Workspace>(`/api/v1/core/workspaces/${workspaceId}`, undefined, signal)
}

export function createWorkspace(body: { name: string; description?: string }) {
  return apiPost<Workspace>('/api/v1/core/workspaces', body)
}

/** 변경분만 전송 — description null은 명시적 클리어 */
export function updateWorkspace(
  workspaceId: string,
  body: Partial<{ name: string; description: string | null }>,
) {
  return apiPatch<void>(`/api/v1/core/workspaces/${workspaceId}`, body)
}

export function deleteWorkspace(workspaceId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}`)
}

/* ---------- 멤버십 (S-06) ---------- */

export function fetchMemberships(workspaceId: string, signal?: AbortSignal) {
  return apiGetList<Membership>(`/api/v1/core/workspaces/${workspaceId}/memberships`, undefined, signal)
}

export type CreateMembershipInput =
  | { granteeType: 'USER'; userId: string; role: Exclude<WorkspaceRole, 'OWNER'> }
  | { granteeType: 'TEAM'; teamId: string; role: Exclude<WorkspaceRole, 'OWNER'> }

export function createMembership(workspaceId: string, body: CreateMembershipInput) {
  return apiPost<void>(`/api/v1/core/workspaces/${workspaceId}/memberships`, body)
}

export function updateMembership(workspaceId: string, membershipId: string, role: Exclude<WorkspaceRole, 'OWNER'>) {
  return apiPatch<void>(`/api/v1/core/workspaces/${workspaceId}/memberships/${membershipId}`, { role })
}

export function deleteMembership(workspaceId: string, membershipId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/memberships/${membershipId}`)
}

/** 부여 후보 가입자 검색 — keyword 2자 이상 */
export function fetchMembershipCandidates(
  workspaceId: string,
  keyword: string,
  limit?: number,
  signal?: AbortSignal,
) {
  return apiGetList<MemberCandidate>(
    `/api/v1/core/workspaces/${workspaceId}/membership-candidates`,
    { keyword, limit },
    signal,
  )
}
