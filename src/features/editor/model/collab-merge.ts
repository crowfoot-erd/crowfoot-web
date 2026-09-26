/**
 * 협업 병합 순수 함수 (05-editor/03-collaboration.md §2 — v1.17)
 *
 * 커맨드 채널의 클라이언트 측 계산 전부 — 네트워크(stomp)·스토어(zustand)를 모른다:
 * · changeTargetKeys — 커맨드 하나가 건드리는 (객체, 속성) 키 집합 (collab ChangeTargets의 웹판)
 * · deriveChanges — 두 문서 스냅샷의 차이를 ErdChange열로 변환. 두 곳에 쓴다:
 *     1) 내 dirty 범위 = deriveChanges(savedDocument, present) — LWW 충돌 감지의 원천
 *     2) undo/redo 보상 발행 = deriveChanges(되돌리기 전 present, 되돌린 후 문서) —
 *        undo가 스냅샷 복원이라 커맨드 이력이 없어도 되돌린 결과를 타인에게 그대로 발행한다
 * · detectLwwConflicts — 타인 커맨드의 키가 내 dirty 키와 같은 속성에서 값까지 바꾸면 충돌 목록
 * · coalesceChanges — 발신 버스트 병합(같은 대상 patch는 합치고, 구조 변경은 앞선 patch를 무효화)
 *
 * 수렴 규칙(§2 채택 전략)의 클라이언트 측 구현: 다른 객체는 자동 병합(키가 안 겹치면 조용히),
 * 같은 속성은 서버 seq 순서 LWW(늦은 커맨드 승리) + 양측 알림, 구조 충돌은 Edit Session Lock이
 * 사전에 막는다. 접두사 필드('*')는 "객체 전체" — 구조 변경이 객체 단위로 겹치면 무조건 알림.
 */
import type {
  ErdArea,
  ErdColumn,
  ErdRelationship,
  ErdTable,
  EditorDocument,
} from '@/features/editor/model/content-schema'
import type { ColumnPatch, ErdChange, TablePatch } from '@/features/editor/model/changes'

/* ---------- (객체, 속성) 키 ---------- */

export type TargetKind =
  | 'table'
  | 'column'
  | 'primaryKey'
  | 'uniqueKey'
  | 'index'
  | 'relationship'
  | 'note'
  | 'area'
  | 'node'

export interface ChangeTargetKey {
  kind: TargetKind
  /** 객체 id — primaryKey·uniqueKey·index는 소속 테이블 id(소유자가 테이블이다) */
  id: string
  /** 속성명 — '*'는 객체 전체(생성·삭제·배열 교체), 'order'는 컬럼 순서 */
  field: string
}

/** 키 문자열화 — Set 교집합용. id는 UUID라 구분자 충돌이 없다 */
const keyId = (k: ChangeTargetKey): string => `${k.kind}:${k.id}:${k.field}`

/** 커맨드 하나가 건드리는 키 — patch는 속성별, 구조 변경은 객체 전체('*') */
export function changeTargetKeys(change: ErdChange): ChangeTargetKey[] {
  switch (change.type) {
    case 'table/create':
      return [{ kind: 'table', id: change.table.id, field: '*' }]
    case 'table/remove':
      return [{ kind: 'table', id: change.tableId, field: '*' }]
    case 'table/patch':
      return Object.keys(change.patch).map((field) => ({ kind: 'table' as const, id: change.tableId, field }))
    case 'column/add':
      return [{ kind: 'column', id: change.column.id, field: '*' }]
    case 'column/remove':
      return [{ kind: 'column', id: change.columnId, field: '*' }]
    case 'column/patch':
      return Object.keys(change.patch).map((field) => ({ kind: 'column' as const, id: change.columnId, field }))
    case 'column/move':
      return [{ kind: 'column', id: change.columnId, field: 'order' }]
    case 'primaryKey/set':
      return [{ kind: 'primaryKey', id: change.tableId, field: '*' }]
    case 'uniqueKey/set':
      return [{ kind: 'uniqueKey', id: change.tableId, field: '*' }]
    case 'index/set':
      return [{ kind: 'index', id: change.tableId, field: '*' }]
    case 'relationship/create':
      return [{ kind: 'relationship', id: change.relationship.id, field: '*' }]
    case 'relationship/patch':
      return Object.keys(change.patch).map((field) => ({ kind: 'relationship' as const, id: change.relationshipId, field }))
    case 'relationship/remove':
      return [{ kind: 'relationship', id: change.relationshipId, field: '*' }]
    case 'note/create':
      return [{ kind: 'note', id: change.note.id, field: '*' }]
    case 'note/remove':
      return [{ kind: 'note', id: change.noteId, field: '*' }]
    case 'note/patch':
      return Object.keys(change.patch).map((field) => ({ kind: 'note' as const, id: change.noteId, field }))
    case 'area/create':
      return [{ kind: 'area', id: change.area.id, field: '*' }]
    case 'area/remove':
      return [{ kind: 'area', id: change.areaId, field: '*' }]
    case 'area/patch':
      return Object.keys(change.patch).map((field) => ({ kind: 'area' as const, id: change.areaId, field }))
    case 'node/move':
      return Object.entries(change.positions).flatMap(([tableId, pos]) =>
        (['x', 'y'] as const)
          .filter((axis) => pos[axis] != null)
          .map((axis) => ({ kind: 'node' as const, id: tableId, field: axis })),
      )
    case 'node/resize':
      return [{ kind: 'node', id: change.tableId, field: 'width' }]
    case 'node/color':
      return [{ kind: 'node', id: change.tableId, field: 'color' }]
  }
}

/* ---------- 스냅샷 diff → ErdChange열 (dirty 도출·undo 보상 공용) ---------- */

/** defaultValue 정규화 — ''≡null (doc-diff·sync-merge와 동일 규칙) */
const normDefault = (v: string | null): string | null => (v == null || v === '' ? null : v)

/** 컬럼 속성 diff — patch로 표현 가능한 필드만 (id 제외 전부) */
function columnPatchOf(from: ErdColumn, to: ErdColumn): Partial<ErdColumn> | null {
  const patch: Record<string, unknown> = {}
  const fields = [
    'logicalName',
    'physicalName',
    'dataType',
    'length',
    'precision',
    'scale',
    'nullable',
    'autoIncrement',
    'comment',
  ] as const
  for (const f of fields) {
    if (from[f] !== to[f]) patch[f] = to[f]
  }
  if (normDefault(from.defaultValue) !== normDefault(to.defaultValue)) patch.defaultValue = to.defaultValue
  return Object.keys(patch).length > 0 ? (patch as Partial<ErdColumn>) : null
}

/** 두 문서의 차이를 커맨드열로 — from을 to로 만드는 절대값 커맨드들.
 *  순서: 제거 → 패치·이동 → 생성(테이블 → 컬럼 → 관계 → 노트·영역). 제거가 먼저 와야
 *  생성 커맨드가 비어 있는 상대를 만나도 순서 역전 없이 적용된다(멱등·절대값이라 순서 관대).
 *  viewport는 로컬 뷰 상태라 협업 대상에서 제외한다. */
export function deriveChanges(from: EditorDocument, to: EditorDocument): ErdChange[] {
  const changes: ErdChange[] = []
  const toTables = new Map(to.model.tables.map((t) => [t.id, t]))
  const fromTables = new Map(from.model.tables.map((t) => [t.id, t]))

  /* 제거 — 관계가 테이블 cascade를 앞질러 사라지므로 관계 먼저 */
  for (const rel of from.model.relationships) {
    if (!to.model.relationships.some((r) => r.id === rel.id)) {
      changes.push({ type: 'relationship/remove', relationshipId: rel.id })
    }
  }
  for (const t of from.model.tables) {
    if (!toTables.has(t.id)) changes.push({ type: 'table/remove', tableId: t.id })
  }
  for (const n of from.diagram.notes) {
    if (!to.diagram.notes.some((x) => x.id === n.id)) changes.push({ type: 'note/remove', noteId: n.id })
  }
  for (const a of from.diagram.areas) {
    if (!to.diagram.areas.some((x) => x.id === a.id)) changes.push({ type: 'area/remove', areaId: a.id })
  }

  /* 패치·이동 — 공통 객체끼리 필드 diff */
  const nodeMoves: Record<string, { x: number; y: number }> = {}
  /** 컬럼 순서 재현 재료 — 이동 패스는 생성(column/add) 뒤에 와야 새 컬럼의 위치도 잡을 수 있다 */
  const reorders: { tableId: string; fromIds: string[]; toIds: string[] }[] = []
  for (const prev of from.model.tables) {
    const next = toTables.get(prev.id)
    if (!next) continue
    const tablePatch: Record<string, unknown> = {}
    for (const f of ['logicalName', 'physicalName', 'comment'] as const) {
      if (prev[f] !== next[f]) tablePatch[f] = next[f]
    }
    if (Object.keys(tablePatch).length > 0) {
      changes.push({ type: 'table/patch', tableId: next.id, patch: tablePatch as Partial<ErdTable> })
    }

    /* 컬럼 — 제거·패치 */
    const toColumns = new Map(next.columns.map((c) => [c.id, c]))
    const prevIds = new Set(prev.columns.map((c) => c.id))
    for (const c of prev.columns) {
      const after = toColumns.get(c.id)
      if (!after) {
        changes.push({ type: 'column/remove', tableId: next.id, columnId: c.id })
        continue
      }
      const patch = columnPatchOf(c, after)
      if (patch) changes.push({ type: 'column/patch', tableId: next.id, columnId: c.id, patch })
    }
    /* 순서 재현 — 시뮬레이션 시작 상태는 "제거된 컬럼이 빠지고 새 컬럼이 to 순서로 꼬리에 붙은" 배열
     *  (아래 생성 단계의 column/add가 정확히 그렇게 적용한다). 이동 패스 자체는 생성 뒤에 발행한다. */
    const fromIds = [
      ...prev.columns.filter((c) => toColumns.has(c.id)).map((c) => c.id),
      ...next.columns.filter((c) => !prevIds.has(c.id)).map((c) => c.id),
    ]
    const toIds = next.columns.map((c) => c.id)
    if (fromIds.join('\0') !== toIds.join('\0')) reorders.push({ tableId: next.id, fromIds, toIds })
    /* PK·UK·인덱스 — 배열 통째 절대값 */
    const pkSame =
      (prev.primaryKey == null && next.primaryKey == null) ||
      (prev.primaryKey != null &&
        next.primaryKey != null &&
        prev.primaryKey.name === next.primaryKey.name &&
        prev.primaryKey.columnIds.join('\0') === next.primaryKey.columnIds.join('\0'))
    if (!pkSame) changes.push({ type: 'primaryKey/set', tableId: next.id, primaryKey: next.primaryKey })
    if (
      prev.uniques.length !== next.uniques.length ||
      prev.uniques.some((u, i) => u.id !== next.uniques[i].id || u.columnIds.join('\0') !== next.uniques[i].columnIds.join('\0'))
    ) {
      changes.push({ type: 'uniqueKey/set', tableId: next.id, uniques: next.uniques })
    }
    if (
      prev.indexes.length !== next.indexes.length ||
      prev.indexes.some((ix, i) => ix.id !== next.indexes[i].id || JSON.stringify(ix.columns) !== JSON.stringify(next.indexes[i].columns))
    ) {
      changes.push({ type: 'index/set', tableId: next.id, indexes: next.indexes })
    }

    /* 노드 레이아웃 — 위치는 모아서 한 커맨드, 폭·색은 개별 */
    const fromNode = from.diagram.nodes[prev.id]
    const toNode = to.diagram.nodes[next.id]
    if (fromNode && toNode) {
      if (fromNode.x !== toNode.x || fromNode.y !== toNode.y) nodeMoves[prev.id] = { x: toNode.x, y: toNode.y }
      if (fromNode.width !== toNode.width) {
        changes.push({ type: 'node/resize', tableId: prev.id, width: toNode.width })
      }
      if (fromNode.color !== toNode.color) changes.push({ type: 'node/color', tableId: prev.id, color: toNode.color })
    }
  }
  if (Object.keys(nodeMoves).length > 0) changes.push({ type: 'node/move', positions: nodeMoves })

  /* 관계 패치 — 필드 diff. 매핑·양 끝이 바뀌면 patch로 표현 불가 → remove+create로 통째 교체 */
  for (const prev of from.model.relationships) {
    const next = to.model.relationships.find((r) => r.id === prev.id)
    if (!next) continue
    const mappingSame =
      JSON.stringify(prev.columnMappings) === JSON.stringify(next.columnMappings) &&
      prev.parentTableId === next.parentTableId &&
      prev.childTableId === next.childTableId
    const patch: Record<string, unknown> = {}
    for (const f of [
      'name',
      'fkName',
      'type',
      'identifying',
      'parentMultiplicity',
      'childMultiplicity',
      'onDelete',
      'onUpdate',
    ] as const) {
      if (prev[f] !== next[f]) patch[f] = next[f]
    }
    if (!mappingSame) {
      changes.push({ type: 'relationship/remove', relationshipId: prev.id })
      changes.push(relationshipCreateOf(next))
    } else if (Object.keys(patch).length > 0) {
      changes.push({ type: 'relationship/patch', relationshipId: prev.id, patch })
    }
  }

  /* 노트·영역 패치 */
  for (const prev of from.diagram.notes) {
    const next = to.diagram.notes.find((n) => n.id === prev.id)
    if (!next) continue
    const patch: Record<string, unknown> = {}
    for (const f of ['title', 'text', 'color', 'linkedTableId', 'x', 'y', 'width'] as const) {
      if (prev[f] !== next[f]) patch[f] = next[f]
    }
    if (Object.keys(patch).length > 0) changes.push({ type: 'note/patch', noteId: prev.id, patch })
  }
  for (const prev of from.diagram.areas) {
    const next = to.diagram.areas.find((a) => a.id === prev.id)
    if (!next) continue
    const patch: Record<string, unknown> = {}
    for (const f of ['name', 'description', 'color', 'tableIds'] as const) {
      if (prev[f] !== next[f]) patch[f] = next[f]
    }
    if (Object.keys(patch).length > 0) {
      changes.push({ type: 'area/patch', areaId: prev.id, patch: patch as Partial<ErdArea> })
    }
  }

  /* 생성 — 테이블(컬럼 포함) → 컬럼(기존 테이블에 추가) → 관계(FK 컬럼 뒤) → 노트·영역 */
  for (const next of to.model.tables) {
    if (fromTables.has(next.id)) continue
    const node = to.diagram.nodes[next.id]
    changes.push({ type: 'table/create', table: next, position: { x: node?.x ?? 0, y: node?.y ?? 0 } })
    if (node && node.width != null) changes.push({ type: 'node/resize', tableId: next.id, width: node.width })
    if (node && node.color !== 'default') changes.push({ type: 'node/color', tableId: next.id, color: node.color })
  }
  for (const next of to.model.tables) {
    const prev = fromTables.get(next.id)
    if (!prev) continue
    const prevIds = new Set(prev.columns.map((c) => c.id))
    for (const c of next.columns) {
      if (!prevIds.has(c.id)) changes.push({ type: 'column/add', tableId: next.id, column: c })
    }
  }
  for (const next of to.model.relationships) {
    if (!from.model.relationships.some((r) => r.id === next.id)) {
      changes.push(relationshipCreateOf(next))
    }
  }
  for (const next of to.diagram.notes) {
    if (!from.diagram.notes.some((n) => n.id === next.id)) changes.push({ type: 'note/create', note: next })
  }
  for (const next of to.diagram.areas) {
    if (!from.diagram.areas.some((a) => a.id === next.id)) changes.push({ type: 'area/create', area: next })
  }

  /* 컬럼 순서 이동 패스 — 생성(add)이 꼬리에 붙인 뒤 to 순서로 맞춘다. working 배열로 적용을
   *  시뮬레이션해, 커맨드열을 순서대로 적용하면 정확히 toIds 순서가 되도록 이동을 뽑는다. */
  for (const { tableId, fromIds, toIds } of reorders) {
    let working = [...fromIds]
    for (let i = 0; i < toIds.length; i += 1) {
      if (working[i] === toIds[i]) continue
      const moved = toIds[i]
      changes.push({ type: 'column/move', tableId, columnId: moved, toIndex: i })
      working = working.filter((id) => id !== moved)
      working.splice(i, 0, moved)
    }
  }
  return changes
}

/** 관계 생성 커맨드 조립 — 관계 행만 추가한다(FK 컬럼 없음). 컬럼 자체·식별 PK 편입·1:1 UK는
 *  deriveChanges가 각각 column/add·primaryKey/set·uniqueKey/set diff로 이미 실어 실으며,
 *  create가 FK 컬럼을 함께 삽입하면 적용 규칙(삽입 위치)과 무관하게 to 최종 상태를
 *  정확히 재현하기 어렵기 때문이다. UI가 직접 만드는 생성 커맨드(실제 FK 컬럼 동반)와 다르다. */
function relationshipCreateOf(rel: ErdRelationship): ErdChange {
  return { type: 'relationship/create', relationship: rel, fkColumns: [] }
}

/* ---------- LWW 충돌 감지 ---------- */

export interface LwwConflict {
  target: ChangeTargetKey
  /** 내 현재 값(표시용) — 구조 변경('*') 겹침은 '*' 그대로 */
  mine: string
  /** 상대 커맨드가 설정한 값(표시용) */
  theirs: string
}

/** 충돌 알림 상한 — 한 커맨드가 수십 속성을 건드려도 토스트는 다섯 줄이면 충분하다 */
export const LWW_CONFLICT_LIMIT = 5

/** 내 dirty 키 집합 — deriveChanges(savedDocument, present)의 키. dirty가 없으면 빈 집합 */
export function dirtyTargetKeys(saved: EditorDocument, present: EditorDocument): Set<string> {
  const keys = new Set<string>()
  for (const change of deriveChanges(saved, present)) {
    for (const key of changeTargetKeys(change)) keys.add(keyId(key))
  }
  return keys
}

/** present에서 키의 현재 값 — patch 커맨드의 값과 비교해 "값이 실제로 바뀌는가"를 가린다 */
function presentValueOf(doc: EditorDocument, key: ChangeTargetKey): unknown {
  const table = doc.model.tables.find((t) => t.id === key.id)
  switch (key.kind) {
    case 'table':
      return table ? (table as unknown as Record<string, unknown>)[key.field] : undefined
    case 'column': {
      for (const t of doc.model.tables) {
        const c = t.columns.find((x) => x.id === key.id)
        if (c) return key.field === 'order' ? c : (c as unknown as Record<string, unknown>)[key.field]
      }
      return undefined
    }
    case 'primaryKey':
      return table?.primaryKey
    case 'uniqueKey':
      return table?.uniques
    case 'index':
      return table?.indexes
    case 'relationship': {
      const rel = doc.model.relationships.find((r) => r.id === key.id)
      return rel ? (rel as unknown as Record<string, unknown>)[key.field] : undefined
    }
    case 'note': {
      const note = doc.diagram.notes.find((n) => n.id === key.id)
      return note ? (note as unknown as Record<string, unknown>)[key.field] : undefined
    }
    case 'area': {
      const area = doc.diagram.areas.find((a) => a.id === key.id)
      return area ? (area as unknown as Record<string, unknown>)[key.field] : undefined
    }
    case 'node':
      return (doc.diagram.nodes[key.id] as unknown as Record<string, unknown> | undefined)?.[key.field]
  }
}

/** 상대 커맨드가 설정하는 값 — patch류는 패치 값, 구조 변경은 '*'.
 *  node/move는 축별 값을, 나머지 patch는 필드명 조회로 가져온다 */
function remoteValueOf(change: ErdChange, key: ChangeTargetKey): unknown {
  switch (change.type) {
    case 'table/patch':
      return change.tableId === key.id ? change.patch[key.field as keyof typeof change.patch] : undefined
    case 'column/patch':
      return change.columnId === key.id ? change.patch[key.field as keyof typeof change.patch] : undefined
    case 'relationship/patch':
      return change.relationshipId === key.id ? change.patch[key.field as keyof typeof change.patch] : undefined
    case 'note/patch':
      return change.noteId === key.id ? change.patch[key.field as keyof typeof change.patch] : undefined
    case 'area/patch':
      return change.areaId === key.id ? change.patch[key.field as keyof typeof change.patch] : undefined
    case 'node/move':
      return change.positions[key.id]?.[key.field as 'x' | 'y']
    case 'node/resize':
      return change.tableId === key.id ? change.width : undefined
    case 'node/color':
      return change.tableId === key.id ? change.color : undefined
    default:
      return '*'
  }
}

const displayValue = (v: unknown): string => {
  if (v === '*') return '*'
  if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

/** 타인 커맨드 × 내 dirty 범위 — 같은 (객체, 속성)을 값 변경과 함께 겹치면 충돌 목록.
 *  · 내 dirty 키와 정확히 같은 키 + 값이 실제로 다름 → 충돌(전형적 LWW)
 *  · 어느 한쪽이 '*'(구조) + 객체가 같음 → 충돌(Lock 우회·WS 끊김 보강 — 값 비교 없이 알림)
 *  · 다른 객체·다른 속성 → 빈 목록(자동 병합 — 알림 없음) */
export function detectLwwConflicts(
  change: ErdChange,
  saved: EditorDocument,
  present: EditorDocument,
): LwwConflict[] {
  const mine = dirtyTargetKeys(saved, present)
  if (mine.size === 0) return [] // dirty 없음 — 뭐가 와도 자동 병합

  const conflicts: LwwConflict[] = []
  for (const key of changeTargetKeys(change)) {
    const exact = mine.has(keyId(key))
    const structural =
      key.field === '*'
        ? [...mine].some((k) => k.startsWith(`${key.kind}:${key.id}:`))
        : [...mine].some((k) => k.endsWith(':*') && k.startsWith(`${key.kind}:${key.id}:`))
    if (!exact && !structural) continue
    if (exact && key.field !== '*') {
      const mineValue = presentValueOf(present, key)
      const theirsValue = remoteValueOf(change, key)
      if (displayValue(mineValue) === displayValue(theirsValue)) continue // 같은 값 — 조용히
      conflicts.push({ target: key, mine: displayValue(mineValue), theirs: displayValue(theirsValue) })
    } else {
      conflicts.push({ target: key, mine: '*', theirs: '*' })
    }
    if (conflicts.length >= LWW_CONFLICT_LIMIT) break
  }
  return conflicts
}

/* ---------- LWW "내 값 복원" ---------- */

/** 충돌 시점 present의 내 값으로 되돌리는 절대값 커맨드열 — 토스트의 "내 값 복원"이 발행하면
 *  새 seq를 받아 이번엔 내 값이 이긴다(대칭 규칙). present는 충돌 감지 시점(applyRemote 전)
 *  스냅샷을 넘긴다 — 거기에 내 편집 값이 있다. 구조('*') 충돌은 되돌릴 패치가 없어 스킵. */
export function conflictRestores(conflicts: LwwConflict[], present: EditorDocument): ErdChange[] {
  const restores: ErdChange[] = []
  for (const conflict of conflicts) {
    const { kind, id, field } = conflict.target
    if (field === '*') continue
    if (kind === 'table' || kind === 'primaryKey' || kind === 'uniqueKey' || kind === 'index' || kind === 'node') {
      if (kind === 'node') {
        const node = present.diagram.nodes[id]
        if (!node) continue
        if (field === 'x' || field === 'y') {
          restores.push({ type: 'node/move', positions: { [id]: { x: node.x, y: node.y } } })
        } else if (field === 'width') {
          restores.push({ type: 'node/resize', tableId: id, width: node.width })
        } else {
          restores.push({ type: 'node/color', tableId: id, color: node.color })
        }
        continue
      }
      const table = present.model.tables.find((t) => t.id === id)
      if (!table) continue
      if (kind === 'table') {
        restores.push({
          type: 'table/patch',
          tableId: id,
          patch: { [field]: presentValueOf(present, conflict.target) } as TablePatch,
        })
      } else if (kind === 'primaryKey') {
        restores.push({ type: 'primaryKey/set', tableId: id, primaryKey: table.primaryKey })
      } else if (kind === 'uniqueKey') {
        restores.push({ type: 'uniqueKey/set', tableId: id, uniques: table.uniques })
      } else {
        restores.push({ type: 'index/set', tableId: id, indexes: table.indexes })
      }
      continue
    }
    if (kind === 'column') {
      const owner = present.model.tables.find((t) => t.columns.some((c) => c.id === id))
      if (!owner) continue
      if (field === 'order') {
        const index = owner.columns.findIndex((c) => c.id === id)
        if (index >= 0) restores.push({ type: 'column/move', tableId: owner.id, columnId: id, toIndex: index })
        continue
      }
      restores.push({
        type: 'column/patch',
        tableId: owner.id,
        columnId: id,
        patch: { [field]: presentValueOf(present, conflict.target) } as ColumnPatch,
      })
      continue
    }
    if (kind === 'relationship') {
      if (!present.model.relationships.some((r) => r.id === id)) continue
      restores.push({
        type: 'relationship/patch',
        relationshipId: id,
        patch: { [field]: presentValueOf(present, conflict.target) } as Partial<ErdRelationship>,
      })
      continue
    }
    if (kind === 'note') {
      if (!present.diagram.notes.some((n) => n.id === id)) continue
      restores.push({ type: 'note/patch', noteId: id, patch: { [field]: presentValueOf(present, conflict.target) } })
      continue
    }
    if (kind === 'area') {
      if (!present.diagram.areas.some((a) => a.id === id)) continue
      restores.push({ type: 'area/patch', areaId: id, patch: { [field]: presentValueOf(present, conflict.target) } as Partial<ErdArea> })
    }
  }
  return coalesceChanges(restores)
}

/* ---------- 발신 버스트 병합 ---------- */

/** 병합 키 — 같은 키의 절대값 커맨드는 하나로 합친다(나중 값 승리). null은 병합 불가 */
function mergeKeyOf(change: ErdChange): string | null {
  switch (change.type) {
    case 'table/patch':
      return `table/patch:${change.tableId}`
    case 'column/patch':
      return `column/patch:${change.columnId}`
    case 'relationship/patch':
      return `relationship/patch:${change.relationshipId}`
    case 'note/patch':
      return `note/patch:${change.noteId}`
    case 'area/patch':
      return `area/patch:${change.areaId}`
    case 'node/resize':
      return `node/resize:${change.tableId}`
    case 'node/color':
      return `node/color:${change.tableId}`
    case 'node/move':
      return 'node/move' // 여러 테이블 위치를 한 커맨드가 싣는다 — 창 내 이동은 여기로 합친다
    default:
      return null
  }
}

/** 병합 항목의 소속 객체 키 — 구조 변경(생성·삭제)이 오면 이 객체의 병합 항목을 버린다.
 *  node/move는 여러 객체를 실어 소속이 없다(제거 뒤 이동은 no-op이라 남겨도 무해하다) */
function objectKeyOf(change: ErdChange): string | null {
  switch (change.type) {
    case 'table/patch':
      return `table:${change.tableId}`
    case 'column/patch':
      return `column:${change.columnId}`
    case 'relationship/patch':
      return `relationship:${change.relationshipId}`
    case 'note/patch':
      return `note:${change.noteId}`
    case 'area/patch':
      return `area:${change.areaId}`
    case 'node/resize':
    case 'node/color':
      return `node:${change.tableId}`
    default:
      return null
  }
}

/** 구조 변경의 객체 키 — 같은 객체의 앞선 병합(patch) 항목이 무의미해진다(제거·생성이 상태를
 *  통째로 정한다). 구조 변경끼리는 순서까지 의미가 있어(C9 추가→제거) 절대 버리지 않는다.
 *  primaryKey/uniqueKey/index/set·column/move는 절대값이지만 독립적이라 어느 쪽도 무효화하지 않는다 —
 *  column/move의 toIndex는 배열 상태 상대값이라 drop하면 순서가 달라진다. */
function structuralKeyOf(change: ErdChange): string | null {
  switch (change.type) {
    case 'table/create':
      return `table:${change.table.id}`
    case 'table/remove':
      return `table:${change.tableId}`
    case 'column/add':
      return `column:${change.column.id}`
    case 'column/remove':
      return `column:${change.columnId}`
    case 'relationship/create':
      return `relationship:${change.relationship.id}`
    case 'relationship/remove':
      return `relationship:${change.relationshipId}`
    case 'note/create':
      return `note:${change.note.id}`
    case 'note/remove':
      return `note:${change.noteId}`
    case 'area/create':
      return `area:${change.area.id}`
    case 'area/remove':
      return `area:${change.areaId}`
    default:
      return null
  }
}

/** 발신 큐의 150ms 창 병합 — patch류는 같은 대상끼리 합치고(나중 필드 승리), 생성·삭제가
 *  들어오면 같은 객체의 앞선 patch를 버린다(구조 변경이 상태를 통째로 정하므로 패치는 무의미).
 *  커맨드는 절대값이라 합쳐도 적용 결과가 원래 열과 같다 — 서버 부하·seq 소비만 줄인다. */
export function coalesceChanges(changes: ErdChange[]): ErdChange[] {
  const out: ErdChange[] = []
  const mergeIndex = new Map<string, number>()
  const objectIndex = new Map<string, Set<number>>()

  const indexEntry = (entry: ErdChange, i: number): void => {
    const mergeKey = mergeKeyOf(entry)
    if (mergeKey === null) return
    if (!mergeIndex.has(mergeKey)) mergeIndex.set(mergeKey, i)
    const objectKey = objectKeyOf(entry)
    if (objectKey) {
      const at = objectIndex.get(objectKey) ?? new Set<number>()
      at.add(i)
      objectIndex.set(objectKey, at)
    }
  }

  for (const change of changes) {
    const mergeKey = mergeKeyOf(change)
    if (mergeKey !== null) {
      const at = mergeIndex.get(mergeKey)
      if (at !== undefined) {
        const prev = out[at]
        // 같은 키 병합 — node/move는 positions 합집합, patch류는 필드 합집합(나중 승리)
        if (prev.type === 'node/move' && change.type === 'node/move') {
          out[at] = { type: 'node/move', positions: { ...prev.positions, ...change.positions } }
        } else if ('patch' in prev && 'patch' in change) {
          out[at] = { ...prev, patch: { ...prev.patch, ...change.patch } } as ErdChange
        } else {
          out.push(change) // 창 안에서 키가 재활용된 드문 경우 — 순서 보존으로 안전하게
        }
        continue
      }
      out.push(change)
      indexEntry(change, out.length - 1)
      continue
    }
    const structuralKey = structuralKeyOf(change)
    if (structuralKey !== null) {
      const victims = objectIndex.get(structuralKey)
      if (victims && victims.size > 0) {
        const drop = victims
        for (let i = out.length - 1; i >= 0; i -= 1) {
          if (drop.has(i)) out.splice(i, 1) // 뒤에서부터 — 인덱스 밀림 방지
        }
        mergeIndex.clear()
        objectIndex.clear()
        out.forEach((entry, i) => indexEntry(entry, i)) // 드물게 일어나는 전수 재계산
      }
    }
    out.push(change)
  }
  return out
}

/* ---------- 표시 레이블 ---------- */

/** 충돌 토스트용 대상 라벨 — "member.email"처럼 물리 경로. 없는 객체는 id 그대로 */
export function describeTarget(doc: EditorDocument, key: ChangeTargetKey): string {
  const table = doc.model.tables.find((t) => t.id === key.id)
  switch (key.kind) {
    case 'table':
    case 'primaryKey':
    case 'uniqueKey':
    case 'index':
    case 'node':
      return table?.physicalName || key.id
    case 'column': {
      for (const t of doc.model.tables) {
        const c = t.columns.find((x) => x.id === key.id)
        if (c) return `${t.physicalName}.${c.physicalName}`
      }
      return key.id
    }
    case 'relationship': {
      const rel = doc.model.relationships.find((r) => r.id === key.id)
      return rel?.fkName || key.id
    }
    case 'note': {
      const note = doc.diagram.notes.find((n) => n.id === key.id)
      return note?.title || note?.text.split('\n').find((l) => l.trim() !== '')?.trim().slice(0, 30) || key.id
    }
    case 'area': {
      const area = doc.diagram.areas.find((a) => a.id === key.id)
      return area?.name || key.id
    }
  }
}
