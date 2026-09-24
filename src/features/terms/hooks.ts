/**
 * 용어 사전 쿼리/뮤테이션 훅 — 워크스페이스 사전·시스템 사전(전역).
 * 목록은 추론 미리보기·사전 패널이 열릴 때 페치한다(발급 시점 재조회 — 고정점 패턴).
 * 시스템 사전은 워크스페이스와 무관한 전역 쿼리 — 표시용 페이지(useSystemTermsPage)와
 * 추론 원천 전체(useAllSystemTerms)를 분리해 관리하고, 관리 화면에서 바꾸면
 * ['systemTerms'] 프리픽스로 에디터 캐시까지 함께 무효화한다.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteAdminSystemTerm,
  deleteWorkspaceTerm,
  fetchAdminSystemTermsPage,
  fetchSystemTermsPage,
  fetchWorkspaceTerms,
  upsertAdminSystemTerm,
  upsertWorkspaceTerm,
  type SystemTermPageParams,
} from '@/features/terms/api'

export const termKeys = {
  list: (workspaceId: string) => ['workspaces', workspaceId, 'terms'] as const,
}

/** 시스템 사전 쿼리 키 — 표시 페이지·전체·관리 페이지를 ['systemTerms'] 프리픽스로 묶는다 */
export const systemTermKeys = {
  all: ['systemTerms'] as const,
  /** 추론·비표준 검사가 쓰는 전체 목록 */
  allTerms: ['systemTerms', 'all'] as const,
  page: (params: SystemTermPageParams) => ['systemTerms', 'page', params] as const,
  adminPage: (params: SystemTermPageParams) => ['admin', 'systemTerms', 'page', params] as const,
}

export function useWorkspaceTerms(workspaceId: string) {
  return useQuery({
    queryKey: termKeys.list(workspaceId),
    queryFn: ({ signal }) => fetchWorkspaceTerms(workspaceId, signal),
    enabled: workspaceId.length > 0,
  })
}

/** 시스템 사전 한 페이지(전역) — 패널 시스템탭 표시용. 페이지 전환 중에도 이전 목록을 보여준다 */
export function useSystemTermsPage(params: SystemTermPageParams) {
  return useQuery({
    queryKey: systemTermKeys.page(params),
    queryFn: ({ signal }) => fetchSystemTermsPage(params, signal),
    placeholderData: keepPreviousData,
  })
}

/** 관리 화면용 한 페이지 — 같은 조회 조건을 관리 경로로 */
export function useAdminSystemTermsPage(params: SystemTermPageParams) {
  return useQuery({
    queryKey: systemTermKeys.adminPage(params),
    queryFn: ({ signal }) => fetchAdminSystemTermsPage(params, signal),
    placeholderData: keepPreviousData,
  })
}

/** 시스템 사전 전체 — 논리명 추론·비표준 검사의 원천. size 100으로 1페이지를 먼저 얻고
 *  totalPages가 1을 넘으면 나머지 페이지를 순차 이어붙인다(현재 276어 = 3요청).
 *  화면 표시는 useSystemTermsPage가 맡는다 — 여기는 원천 데이터만 담는다 */
/** 추론이 전체 시스템 사전을 받아오는 단위 — 서버 size 상한(100,000)에 맞춘 한 번의 요청 */
const ALL_TERMS_PAGE_SIZE = 100_000

export function useAllSystemTerms() {
  return useQuery({
    queryKey: systemTermKeys.allTerms,
    queryFn: async ({ signal }) => {
      // 시스템 사전은 수만 토큰급이라 한 번의 대량 요청(size 상한 100,000)으로 받는다 —
      // size 100 순차 로딩이면 3.4만 토큰 = 340요청이 된다. 그래도 남는 페이지(10만 초과)는 이어 붙인다
      const first = await fetchSystemTermsPage({ page: 1, size: ALL_TERMS_PAGE_SIZE }, signal)
      const items = [...first.items]
      for (let page = 2; page <= first.totalPages; page++) {
        const next = await fetchSystemTermsPage({ page, size: ALL_TERMS_PAGE_SIZE }, signal)
        items.push(...next.items)
      }
      return items
    },
  })
}

export function useUpsertTerm(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: { term: string; label: string; types?: Record<string, string> | null }) =>
      upsertWorkspaceTerm(workspaceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: termKeys.list(workspaceId) })
    },
  })
}

export function useDeleteTerm(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (termId: string) => deleteWorkspaceTerm(workspaceId, termId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: termKeys.list(workspaceId) })
    },
  })
}

/** 시스템 사전 관리 뮤테이션 — 성공 시 관리 목록과 에디터 캐시(사용자 조회 전부)를 무효화한다 */
export function useUpsertAdminSystemTerm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: {
      term: string
      labels: Record<string, string>
      types?: Record<string, string> | null
    }) => upsertAdminSystemTerm(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: systemTermKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'systemTerms'] })
    },
  })
}

export function useDeleteAdminSystemTerm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (termId: string) => deleteAdminSystemTerm(termId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: systemTermKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'systemTerms'] })
    },
  })
}
