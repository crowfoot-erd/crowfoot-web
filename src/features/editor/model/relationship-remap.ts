/**
 * 관계의 컬럼 매핑 편집 — 자식 쪽 외래 키 컬럼을 바꾸는 변경 묶음 (05-editor/02-ui.md §4.2)
 *
 * 부모 쪽은 부모의 기본 키 컬럼 그대로다. 매핑마다 자식 컬럼을 기존 컬럼으로 바꾸거나 새로 만든다.
 * 결과는 변경 배열 한 덩어리다 — commitAll로 커밋해 Undo 한 번으로 전체가 취소된다.
 *   ① 새 컬럼 추가(column/add) ② 부모 타입에 맞추기(column/patch)
 *   ③ 관계 패치(relationship/patch — 규칙 옮기기는 리듀서가 한다) ④ 쓰지 않게 된 컬럼 삭제(column/remove)
 */
import { createColumn, type ErdChange, type RelationshipPatch } from '@/features/editor/model/changes'
import type { EditorDocument, ErdColumn, ErdRelationship, ErdTable } from '@/features/editor/model/content-schema'

/** 매핑 한 줄의 자식 쪽 선택 — 기존 컬럼 id 또는 "새 컬럼 만들기" */
export const NEW_COLUMN = '__new__'

export interface RemapInput {
  /** 부모 컬럼 id → 자식 컬럼 id 또는 NEW_COLUMN. 관계의 매핑 순서대로 읽는다 */
  selection: Record<string, string>
  /** 부모 타입에 맞출 자식 컬럼 id */
  alignTypeColumnIds?: readonly string[]
  /** 외래 키에서 빠진 컬럼을 지울지 */
  removeReleased?: boolean
  /** 매핑과 함께 보낼 나머지 패치(유형·기수 등) */
  patch?: RelationshipPatch
}

export type RemapProblem = 'DUPLICATE_CHILD_COLUMN' | 'UNKNOWN_COLUMN'

export type RemapResult =
  | { ok: true; changed: boolean; changes: ErdChange[] }
  | { ok: false; reason: RemapProblem }

/** 두 컬럼의 타입 서명이 같은지 — 검증의 FK_TYPE_MISMATCH와 같은 기준 */
export function sameColumnType(a: ErdColumn, b: ErdColumn): boolean {
  return (
    a.dataType.trim().toLowerCase() === b.dataType.trim().toLowerCase() &&
    a.length === b.length &&
    a.precision === b.precision &&
    a.scale === b.scale
  )
}

function uniqueName(existing: Set<string>, base: string): string {
  if (!existing.has(base)) return base
  for (let i = 1; ; i += 1) {
    const candidate = `${base}_${i}`
    if (!existing.has(candidate)) return candidate
  }
}

/** 지워도 되는 컬럼인지 — 기본 키에 들었거나 다른 관계가 쓰는 컬럼은 남긴다 */
function isRemovable(doc: EditorDocument, table: ErdTable, columnId: string, relationshipId: string): boolean {
  if (table.primaryKey?.columnIds.includes(columnId)) return false
  return !doc.model.relationships.some(
    (rel) =>
      rel.id !== relationshipId &&
      rel.columnMappings.some((m) => m.childColumnId === columnId || m.parentColumnId === columnId),
  )
}

export function buildRemapChanges(
  doc: EditorDocument,
  relationship: ErdRelationship,
  input: RemapInput,
): RemapResult {
  const parent = doc.model.tables.find((table) => table.id === relationship.parentTableId)
  const child = doc.model.tables.find((table) => table.id === relationship.childTableId)
  if (!parent || !child) return { ok: false, reason: 'UNKNOWN_COLUMN' }
  const parentColumn = new Map(parent.columns.map((column) => [column.id, column] as const))
  const childColumn = new Map(child.columns.map((column) => [column.id, column] as const))
  const align = new Set(input.alignTypeColumnIds ?? [])

  const changes: ErdChange[] = []
  const takenNames = new Set(child.columns.map((column) => column.physicalName.toLowerCase()))
  const used = new Set<string>()
  const columnMappings: ErdRelationship['columnMappings'] = []
  // 식별 관계의 외래 키는 기본 키라 NOT NULL이다. 리듀서가 다시 맞추지만 새 컬럼도 같은 값으로 만든다
  const identifying = input.patch?.identifying ?? relationship.identifying
  const parentMultiplicity = input.patch?.parentMultiplicity ?? relationship.parentMultiplicity

  for (const mapping of relationship.columnMappings) {
    const source = parentColumn.get(mapping.parentColumnId)
    const picked = input.selection[mapping.parentColumnId] ?? mapping.childColumnId
    if (!source) return { ok: false, reason: 'UNKNOWN_COLUMN' }

    if (picked === NEW_COLUMN) {
      const physicalName = uniqueName(
        takenNames,
        `${parent.physicalName.toLowerCase()}_${source.physicalName.toLowerCase()}`,
      )
      takenNames.add(physicalName)
      const column = createColumn({
        physicalName,
        logicalName: source.logicalName,
        dataType: source.dataType,
        length: source.length,
        precision: source.precision,
        scale: source.scale,
        nullable: !identifying && parentMultiplicity === 'ZERO_OR_ONE',
        autoIncrement: false,
      })
      changes.push({ type: 'column/add', tableId: child.id, column })
      columnMappings.push({ parentColumnId: source.id, childColumnId: column.id })
      continue
    }

    const target = childColumn.get(picked)
    if (!target) return { ok: false, reason: 'UNKNOWN_COLUMN' }
    if (used.has(target.id)) return { ok: false, reason: 'DUPLICATE_CHILD_COLUMN' }
    used.add(target.id)
    if (align.has(target.id) && !sameColumnType(source, target)) {
      changes.push({
        type: 'column/patch',
        tableId: child.id,
        columnId: target.id,
        patch: { dataType: source.dataType, length: source.length, precision: source.precision, scale: source.scale },
      })
    }
    columnMappings.push({ parentColumnId: source.id, childColumnId: target.id })
  }

  const before = relationship.columnMappings.map((m) => `${m.parentColumnId}>${m.childColumnId}`).join('|')
  const after = columnMappings.map((m) => `${m.parentColumnId}>${m.childColumnId}`).join('|')
  const mappingChanged = before !== after
  const hasPatch = input.patch !== undefined && Object.keys(input.patch).length > 0
  if (mappingChanged || hasPatch) {
    changes.push({
      type: 'relationship/patch',
      relationshipId: relationship.id,
      patch: mappingChanged ? { ...input.patch, columnMappings } : { ...input.patch },
    })
  }

  if (mappingChanged && input.removeReleased) {
    const kept = new Set(columnMappings.map((m) => m.childColumnId))
    for (const mapping of relationship.columnMappings) {
      if (kept.has(mapping.childColumnId)) continue
      if (!isRemovable(doc, child, mapping.childColumnId, relationship.id)) continue
      changes.push({ type: 'column/remove', tableId: child.id, columnId: mapping.childColumnId })
    }
  }

  return { ok: true, changed: mappingChanged, changes }
}
