/**
 * 데이터 브라우저 쿼리 훅 (09-database-manager/00-data-browser.md §3.1~3.4).
 *
 * 서버는 결과를 캐시하지 않는다. 화면도 오래 붙들지 않는다 — 다시 열면 다시 읽는다(staleTime 0).
 * 실패는 자동으로 다시 시도하지 않는다: 접속 실패·제한 시간 초과를 되풀이해 대상 DB에 부하를 주지 않기 위해서다.
 */
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import {
  applyRowChanges,
  countObjectRows,
  fetchCellValue,
  fetchDatabaseObjects,
  fetchObjectRows,
  fetchObjectStructure,
  runCriterionChecks,
  runQuery,
  type CriterionCheckRequest,
  type RowFilter,
  type RowsQuery,
} from '@/features/database/api'
import type { RowChange } from '@/features/database/row-edits'

export const databaseKeys = {
  objects: (workspaceId: string, connectionId: string) =>
    ['database', workspaceId, connectionId, 'objects'] as const,
  structure: (workspaceId: string, connectionId: string, objectName: string) =>
    ['database', workspaceId, connectionId, 'structure', objectName] as const,
  rows: (workspaceId: string, connectionId: string, objectName: string, query: RowsQuery) =>
    ['database', workspaceId, connectionId, 'rows', objectName, query] as const,
}

export function useDatabaseObjects(workspaceId: string, connectionId: string, enabled = true) {
  return useQuery({
    queryKey: databaseKeys.objects(workspaceId, connectionId),
    queryFn: ({ signal }) => fetchDatabaseObjects(workspaceId, connectionId, signal),
    enabled: enabled && workspaceId.length > 0 && connectionId.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export function useObjectStructure(
  workspaceId: string,
  connectionId: string,
  objectName: string | null,
) {
  return useQuery({
    queryKey: databaseKeys.structure(workspaceId, connectionId, objectName ?? ''),
    queryFn: ({ signal }) =>
      fetchObjectStructure(workspaceId, connectionId, objectName ?? '', signal),
    enabled: objectName !== null,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export function useObjectRows(
  workspaceId: string,
  connectionId: string,
  objectName: string | null,
  query: RowsQuery,
) {
  return useQuery({
    queryKey: databaseKeys.rows(workspaceId, connectionId, objectName ?? '', query),
    queryFn: ({ signal }) =>
      fetchObjectRows(workspaceId, connectionId, objectName ?? '', query, signal),
    enabled: objectName !== null,
    retry: false,
    refetchOnWindowFocus: false,
    // 정렬·페이지를 바꾸는 동안 앞 결과를 그대로 보여 준다(표가 깜빡이지 않게)
    placeholderData: keepPreviousData,
  })
}

/** 정확한 행 수 — 사용자가 눌렀을 때만 센다(큰 테이블에서 느리다) */
export function useCountRows(workspaceId: string, connectionId: string, objectName: string) {
  return useMutation({
    mutationFn: (filters: RowFilter[]) =>
      countObjectRows(workspaceId, connectionId, objectName, filters),
  })
}

/** SQL 콘솔 실행 — 자동으로 다시 시도하지 않는다(같은 쓰기 문장이 두 번 실행되면 안 된다) */
export function useRunQuery(workspaceId: string, connectionId: string) {
  return useMutation({
    mutationFn: ({ sql, confirmed }: { sql: string; confirmed: boolean }) =>
      runQuery(workspaceId, connectionId, sql, confirmed),
    retry: false,
  })
}

/** 행 편집 적용 — 자동으로 다시 시도하지 않는다(같은 변경이 두 번 들어가면 안 된다) */
export function useApplyRowChanges(workspaceId: string, connectionId: string, objectName: string) {
  return useMutation({
    mutationFn: (changes: RowChange[]) =>
      applyRowChanges(workspaceId, connectionId, objectName, changes),
    retry: false,
  })
}

/** 수용 기준 데이터 확인 — 읽기만 하지만 대상 DB에 부하를 되풀이하지 않게 다시 시도하지 않는다 */
export function useRunCriterionChecks(workspaceId: string, connectionId: string) {
  return useMutation({
    mutationFn: (checks: CriterionCheckRequest[]) => runCriterionChecks(workspaceId, connectionId, checks),
    retry: false,
  })
}

/** 긴 값 읽기 — 잘린 셀을 열었을 때만 읽는다. 다시 열면 다시 읽는다(화면이 값을 오래 붙들지 않는다) */
export function useCellValue(
  workspaceId: string,
  connectionId: string,
  objectName: string,
  target: { key: Record<string, string>; column: string } | null,
) {
  return useQuery({
    queryKey: ['database', workspaceId, connectionId, 'cell', objectName, target] as const,
    queryFn: ({ signal }) =>
      fetchCellValue(
        workspaceId,
        connectionId,
        objectName,
        target?.key ?? {},
        target?.column ?? '',
        signal,
      ),
    enabled: target !== null,
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  })
}
