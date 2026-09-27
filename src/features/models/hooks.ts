/**
 * ERD 문서 쿼리/뮤테이션 훅 — 생성 성공 후 목록 invalidate (낙관적 갱신 금지).
 * 목록은 워크스페이스당 문서 수가 적어 size 100 고정 로드(페이징 UI는 에디터 단계).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  cloneFromTemplate,
  createModel,
  createModelShare,
  createOwnerShareReply,
  createShareComment,
  deleteModel,
  deleteOwnerShareComment,
  deleteShareComment,
  fetchDatabaseTypes,
  fetchModel,
  fetchModelShares,
  fetchModelVersionDetail,
  fetchModelVersions,
  fetchModels,
  fetchShareFeedback,
  fetchSharedDocument,
  fetchSharedGallery,
  fetchTemplates,
  patchModelVersionMemo,
  restoreModelVersion,
  revokeModelShare,
  sqlImport,
  sqlImportPreview,
  toggleShareReaction,
  updateModel,
  type CloneFromTemplateInput,
  type CreateModelInput,
  type CreateShareCommentInput,
  type CreateShareInput,
  type SqlImportInput,
} from '@/features/models/api'
import type { ModelSummary, ShareFeedback } from '@/api/types'

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
  /** 공유 문서 피드백(반응·댓글) — shared 하위 키라 ['shares', token] 무효화에 함께 갱신된다 */
  shareFeedback: (token: string) => ['shares', token, 'feedback'] as const,
  /** 공유 갤러리 — 현재 공유 중인 문서 목록(랜딩), 마찬가지로 인증 무관 루트 키 */
  gallery: ['shares', 'gallery'] as const,
  /** 템플릿 공개 목록 — 인증 무관 루트 키(갤러리와 같은 규칙) */
  templates: ['templates'] as const,
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

/* ---------- SQL Import (08-core/02-model.md §1.12) ---------- */

/** SQL Import 미리보기 — 다이얼로그 [미리보기] 버튼. 저장 부수효과 없음 */
export function useSqlImportPreview(workspaceId: string) {
  return useMutation({
    mutationFn: (body: { databaseType: string; ddl: string }) =>
      sqlImportPreview(workspaceId, body),
  })
}

/** SQL Import 생성 — 성공 시 문서 목록 invalidate */
export function useSqlImport(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: SqlImportInput) => sqlImport(workspaceId, body),
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

/* ---------- 공유 문서 피드백 (08-core/02-model.md §1.10.6·§1.10.7) ---------- */

/** 피드백 초기화 — 반응 상태 + 댓글 목록 1회 fetch (공개 뷰어 하단 섹션) */
export function useShareFeedback(token: string) {
  return useQuery({
    queryKey: modelKeys.shareFeedback(token),
    queryFn: ({ signal }) => fetchShareFeedback(token, signal),
    enabled: token.length > 0,
    retry: false,
  })
}

/** 반응 토글 — 낙관 전환은 컴포넌트가, 정착은 서버 응답으로 캐시를 덮어쓴다 */
export function useToggleShareReaction(token: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => toggleShareReaction(token),
    onSuccess: (reaction) => {
      // 토글은 항상 본문을 돌려주지만 apiPost 원천 타입이 undefined 가능 — 없으면 낙관값 유지
      if (!reaction) return
      queryClient.setQueryData<ShareFeedback>(modelKeys.shareFeedback(token), (feedback) =>
        feedback
          ? { ...feedback, reactionCount: reaction.reactionCount, reacted: reaction.reacted }
          : feedback,
      )
    },
    // 실패 시 낙관 전환 원복은 onError 콜백(컴포넌트)이 queryClient로 되돌린다
  })
}

/** 익명 댓글 등록 — 성공 시 피드백 전체를 다시 땡긴다(댓글 수 카운터도 서버가 갱신한다) */
export function useCreateShareComment(token: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateShareCommentInput) => createShareComment(token, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelKeys.shared(token) })
    },
  })
}

/** 익명 본인 댓글 삭제 — 서버(방문자 쿠키)가 최종 판정, 403도 이 훅 호출자가 토스트로 받는다 */
export function useDeleteShareComment(token: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (commentId: string) => deleteShareComment(token, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelKeys.shared(token) })
    },
  })
}

/** 오너 답글 등록(공유 다이얼로그) — 무효화에 토큰이 필요해 변수에 실어 보낸다 */
export function useCreateOwnerShareReply(workspaceId: string, modelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      shareId,
      parentCommentId,
      content,
    }: { shareId: string; token: string; parentCommentId: string; content: string }) =>
      createOwnerShareReply(workspaceId, modelId, shareId, { parentCommentId, content }),
    onSuccess: (_reply, { token }) => {
      void queryClient.invalidateQueries({ queryKey: modelKeys.shared(token) })
      void queryClient.invalidateQueries({ queryKey: modelKeys.shares(workspaceId, modelId) })
    },
  })
}

/** 오너 댓글 관리 삭제(공유 다이얼로그) — 답글 동반 삭제로 카운터도 내려간다 */
export function useDeleteOwnerShareComment(workspaceId: string, modelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ shareId, commentId }: { shareId: string; token: string; commentId: string }) =>
      deleteOwnerShareComment(workspaceId, modelId, shareId, commentId),
    onSuccess: (_void, { token }) => {
      void queryClient.invalidateQueries({ queryKey: modelKeys.shared(token) })
      void queryClient.invalidateQueries({ queryKey: modelKeys.shares(workspaceId, modelId) })
    },
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

/* ---------- 템플릿 (08-core/09-templates.md) ---------- */

/** 템플릿 공개 목록 — 게스트(미인증) 랜딩·로그인 사용자 다이얼로그가 같이 쓴다 (빈 목록이면 조용히 숨긴다) */
export function useTemplates() {
  return useQuery({
    queryKey: modelKeys.templates,
    queryFn: ({ signal }) => fetchTemplates(signal),
    retry: false,
  })
}

/** 템플릿 복제 — 성공 시 문서 목록 invalidate(복제된 문서가 목록에 나타난다) */
export function useCloneFromTemplate(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CloneFromTemplateInput) => cloneFromTemplate(workspaceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'models'] })
    },
  })
}
