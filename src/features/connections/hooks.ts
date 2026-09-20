/**
 * 커넥션 쿼리/뮤테이션 훅 — 목록(멤버 전체)·등록/변경/삭제·테스트·리버스.
 * 리버스 성공은 문서 목록도 갱신한다(신규 문서 생성).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createConnection,
  deleteConnection,
  fetchConnectionSchema,
  fetchConnections,
  reverseEngineer,
  testConnection,
  updateConnection,
  type CreateConnectionInput,
  type ReverseEngineeringInput,
} from '@/features/connections/api'

export const connectionKeys = {
  list: (workspaceId: string) => ['workspaces', workspaceId, 'connections'] as const,
}

export function useConnections(workspaceId: string) {
  return useQuery({
    queryKey: connectionKeys.list(workspaceId),
    queryFn: ({ signal }) => fetchConnections(workspaceId, signal),
    enabled: workspaceId.length > 0,
  })
}

export function useCreateConnection(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateConnectionInput) => createConnection(workspaceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionKeys.list(workspaceId) })
    },
  })
}

export function useUpdateConnection(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      connectionId,
      body,
    }: {
      connectionId: string
      body: Partial<Omit<CreateConnectionInput, 'password'>> & { password?: string }
    }) => updateConnection(workspaceId, connectionId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionKeys.list(workspaceId) })
    },
  })
}

export function useDeleteConnection(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (connectionId: string) => deleteConnection(workspaceId, connectionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionKeys.list(workspaceId) })
    },
  })
}

/** 접속 테스트 — 목록 캐시와 무관한 단발 호출 */
export function useTestConnection(workspaceId: string) {
  return useMutation({
    mutationFn: (connectionId: string) => testConnection(workspaceId, connectionId),
  })
}

/** 리버스 — 성공 시 문서 목록도 무효화 */
export function useReverseEngineer(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ connectionId, body }: { connectionId: string; body?: ReverseEngineeringInput }) =>
      reverseEngineer(workspaceId, connectionId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionKeys.list(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'models'] })
    },
  })
}

/** 스키마 조회(동기화 원천) — 문서·커넥션 상태를 바꾸지 않는 읽기 경로라 캐시 무효화 없음 */
export function useConnectionSchema(workspaceId: string) {
  return useMutation({
    mutationFn: (connectionId: string) => fetchConnectionSchema(workspaceId, connectionId),
  })
}
