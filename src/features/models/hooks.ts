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
  fetchModelVersionDetail,
  fetchModelVersions,
  fetchModels,
  fetchSharedDocument,
  fetchSharedGallery,
  patchModelVersionMemo,
  restoreModelVersion,
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
  /** 버전 기록 목록(§1.11) — page·keyword 포함(메모 검색). keyword가 키에 있어야
   *  검색어를 바꿀 때 새로 땡긴다 — 누락되면 이전 키워드의 캐시가 그대로 노출된다.
   *  detail 서브트리라 저장 성공 무효화에 함께 갱신된다 */
  versions: (workspaceId: string, modelId: string, page: number, keyword = '') =>
    ['workspaces', workspaceId, 'models', 'detail', modelId, 'versions', page, keyword] as const,
  /** 버전 상세(해당 시점 content 전문) — 버전 뷰어 */
  versionDetail: (workspaceId: string, modelId: string, version: number) =>
    ['workspaces', workspaceId, 'models', 'detail', modelId, 'versions', 'detail', version] as const,
  /** 공개 공유 문서 — 인증과 무관한 별도 루트 키 (게스트도 조회) */
  shared: (token: string) => ['shares', token] as const,
  /** 공유 갤러리 — 현재 공유 중인 문서 목록(랜딩), 마찬가지로 인증 무관 루트 키 */
  gallery: ['shares', 'gallery'] as const,
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

/* ---------- 문서 버전 기록 (08-core/02-model.md §1.11) ---------- */

/** 버전 기록 목록 — 다이얼로그가 열려 있을 때만, 최신순 페이징(size 20 고정).
 *  keyword는 디바운스가 끝난 값(메모 부분 일치) — 빈 문자열이면 전체 목록 */
export function useModelVersions(
  workspaceId: string,
  modelId: string,
  page: number,
  keyword: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: modelKeys.versions(workspaceId, modelId, page, keyword),
    queryFn: ({ signal }) =>
      fetchModelVersions(workspaceId, modelId, { page, size: 20, keyword: keyword || undefined }, signal),
    enabled: enabled && workspaceId.length > 0 && modelId.length > 0,
  })
}

/** 버전 상세 — 버전 뷰어가 여는 시점 문서 전문 */
export function useModelVersionDetail(
  workspaceId: string,
  modelId: string,
  version: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: modelKeys.versionDetail(workspaceId, modelId, version),
    queryFn: ({ signal }) => fetchModelVersionDetail(workspaceId, modelId, version, signal),
    enabled: enabled && workspaceId.length > 0 && modelId.length > 0,
  })
}

/** 버전 메모 편집 — 성공 시 목록 전체 페이지 무효화(요약 행이 갱신된다) */
export function usePatchModelVersionMemo(workspaceId: string, modelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ version, memo }: { version: number; memo: string | null }) =>
      patchModelVersionMemo(workspaceId, modelId, version, { memo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workspaces', workspaceId, 'models', 'detail', modelId, 'versions'],
      })
    },
  })
}

/** 버전 복원 — 과거 content가 새 버전으로 저장된다. 문서·버전 기록 전체를 다시 땡긴다 */
export function useRestoreModelVersion(workspaceId: string, modelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ version, baseVersion }: { version: number; baseVersion: number }) =>
      restoreModelVersion(workspaceId, modelId, version, { baseVersion }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'models'] })
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

/** 공유 갤러리 목록 — 게스트(미인증) 랜딩 페이지에서도 그대로 쓴다 (빈 목록이면 섹션을 숨긴다) */
export function useSharedGallery() {
  return useQuery({
    queryKey: modelKeys.gallery,
    queryFn: ({ signal }) => fetchSharedGallery(signal),
    retry: false,
  })
}
