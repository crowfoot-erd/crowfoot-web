/**
 * 팀 쿼리/뮤테이션 훅 — 변경 성공 후 invalidate (낙관적 갱신 금지)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Team } from '@/api/types'
import {
  addTeamMember,
  createTeam,
  dissolveTeam,
  fetchMyTeams,
  fetchTeam,
  fetchTeamMemberCandidates,
  fetchTeamMembers,
  removeTeamMember,
  updateTeam,
} from '@/features/teams/api'

export const teamKeys = {
  list: (ownedOnly: boolean) => ['teams', { ownedOnly }] as const,
  detail: (teamId: string) => ['teams', 'detail', teamId] as const,
  members: (teamId: string) => ['teams', teamId, 'members'] as const,
  candidates: (teamId: string, keyword: string) => ['teams', teamId, 'candidates', keyword] as const,
}

export function useMyTeams(ownedOnly = false) {
  return useQuery({
    queryKey: teamKeys.list(ownedOnly),
    queryFn: ({ signal }) => fetchMyTeams(ownedOnly, signal),
  })
}

export function useTeam(teamId: string) {
  return useQuery({
    queryKey: teamKeys.detail(teamId),
    queryFn: ({ signal }) => fetchTeam(teamId, signal),
    enabled: teamId.length > 0,
  })
}

export function useCreateTeam() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createTeam,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}

export function useUpdateTeam(teamId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Partial<Pick<Team, 'name' | 'description'>>) => updateTeam(teamId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) })
      void queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}

export function useDissolveTeam() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (teamId: string) => dissolveTeam(teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teams'] })
      void queryClient.invalidateQueries({ queryKey: ['workspaces', 'mine'] })
    },
  })
}

/* ---------- 멤버 구성 (S-08) ---------- */

export function useTeamMembers(teamId: string) {
  return useQuery({
    queryKey: teamKeys.members(teamId),
    queryFn: ({ signal }) => fetchTeamMembers(teamId, signal),
    enabled: teamId.length > 0,
  })
}

export function useTeamMemberCandidates(teamId: string, keyword: string) {
  return useQuery({
    queryKey: teamKeys.candidates(teamId, keyword),
    queryFn: ({ signal }) => fetchTeamMemberCandidates(teamId, keyword, 10, signal),
    enabled: teamId.length > 0 && keyword.trim().length >= 2,
  })
}

export function useAddTeamMember(teamId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => addTeamMember(teamId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.members(teamId) })
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) })
    },
  })
}

export function useRemoveTeamMember(teamId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.members(teamId) })
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) })
    },
  })
}
