/**
 * 매니지드 DB 쿼리/뮤테이션 훅 — 관리자(루트 인스턴스 CRUD)·사용자(발급·철회).
 * 발급·철회는 커넥션 목록까지 무효화한다(자동 등록·삭제되므로).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createManagedInstance,
  deleteManagedInstance,
  fetchManagedCredential,
  fetchManagedDatabases,
  fetchManagedInstances,
  fetchManagedIssueLimit,
  issueManagedDatabase,
  revokeManagedDatabase,
  testManagedInstance,
  updateManagedInstance,
  updateManagedIssueLimit,
  type CreateManagedInstanceInput,
  type UpdateManagedInstanceInput,
} from '@/features/managed/api'
import { connectionKeys } from '@/features/connections/hooks'

export const managedKeys = {
  instances: ['admin', 'managedInstances'] as const,
  issueLimit: ['admin', 'managedIssueLimit'] as const,
  list: (workspaceId: string) => ['workspaces', workspaceId, 'managedDatabases'] as const,
}

/* ---------- 관리자: 루트 인스턴스 ---------- */

export function useManagedInstances() {
  return useQuery({
    queryKey: managedKeys.instances,
    queryFn: ({ signal }) => fetchManagedInstances(signal),
  })
}

/** 발급 한도(관리자) — 워크스페이스 내 사용자당 */
export function useManagedIssueLimit() {
  return useQuery({
    queryKey: managedKeys.issueLimit,
    queryFn: ({ signal }) => fetchManagedIssueLimit(signal),
  })
}

export function useUpdateManagedIssueLimit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (limit: number) => updateManagedIssueLimit(limit),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: managedKeys.issueLimit })
    },
  })
}

export function useCreateManagedInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateManagedInstanceInput) => createManagedInstance(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: managedKeys.instances })
    },
  })
}

export function useUpdateManagedInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ instanceId, body }: { instanceId: string; body: UpdateManagedInstanceInput }) =>
      updateManagedInstance(instanceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: managedKeys.instances })
    },
  })
}

export function useDeleteManagedInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (instanceId: string) => deleteManagedInstance(instanceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: managedKeys.instances })
    },
  })
}

/** 접속 테스트 — 결과는 토스트로 보고(무효화할 캐시 없음) */
export function useTestManagedInstance() {
  return useMutation({
    mutationFn: (instanceId: string) => testManagedInstance(instanceId),
  })
}

/* ---------- 사용자: 발급 ---------- */

export function useManagedDatabases(workspaceId: string) {
  return useQuery({
    queryKey: managedKeys.list(workspaceId),
    queryFn: ({ signal }) => fetchManagedDatabases(workspaceId, signal),
    enabled: workspaceId.length > 0,
  })
}

export function useIssueManagedDatabase(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (instanceId?: string) => issueManagedDatabase(workspaceId, instanceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: managedKeys.list(workspaceId) })
      // 발급은 커넥션을 자동 등록한다 — 커넥션 목록도 갱신
      void queryClient.invalidateQueries({ queryKey: connectionKeys.list(workspaceId) })
    },
  })
}

export function useRevokeManagedDatabase(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (databaseId: string) => revokeManagedDatabase(workspaceId, databaseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: managedKeys.list(workspaceId) })
      // 철회는 발급 커넥션을 삭제한다 — 커넥션 목록도 갱신
      void queryClient.invalidateQueries({ queryKey: connectionKeys.list(workspaceId) })
    },
  })
}

/** 접속 정보(본인 발급만) — 다이얼로그 열릴 때마다 요청해 복호화본을 받는다(캐시 없음) */
export function useManagedCredential(workspaceId: string) {
  return useMutation({
    mutationFn: (databaseId: string) => fetchManagedCredential(workspaceId, databaseId),
  })
}
