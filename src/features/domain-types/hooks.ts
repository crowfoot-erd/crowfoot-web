/**
 * 도메인 타입 훅 (08-core/16-domain-type.md)
 *
 * 목록은 워크스페이스 단위로 캐시한다. 창에 다시 들어오면 다시 읽는다 — 다른 사람이 고친 것을
 * 알아채는 경로다(05-editor/02-ui.md §16 협업).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createDomainType,
  deleteDomainType,
  fetchDomainTypes,
  updateDomainType,
  type DomainTypeInput,
} from '@/features/domain-types/api'

export const domainTypeKeys = {
  list: (workspaceId: string) => ['domain-types', workspaceId] as const,
}

/** 목록 — workspaceId가 없으면(공개 뷰어) 읽지 않는다 */
export function useDomainTypes(workspaceId: string | null) {
  return useQuery({
    queryKey: domainTypeKeys.list(workspaceId ?? ''),
    queryFn: ({ signal }) => fetchDomainTypes(workspaceId ?? '', signal),
    enabled: workspaceId !== null && workspaceId !== '',
    staleTime: 30_000,
  })
}

export function useCreateDomainType(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DomainTypeInput) => createDomainType(workspaceId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: domainTypeKeys.list(workspaceId) }),
  })
}

export function useUpdateDomainType(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: { domainTypeId: string; input: DomainTypeInput; baseVersion: number }) =>
      updateDomainType(workspaceId, variables.domainTypeId, variables.input, variables.baseVersion),
    // 충돌(다른 사람이 먼저 고침)이어도 목록을 다시 읽어 최신 버전을 보여 준다
    onSettled: () => queryClient.invalidateQueries({ queryKey: domainTypeKeys.list(workspaceId) }),
  })
}

export function useDeleteDomainType(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (domainTypeId: string) => deleteDomainType(workspaceId, domainTypeId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: domainTypeKeys.list(workspaceId) }),
  })
}
