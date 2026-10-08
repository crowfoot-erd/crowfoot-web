/**
 * 사이트 쇼케이스 쿼리/뮤테이션 훅 (08-core/19-site-showcase.md) — 변경 성공 후 invalidate (낙관적 갱신 금지)
 *
 * 문서의 사이트를 고치면 공개 목록·관리자 목록도 달라진다 — 두 서브트리를 함께 무효화한다.
 * 문서의 사이트 캐시는 응답(사이트 객체)으로 바로 채운다 — 다시 읽지 않는다.
 */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteModelSite,
  fetchAdminShowcaseSites,
  fetchModelSite,
  fetchShowcaseSites,
  recaptureModelSite,
  reportShowcaseSite,
  saveModelSite,
  updateAdminShowcaseSite,
  type AdminShowcaseFilter,
  type ModelSite,
  type ModelSiteBody,
} from '@/features/showcase/api'

/** 목록 한 번에 붙이는 수 — 서버 기본값(Section 3.5)과 같다 */
export const SHOWCASE_PAGE_SIZE = 12
/** 랜딩 섹션의 카드 수(Section 3.5 — size=6 첫 페이지) */
export const SHOWCASE_LANDING_SIZE = 6

export const showcaseKeys = {
  all: ['showcase'] as const,
  /** 공개 목록(랜딩·/showcase) 루트 */
  public: ['showcase', 'public'] as const,
  /** 관리자 목록 루트 */
  adminAll: ['showcase', 'admin'] as const,
  modelSite: (workspaceId: string, modelId: string) => ['showcase', 'model', workspaceId, modelId] as const,
  landing: ['showcase', 'public', 'landing'] as const,
  list: ['showcase', 'public', 'list'] as const,
  admin: (filter: AdminShowcaseFilter, page: number) => ['showcase', 'admin', filter, page] as const,
}

/** 문서의 사이트 — 없으면 data가 null */
export function useModelSite(workspaceId: string, modelId: string | null) {
  return useQuery({
    queryKey: showcaseKeys.modelSite(workspaceId, modelId ?? ''),
    queryFn: ({ signal }) => fetchModelSite(workspaceId, modelId ?? '', signal),
    enabled: Boolean(modelId),
  })
}

/** 문서의 사이트가 바뀐 뒤 — 공개·관리자 목록을 다시 읽게 한다 */
function invalidateLists(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: showcaseKeys.public })
  void queryClient.invalidateQueries({ queryKey: showcaseKeys.adminAll })
}

/** 저장·다시 가져오기 응답(사이트 객체)을 문서 캐시에 바로 넣고, 공개 목록은 다시 읽게 한다 */
function useSiteMutation<TVariables>(
  workspaceId: string,
  modelId: string,
  mutationFn: (variables: TVariables) => Promise<ModelSite | undefined>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (site) => {
      if (site) queryClient.setQueryData(showcaseKeys.modelSite(workspaceId, modelId), site)
      invalidateLists(queryClient)
    },
  })
}

export function useSaveModelSite(workspaceId: string, modelId: string) {
  return useSiteMutation(workspaceId, modelId, (body: ModelSiteBody) => saveModelSite(workspaceId, modelId, body))
}

export function useRecaptureModelSite(workspaceId: string, modelId: string) {
  return useSiteMutation(workspaceId, modelId, () => recaptureModelSite(workspaceId, modelId))
}

export function useDeleteModelSite(workspaceId: string, modelId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deleteModelSite(workspaceId, modelId),
    onSuccess: () => {
      queryClient.setQueryData(showcaseKeys.modelSite(workspaceId, modelId), null)
      invalidateLists(queryClient)
    },
  })
}

/** 랜딩 섹션 — 게스트 조회라 retry 없이(빈 목록·실패면 섹션을 숨긴다) */
export function useLandingShowcase() {
  return useQuery({
    queryKey: showcaseKeys.landing,
    queryFn: ({ signal }) => fetchShowcaseSites({ page: 0, size: SHOWCASE_LANDING_SIZE }, signal),
    retry: false,
  })
}

/** /showcase 목록 — "더 보기"로 다음 페이지를 붙인다(0부터, Section 3.5) */
export function useShowcaseSites() {
  return useInfiniteQuery({
    queryKey: showcaseKeys.list,
    queryFn: ({ pageParam, signal }) => fetchShowcaseSites({ page: pageParam, size: SHOWCASE_PAGE_SIZE }, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPageParam + 1 < lastPage.totalPages ? lastPageParam + 1 : undefined,
    retry: false,
  })
}

/** 신고 — 같은 사람이 다시 신고해도 200(멱등). 자동 숨김이 생길 수 있어 목록을 다시 읽는다 */
export function useReportShowcaseSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ siteId, reason }: { siteId: string; reason?: string }) => reportShowcaseSite(siteId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: showcaseKeys.public })
    },
  })
}

/** 관리자 목록 — page는 화면 기준 1부터, 요청은 0부터 */
export function useAdminShowcaseSites(filter: AdminShowcaseFilter, page: number) {
  return useQuery({
    queryKey: showcaseKeys.admin(filter, page),
    queryFn: ({ signal }) => fetchAdminShowcaseSites({ filter, page: page - 1 }, signal),
    placeholderData: keepPreviousData,
  })
}

export function useUpdateAdminShowcaseSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ siteId, hidden }: { siteId: string; hidden: boolean }) => updateAdminShowcaseSite(siteId, hidden),
    onSuccess: () => {
      invalidateLists(queryClient)
    },
  })
}
