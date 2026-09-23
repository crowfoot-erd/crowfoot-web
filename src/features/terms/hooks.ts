/**
 * 용어 사전 쿼리/뮤테이션 훅 — 목록(멤버 전체)·upsert·삭제.
 * 목록은 추론 미리보기가 열릴 때 페치한다(발급 시점 재조회 — 고정점 패턴).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteWorkspaceTerm,
  fetchWorkspaceTerms,
  upsertWorkspaceTerm,
} from '@/features/terms/api'

export const termKeys = {
  list: (workspaceId: string) => ['workspaces', workspaceId, 'terms'] as const,
}

export function useWorkspaceTerms(workspaceId: string) {
  return useQuery({
    queryKey: termKeys.list(workspaceId),
    queryFn: ({ signal }) => fetchWorkspaceTerms(workspaceId, signal),
    enabled: workspaceId.length > 0,
  })
}

export function useUpsertTerm(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: { term: string; label: string }) => upsertWorkspaceTerm(workspaceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: termKeys.list(workspaceId) })
    },
  })
}

export function useDeleteTerm(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (termId: string) => deleteWorkspaceTerm(workspaceId, termId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: termKeys.list(workspaceId) })
    },
  })
}
