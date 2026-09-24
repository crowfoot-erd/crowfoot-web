/**
 * 용어 사전 쿼리/뮤테이션 훅 — 표준 사전(워크스페이스)·시스템 사전(전역)·대량 등록.
 * 목록은 추론 미리보기·사전 패널이 열릴 때 페치한다(발급 시점 재조회 — 고정점 패턴).
 * 시스템 사전은 워크스페이스와 무관한 전역 쿼리 — 관리 화면에서 바꾸면 에디터 캐시도 함께 무효화한다.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteAdminSystemTerm,
  deleteWorkspaceTerm,
  fetchAdminSystemTerms,
  fetchSystemTerms,
  fetchWorkspaceTerms,
  upsertAdminSystemTerm,
  upsertWorkspaceTerm,
} from '@/features/terms/api'
import { errorMessage } from '@/lib/result-code'

export const termKeys = {
  list: (workspaceId: string) => ['workspaces', workspaceId, 'terms'] as const,
}

/** 시스템 사전 쿼리 키 — 사용자 목록(에디터 추론)과 관리 목록을 함께 무효화할 때 쓴다 */
export const systemTermKeys = {
  list: ['systemTerms'] as const,
  admin: ['admin', 'systemTerms'] as const,
}

export function useWorkspaceTerms(workspaceId: string) {
  return useQuery({
    queryKey: termKeys.list(workspaceId),
    queryFn: ({ signal }) => fetchWorkspaceTerms(workspaceId, signal),
    enabled: workspaceId.length > 0,
  })
}

/** 시스템 사전(전역) — 에디터 추론의 바닥 사전. 워크스페이스 무관하게 1회 페치된다 */
export function useSystemTerms() {
  return useQuery({
    queryKey: systemTermKeys.list,
    queryFn: ({ signal }) => fetchSystemTerms(signal),
  })
}

export function useAdminSystemTerms() {
  return useQuery({
    queryKey: systemTermKeys.admin,
    queryFn: ({ signal }) => fetchAdminSystemTerms(signal),
  })
}

export function useUpsertTerm(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: { term: string; label: string; type?: string | null }) =>
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

/** 시스템 사전 관리 뮤테이션 — 성공 시 관리 목록과 에디터 캐시(사용자 목록) 둘 다 무효화한다 */
export function useUpsertAdminSystemTerm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: { term: string; labels: Record<string, string>; type?: string | null }) =>
      upsertAdminSystemTerm(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: systemTermKeys.list })
      void queryClient.invalidateQueries({ queryKey: systemTermKeys.admin })
    },
  })
}

export function useDeleteAdminSystemTerm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (termId: string) => deleteAdminSystemTerm(termId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: systemTermKeys.list })
      void queryClient.invalidateQueries({ queryKey: systemTermKeys.admin })
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
 *  않는다 — 실패는 outcome에 줄 번호·에러 문구로 모아 돌려준다. */
export function useBulkUpsertTerms(workspaceId: string) {
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
      // 순차 실행 — 병렬으로 쏘면 서버의 1,000 상한 검사가 경쟁할 수 있다
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]
        try {
          await upsertWorkspaceTerm(workspaceId, {
            term: entry.term,
            label: entry.label,
            type: entry.type ?? null,
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
