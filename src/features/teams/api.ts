/**
 * 팀 API (08-core/04-team.md)
 *
 * - 생성(POST) 응답: { teamId } — Workspace는 만들어지지 않는다(멤버십 부여로만 연결)
 * - 정보 변경(PATCH)은 200 + 갱신된 상세 본문
 */
import { apiDelete, apiGet, apiGetList, apiPatch, apiPost } from '@/api/client'
import type { ListResult, MemberCandidate, Team, TeamDetail, TeamMember } from '@/api/types'

export interface TeamCreated {
  teamId: string
}

/** 내 소속 팀 목록 — ownedOnly=true면 내가 Owner인 팀만 (WS 멤버 추가 다이얼로그 팀 선택) */
export function fetchMyTeams(ownedOnly = false, signal?: AbortSignal): Promise<ListResult<Team>> {
  return apiGetList<Team>('/api/v1/core/teams', { ownedOnly: ownedOnly || undefined }, signal)
}

export function createTeam(body: { name: string; description?: string }) {
  return apiPost<TeamCreated>('/api/v1/core/teams', body)
}

export function fetchTeam(teamId: string, signal?: AbortSignal) {
  return apiGet<TeamDetail>(`/api/v1/core/teams/${teamId}`, undefined, signal)
}

/** 이름·설명 변경 — 변경분만 전송 (description: null은 명시적 클리어) */
export function updateTeam(teamId: string, body: Partial<Pick<Team, 'name' | 'description'>>) {
  return apiPatch<TeamDetail>(`/api/v1/core/teams/${teamId}`, body)
}

export function dissolveTeam(teamId: string) {
  return apiDelete<void>(`/api/v1/core/teams/${teamId}`)
}

export function fetchTeamMembers(teamId: string, signal?: AbortSignal) {
  return apiGetList<TeamMember>(`/api/v1/core/teams/${teamId}/members`, undefined, signal)
}

export function addTeamMember(teamId: string, userId: string) {
  return apiPost<void>(`/api/v1/core/teams/${teamId}/members`, { userId })
}

export function removeTeamMember(teamId: string, userId: string) {
  return apiDelete<void>(`/api/v1/core/teams/${teamId}/members/${userId}`)
}

/** 멤버 후보 검색 — 이미 팀 멤버인 사용자는 서버가 제외, keyword 2자 이상 */
export function fetchTeamMemberCandidates(
  teamId: string,
  keyword: string,
  limit?: number,
  signal?: AbortSignal,
) {
  return apiGetList<MemberCandidate>(
    `/api/v1/core/teams/${teamId}/member-candidates`,
    { keyword, limit },
    signal,
  )
}
