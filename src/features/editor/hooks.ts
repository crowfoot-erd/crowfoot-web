/**
 * 에디터 쿼리·뮤테이션 — DDL 생성 쿼리, 저장·배포 뮤테이션, 저장 성공 후 문서 쿼리 invalidate (목록 v 표시·상세 동기화)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deployModel,
  fetchConnectionMigrationDdl,
  fetchModelDdl,
  fetchModelVersion,
  fetchVersionMigrationDdl,
  saveModelContent,
  type SaveModelContentInput,
} from '@/features/editor/api'
import { modelKeys } from '@/features/models/hooks'

/** 협업 v1 버전 폴링 주기 — v1은 폴링 기반 변경 감지(2차: WebSocket 푸시) */
export const VERSION_POLL_MS = 5000

export function useSaveModelContent(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ modelId, body }: { modelId: string; body: SaveModelContentInput }) =>
      saveModelContent(workspaceId, modelId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'models'] })
    },
  })
}

/** DDL 생성 — 다이얼로그가 열려 있을 때만 조회한다. staleTime 0이라 열 때마다
 *  마지막 저장 본문 기준으로 새로 받는다(저장 invalidate가 목록 키(prefix)에 걸린다). */
export function useModelDdl(workspaceId: string, modelId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['workspaces', workspaceId, 'models', modelId, 'ddl'],
    queryFn: ({ signal }) => fetchModelDdl(workspaceId, modelId as string, signal),
    enabled: enabled && modelId !== null,
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  })
}

/** 마이그레이션 DDL(버전 A→B) — 비교 뷰 헤더 진입, 다이얼로그가 열려 있을 때만 */
export function useVersionMigrationDdl(
  workspaceId: string,
  modelId: string,
  from: number,
  to: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['workspaces', workspaceId, 'models', modelId, 'versions', from, 'migration', to],
    queryFn: ({ signal }) => fetchVersionMigrationDdl(workspaceId, modelId, from, to, signal),
    enabled,
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  })
}

/** 마이그레이션 DDL(문서↔실제 DB) — SyncDialog 푸터 진입(Editor+), 열려 있을 때만 */
export function useConnectionMigrationDdl(
  workspaceId: string,
  modelId: string,
  connectionId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['workspaces', workspaceId, 'models', modelId, 'connections', connectionId, 'migration'],
    queryFn: ({ signal }) => fetchConnectionMigrationDdl(workspaceId, modelId, connectionId, signal),
    enabled: enabled && connectionId.length > 0,
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  })
}

/** 배포(1.8) — invalidate 없음: 문서 content는 변하지 않는다 */
export function useDeployModel(workspaceId: string) {
  return useMutation({
    mutationFn: ({ modelId, connectionId }: { modelId: string; connectionId: string }) =>
      deployModel(workspaceId, modelId, connectionId),
  })
}

/** 협업 v1 버전 폴링(1.9) — 문서가 열려 있는 동안 주기적으로 version만 조회한다.
 *  404(삭제됨)·네트워크 오류는 조용히: 폴링이 편집을 방해하지 않게 retry 없음.
 *  공개 공유 뷰어에서는 끈다(enabled=false) — 인증 없는 경로라 폴링이 401을 만든다. */
export function useModelVersion(workspaceId: string, modelId: string, enabled = true) {
  return useQuery({
    queryKey: modelKeys.version(workspaceId, modelId),
    queryFn: ({ signal }) => fetchModelVersion(workspaceId, modelId, signal),
    enabled,
    refetchInterval: VERSION_POLL_MS,
    staleTime: 0,
    gcTime: 15_000,
    retry: false,
  })
}
