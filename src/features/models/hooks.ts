/**
 * ERD 문서 쿼리/뮤테이션 훅 — 생성 성공 후 목록 invalidate (낙관적 갱신 금지).
 * 목록은 워크스페이스당 문서 수가 적어 size 100 고정 로드(페이징 UI는 에디터 단계).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createModel,
  createModelShare,
  deleteModel,
  fetchDatabaseTypes,
  fetchModel,
  fetchModelShares,
  fetchModels,
  fetchSharedDocument,
  revokeModelShare,
  updateModel,
  type CreateModelInput,
  type CreateShareInput,
} from '@/features/models/api'
import type { ModelSummary } from '@/api/types'

export const modelKeys = {
  list: (workspaceId: string, keyword: string) => ['workspaces', workspaceId, 'models', keyword] as const,
  detail: (workspaceId: string, modelId: string) =>
    ['workspaces', workspaceId, 'models', 'detail', modelId] as const,
  // 협업 버전(폴링·WebSocket 푸시 주입 공용) — detail 키 아래에 둬 함께 invalidate 되지 않게 분리
  version: (workspaceId: string, modelId: string) =>
    ['workspaces', workspaceId, 'models', 'detail', modelId, 'version'] as const,
  shares: (workspaceId: string, modelId: string) =>
    ['workspaces', workspaceId, 'models', 'detail', modelId, 'shares'] as const,
  /** 공개 공유 문서 — 인증과 무관한 별도 루트 키 (게스트도 조회) */
  shared: (token: string) => ['shares', token] as const,
  databaseTypes: ['database-types'] as const,
}

export function useModels(workspaceId: string, keyword = '') {
  return useQuery({
    queryKey: modelKeys.list(workspaceId, keyword),
    queryFn: ({ signal }) => fetchModels(workspaceId, { keyword: keyword || undefined, size: 100 }, signal),
    enabled: workspaceId.length > 0,
  })
}

/** 문서 상세(1.3) — content 포함, 에디터 화면 로드 */
export function useModel(workspaceId: string, modelId: string) {
  return useQuery({
    queryKey: modelKeys.detail(workspaceId, modelId),
    queryFn: ({ signal }) => fetchModel(workspaceId, modelId, signal),
    enabled: workspaceId.length > 0 && modelId.length > 0,
  })
}

export function useDatabaseTypes() {
  return useQuery({ queryKey: modelKeys.databaseTypes, queryFn: ({ signal }) => fetchDatabaseTypes(signal) })
}

/** 메타 변경 — 이름·설명 */
export function useUpdateModel(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      modelId,
      body,
    }: { modelId: string; body: Partial<Pick<ModelSummary, 'name' | 'description'>> }) =>
      updateModel(workspaceId, modelId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'models'] })
    },
  })
}

export function useDeleteModel(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (modelId: string) => deleteModel(workspaceId, modelId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'models'] })
    },
  })
}

export function useCreateModel(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateModelInput) => createModel(workspaceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'models'] })
    },
  })
}

/* ---------- 문서 공유 링크 (08-core/02-model.md §1.10) ---------- */

/** 링크 목록 — 다이얼로그가 열려 있을 때만 */
export function useModelShares(workspaceId: string, modelId: string, enabled: boolean) {
  return useQuery({
    queryKey: modelKeys.shares(workspaceId, modelId),
    queryFn: ({ signal }) => fetchModelShares(workspaceId, modelId, signal),
    enabled: enabled && workspaceId.length > 0 && modelId.length > 0,
  })
}

/** 링크 발급 — 성공 시 목록 갱신 */
export function useCreateModelShare(workspaceId: string, modelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateShareInput) => createModelShare(workspaceId, modelId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelKeys.shares(workspaceId, modelId) })
    },
  })
}

/** 링크 철회 — 성공 시 목록 갱신 */
export function useRevokeModelShare(workspaceId: string, modelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (shareId: string) => revokeModelShare(workspaceId, modelId, shareId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelKeys.shares(workspaceId, modelId) })
    },
  })
}

/** 공유 문서 공개 조회 — 게스트(미인증)도 그대로 쓴다 */
export function useSharedDocument(token: string) {
  return useQuery({
    queryKey: modelKeys.shared(token),
    queryFn: ({ signal }) => fetchSharedDocument(token, signal),
    enabled: token.length > 0,
    retry: false,
  })
}
