/**
 * 편집 변경 유니온과 순수 적용 함수 (05-editor/01-core.md §15 Command 구조와 1:1)
 *
 * 모든 문서 변경은 직렬화 가능한 ErdChange로 표현되고 applyChange 순수 함수를 통과한다.
 * undo/redo 실행은 문서 스냅샷 복원(하이브리드)이지만, 이 구조가 Command 스택·변경 이력·
 * 협업 이관 경로를 열어 둔다. 적용은 항상 불변(구조 공유) — 안 바뀐 테이블 객체는 참조가 유지되어
 * 노드 단위 셀렉터 구독에서 해당 노드만 리렌더된다.
 */
import type { WorkspaceTerm } from '@/api/types'
import {
  coerceChildMultiplicity,
  type ErdArea,
  type ErdCheck,
  type ErdNodeLayout,
  type ErdRequirement,
  type ErdColumn,
  type ErdContent,
  type ErdIndex,
  type ErdNote,
  type ErdPrimaryKey,
  type ErdRelationship,
  type ErdTable,
  type ErdUniqueKey,
  type ErdValidationException,
  type EditorDocument,
  type TableColorValue,
} from '@/features/editor/model/content-schema'
import { dbmsAutoIndexesFk, parsePhysicalType } from '@/features/editor/model/dbms'
import { defaultKeyName } from '@/features/editor/model/keys'

export type TablePatch = Partial<Pick<ErdTable, 'logicalName' | 'physicalName' | 'comment'>>
export type ColumnPatch = Partial<Omit<ErdColumn, 'id'>>
export type RelationshipPatch = Partial<
  Pick<
    ErdRelationship,
    | 'name'
    | 'type'
    | 'identifying'
    | 'parentMultiplicity'
    | 'childMultiplicity'
    | 'fkName'
    | 'onDelete'
    | 'onUpdate'
    /** 컬럼 매핑 편집 — 자식 쪽 외래 키 컬럼을 바꾼다(05-editor/02-ui.md §4.2) */
    | 'columnMappings'
  >
>
export type NotePatch = Partial<
  Pick<ErdNote, 'x' | 'y' | 'width' | 'height' | 'text' | 'title' | 'color' | 'linkedTableId'>
>
export type AreaPatch = Partial<Pick<ErdArea, 'name' | 'description' | 'color' | 'tableIds'>>
/** 요구사항 패치 — code는 바꾸지 않는다. revision은 리듀서가 올린다(제목·내용이 바뀌면) */
export type RequirementPatch = Partial<
  Pick<ErdRequirement, 'areaId' | 'scope' | 'title' | 'description' | 'status' | 'revision' | 'appliedRevision' | 'tableIds' | 'criteria'>
>

export type ErdChange =
  | { type: 'table/create'; table: ErdTable; position: { x: number; y: number } }
  | { type: 'table/remove'; tableId: string }
  | { type: 'table/patch'; tableId: string; patch: TablePatch }
  | { type: 'column/add'; tableId: string; column: ErdColumn }
  | { type: 'column/remove'; tableId: string; columnId: string }
  | { type: 'column/patch'; tableId: string; columnId: string; patch: ColumnPatch }
  | { type: 'column/move'; tableId: string; columnId: string; toIndex: number }
  | { type: 'primaryKey/set'; tableId: string; primaryKey: ErdPrimaryKey | null }
  | { type: 'uniqueKey/set'; tableId: string; uniques: ErdUniqueKey[] }
  | { type: 'index/set'; tableId: string; indexes: ErdIndex[] }
  /** CHECK 제약 목록 교체(v1.34) — 유니크·인덱스와 같은 절대값 배열 교체 */
  | { type: 'check/set'; tableId: string; checks: ErdCheck[] }
  | { type: 'relationship/create'; relationship: ErdRelationship; fkColumns: ErdColumn[] }
  | { type: 'relationship/patch'; relationshipId: string; patch: RelationshipPatch }
  | { type: 'relationship/remove'; relationshipId: string }
  | { type: 'note/create'; note: ErdNote }
  | { type: 'note/patch'; noteId: string; patch: NotePatch }
  | { type: 'note/remove'; noteId: string }
  | { type: 'area/create'; area: ErdArea }
  | { type: 'area/patch'; areaId: string; patch: AreaPatch }
  | { type: 'area/remove'; areaId: string }
  | { type: 'requirement/create'; requirement: ErdRequirement }
  | { type: 'requirement/patch'; requirementId: string; patch: RequirementPatch }
  | { type: 'requirement/remove'; requirementId: string }
  /** 검증 예외(v1.34) — 하나씩 더하고 지운다(협업에서 두 사람이 동시에 다른 예외를 둬도 서로 지우지 않게) */
  | { type: 'validationException/add'; exception: ErdValidationException }
  | { type: 'validationException/remove'; exceptionId: string }
  | { type: 'node/move'; positions: Record<string, { x: number; y: number }> }
  | { type: 'node/resize'; tableId: string; width: number | null }
  | { type: 'node/color'; tableId: string; color: TableColorValue }
/* ---------- 팩토리 — 신규 객체 기본값 ---------- */

export function newId(): string {
  return crypto.randomUUID()
}

/** 도메인 타입이 다루는 컬럼 속성 (05-editor/01-core.md §11.1) */
export const DOMAIN_FIELDS = ['dataType', 'length', 'precision', 'scale', 'nullable', 'defaultValue'] as const
export type DomainField = (typeof DOMAIN_FIELDS)[number]

/**
 * 컬럼 패치 — 도메인 타입을 쓰는 컬럼에서 도메인 타입이 다루는 속성을 직접 고치면
 * 그 속성을 overrides에 넣는다("도메인 타입과 다르게 쓰기" — 이후 전파에서 건너뛴다).
 * 패치가 domain을 직접 싣고 오면(적용·전파·되돌리기·연결 풀기) 그대로 따른다.
 */
function patchColumn(column: ErdColumn, patch: ColumnPatch): ErdColumn {
  const next = { ...column, ...patch }
  if (!column.domain || 'domain' in patch) return next
  const touched = DOMAIN_FIELDS.filter((field) => field in patch && patch[field] !== column[field])
  if (touched.length === 0) return next
  const overrides = [...new Set([...column.domain.overrides, ...touched])]
  return { ...next, domain: { ...column.domain, overrides } }
}

export function createColumn(init: Partial<ErdColumn> = {}): ErdColumn {
  return {
    id: newId(),
    logicalName: '',
    physicalName: '',
    dataType: 'VARCHAR',
    length: null,
    precision: null,
    scale: null,
    nullable: true,
    defaultValue: null,
    autoIncrement: false,
    comment: null,
    generated: null,
    onUpdate: null,
    ...init,
  }
}

/** 새 인덱스 — 종류는 BTREE, 파서 없음이 기본(문서 편집 API가 만드는 본체와 같은 기본값) */
export function createIndex(init: Pick<ErdIndex, 'name' | 'columns'> & Partial<ErdIndex>): ErdIndex {
  return {
    id: newId(),
    type: 'BTREE',
    parser: null,
    ...init,
  }
}

export function createTable(physicalName: string, init: Partial<ErdTable> = {}): ErdTable {
  return {
    id: newId(),
    logicalName: '',
    physicalName,
    comment: null,
    columns: [],
    primaryKey: null,
    uniques: [],
    indexes: [],
    checks: [],
    ...init,
  }
}

export function createArea(name: string, init: Partial<ErdArea> = {}): ErdArea {
  return {
    id: newId(),
    name,
    description: '',
    color: 'default',
    tableIds: [],
    ...init,
  }
}

/* ---------- 순수 적용 ---------- */

/** PK 토글 변경 묶음 — 켜면 NN 강제 + PK 블록 끝(최상단)으로 이동,
 *  끄면 PK 목록 정리 + AI 해제 + 영역 시작으로 이동해 블록 구조를 유지한다.
 *  해제된 컬럼이 FK면 FK 영역(PK 바로 밑)으로, 아니면 일반 블록으로 내려간다.
 *  노드 인라인 토글과 컬럼 정보 다이얼로그가 같은 규칙을 공유한다. */
export function pkToggleChanges(
  table: ErdTable,
  columnId: string,
  enable: boolean,
  fkColumnIds: Set<string> = new Set(),
): ErdChange[] {
  const isPk = table.primaryKey?.columnIds.includes(columnId) ?? false
  if (enable === isPk) return []
  if (!enable) {
    const columnIds = (table.primaryKey?.columnIds ?? []).filter((cid) => cid !== columnId)
    // 남은 PK가 연속으로 차지하는 앞쪽 길이 → FK 영역 시작. 일반 컬럼이면 FK 블록까지 건너뛴다
    // (이동 대상 컬럼은 자리에서 빠 있다고 보고 스캔에서 건너뛴다)
    const remainingPk = new Set(columnIds)
    let insertAt = 0
    for (const c of table.columns) {
      if (c.id === columnId) continue
      if (remainingPk.has(c.id)) insertAt += 1
      else break
    }
    if (!fkColumnIds.has(columnId)) {
      for (let i = insertAt; i < table.columns.length; i += 1) {
        if (table.columns[i].id === columnId) continue
        if (fkColumnIds.has(table.columns[i].id)) insertAt += 1
        else break
      }
    }
    return [
      {
        type: 'primaryKey/set',
        tableId: table.id,
        primaryKey: columnIds.length > 0 && table.primaryKey ? { ...table.primaryKey, columnIds } : null,
      },
      { type: 'column/patch', tableId: table.id, columnId, patch: { autoIncrement: false } },
      { type: 'column/move', tableId: table.id, columnId, toIndex: insertAt },
    ]
  }
  const name = table.primaryKey?.name ?? `${table.physicalName.toLowerCase() || 'table'}_pk`
  const columnIds = [...(table.primaryKey?.columnIds ?? []), columnId]
  const changes: ErdChange[] = [
    {
      type: 'primaryKey/set',
      tableId: table.id,
      primaryKey: { name, columnIds },
    },
    { type: 'column/patch', tableId: table.id, columnId, patch: { nullable: false } },
    // 기존 PK들 바로 뒤(전체 컬럼 최상단 블록의 끝)로 이동
    { type: 'column/move', tableId: table.id, columnId, toIndex: table.primaryKey?.columnIds.length ?? 0 },
  ]
  // 복합 PK가 되는 순간 — AI는 단일 정수 컬럼 전용이라 기존 PK의 AI를 해제한다 (같은 undo 스택)
  if (columnIds.length > 1) {
    for (const cid of table.primaryKey?.columnIds ?? []) {
      if (table.columns.find((c) => c.id === cid)?.autoIncrement) {
        changes.push({ type: 'column/patch', tableId: table.id, columnId: cid, patch: { autoIncrement: false } })
      }
    }
  }
  return changes
}

/** 워크스페이스 사전 용어 → 컬럼 패치 — 물리명 제안 선택 시 이름·타입을 한 커밋으로 채운다.
 *  타입은 용어 types 맵의 문서 DB 종류 값(물리 표기)을 parsePhysicalType로 공용 코드 +
 *  length/precision/scale로 되돌려 적용한다(DECIMAL(15,2) → precision 15·scale 2).
 *  용어에 그 종류 타입이 없거나 호환 논리 타입이 없으면(파싱 null) 타입 칸은 그대로 둔다.
 *  컬럼 물리명 입력(ColumnTermInput)과 컬럼 정보 다이얼로그가 같은 규칙을 쓸 수 있다 */
export function termColumnPatch(
  term: Pick<WorkspaceTerm, 'term' | 'label' | 'types'>,
  databaseType: string,
  dbmsId: string,
): ColumnPatch {
  const parsed = parsePhysicalType(term.types?.[databaseType] ?? '', dbmsId)
  return {
    physicalName: term.term,
    logicalName: term.label,
    ...(parsed
      ? { dataType: parsed.code, length: parsed.length, precision: parsed.precision, scale: parsed.scale }
      : {}),
  }
}

function toDoc(content: ErdContent): EditorDocument {
  return { model: content.model, diagram: content.diagram }
}

function toContent(doc: EditorDocument): ErdContent {
  return { schemaVersion: 1, model: doc.model, diagram: doc.diagram }
}

function mapTable(doc: EditorDocument, tableId: string, fn: (table: ErdTable) => ErdTable): EditorDocument {
  return {
    ...doc,
    model: {
      ...doc.model,
      tables: doc.model.tables.map((t) => (t.id === tableId ? fn(t) : t)),
    },
  }
}

/** PK가 컬럼 삭제로 비면 null — 남은 순서는 보존 */
function primaryKeyWithoutColumn(pk: ErdPrimaryKey | null, columnId: string): ErdPrimaryKey | null {
  if (!pk || !pk.columnIds.includes(columnId)) return pk
  const columnIds = pk.columnIds.filter((id) => id !== columnId)
  return columnIds.length > 0 ? { ...pk, columnIds } : null
}

/** 유니크 키 목록에서 컬럼 제거 — 남는 컬럼이 없으면 키 자체를 제거한다 */
function uniquesWithoutColumn(uniques: ErdUniqueKey[], columnId: string): ErdUniqueKey[] {
  return uniques
    .map((unique) =>
      unique.columnIds.includes(columnId)
        ? { ...unique, columnIds: unique.columnIds.filter((id) => id !== columnId) }
        : unique,
    )
    .filter((unique) => unique.columnIds.length > 0)
}

/** 인덱스 목록에서 컬럼 제거 — 컬럼별 정렬은 보존, 남는 컬럼이 없으면 인덱스를 제거한다 */
function indexesWithoutColumn(indexes: ErdIndex[], columnId: string): ErdIndex[] {
  return indexes
    .map((index) =>
      index.columns.some((entry) => entry.columnId === columnId)
        ? { ...index, columns: index.columns.filter((entry) => entry.columnId !== columnId) }
        : index,
    )
    .filter((index) => index.columns.length > 0)
}

/** 컬럼 삭제의 하향 정리 — 관계 매핑에 걸린 컬럼(FK 자식·부모 PK)이면 관계 전체를 제거한다
 *  (복합 FK의 나머지 컬럼도 함께 — 매핑 일부만 남은 FK는 무결성 의미가 없다).
 *  일반 컬럼이면 PK·유니크·인덱스에서 해당 참조만 정리한다. */
function removeColumnEverywhere(doc: EditorDocument, tableId: string, columnId: string): EditorDocument {
  const owners = doc.model.relationships.filter(
    (rel) =>
      (rel.childTableId === tableId && rel.columnMappings.some((m) => m.childColumnId === columnId)) ||
      (rel.parentTableId === tableId && rel.columnMappings.some((m) => m.parentColumnId === columnId)),
  )
  if (owners.length > 0) {
    const cascaded = owners.reduce((acc, rel) => removeRelationshipCascade(acc, rel.id), doc)
    // 원본 컬럼이 아직 살아 있으면(부모 쪽 PK 등 cascade가 지우지 않는 컬럼) 일반 정리로 마저 제거
    return removeColumnEverywhere(cascaded, tableId, columnId)
  }
  // CHECK 제약은 컬럼 id에 묶이지 않는다(식은 원문) — 그대로 둔다
  const removed = mapTable(doc, tableId, (table) => ({
    ...table,
    columns: table.columns.filter((c) => c.id !== columnId),
    primaryKey: primaryKeyWithoutColumn(table.primaryKey, columnId),
    uniques: uniquesWithoutColumn(table.uniques, columnId),
    indexes: indexesWithoutColumn(table.indexes, columnId),
  }))
  return withoutExceptions(removed, (target) => target === `column:${tableId}:${columnId}`)
}

/** 검증 예외 정리 — 대상이 지워진 예외를 뺀다(그룹의 tableIds 정리와 같은 cascade).
 *  지울 것이 없으면 원본을 그대로 돌려줘 구조 공유를 지킨다 */
function withoutExceptions(doc: EditorDocument, gone: (target: string) => boolean): EditorDocument {
  const exceptions = doc.diagram.validationExceptions
  if (!exceptions.some((exception) => gone(exception.target))) return doc
  return {
    ...doc,
    diagram: { ...doc.diagram, validationExceptions: exceptions.filter((exception) => !gone(exception.target)) },
  }
}

/** 테이블 삭제 cascade — 붙은 관계 제거 + 관계 소유 FK 컬럼을 상대 테이블에서도 제거 + 노드 제거
 *  + 이 테이블을 가리키던 메모 연관 해제 + 주제 영역 소속 목록 정리 */
function removeTableCascade(doc: EditorDocument, tableId: string): EditorDocument {
  const attached = doc.model.relationships.filter(
    (rel) => rel.parentTableId === tableId || rel.childTableId === tableId,
  )
  let next: EditorDocument = {
    ...doc,
    model: {
      ...doc.model,
      tables: doc.model.tables.filter((t) => t.id !== tableId),
      relationships: doc.model.relationships.filter((rel) => !attached.includes(rel)),
    },
    diagram: {
      ...doc.diagram,
      nodes: Object.fromEntries(Object.entries(doc.diagram.nodes).filter(([id]) => id !== tableId)),
      notes: doc.diagram.notes.map((n) => (n.linkedTableId === tableId ? { ...n, linkedTableId: null } : n)),
      // 소속 정리는 해자 같은 정리다 — 영역은 남고 멤버 목록에서만 빠진다(노트 연관 해제와 동형)
      areas: doc.diagram.areas.map((area) =>
        area.tableIds.includes(tableId)
          ? { ...area, tableIds: area.tableIds.filter((id) => id !== tableId) }
          : area,
      ),
      // 요구사항의 연결도 같은 방식으로 정리한다 — 요구사항은 남고 그 테이블만 빠진다
      requirements: doc.diagram.requirements.map((requirement) =>
        requirement.tableIds.includes(tableId)
          ? { ...requirement, tableIds: requirement.tableIds.filter((id) => id !== tableId) }
          : requirement,
      ),
    },
  }
  // 이 테이블·그 컬럼·붙어 있던 관계를 가리키던 검증 예외는 대상이 사라졌으니 함께 지운다
  const attachedTargets = new Set(attached.map((rel) => `relationship:${rel.id}`))
  next = withoutExceptions(
    next,
    (target) => target === `table:${tableId}` || target.startsWith(`column:${tableId}:`) || attachedTargets.has(target),
  )
  // 관계 소유 FK 컬럼 정리 — 상대 테이블이 살아 있는 쪽에서 제거한다
  for (const rel of attached) {
    const otherTableId = rel.parentTableId === tableId ? rel.childTableId : rel.parentTableId
    for (const mapping of rel.columnMappings) {
      if (otherTableId === rel.childTableId) {
        next = removeColumnEverywhere(next, otherTableId, mapping.childColumnId)
      }
    }
  }
  return next
}

/** 관계 생성 — FK 컬럼은 PK 블록 바로 밑(FK 영역 선두)에 삽입 + 식별 관계면 자식 PK에 FK 포함 (05-editor/01-core.md §6)
 *  비식별 1:1은 FK 전체 컬럼에 UK를 만들어 1:1을 강제한다 — 식별은 자식 PK가 이미 유일성을 보장한다.
 *  비식별 1:N은 FK 컬럼 전체로 복합 인덱스를 함께 만든다(§6.6 인덱스 자동 생성 정책) — 단
 *  MySQL(InnoDB)처럼 FK 선언이 자식 인덱스를 자동 생성하는 DBMS 문서는 만들지 않는다(DB이 알아서 한다).
 *  식별(PK 편입)·비식별 1:1(UK)은 상위 키가 선두 컬럼을 이미 덮는다 — PK·UK는 키로만 관리하고
 *  백킹 인덱스를 별도 Index 객체로 만들지 않는다(모든 DBMS가 자동 생성). */
function applyRelationshipCreate(
  doc: EditorDocument,
  relationship: ErdRelationship,
  fkColumns: ErdColumn[],
  databaseType = '',
): EditorDocument {
  const fkIds = fkColumns.map((c) => c.id)
  // fkColumns가 빈 diff 재생(collab 병합 — 키는 index/set 등 각자의 diff가 재현)에서는
  // UK·인덱스를 만들지 않는다 — 컬럼 0개 키는 무의미한 껍데기다
  const wantUk = fkIds.length > 0 && relationship.type === 'ONE_TO_ONE' && !relationship.identifying
  const wantIndex =
    fkIds.length > 0 &&
    relationship.type === 'ONE_TO_MANY' &&
    !relationship.identifying &&
    !dbmsAutoIndexesFk(databaseType)
  let next = mapTable(doc, relationship.childTableId, (table) => {
    const primaryKey = relationship.identifying
      ? table.primaryKey
        ? { ...table.primaryKey, columnIds: [...table.primaryKey.columnIds, ...fkIds] }
        : { name: `${table.physicalName}_pk`, columnIds: [...fkIds] }
      : table.primaryKey
    // 선두 연속 PK 길이 뒤에 끼워 넣는다 — 식별 관계면 PK 블록 끝, 비식별이면 FK 영역 선두가 된다
    const pkSet = new Set(primaryKey?.columnIds ?? [])
    let pkLen = 0
    for (const column of table.columns) {
      if (pkSet.has(column.id)) pkLen += 1
      else break
    }
    return {
      ...table,
      columns: [...table.columns.slice(0, pkLen), ...fkColumns, ...table.columns.slice(pkLen)],
      primaryKey,
      uniques: wantUk
        ? [...table.uniques, { id: newId(), name: defaultKeyName(doc.model, table, 'unique', fkColumns), columnIds: [...fkIds] }]
        : table.uniques,
      indexes: wantIndex
        ? [
            ...table.indexes,
            createIndex({
              name: defaultKeyName(doc.model, table, 'index', fkColumns),
              columns: fkIds.map((columnId) => ({ columnId, order: 'ASC' as const })),
            }),
          ]
        : table.indexes,
    }
  })
  next = {
    ...next,
    model: { ...next.model, relationships: [...next.model.relationships, relationship] },
  }
  return next
}

/** 관계 삭제 — 관계 소유 FK 컬럼도 함께 제거 (다른 관계가 참조하지 않는 경우만).
 *  FK 전체로 구성된 UK는 컬럼이 모두 사라지며 uniquesWithoutColumn이 자동으로 제거한다. */
function removeRelationshipCascade(doc: EditorDocument, relationshipId: string): EditorDocument {
  const rel = doc.model.relationships.find((r) => r.id === relationshipId)
  if (!rel) return doc
  let next: EditorDocument = withoutExceptions(
    {
      ...doc,
      model: { ...doc.model, relationships: doc.model.relationships.filter((r) => r.id !== relationshipId) },
    },
    (target) => target === `relationship:${relationshipId}`,
  )
  for (const mapping of rel.columnMappings) {
    const stillReferenced = next.model.relationships.some((r) =>
      r.columnMappings.some((m) => m.childColumnId === mapping.childColumnId && r.childTableId === rel.childTableId),
    )
    if (!stillReferenced) {
      next = removeColumnEverywhere(next, rel.childTableId, mapping.childColumnId)
    }
  }
  return next
}

/** 관계 속성 변경 — 유형(1:1/1:N)·식별·부모 기수 전환 시 하위 제약을 동기화한다 (05-editor/01-core.md §6)
 *  · 식별 ↔ 비식별: FK의 자식 PK 편입/해제 + NOT NULL 전환 + 3영역(PK→FK→일반) 재정렬
 *    (복합 PK가 되는 순간 기존 PK의 AI 해제 — pkToggleChanges와 같은 규칙)
 *  · 비식별 1:1: FK 전체 컬럼 UK로 1:1을 강제 — 식별·1:N이면 관계가 만든 UK를 제거한다
  · 비식별 1:N: FK 컬럼 인덱스를 만든다(생성과 같은 기본값) — 식별·1:1이면 관계가 만든 인덱스를 제거한다
 *  · 부모 기수: 정확히 1(|)이면 FK NOT NULL, 0 또는 1(○|)이면 nullable — 식별 FK는 PK라 항상 NOT NULL
 *  · 유형 전환: 자식 기수가 새 유형에 없는 값이면 기본값으로 보정한다
 *  UK·인덱스 소유 판정은 FK 집합과 정확히 일치하는 경우만 — 사용자가 직접 만들었거나 고친 키는 보존한다. */
/**
 * 외래 키 컬럼 교체 — 이전 컬럼에서 관계가 만든 것을 걷고, 새 컬럼에 관계의 규칙을 건다.
 *  · 걷기: 식별 관계였으면 기본 키에서 뺀다. 이전 외래 키 집합과 정확히 일치하는 UK·인덱스(관계 소유)를 지운다.
 *    컬럼 자체는 남긴다(일반 컬럼이 된다) — 지우는 일은 호출부가 column/remove로 따로 한다
 *  · 걸기: 식별 관계면 기본 키에 넣고 NOT NULL, 아니면 부모 기수로 nullable을 정한다.
 *    비식별 1:1은 UK를, 비식별 1:N은 인덱스를 새 외래 키 집합으로 만든다(이미 있으면 두지 않는다)
 * 사용자가 직접 만든 키(집합이 다른 UK·인덱스)는 건드리지 않는다.
 */
function rekeyForeignKey(
  doc: EditorDocument,
  table: ErdTable,
  prev: ErdRelationship,
  next: ErdRelationship,
  databaseType: string,
): ErdTable {
  const prevFkIds = prev.columnMappings.map((m) => m.childColumnId)
  const nextFkIds = next.columnMappings.map((m) => m.childColumnId)
  const nextSet = new Set(nextFkIds)
  const released = new Set(prevFkIds.filter((id) => !nextSet.has(id)))
  const keyOf = (ids: readonly string[]) => [...ids].sort().join('\0')
  const prevKey = keyOf(prevFkIds)
  const nextKey = keyOf(nextFkIds)
  let { columns, primaryKey, uniques, indexes } = table

  /* ---------- 걷기 ---------- */
  if (prev.identifying && primaryKey) {
    const remain = primaryKey.columnIds.filter((id) => !released.has(id))
    primaryKey = remain.length > 0 ? { ...primaryKey, columnIds: remain } : null
  }
  uniques = uniques.filter((u) => keyOf(u.columnIds) !== prevKey)
  indexes = indexes.filter((ix) => keyOf(ix.columns.map((c) => c.columnId)) !== prevKey)

  /* ---------- 걸기 ---------- */
  if (next.identifying) {
    const pkIds = new Set(primaryKey?.columnIds ?? [])
    primaryKey = primaryKey
      ? { ...primaryKey, columnIds: [...primaryKey.columnIds, ...nextFkIds.filter((id) => !pkIds.has(id))] }
      : { name: `${table.physicalName}_pk`, columnIds: [...nextFkIds] }
    // 복합 기본 키에는 자동 증가를 둘 수 없다 — 식별 전환과 같은 규칙
    const composite = primaryKey.columnIds.length > 1
    columns = columns.map((c) =>
      nextSet.has(c.id)
        ? { ...c, nullable: false, autoIncrement: false }
        : composite && pkIds.has(c.id) && c.autoIncrement
          ? { ...c, autoIncrement: false }
          : c,
    )
  } else {
    const nullable = next.parentMultiplicity === 'ZERO_OR_ONE'
    const pkNow = new Set(primaryKey?.columnIds ?? [])
    // 자식의 기본 키이기도 한 컬럼은 NOT NULL을 지킨다
    columns = columns.map((c) => (nextSet.has(c.id) && !pkNow.has(c.id) ? { ...c, nullable } : c))
  }

  // 3영역 순서 재확정 — PK → FK → 일반 (stable이라 같은 영역 안 순서는 유지)
  const pkNow = new Set(primaryKey?.columnIds ?? [])
  const rank = (id: string) => (pkNow.has(id) ? 0 : nextSet.has(id) ? 1 : 2)
  columns = [...columns].sort((a, b) => rank(a.id) - rank(b.id))

  const byId = new Map(columns.map((c) => [c.id, c]))
  const fkColumns = nextFkIds.map((id) => byId.get(id)).filter((c): c is ErdColumn => c !== undefined)
  const working = { ...table, columns, primaryKey, uniques, indexes }
  if (
    fkColumns.length > 0 &&
    next.type === 'ONE_TO_ONE' &&
    !next.identifying &&
    !uniques.some((u) => keyOf(u.columnIds) === nextKey)
  ) {
    uniques = [...uniques, { id: newId(), name: defaultKeyName(doc.model, working, 'unique', fkColumns), columnIds: [...nextFkIds] }]
  }
  if (
    fkColumns.length > 0 &&
    next.type === 'ONE_TO_MANY' &&
    !next.identifying &&
    !dbmsAutoIndexesFk(databaseType) &&
    !indexes.some((ix) => keyOf(ix.columns.map((c) => c.columnId)) === nextKey)
  ) {
    indexes = [
      ...indexes,
      createIndex({
        name: defaultKeyName(doc.model, working, 'index', fkColumns),
        columns: nextFkIds.map((columnId) => ({ columnId, order: 'ASC' as const })),
      }),
    ]
  }
  return { ...table, columns, primaryKey, uniques, indexes }
}

function applyRelationshipPatch(
  doc: EditorDocument,
  change: Extract<ErdChange, { type: 'relationship/patch' }>,
  databaseType = '',
): EditorDocument {
  const prev = doc.model.relationships.find((r) => r.id === change.relationshipId)
  if (!prev) return doc
  const patchedType = change.patch.type ?? prev.type
  const next = {
    ...prev,
    ...change.patch,
    childMultiplicity: coerceChildMultiplicity(patchedType, change.patch.childMultiplicity ?? prev.childMultiplicity),
  }
  const merged: EditorDocument = {
    ...doc,
    model: {
      ...doc.model,
      relationships: doc.model.relationships.map((r) => (r.id === next.id ? next : r)),
    },
  }
  // 컬럼 매핑이 바뀌었다 — 이전 외래 키 컬럼에서 관계의 규칙을 걷어 내고 새 컬럼에 다시 건다.
  // 유형·식별 여부가 함께 바뀌어도 "이전 관계로 걷고 새 관계로 건다"로 한 번에 처리된다
  const prevFkIds = prev.columnMappings.map((m) => m.childColumnId)
  const nextFkIds = next.columnMappings.map((m) => m.childColumnId)
  if (change.patch.columnMappings && [...prevFkIds].sort().join('\0') !== [...nextFkIds].sort().join('\0')) {
    return mapTable(merged, next.childTableId, (table) =>
      rekeyForeignKey(merged, table, prev, next, databaseType),
    )
  }

  const constraintsChanged =
    prev.identifying !== next.identifying ||
    prev.type !== next.type ||
    prev.parentMultiplicity !== next.parentMultiplicity
  if (!constraintsChanged) return merged

  return mapTable(merged, next.childTableId, (table) => {
    const fkIds = next.columnMappings.map((m) => m.childColumnId)
    const fkSet = new Set(fkIds)
    let { columns, primaryKey, uniques, indexes } = table

    if (prev.identifying !== next.identifying) {
      if (next.identifying) {
        const pkIds = new Set(primaryKey?.columnIds ?? [])
        primaryKey = primaryKey
          ? { ...primaryKey, columnIds: [...primaryKey.columnIds, ...fkIds.filter((id) => !pkIds.has(id))] }
          : { name: `${table.physicalName}_pk`, columnIds: [...fkIds] }
        columns = columns.map((c) => (fkSet.has(c.id) ? { ...c, nullable: false } : c))
        if ((primaryKey.columnIds.length ?? 0) > 1) {
          const oldPkIds = new Set(table.primaryKey?.columnIds ?? [])
          columns = columns.map((c) => (oldPkIds.has(c.id) && c.autoIncrement ? { ...c, autoIncrement: false } : c))
        }
      } else {
        const remain = (primaryKey?.columnIds ?? []).filter((id) => !fkSet.has(id))
        primaryKey = primaryKey && remain.length > 0 ? { ...primaryKey, columnIds: remain } : null
        columns = columns.map((c) => (fkSet.has(c.id) ? { ...c, nullable: next.parentMultiplicity === 'ZERO_OR_ONE' } : c))
      }
    } else if (prev.parentMultiplicity !== next.parentMultiplicity && !next.identifying) {
      columns = columns.map((c) => (fkSet.has(c.id) ? { ...c, nullable: next.parentMultiplicity === 'ZERO_OR_ONE' } : c))
    }

    // 3영역 순서 재확정 — PK → FK → 일반 (stable이라 같은 영역 안 순서는 유지)
    const pkNow = new Set(primaryKey?.columnIds ?? [])
    const rank = (id: string) => (pkNow.has(id) ? 0 : fkSet.has(id) ? 1 : 2)
    columns = [...columns].sort((a, b) => rank(a.id) - rank(b.id))

    const fkKey = [...fkIds].sort().join('\0')
    const byId = new Map(columns.map((c) => [c.id, c]))
    const fkColumns = fkIds.map((id) => byId.get(id)).filter((c): c is ErdColumn => c !== undefined)
    const owned = uniques.find((u) => [...u.columnIds].sort().join('\0') === fkKey)
    const wantUk = next.type === 'ONE_TO_ONE' && !next.identifying
    if (wantUk && !owned) {
      uniques = [...uniques, { id: newId(), name: defaultKeyName(merged.model, table, 'unique', fkColumns), columnIds: [...fkIds] }]
    } else if (!wantUk && owned) {
      uniques = uniques.filter((u) => u !== owned)
    }

    // 인덱스 동기화 — UK와 같은 소유 규칙(컬럼 집합 일치)으로 비식별 1:N 기본 인덱스를 맞춘다.
    // MySQL(InnoDB) 문서는 FK 인덱스를 만들지 않는다(§6.6 — DB이 자동 생성), 남아 있으면 제거만
    const ownedIndex = indexes.find((ix) => ix.columns.map((c) => c.columnId).sort().join('\0') === fkKey)
    const wantIndex = next.type === 'ONE_TO_MANY' && !next.identifying && !dbmsAutoIndexesFk(databaseType)
    if (wantIndex && !ownedIndex) {
      indexes = [
        ...indexes,
        createIndex({ name: defaultKeyName(merged.model, table, 'index', fkColumns), columns: fkIds.map((columnId) => ({ columnId, order: 'ASC' as const })) }),
      ]
    } else if (!wantIndex && ownedIndex) {
      indexes = indexes.filter((ix) => ix !== ownedIndex)
    }

    return { ...table, columns, primaryKey, uniques, indexes }
  })
}

/** 단일 변경 적용 — 순수 함수, 원본 불변.
 *  databaseType(문서 대상 DBMS)은 관계 생성·전환의 FK 인덱스 자동 생성 여부를 결정한다(§6.6) —
 *  MySQL(InnoDB)은 DB이 FK 인덱스를 자동 생성하므로 ERD에 만들지 않는다. 협업 리플레이도
 *  같은 문서 메타로 같은 결과가 나온다(모든 클라이언트가 같은 값을 넘긴다). */
export function applyChange(doc: EditorDocument, change: ErdChange, databaseType = ''): EditorDocument {
  switch (change.type) {
    case 'table/create':
      return {
        ...doc,
        model: { ...doc.model, tables: [...doc.model.tables, change.table] },
        diagram: {
          ...doc.diagram,
          nodes: { ...doc.diagram.nodes, [change.table.id]: { x: change.position.x, y: change.position.y, width: null, color: 'default' } },
        },
      }
    case 'table/remove':
      return removeTableCascade(doc, change.tableId)
    case 'table/patch':
      return mapTable(doc, change.tableId, (table) => ({ ...table, ...change.patch }))
    case 'column/add':
      return mapTable(doc, change.tableId, (table) => ({ ...table, columns: [...table.columns, change.column] }))
    case 'column/remove':
      return removeColumnEverywhere(doc, change.tableId, change.columnId)
    case 'column/patch':
      return mapTable(doc, change.tableId, (table) => ({
        ...table,
        columns: table.columns.map((c) => (c.id === change.columnId ? patchColumn(c, change.patch) : c)),
      }))
    case 'column/move':
      return mapTable(doc, change.tableId, (table) => {
        const from = table.columns.findIndex((c) => c.id === change.columnId)
        if (from < 0) return table
        const columns = [...table.columns]
        const [moved] = columns.splice(from, 1)
        const to = Math.max(0, Math.min(change.toIndex, columns.length))
        columns.splice(to, 0, moved)
        return { ...table, columns }
      })
    case 'primaryKey/set':
      return mapTable(doc, change.tableId, (table) => ({ ...table, primaryKey: change.primaryKey }))
    case 'uniqueKey/set':
      return mapTable(doc, change.tableId, (table) => ({ ...table, uniques: change.uniques }))
    case 'index/set':
      return mapTable(doc, change.tableId, (table) => ({ ...table, indexes: change.indexes }))
    case 'check/set':
      return mapTable(doc, change.tableId, (table) => ({ ...table, checks: change.checks }))
    case 'relationship/create':
      return applyRelationshipCreate(doc, change.relationship, change.fkColumns, databaseType)
    case 'relationship/patch':
      return applyRelationshipPatch(doc, change, databaseType)
    case 'relationship/remove':
      return removeRelationshipCascade(doc, change.relationshipId)
    case 'note/create':
      return { ...doc, diagram: { ...doc.diagram, notes: [...doc.diagram.notes, change.note] } }
    case 'note/patch':
      return {
        ...doc,
        diagram: {
          ...doc.diagram,
          notes: doc.diagram.notes.map((n) => (n.id === change.noteId ? { ...n, ...change.patch } : n)),
        },
      }
    case 'note/remove':
      return {
        ...doc,
        diagram: { ...doc.diagram, notes: doc.diagram.notes.filter((n) => n.id !== change.noteId) },
      }
    case 'area/create':
      return { ...doc, diagram: { ...doc.diagram, areas: [...doc.diagram.areas, change.area] } }
    case 'area/patch':
      return {
        ...doc,
        diagram: {
          ...doc.diagram,
          areas: doc.diagram.areas.map((area) => (area.id === change.areaId ? { ...area, ...change.patch } : area)),
        },
      }
    case 'area/remove':
      // 영역 삭제는 멤버 테이블을 건드리지 않는다 — 묶음 표시만 사라진다.
      // 그 영역을 도메인으로 가리키던 요구사항은 미분류가 된다
      return {
        ...doc,
        diagram: {
          ...doc.diagram,
          areas: doc.diagram.areas.filter((area) => area.id !== change.areaId),
          requirements: doc.diagram.requirements.map((requirement) =>
            requirement.areaId === change.areaId ? { ...requirement, areaId: null } : requirement,
          ),
        },
      }
    case 'requirement/create':
      return { ...doc, diagram: { ...doc.diagram, requirements: [...doc.diagram.requirements, change.requirement] } }
    case 'requirement/patch':
      return {
        ...doc,
        diagram: {
          ...doc.diagram,
          requirements: doc.diagram.requirements.map((requirement) => {
            if (requirement.id !== change.requirementId) return requirement
            const next = { ...requirement, ...change.patch }
            // 제목이나 내용이 바뀌면 개정 번호가 오른다 — 그 요구사항은 반영 대기가 된다.
            // 패치가 revision을 직접 실었으면(서버 본문을 따라가는 병합) 그 값을 쓴다
            if (change.patch.revision !== undefined) return next
            const contentChanged = next.title !== requirement.title || next.description !== requirement.description
            return contentChanged ? { ...next, revision: requirement.revision + 1 } : next
          }),
        },
      }
    case 'requirement/remove':
      return {
        ...doc,
        diagram: {
          ...doc.diagram,
          requirements: doc.diagram.requirements.filter((requirement) => requirement.id !== change.requirementId),
        },
      }
    case 'validationException/add':
      // 같은 규칙·대상의 예외가 이미 있으면 바꿔 끼운다 — 한 경고에 예외는 하나다
      return {
        ...doc,
        diagram: {
          ...doc.diagram,
          validationExceptions: [
            ...doc.diagram.validationExceptions.filter(
              (exception) =>
                exception.id !== change.exception.id &&
                !(exception.ruleId === change.exception.ruleId && exception.target === change.exception.target),
            ),
            change.exception,
          ],
        },
      }
    case 'validationException/remove':
      return {
        ...doc,
        diagram: {
          ...doc.diagram,
          validationExceptions: doc.diagram.validationExceptions.filter((exception) => exception.id !== change.exceptionId),
        },
      }
    case 'node/move': {
      const nodes: Record<string, ErdNodeLayout> = Object.fromEntries(
        Object.entries(doc.diagram.nodes).map(([id, layout]) =>
          id in change.positions ? [id, { ...layout, ...change.positions[id] }] : [id, layout],
        ),
      )
      // 위치가 없던 테이블(문서 편집 API가 만든 테이블 — 02-ui.md §18)은 여기서 위치를 얻는다.
      // 없는 테이블의 id는 무시한다 — 지워진 테이블로 가는 늦은 이동이 노드를 되살리지 않게
      for (const table of doc.model.tables) {
        const position = change.positions[table.id]
        if (position && !(table.id in nodes)) nodes[table.id] = { ...position, width: null, color: 'default' }
      }
      return { ...doc, diagram: { ...doc.diagram, nodes } }
    }
    case 'node/resize':
      return {
        ...doc,
        diagram: {
          ...doc.diagram,
          nodes: { ...doc.diagram.nodes, [change.tableId]: { ...doc.diagram.nodes[change.tableId], width: change.width } },
        },
      }
    case 'node/color':
      return {
        ...doc,
        diagram: {
          ...doc.diagram,
          nodes: { ...doc.diagram.nodes, [change.tableId]: { ...doc.diagram.nodes[change.tableId], color: change.color } },
        },
      }
  }
}

/** 연속 변경을 한 번에 — 같은 undo 스택에 들어가는 단위 */
export function applyChanges(doc: EditorDocument, changes: ErdChange[], databaseType = ''): EditorDocument {
  return changes.reduce((acc, change) => applyChange(acc, change, databaseType), doc)
}

/** ErdContent 허용 래퍼 — 저장 직전 변환 등에서 사용 */
export function applyChangeToContent(content: ErdContent, change: ErdChange): ErdContent {
  return toContent(applyChange(toDoc(content), change))
}
