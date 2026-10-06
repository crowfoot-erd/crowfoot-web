/**
 * 에디터 쿼리·뮤테이션 — DDL 생성 쿼리, 저장·배포 뮤테이션, 저장 성공 후 문서 쿼리 invalidate (목록 v 표시·상세 동기화)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  applyConnectionMigration,
  deployModel,
  fetchConnectionMigrationDdl,
  fetchModelDdl,
  fetchModelOutline,
  fetchShareDdl,
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

/** 공개 뷰어 DDL 생성(§1.10.8) — 공유 토큰이 자격. 다이얼로그가 열려 있을 때만 조회한다 */
export function useShareDdl(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ['shares', token, 'ddl'],
    queryFn: ({ signal }) => fetchShareDdl(token, signal),
    enabled: enabled && token.length > 0,
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

/** 마이그레이션 DDL 실행(1.15) — 반영 후 스크립트 쿼리를 무효화해 다이얼로그가 열려 있는
 *  채 재조회한다: 깨끗하게 반영되면 빈 diff(문장 0)로 수렴해 눈으로 확인시킨다. */
export function useApplyConnectionMigration(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      modelId,
      connectionId,
      includeDestructive,
    }: {
      modelId: string
      connectionId: string
      includeDestructive?: boolean
    }) => applyConnectionMigration(workspaceId, modelId, connectionId, includeDestructive ?? false),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'workspaces',
          workspaceId,
          'models',
          variables.modelId,
          'connections',
          variables.connectionId,
          'migration',
        ],
      })
    },
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

/** 반영 대기 요구사항의 바뀐 내용(08-core/17-model-edit.md §2.4) — 저장된 문서의 개요에서 읽는다.
 *  키가 ['workspaces', ws, 'models', ...] 아래라 저장 성공의 invalidate에 함께 걸린다.
 *  저장 버전을 키에 넣어 남이 저장해 버전이 오른 경우에도 다시 읽는다 */
export function useRequirementChanges(workspaceId: string, modelId: string, version: number, enabled: boolean) {
  return useQuery({
    queryKey: [...modelKeys.detail(workspaceId, modelId), 'outline', version],
    queryFn: async ({ signal }) => {
      const outline = await fetchModelOutline(workspaceId, modelId, signal)
      return new Map((outline?.requirements ?? []).flatMap((item) => (item.changes ? [[item.code, item.changes] as const] : [])))
    },
    enabled: enabled && workspaceId.length > 0 && modelId.length > 0,
    staleTime: 0,
    retry: false,
  })
}
