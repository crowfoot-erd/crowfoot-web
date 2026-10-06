/**
 * 조회 부하 안내 — 정렬·조건이 인덱스를 타기 어려운지 (09-database-manager/00-data-browser.md §5.11)
 *
 * 화면이 구조(기본 키·인덱스)만 보고 판단한다. 서버의 실행 계획을 묻지 않는다 — 안내일 뿐 막지 않는다.
 * 인덱스의 첫 컬럼이 아닌 컬럼은 인덱스를 타기 어렵다고 본다(기본 키·고유 인덱스 포함).
 * 포함·시작 조건은 값을 문자로 바꿔 LIKE로 비교하므로 인덱스가 있어도 느릴 수 있다.
 */
import type { FilterOp, ObjectStructure, RowFilter, RowSort } from '@/features/database/api'

const PATTERN_OPS: ReadonlySet<FilterOp> = new Set<FilterOp>(['CONTAINS', 'STARTS_WITH'])

export interface IndexHints {
  /** 어느 인덱스의 첫 컬럼도 아닌 정렬·조건 컬럼 — 나온 순서대로, 겹치지 않게 */
  unindexed: string[]
  /** 포함·시작 조건을 건 컬럼 — 인덱스가 있어도 느릴 수 있다 */
  pattern: string[]
}

/** 기본 키·인덱스의 첫 컬럼(소문자) */
export function leadingIndexColumns(structure: ObjectStructure): Set<string> {
  const leading = new Set<string>()
  const first = structure.primaryKey[0]
  if (first) leading.add(first.toLowerCase())
  for (const index of structure.indexes) {
    const column = index.columns[0]
    if (column) leading.add(column.toLowerCase())
  }
  return leading
}

/**
 * 구조를 모르거나 뷰면(뷰에는 인덱스가 없다 — 바탕 테이블의 인덱스를 화면이 알 수 없다) 안내하지 않는다.
 */
export function indexHints(
  structure: ObjectStructure | undefined,
  filters: readonly RowFilter[],
  sort: readonly RowSort[],
): IndexHints {
  if (!structure || structure.kind === 'VIEW') return { unindexed: [], pattern: [] }
  const leading = leadingIndexColumns(structure)
  const unindexed: string[] = []
  const pattern: string[] = []
  const push = (list: string[], column: string) => {
    if (!list.includes(column)) list.push(column)
  }
  for (const item of sort) {
    if (!leading.has(item.column.toLowerCase())) push(unindexed, item.column)
  }
  for (const filter of filters) {
    if (!leading.has(filter.column.toLowerCase())) push(unindexed, filter.column)
    if (PATTERN_OPS.has(filter.op)) push(pattern, filter.column)
  }
  return { unindexed, pattern }
}
