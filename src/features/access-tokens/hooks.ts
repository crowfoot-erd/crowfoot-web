/**
 * 워크스페이스 액세스 토큰 쿼리/뮤테이션 훅 — 목록, 발급, 폐기.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchAccessTokens,
  issueAccessToken,
  revokeAccessToken,
  type IssueAccessTokenInput,
} from '@/features/access-tokens/api'

export const accessTokenKeys = {
  list: (workspaceId: string) => ['workspaces', workspaceId, 'access-tokens'] as const,
}

export function useAccessTokens(workspaceId: string) {
  return useQuery({
    queryKey: accessTokenKeys.list(workspaceId),
    queryFn: ({ signal }) => fetchAccessTokens(workspaceId, signal),
    enabled: workspaceId.length > 0,
  })
}

export function useIssueAccessToken(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: IssueAccessTokenInput) => issueAccessToken(workspaceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accessTokenKeys.list(workspaceId) })
    },
  })
}

export function useRevokeAccessToken(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (tokenId: string) => revokeAccessToken(workspaceId, tokenId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accessTokenKeys.list(workspaceId) })
    },
  })
}
