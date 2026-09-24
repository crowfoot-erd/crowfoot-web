/**
 * 용어 사전 쿼리/뮤테이션 훅 — 표준 사전(워크스페이스)·시스템 사전(전역)·대량 등록.
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
import { errorMessage } from '@/lib/result-code'

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
export function useAllSystemTerms() {
  return useQuery({
    queryKey: systemTermKeys.allTerms,
    queryFn: async ({ signal }) => {
      const first = await fetchSystemTermsPage({ page: 1, size: 100 }, signal)
      const items = [...first.items]
      for (let page = 2; page <= first.totalPages; page++) {
        const next = await fetchSystemTermsPage({ page, size: 100 }, signal)
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

/** 대량 등록 한 줄 결과 — editor의 term-bulk-parse와 같은 구조(줄 번호 포함). type은 선택 */
export interface TermBulkLine {
  line: number
  term: string
  label: string
  type?: string | null
}

export interface BulkUpsertOutcome {
  succeeded: Array<{ line: number; term: string }>
  failed: Array<{ line: number; term: string; message: string }>
}

/** 용어 대량 등록 — 원시 upsert를 줄 단위로 순차 실행한다.
 *  useUpsertTerm을 줄마다 쓰면 성공할 때마다 invalidate로 목록을 N번 리페치하니,
 *  api를 직접 부르고 **끝나고 1회만** invalidate한다. 한 줄 실패가 나머지를 멈추지
 *  않는다 — 실패는 outcome에 줄 번호·에러 문구로 모아 돌려준다.
 *  3열 타입은 문서의 DB 종류(databaseType) 키 하나로 저장된다. */
export function useBulkUpsertTerms(workspaceId: string, databaseType: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      entries,
      onProgress,
    }: {
      entries: readonly TermBulkLine[]
      /** 진행 콜백 — 다이얼로그의 n/N 표시. 줄 하나가 끝날 때마다 (done, total)로 불린다 */
      onProgress?: (done: number, total: number) => void
    }) => {
      const outcome: BulkUpsertOutcome = { succeeded: [], failed: [] }
      // 순차 실행 — 병렬로 쏘면 서버의 1,000 상한 검사가 경쟁할 수 있다
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]
        try {
          await upsertWorkspaceTerm(workspaceId, {
            term: entry.term,
            label: entry.label,
            types: entry.type ? { [databaseType]: entry.type } : null,
          })
          outcome.succeeded.push({ line: entry.line, term: entry.term })
        } catch (error) {
          outcome.failed.push({ line: entry.line, term: entry.term, message: errorMessage(error) })
        }
        onProgress?.(index + 1, entries.length)
      }
      return outcome
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: termKeys.list(workspaceId) })
    },
  })
}
