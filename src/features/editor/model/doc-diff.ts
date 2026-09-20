/**
 * 저장 시점 변경 요약 — 문서 스냅샷 diff (05-editor/01-core.md §13, 08-core/02-model.md §1.11)
 *
 * 버전 기록의 자동 메모("member 테이블 추가" 등)를 만든다. 저장 직전 마지막으로 저장된 문서와
 * 현재 문서의 스냅샷을 비교해 요약 항목을 계산한다 — 순수 함수로 undo/redo·자동저장 묶음과
 * 무관하게 항상 "무엇이 저장되는가"만 남는다(커밋 사이트 수집 방식의 취약점 회피).
 *
 * 계약:
 * · 매칭은 객체 id 기준 — 두 문서는 같은 계보(하나의 문서의 두 시점)라 id가 안정적이다.
 * · defaultValue는 ''≡null로 정규화해 비교한다(sync-merge 규칙과 동일 — 드리프트 방지).
 * · model 항목(table·column·primaryKey·uniqueKey·index·relationship)이 하나라도 있으면
 *   layoutOnly=false, diagram만(note·node·viewport) 바뀌었으면 layoutOnly=true.
 * · 항목은 50개 상한 — 넘치면 자르고 truncated=true(서버 상한 64KB의 실질 방어선).
 * · detail은 언어 중립(필드명·물리명·개수)로만 채운다 — 요약은 서버에 저장되고
 *   렌더는 클라이언트 i18n이 맡으므로 한국어 문장을 심지 않는다(sync-merge과 다른 점).
 */
import type {
  EditorDocument,
  ErdColumn,
  ErdNote,
  ErdRelationship,
  ErdTable,
} from '@/features/editor/model/content-schema'

export type DocDiffKind =
  | 'table'
  | 'column'
  | 'primaryKey'
  | 'uniqueKey'
  | 'index'
  | 'relationship'
  | 'note'
  | 'node'
export type DocDiffAction = 'add' | 'update' | 'remove' | 'move'

/** 요약 항목 — 서버 changeSummary JSON의 items 원소 (렌더 규칙은 05-editor/02-ui.md) */
export interface DocDiffItem {
  kind: DocDiffKind
  action: DocDiffAction
  /** 소속 테이블 물리명 — 관계는 자식 테이블, note·node는 대상 물리명 */
  table: string
  /** 대상 이름 — 컬럼 물리명·키 이름·관계 fkName·노트 제목(없으면 본문 첫 줄) */
  name: string
  /** 상세 — 갱신된 필드명 목록·구성 원소 등 언어 중립 문자열 */
  detail: string
}

export interface DocumentDiffSummary {
  items: DocDiffItem[]
  /** model 변경 없이 diagram(노트·레이아웃·뷰포트)만 바뀐 저장 */
  layoutOnly: boolean
  /** 항목 상한(50) 초과로 잘렸는가 */
  truncated: boolean
}

/** 항목 상한 — 넉넉한 하루치 편집도 요약 목록에 다 들어가고 64KB 서버 상한에도 여유 */
export const DOC_DIFF_ITEM_LIMIT = 50

const DIAGRAM_KINDS: ReadonlySet<DocDiffKind> = new Set(['note', 'node'])

/** defaultValue 비교 정규화 — 빈 문자열과 null을 같은 취급 (sync-merge과 동일) */
const normDefault = (v: string | null): string | null => (v == null || v === '' ? null : v)

/** 컬럼 타입 표기 — dataType(길이) / dataType(정밀도,스케일). 언어 중립 */
function columnTypeLabel(c: ErdColumn): string {
  if (c.length != null) return `${c.dataType}(${c.length})`
  if (c.precision != null) return `${c.dataType}(${c.precision},${c.scale ?? 0})`
  return c.dataType
}

/** 노트 표시 이름 — 제목 우선, 없으면 본문 첫 줄 */
function noteLabel(note: ErdNote): string {
  if (note.title) return note.title
  const firstLine = note.text.split('\n').find((line) => line.trim() !== '')
  return firstLine?.trim().slice(0, 30) ?? ''
}

/** 테이블 하나의 차분 — 테이블 패치 + 컬럼 + PK + UK + 인덱스 (항목은 items에 push) */
function diffTable(from: ErdTable, to: ErdTable, items: DocDiffItem[]): void {
  const tableFields = ['logicalName', 'physicalName', 'comment'] as const
  const changedFields = tableFields.filter(
    (f) => from[f] !== to[f],
  )
  if (changedFields.length > 0) {
    items.push({ kind: 'table', action: 'update', table: to.physicalName, name: to.physicalName, detail: changedFields.join(', ') })
  }

  // 컬럼 — from 기준 제거·갱신, to 기준 추가
  const toColumns = new Map(to.columns.map((c) => [c.id, c]))
  for (const c of from.columns) {
    const next = toColumns.get(c.id)
    if (!next) {
      items.push({ kind: 'column', action: 'remove', table: to.physicalName, name: c.physicalName, detail: '' })
      continue
    }
    const fields = [
      'logicalName',
      'physicalName',
      'dataType',
      'nullable',
      'autoIncrement',
      'comment',
    ] as const
    // string[] — length·precision·scale·defaultValue처럼 비교 방식이 다른 필드를 같이 밀어 넣는다
    const changed: string[] = fields.filter((f) => c[f] !== next[f])
    if (c.length !== next.length) changed.push('length')
    if (c.precision !== next.precision) changed.push('precision')
    if (c.scale !== next.scale) changed.push('scale')
    if (normDefault(c.defaultValue) !== normDefault(next.defaultValue)) changed.push('defaultValue')
    if (changed.length > 0) {
      items.push({ kind: 'column', action: 'update', table: to.physicalName, name: next.physicalName, detail: changed.join(', ') })
    }
  }
  const fromColumnIds = new Set(from.columns.map((c) => c.id))
  for (const c of to.columns) {
    if (!fromColumnIds.has(c.id)) {
      items.push({ kind: 'column', action: 'add', table: to.physicalName, name: c.physicalName, detail: columnTypeLabel(c) })
    }
  }

  // PK — null↔설정은 add/remove, 양쪽 다 있으면 이름·컬럼 순서 비교
  const physById = new Map(to.columns.map((c) => [c.id, c.physicalName]))
  if (!from.primaryKey && to.primaryKey) {
    items.push({ kind: 'primaryKey', action: 'add', table: to.physicalName, name: to.primaryKey.name, detail: to.primaryKey.columnIds.map((id) => physById.get(id) ?? id).join(', ') })
  } else if (from.primaryKey && !to.primaryKey) {
    items.push({ kind: 'primaryKey', action: 'remove', table: to.physicalName, name: from.primaryKey.name, detail: '' })
  } else if (from.primaryKey && to.primaryKey) {
    const same =
      from.primaryKey.name === to.primaryKey.name &&
      from.primaryKey.columnIds.join('\0') === to.primaryKey.columnIds.join('\0')
    if (!same) {
      items.push({ kind: 'primaryKey', action: 'update', table: to.physicalName, name: to.primaryKey.name, detail: to.primaryKey.columnIds.map((id) => physById.get(id) ?? id).join(', ') })
    }
  }

  // UK — id 매칭 add/remove/update(이름·컬럼 순서)
  diffKeyedArrays({
    from: from.uniques,
    to: to.uniques,
    table: to.physicalName,
    kind: 'uniqueKey',
    same: (a, b) => a.name === b.name && a.columnIds.join('\0') === b.columnIds.join('\0'),
    label: (u) => u.name,
    columnDetail: (u) => u.columnIds.map((id) => physById.get(id) ?? id).join(', '),
    items,
  })

  // 인덱스 — id 매칭, columns는 컬럼·정렬 순서까지
  diffKeyedArrays({
    from: from.indexes,
    to: to.indexes,
    table: to.physicalName,
    kind: 'index',
    same: (a, b) =>
      a.name === b.name &&
      a.columns.map((m) => `${m.columnId}:${m.order}`).join('\0') ===
        b.columns.map((m) => `${m.columnId}:${m.order}`).join('\0'),
    label: (i) => i.name,
    columnDetail: (i) => i.columns.map((m) => physById.get(m.columnId) ?? m.columnId).join(', '),
    items,
  })
}

/** id 매칭 키 배열(UK·인덱스) 공통 차분 */
function diffKeyedArrays<T extends { id: string }>(opts: {
  from: T[]
  to: T[]
  table: string
  kind: DocDiffKind
  same: (a: T, b: T) => boolean
  label: (item: T) => string
  columnDetail: (item: T) => string
  items: DocDiffItem[]
}): void {
  const toById = new Map(opts.to.map((x) => [x.id, x]))
  for (const prev of opts.from) {
    const next = toById.get(prev.id)
    if (!next) {
      opts.items.push({ kind: opts.kind, action: 'remove', table: opts.table, name: opts.label(prev), detail: '' })
    } else if (!opts.same(prev, next)) {
      opts.items.push({ kind: opts.kind, action: 'update', table: opts.table, name: opts.label(next), detail: opts.columnDetail(next) })
    }
  }
  const fromIds = new Set(opts.from.map((x) => x.id))
  for (const next of opts.to) {
    if (!fromIds.has(next.id)) {
      opts.items.push({ kind: opts.kind, action: 'add', table: opts.table, name: opts.label(next), detail: opts.columnDetail(next) })
    }
  }
}

/** 관계 차분 — fkName·유형·기수·참조 동작·컬럼 매핑 */
function diffRelationships(from: EditorDocument, to: EditorDocument, items: DocDiffItem[]): void {
  const physOf = (doc: EditorDocument, tableId: string): string =>
    doc.model.tables.find((t) => t.id === tableId)?.physicalName ?? ''
  const mappingKey = (rel: ErdRelationship): string =>
    rel.columnMappings.map((m) => `${m.parentColumnId}=${m.childColumnId}`).join('\0')

  const toById = new Map(to.model.relationships.map((r) => [r.id, r]))
  for (const prev of from.model.relationships) {
    const next = toById.get(prev.id)
    if (!next) {
      items.push({ kind: 'relationship', action: 'remove', table: physOf(from, prev.childTableId), name: prev.fkName, detail: '' })
      continue
    }
    const fields = [
      'name',
      'fkName',
      'type',
      'identifying',
      'parentMultiplicity',
      'childMultiplicity',
      'onDelete',
      'onUpdate',
      'parentTableId',
      'childTableId',
    ] as const
    const changed: string[] = fields.filter((f) => prev[f] !== next[f])
    if (mappingKey(prev) !== mappingKey(next)) changed.push('columnMappings')
    if (changed.length > 0) {
      items.push({ kind: 'relationship', action: 'update', table: physOf(to, next.childTableId), name: next.fkName, detail: changed.join(', ') })
    }
  }
  const fromIds = new Set(from.model.relationships.map((r) => r.id))
  for (const next of to.model.relationships) {
    if (!fromIds.has(next.id)) {
      items.push({
        kind: 'relationship',
        action: 'add',
        table: physOf(to, next.childTableId),
        name: next.fkName,
        detail: `${physOf(to, next.parentTableId)} → ${physOf(to, next.childTableId)}`,
      })
    }
  }
}

/** 노트 차분 — 내용(제목·본문·색·연관)은 update, 위치·크기는 move */
function diffNotes(from: ErdNote[], to: ErdNote[], items: DocDiffItem[]): void {
  const toById = new Map(to.map((n) => [n.id, n]))
  for (const prev of from) {
    const next = toById.get(prev.id)
    if (!next) {
      items.push({ kind: 'note', action: 'remove', table: '', name: noteLabel(prev), detail: '' })
      continue
    }
    const contentFields = ['title', 'text', 'color', 'linkedTableId'] as const
    const changedContent = contentFields.filter((f) => prev[f] !== next[f])
    if (changedContent.length > 0) {
      items.push({ kind: 'note', action: 'update', table: '', name: noteLabel(next), detail: changedContent.join(', ') })
    }
    const moveFields = (['x', 'y', 'width'] as const).filter((f) => prev[f] !== next[f])
    if (moveFields.length > 0) {
      items.push({ kind: 'note', action: 'move', table: '', name: noteLabel(next), detail: moveFields.join(', ') })
    }
  }
  const fromIds = new Set(from.map((n) => n.id))
  for (const next of to) {
    if (!fromIds.has(next.id)) {
      items.push({ kind: 'note', action: 'add', table: '', name: noteLabel(next), detail: '' })
    }
  }
}

/** 노드 레이아웃 차분 — 같은 테이블의 위치(x,y)=move, 폭·색=update. 신규/소멸 노드는 테이블 항목이 대신한다 */
function diffNodes(from: EditorDocument, to: EditorDocument, items: DocDiffItem[]): void {
  const physOf = (tableId: string): string =>
    to.model.tables.find((t) => t.id === tableId)?.physicalName ??
    from.model.tables.find((t) => t.id === tableId)?.physicalName ??
    ''
  for (const [tableId, next] of Object.entries(to.diagram.nodes)) {
    const prev = from.diagram.nodes[tableId]
    if (!prev) continue
    if (prev.x !== next.x || prev.y !== next.y) {
      items.push({ kind: 'node', action: 'move', table: physOf(tableId), name: physOf(tableId), detail: 'x, y' })
    }
    const resizeColor = (['width', 'color'] as const).filter((f) => prev[f] !== next[f])
    if (resizeColor.length > 0) {
      items.push({ kind: 'node', action: 'update', table: physOf(tableId), name: physOf(tableId), detail: resizeColor.join(', ') })
    }
  }
}

/** 마지막 저장 문서와 현재 문서의 변경 요약을 계산한다 (05-editor/01-core.md §13) */
export function diffDocuments(from: EditorDocument, to: EditorDocument): DocumentDiffSummary {
  const items: DocDiffItem[] = []

  const toTables = new Map(to.model.tables.map((t) => [t.id, t]))
  for (const prev of from.model.tables) {
    const next = toTables.get(prev.id)
    if (!next) {
      items.push({ kind: 'table', action: 'remove', table: prev.physicalName, name: prev.physicalName, detail: '' })
    } else {
      diffTable(prev, next, items)
    }
  }
  const fromTableIds = new Set(from.model.tables.map((t) => t.id))
  for (const next of to.model.tables) {
    if (!fromTableIds.has(next.id)) {
      items.push({ kind: 'table', action: 'add', table: next.physicalName, name: next.physicalName, detail: `columns ${next.columns.length}` })
    }
  }

  diffRelationships(from, to, items)
  diffNotes(from.diagram.notes, to.diagram.notes, items)
  diffNodes(from, to, items)

  const viewportChanged =
    JSON.stringify(from.diagram.viewport) !== JSON.stringify(to.diagram.viewport)
  const modelChanged = items.some((item) => !DIAGRAM_KINDS.has(item.kind))

  const truncated = items.length > DOC_DIFF_ITEM_LIMIT
  return {
    items: truncated ? items.slice(0, DOC_DIFF_ITEM_LIMIT) : items,
    layoutOnly: !modelChanged && (items.length > 0 || viewportChanged),
    truncated,
  }
}
