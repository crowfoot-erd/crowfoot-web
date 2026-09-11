/**
 * 워크스페이스 쿼리/뮤테이션 훅 — 변경 성공 후 invalidate (낙관적 갱신 금지 §3.5)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createMembership,
  createWorkspace,
  deleteMembership,
  deleteWorkspace,
  fetchMemberships,
  fetchMembershipCandidates,
  fetchMyWorkspaces,
  fetchWorkspace,
  updateMembership,
  updateWorkspace,
} from '@/features/workspaces/api'
import type { Workspace, WorkspaceRole } from '@/api/types'

export const workspaceKeys = {
  mine: ['workspaces', 'mine'] as const,
  detail: (workspaceId: string) => ['workspaces', 'detail', workspaceId] as const,
  memberships: (workspaceId: string) => ['workspaces', workspaceId, 'memberships'] as const,
  candidates: (workspaceId: string, keyword: string) =>
    ['workspaces', workspaceId, 'candidates', keyword] as const,
}

export function useMyWorkspaces() {
  return useQuery({ queryKey: workspaceKeys.mine, queryFn: ({ signal }) => fetchMyWorkspaces(signal) })
}

export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.detail(workspaceId),
    queryFn: ({ signal }) => fetchWorkspace(workspaceId, signal),
    enabled: workspaceId.length > 0,
  })
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.mine })
    },
  })
}

export function useUpdateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Partial<Pick<Workspace, 'name' | 'description'>>) =>
      updateWorkspace(workspaceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.mine })
    },
  })
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (workspaceId: string) => deleteWorkspace(workspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.mine })
    },
  })
}

/* ---------- 멤버십 (S-06) ---------- */

export function useMemberships(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.memberships(workspaceId),
    queryFn: ({ signal }) => fetchMemberships(workspaceId, signal),
    enabled: workspaceId.length > 0,
  })
}

/** 후보 검색 — 2자 이상 입력 시에만 활성화 (300ms 디바운스는 호출부) */
export function useMembershipCandidates(workspaceId: string, keyword: string) {
  return useQuery({
    queryKey: workspaceKeys.candidates(workspaceId, keyword),
    queryFn: ({ signal }) => fetchMembershipCandidates(workspaceId, keyword, 10, signal),
    enabled: workspaceId.length > 0 && keyword.trim().length >= 2,
  })
}

export function useCreateMembership(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Parameters<typeof createMembership>[1]) => createMembership(workspaceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.memberships(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.mine })
    },
  })
}

export function useUpdateMembership(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: Exclude<WorkspaceRole, 'OWNER'> }) =>
      updateMembership(workspaceId, membershipId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.memberships(workspaceId) })
    },
  })
}

export function useDeleteMembership(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (membershipId: string) => deleteMembership(workspaceId, membershipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.memberships(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.mine })
    },
  })
}
