/**
 * 행 편집 모으기 (09-database-manager/00-data-browser.md §5.2) — 순수 함수.
 *
 * 화면에서 고친 내용은 [적용]을 누르기 전까지 서버에 가지 않는다. 여기에 모아 두었다가 한 번에 보낸다(§3.5).
 * 수정은 고치는 순간의 편집 전 값(original)을 함께 기억한다 — 페이지를 넘기거나 정렬을 바꿔도
 * 충돌 검사에 쓸 값이 남아 있어야 하기 때문이다.
 */
import {
  isBinaryCell,
  isTruncatedCell,
  type CellValue,
  type ColumnMeta,
} from '@/features/database/api'

/** 셀에 넣을 값 — 문자열 또는 NULL */
export type EditValue = string | null

export interface RowUpdate {
  /** 대상 행의 기본 키(편집 전 값) */
  key: Record<string, string>
  /** 바꿀 컬럼과 값 */
  values: Record<string, EditValue>
  /** 바꾸려는 컬럼의 편집 전 값 — 서버가 충돌 검사에 쓴다 */
  original: Record<string, EditValue>
}

export interface RowInsert {
  /** 화면에서만 쓰는 번호 */
  id: number
  /** 사용자가 채운 컬럼만 — 나머지는 데이터베이스 기본값이 들어간다 */
  values: Record<string, EditValue>
}

export interface RowEdits {
  /** 행 키(rowKeyOf) → 수정 */
  updates: Record<string, RowUpdate>
  /** 행 키 → 삭제할 행의 기본 키 */
  deletes: Record<string, Record<string, string>>
  inserts: RowInsert[]
  nextInsertId: number
}

export const EMPTY_EDITS: RowEdits = { updates: {}, deletes: {}, inserts: [], nextInsertId: 1 }

/** 서버에 보내는 변경 한 건(§3.5) */
export type RowChange =
  | { op: 'INSERT'; values: Record<string, EditValue> }
  | {
      op: 'UPDATE'
      key: Record<string, string>
      values: Record<string, EditValue>
      original: Record<string, EditValue>
    }
  | { op: 'DELETE'; key: Record<string, string> }

/** 변경 번호 → 화면의 어느 행인지 — 서버가 알려 준 실패 위치를 행에 붙이는 데 쓴다 */
export type ChangeTarget = { kind: 'row'; rowKey: string } | { kind: 'insert'; id: number }

/** 행의 기본 키 — 기본 키 컬럼의 셀이 모두 문자열일 때만 있다 */
export function primaryKeyOf(
  columns: ColumnMeta[],
  row: CellValue[],
): Record<string, string> | null {
  const key: Record<string, string> = {}
  let found = false
  for (let index = 0; index < columns.length; index++) {
    if (!columns[index].primaryKey) continue
    const cell = row[index]
    if (typeof cell !== 'string') return null
    key[columns[index].name] = cell
    found = true
  }
  return found ? key : null
}

/** 행 키 — 기본 키를 컬럼 순서대로 이어 만든 문자열 */
export function rowKeyOf(columns: ColumnMeta[], row: CellValue[]): string | null {
  const key = primaryKeyOf(columns, row)
  return key ? JSON.stringify(Object.values(key)) : null
}

/** 셀의 편집 전 값 — 잘린 셀과 이진 셀은 값을 알 수 없다(undefined) */
export function editableValueOf(cell: CellValue): EditValue | undefined {
  if (cell === null || typeof cell === 'string') return cell
  if (isTruncatedCell(cell) || isBinaryCell(cell)) return undefined
  return undefined
}

/**
 * 셀을 고친다. 편집 전 값과 같아지면 그 컬럼의 수정을 뺀다.
 *
 * @param original 편집 전 값 — 잘린 셀은 통째로 읽어 온 값을 넘긴다(§3.7)
 */
export function setCell(
  edits: RowEdits,
  rowKey: string,
  key: Record<string, string>,
  column: string,
  value: EditValue,
  original: EditValue,
): RowEdits {
  const current = edits.updates[rowKey] ?? { key, values: {}, original: {} }
  const values = { ...current.values }
  const originals = { ...current.original }
  // 이미 고친 컬럼이면 처음 기억한 편집 전 값을 그대로 둔다
  const baseline = column in originals ? originals[column] : original
  if (value === baseline) {
    delete values[column]
    delete originals[column]
  } else {
    values[column] = value
    originals[column] = baseline
  }
  const updates = { ...edits.updates }
  if (Object.keys(values).length === 0) delete updates[rowKey]
  else updates[rowKey] = { key: current.key, values, original: originals }
  return { ...edits, updates }
}

/** 삭제 표시를 켜거나 끈다 */
export function toggleDelete(
  edits: RowEdits,
  rowKey: string,
  key: Record<string, string>,
): RowEdits {
  const deletes = { ...edits.deletes }
  if (rowKey in deletes) delete deletes[rowKey]
  else deletes[rowKey] = key
  return { ...edits, deletes }
}

export function addInsert(edits: RowEdits): RowEdits {
  return {
    ...edits,
    inserts: [{ id: edits.nextInsertId, values: {} }, ...edits.inserts],
    nextInsertId: edits.nextInsertId + 1,
  }
}

/** 추가할 행의 칸을 채운다 — undefined면 그 컬럼을 비운다(데이터베이스 기본값) */
export function setInsertCell(
  edits: RowEdits,
  id: number,
  column: string,
  value: EditValue | undefined,
): RowEdits {
  return {
    ...edits,
    inserts: edits.inserts.map((insert) => {
      if (insert.id !== id) return insert
      const values = { ...insert.values }
      if (value === undefined) delete values[column]
      else values[column] = value
      return { ...insert, values }
    }),
  }
}

export function removeInsert(edits: RowEdits, id: number): RowEdits {
  return { ...edits, inserts: edits.inserts.filter((insert) => insert.id !== id) }
}

export interface EditCounts {
  inserted: number
  updated: number
  deleted: number
  total: number
}

/** 적용될 변경 수 — 삭제 표시한 행의 수정은 세지 않는다(삭제만 간다) */
export function countEdits(edits: RowEdits): EditCounts {
  const deleted = Object.keys(edits.deletes).length
  const updated = Object.keys(edits.updates).filter((rowKey) => !(rowKey in edits.deletes)).length
  const inserted = edits.inserts.length
  return { inserted, updated, deleted, total: inserted + updated + deleted }
}

/** 서버에 보낼 변경 목록 — 삭제, 수정, 추가 순서. targets는 같은 순서의 화면 위치다 */
export function buildChanges(edits: RowEdits): { changes: RowChange[]; targets: ChangeTarget[] } {
  const changes: RowChange[] = []
  const targets: ChangeTarget[] = []
  for (const [rowKey, key] of Object.entries(edits.deletes)) {
    changes.push({ op: 'DELETE', key })
    targets.push({ kind: 'row', rowKey })
  }
  for (const [rowKey, update] of Object.entries(edits.updates)) {
    if (rowKey in edits.deletes) continue
    changes.push({
      op: 'UPDATE',
      key: update.key,
      values: update.values,
      original: update.original,
    })
    targets.push({ kind: 'row', rowKey })
  }
  // 화면에는 새 행이 위에 쌓인다 — 추가한 순서대로 보낸다
  for (const insert of [...edits.inserts].reverse()) {
    changes.push({ op: 'INSERT', values: insert.values })
    targets.push({ kind: 'insert', id: insert.id })
  }
  return { changes, targets }
}
