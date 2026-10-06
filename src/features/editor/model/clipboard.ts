/**
 * 에디터 클립보드 — 복사/붙여넣기·Duplicate (05-editor/02-ui.md §9)
 *
 * 클립보드는 모듈 상태와 브라우저 저장소(localStorage)에 산다 — 시스템 클립보드로 내보내지 않는다
 * (권한을 묻지 않는다). 저장소에 둔 덕에 같은 브라우저의 다른 탭에서 연 **다른 문서에도 붙여 넣는다**.
 * 문서 스냅샷을 그대로 들고 있다가 붙여넣기 시점에 문서에 맞춰 재구성한다.
 *
 * - 저장소에는 1MB 이하만 둔다. 넘으면 모듈 상태에만 남아 같은 문서 안에서만 붙여 넣는다.
 *   24시간이 지난 것은 쓰지 않는다. 로그아웃하면 지운다(clipboard-storage.ts).
 * - 위치: 같은 문서는 원본에서 32px씩 치우친다. 다른 문서는 화면 가운데(center)에,
 *   우클릭 붙여넣기는 누른 자리(anchor)에 놓는다.
 *
 * - 복사: 선택된 테이블·메모 + 관계는 양끝 테이블이 모두 선택됐을 때만(서브그래프 관례).
 * - **주제 영역은 복사 대상이 아니다**(v1.13 명시) — 영역은 문서 전체 배경의 묶음 표시지
 *   객체가 아니라서 복제되면 같은 박스가 겹쳐 그려진다. 붙여넣은 테이블의 영역 소속도
 *   이어받지 않는다(원본 테이블의 소속을 그대로 두면 두 사본이 한 영역에 중복 등록된다).
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
import { CLIPBOARD_STORAGE_KEY, removeStoredClipboard } from '@/features/editor/model/clipboard-storage'
import { NOTE_ESTIMATED_HEIGHT } from '@/features/editor/model/canvas-bounds'
import { documentKeyNames, nextName } from '@/features/editor/model/keys'
import { estimateTableHeight, MIN_WIDTH } from '@/features/editor/model/table-size'

/** 붙여넣기 오프셋 — 원본 오른쪽 아래로 살짝 치우친다 */
const PASTE_OFFSET = 32

/** 저장소에 두는 한도(글자 수) — 넘으면 이 탭 안에서만 쓴다 */
const SHARED_MAX_LENGTH = 1_000_000
/** 저장소에 둔 클립보드의 수명 */
const SHARED_TTL_MS = 24 * 60 * 60 * 1000

export interface ClipboardPayload {
  tables: ErdTable[]
  relationships: ErdRelationship[]
  notes: ErdNote[]
  /** 복사한 시점의 테이블 위치 — 다른 문서에는 원본의 배치 정보가 없다 */
  positions: Record<string, { x: number; y: number }>
}

interface ClipboardState {
  payload: ClipboardPayload
  /** 복사한 문서 — 붙여 넣는 문서와 다르면 위치를 화면 가운데로 잡는다 */
  sourceModelId: string | null
  copiedAt: number
  /** 이 클립보드를 몇 번 붙여넣었는지 — 오프셋 누적(1부터) */
  pastedCount: number
}

let clipboard: ClipboardState | null = null

/** 저장소의 클립보드 — 없거나 낡았거나 형식이 맞지 않으면 null */
function readShared(): Omit<ClipboardState, 'pastedCount'> | null {
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ClipboardState>
    const payload = parsed.payload
    if (
      !payload ||
      !Array.isArray(payload.tables) ||
      !Array.isArray(payload.relationships) ||
      !Array.isArray(payload.notes) ||
      typeof parsed.copiedAt !== 'number'
    ) {
      return null
    }
    if (Date.now() - parsed.copiedAt > SHARED_TTL_MS) return null
    return {
      payload: { ...payload, positions: payload.positions ?? {} },
      sourceModelId: parsed.sourceModelId ?? null,
      copiedAt: parsed.copiedAt,
    }
  } catch {
    return null
  }
}

/** 지금 쓸 클립보드 — 다른 탭에서 더 나중에 복사한 것이 있으면 그것으로 바꾼다 */
function currentClipboard(): ClipboardState | null {
  const shared = readShared()
  if (shared && (!clipboard || shared.copiedAt > clipboard.copiedAt)) {
    clipboard = { ...shared, pastedCount: 0 }
  }
  return clipboard
}

export function hasClipboard(): boolean {
  return currentClipboard() !== null
}

/** 클립보드를 비운다 — 모듈 상태와 저장소 모두 */
export function clearClipboard(): void {
  clipboard = null
  removeStoredClipboard()
}

export interface CopyResult {
  /** 복사된 객체가 있는지 — 없으면 클립보드는 그대로다 */
  copied: boolean
  /** 저장소에도 두었는지 — false면 다른 문서에는 붙여 넣을 수 없다(크기 한도·저장소 사용 불가) */
  shared: boolean
}

/** 선택 세트를 클립보드로 — 복사된 객체가 하나도 없으면 copied:false(클립보드 유지) */
export function copyToClipboard(
  doc: EditorDocument,
  selectedIds: readonly string[],
  sourceModelId: string | null = null,
): CopyResult {
  const selected = new Set(selectedIds)
  const tables = doc.model.tables.filter((table) => selected.has(table.id))
  const relationships = doc.model.relationships.filter(
    (rel) => selected.has(rel.childTableId) && selected.has(rel.parentTableId),
  )
  const notes = doc.diagram.notes.filter((note) => selected.has(note.id))
  if (tables.length === 0 && notes.length === 0) return { copied: false, shared: false }
  const positions: ClipboardPayload['positions'] = {}
  for (const table of tables) {
    const layout = doc.diagram.nodes[table.id]
    if (layout) positions[table.id] = { x: layout.x, y: layout.y }
  }
  // 저장소 것보다 늦은 시각이어야 다음 읽기에서 덮이지 않는다
  const copiedAt = Math.max(Date.now(), (clipboard?.copiedAt ?? 0) + 1)
  clipboard = { payload: { tables, relationships, notes, positions }, sourceModelId, copiedAt, pastedCount: 0 }
  let shared = false
  try {
    const serialized = JSON.stringify({ payload: clipboard.payload, sourceModelId, copiedAt })
    if (serialized.length <= SHARED_MAX_LENGTH) {
      window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, serialized)
      shared = true
    } else {
      // 이전에 둔 것이 남아 있으면 다른 탭이 낡은 내용을 붙여 넣는다 — 지운다
      window.localStorage.removeItem(CLIPBOARD_STORAGE_KEY)
    }
  } catch {
    shared = false
  }
  return { copied: true, shared }
}

export interface PasteOptions {
  /** 붙여 넣는 문서 — 복사한 문서와 다르면 center에 놓는다 */
  modelId?: string | null
  /** 화면 가운데(캔버스 좌표) — 다른 문서에 붙여 넣을 때 묶음의 중심이 여기에 온다 */
  center?: { x: number; y: number } | null
  /** 우클릭한 자리(캔버스 좌표) — 묶음의 왼쪽 위가 여기에 온다. center보다 먼저다 */
  anchor?: { x: number; y: number } | null
}

export interface PasteResult {
  changes: ErdChange[]
  /** 붙여넣은 객체 id들 — 호출부가 선택으로 바꾼다(연속 붙여넣기·Duplicate UX) */
  selectedIds: string[]
}

/** 클립보드를 문서에 붙여넣는 변경 목록 — doc는 변경하지 않는다(순수 계산).
 *  databaseType은 관계 재생의 FK 인덱스 자동 생성 규칙(§6.6)에 들어간다 — 원본 문서와 같은 DBMS */
export function pasteFromClipboard(
  doc: EditorDocument,
  copyLabel: string,
  databaseType = '',
  options: PasteOptions = {},
): PasteResult | null {
  const clipboard = currentClipboard()
  if (!clipboard || clipboard.payload.tables.length + clipboard.payload.notes.length === 0) return null
  clipboard.pastedCount += 1
  const offset = PASTE_OFFSET * clipboard.pastedCount

  /* ---------- 놓을 자리 — 원본 좌표에 더할 이동량 ---------- */
  const positionOf = (tableId: string) =>
    clipboard.payload.positions[tableId] ?? doc.diagram.nodes[tableId] ?? { x: 0, y: 0 }
  // 실측 크기는 모른다(다른 문서에서 왔을 수 있다) — 최소 폭과 컬럼 수로 어림한다
  const boxes = [
    ...clipboard.payload.tables.map((table) => ({
      ...positionOf(table.id),
      w: MIN_WIDTH,
      h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length + (table.checks?.length ?? 0)),
    })),
    ...clipboard.payload.notes.map((note) => ({ x: note.x, y: note.y, w: note.width, h: NOTE_ESTIMATED_HEIGHT })),
  ]
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.w))
  const maxY = Math.max(...boxes.map((box) => box.y + box.h))
  const crossDocument = options.modelId != null && clipboard.sourceModelId !== options.modelId
  let dx = offset
  let dy = offset
  if (options.anchor) {
    dx = options.anchor.x - minX
    dy = options.anchor.y - minY
  } else if (crossDocument && options.center) {
    // 묶음의 중심을 화면 가운데에 맞춘다 — 연속 붙여넣기는 조금씩 치우친다
    dx = options.center.x - (minX + maxX) / 2 + offset - PASTE_OFFSET
    dy = options.center.y - (minY + maxY) / 2 + offset - PASTE_OFFSET
  }

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

    const layout = positionOf(original.id)
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
      position: { x: Math.round(layout.x + dx), y: Math.round(layout.y + dy) },
    }
    changes.push(change)
    selectedIds.push(id)
    working = applyChange(working, change, databaseType)
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
    working = applyChange(working, change, databaseType)
  }

  /* ---------- 메모 ---------- */
  for (const original of clipboard.payload.notes) {
    const linkedTableId = original.linkedTableId ? tableIdMap.get(original.linkedTableId) ?? null : null
    const note: ErdNote = {
      ...original,
      id: newId(),
      x: Math.round(original.x + dx),
      y: Math.round(original.y + dy),
      linkedTableId,
    }
    const change: ErdChange = { type: 'note/create', note }
    changes.push(change)
    selectedIds.push(note.id)
    working = applyChange(working, change, databaseType)
  }

  return { changes, selectedIds }
}
