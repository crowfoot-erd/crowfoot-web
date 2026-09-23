/**
 * 에디터 클립보드 — 복사/붙여넣기·Duplicate (05-editor/02-ui.md §9)
 *
 * 클립보드는 세션(모듈) 안쪽에만 산다 — 시스템 클립보드로 내보내지 않는다. 문서 스냅샷을
 * 그대로 들고 있다가 붙여넣기 시점에 문서에 맞춰 재구성한다.
 *
 * - 복사: 선택된 테이블·메모 + 관계는 양끝 테이블이 모두 선택됐을 때만(서브그래프 관례).
 * - 붙여넣기: 모든 객체 id를 재발급하고 물리명에 접미를 붙여 유일화한다(접미 문구는 호출부
 *   i18n — "사본"/"copy"). 키(PK·UK·인덱스·FK) 이름도 문서에서 유일하게 다시 만든다.
 * - **FK 이중 삽입 방지**: 관계가 참조하는 FK 컬럼은 테이블 복사에서 빼고
 *   relationship/create의 fkColumns로 삽입한다 — applyRelationshipCreate가 FK 삽입의
 *   유일한 경로라야 식별 관계의 PK 편입·비식별 1:1의 UK 생성 규칙이 그대로 지켜진다.
 *   대가로 컬럼 순서가 원본과 달라질 수 있다(FK는 PK 블록 뒤에 끼워진다) — 수용하고 문서화했다.
 * - 결과는 ErdChange 배열 — commitAll로 한 번에 커밋해 undo 한 번으로 전체 취소가 된다.
 *   같은 클립보드를 연속으로 붙여넣으면 오프셋이 32px씩 누적돼 겹치지 않는다.
 */
import {
  applyChange,
  newId,
  type ErdChange,
} from '@/features/editor/model/changes'
import type {
  ErdColumn,
  ErdIndex,
  ErdNote,
  ErdRelationship,
  ErdTable,
  ErdUniqueKey,
  EditorDocument,
} from '@/features/editor/model/content-schema'
import { documentKeyNames, nextName } from '@/features/editor/model/keys'

/** 붙여넣기 오프셋 — 원본 오른쪽 아래로 살짝 치우친다 */
const PASTE_OFFSET = 32

export interface ClipboardPayload {
  tables: ErdTable[]
  relationships: ErdRelationship[]
  notes: ErdNote[]
}

interface ClipboardState {
  payload: ClipboardPayload
  /** 이 클립보드를 몇 번 붙여넣었는지 — 오프셋 누적(1부터) */
  pastedCount: number
}

let clipboard: ClipboardState | null = null

export function hasClipboard(): boolean {
  return clipboard !== null
}

/** 선택 세트를 클립보드로 — 복사된 객체가 하나도 없으면 false(클립보드 유지) */
export function copyToClipboard(doc: EditorDocument, selectedIds: readonly string[]): boolean {
  const selected = new Set(selectedIds)
  const tables = doc.model.tables.filter((table) => selected.has(table.id))
  const relationships = doc.model.relationships.filter(
    (rel) => selected.has(rel.childTableId) && selected.has(rel.parentTableId),
  )
  const notes = doc.diagram.notes.filter((note) => selected.has(note.id))
  if (tables.length === 0 && notes.length === 0) return false
  clipboard = { payload: { tables, relationships, notes }, pastedCount: 0 }
  return true
}

export interface PasteResult {
  changes: ErdChange[]
  /** 붙여넣은 객체 id들 — 호출부가 선택으로 바꾼다(연속 붙여넣기·Duplicate UX) */
  selectedIds: string[]
}

/** 클립보드를 문서에 붙여넣는 변경 목록 — doc는 변경하지 않는다(순수 계산) */
export function pasteFromClipboard(doc: EditorDocument, copyLabel: string): PasteResult | null {
  if (!clipboard || clipboard.payload.tables.length + clipboard.payload.notes.length === 0) return null
  clipboard.pastedCount += 1
  const offset = PASTE_OFFSET * clipboard.pastedCount

  const changes: ErdChange[] = []
  const selectedIds: string[] = []
  const tableIdMap = new Map<string, string>()
  const columnIdMap = new Map<string, string>()
  let working = doc

  /* 관계가 다시 만들 FK 컬럼 — 테이블 복사에서 제외한다(이중 삽입 방지) */
  const fkChildColumnIds = new Set(
    clipboard.payload.relationships.flatMap((rel) => rel.columnMappings.map((m) => m.childColumnId)),
  )
  const columnOf = new Map<string, ErdColumn>()
  for (const table of clipboard.payload.tables) {
    for (const column of table.columns) columnOf.set(column.id, column)
  }

  /* ---------- 테이블 ---------- */
  for (const original of clipboard.payload.tables) {
    const id = newId()
    tableIdMap.set(original.id, id)

    const columns: ErdColumn[] = []
    for (const column of original.columns) {
      if (fkChildColumnIds.has(column.id)) continue
      const columnId = newId()
      columnIdMap.set(column.id, columnId)
      columns.push({ ...column, id: columnId })
    }
    /** 원본 컬럼 id → 복사본 id — FK여서 빠진 컬럼은 매핑이 없어 키에서 자동으로 빠진다 */
    const remapIds = (ids: readonly string[]): string[] =>
      ids.map((cid) => columnIdMap.get(cid)).filter((cid): cid is string => cid != null)

    const keyNames = documentKeyNames(working.model)
    const tableNames = new Set(working.model.tables.map((t) => t.physicalName.trim().toLowerCase()))
    const primaryKey = original.primaryKey
      ? {
          ...original.primaryKey,
          name: nextName(keyNames, original.primaryKey.name),
          columnIds: remapIds(original.primaryKey.columnIds),
        }
      : null
    if (primaryKey) keyNames.add(primaryKey.name.toLowerCase())
    // FK 전체로 구성된 키(식별 관계가 만든 복합 PK·UK)는 컬럼이 비워지는데, relationship/create가 다시 구성한다
    const uniques: ErdUniqueKey[] = original.uniques
      .map((u) => ({ ...u, id: newId(), name: nextName(keyNames, u.name), columnIds: remapIds(u.columnIds) }))
      .filter((u) => u.columnIds.length > 0)
    for (const u of uniques) keyNames.add(u.name.toLowerCase())
    const indexes: ErdIndex[] = original.indexes
      .map((ix) => ({
        ...ix,
        id: newId(),
        name: nextName(keyNames, ix.name),
        columns: ix.columns.flatMap((c) => {
          const columnId = columnIdMap.get(c.columnId)
          return columnId ? [{ columnId, order: c.order }] : []
        }),
      }))
      .filter((ix) => ix.columns.length > 0)

    const layout = doc.diagram.nodes[original.id] ?? { x: 0, y: 0 }
    const table: ErdTable = {
      ...original,
      id,
      physicalName: nextName(tableNames, `${original.physicalName}_${copyLabel}`),
      columns,
      primaryKey: primaryKey && primaryKey.columnIds.length > 0 ? primaryKey : null,
      uniques,
      indexes,
    }
    const change: ErdChange = {
      type: 'table/create',
      table,
      position: { x: layout.x + offset, y: layout.y + offset },
    }
    changes.push(change)
    selectedIds.push(id)
    working = applyChange(working, change)
  }

  /* ---------- 관계 — FK 컬럼은 여기서 자식 테이블에 삽입된다 ---------- */
  for (const original of clipboard.payload.relationships) {
    const parentTableId = tableIdMap.get(original.parentTableId)
    const childTableId = tableIdMap.get(original.childTableId)
    if (!parentTableId || !childTableId) continue

    const fkColumns: ErdColumn[] = []
    const columnMappings: ErdRelationship['columnMappings'] = []
    for (const mapping of original.columnMappings) {
      const parentColumnId = columnIdMap.get(mapping.parentColumnId)
      const childColumn = columnOf.get(mapping.childColumnId)
      if (!parentColumnId || !childColumn) continue
      const fkId = newId()
      fkColumns.push({ ...childColumn, id: fkId })
      columnMappings.push({ parentColumnId, childColumnId: fkId })
    }
    // 매핑이 하나도 구성되지 않으면(연쇄 FK 등 원본 부모 PK가 복사에서 빠진 경우) 관계를 건너뛴다
    if (columnMappings.length === 0) continue

    const relationship: ErdRelationship = {
      ...original,
      id: newId(),
      parentTableId,
      childTableId,
      fkName: nextName(documentKeyNames(working.model), original.fkName),
      columnMappings,
    }
    const change: ErdChange = { type: 'relationship/create', relationship, fkColumns }
    changes.push(change)
    selectedIds.push(relationship.id)
    working = applyChange(working, change)
  }

  /* ---------- 메모 ---------- */
  for (const original of clipboard.payload.notes) {
    const linkedTableId = original.linkedTableId ? tableIdMap.get(original.linkedTableId) ?? null : null
    const note: ErdNote = {
      ...original,
      id: newId(),
      x: original.x + offset,
      y: original.y + offset,
      linkedTableId,
    }
    const change: ErdChange = { type: 'note/create', note }
    changes.push(change)
    selectedIds.push(note.id)
    working = applyChange(working, change)
  }

  return { changes, selectedIds }
}
