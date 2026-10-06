/**
 * 외래 키 따라가기 (09-database-manager/00-data-browser.md §5.9)
 *
 * - 부모로: 외래 키 컬럼의 값으로 부모 테이블의 그 행을 연다(참조 컬럼 = 값)
 * - 자식으로: 이 행을 참조하는 테이블을 그 값으로 걸러 연다(외래 키 컬럼 = 이 행의 참조 컬럼 값)
 * - 값 중 하나라도 NULL·잘림·이진이면 따라갈 수 없다 — 정확히 같은 값으로만 거른다
 */
import type { CellValue, ColumnMeta, ObjectStructure, RowFilter } from '@/features/database/api'

export type ForeignKeyDef = ObjectStructure['foreignKeys'][number]
export type ReferenceDef = NonNullable<ObjectStructure['referencedBy']>[number]

/** 따라갈 곳 — 고를 객체와 처음 걸어 둘 조건 */
export interface FollowTarget {
  object: string
  filters: RowFilter[]
}

/** 컬럼 이름(소문자) → 그 컬럼이 들어 있는 외래 키. 여러 외래 키에 들면 앞의 것 */
export function foreignKeyByColumn(
  foreignKeys: readonly ForeignKeyDef[] | undefined,
): Map<string, ForeignKeyDef> {
  const map = new Map<string, ForeignKeyDef>()
  for (const foreignKey of foreignKeys ?? []) {
    for (const column of foreignKey.columns) {
      const key = column.toLowerCase()
      if (!map.has(key)) map.set(key, foreignKey)
    }
  }
  return map
}

function valuesOf(
  names: readonly string[],
  columns: readonly ColumnMeta[],
  row: readonly CellValue[],
): string[] | null {
  const values: string[] = []
  for (const name of names) {
    const index = columns.findIndex((column) => column.name.toLowerCase() === name.toLowerCase())
    const cell = index < 0 ? undefined : row[index]
    if (typeof cell !== 'string') return null
    values.push(cell)
  }
  return values
}

function equalsFilters(names: readonly string[], values: readonly string[]): RowFilter[] {
  return names.map((column, index) => ({ column, op: 'EQ', value: values[index] }))
}

/** 이 행의 외래 키 값으로 부모 행 — 값을 알 수 없으면 null */
export function parentTarget(
  foreignKey: ForeignKeyDef,
  columns: readonly ColumnMeta[],
  row: readonly CellValue[],
): FollowTarget | null {
  const values = valuesOf(foreignKey.columns, columns, row)
  if (!values) return null
  return {
    object: foreignKey.referencedObject,
    filters: equalsFilters(foreignKey.referencedColumns, values),
  }
}

/** 이 행을 참조하는 자식 행 — 참조 컬럼 값을 알 수 없으면 null */
export function childTarget(
  reference: ReferenceDef,
  columns: readonly ColumnMeta[],
  row: readonly CellValue[],
): FollowTarget | null {
  const values = valuesOf(reference.referencedColumns, columns, row)
  if (!values) return null
  return { object: reference.object, filters: equalsFilters(reference.columns, values) }
}
