/**
 * 도메인 타입과 컬럼 — 적용·다르게 쓰기·전파 (05-editor/01-core.md §11.1) — 순수 함수.
 *
 * 컬럼은 값을 자기 것으로 갖는다. 도메인 타입은 그 값의 출처를 가리키는 연결(column.domain)일 뿐이다.
 * 서버는 도메인 타입을 고쳐도 문서를 고치지 않는다 — 여기서 "맞춘 버전보다 도메인 타입이 새로운 컬럼"을
 * 찾고, 편집자가 고른 대로 전파하는 변경 묶음을 만든다.
 */
import type { DomainType } from '@/features/domain-types/api'
import { DOMAIN_FIELDS, type ColumnPatch, type DomainField, type ErdChange } from '@/features/editor/model/changes'
import type { EditorDocument, ErdColumn, ErdColumnDomain, ErdTable } from '@/features/editor/model/content-schema'

type DomainValues = Pick<ErdColumn, DomainField>

/** 도메인 타입이 컬럼에 주는 값 */
export function domainValues(domainType: DomainType): DomainValues {
  return {
    dataType: domainType.dataType,
    length: domainType.length,
    precision: domainType.precision,
    scale: domainType.scale,
    nullable: domainType.nullable,
    defaultValue: domainType.defaultValue,
  }
}

/** 외래 키 컬럼 id — 외래 키 컬럼의 타입은 부모 컬럼을 따르므로 도메인 타입을 적용할 수 없다 */
export function foreignKeyColumnIds(doc: EditorDocument): Set<string> {
  return new Set(doc.model.relationships.flatMap((rel) => rel.columnMappings.map((m) => m.childColumnId)))
}

/**
 * 이 컬럼에서 도메인 타입이 실제로 다루는 속성 — 기본 키 컬럼은 nullable을 따르지 않는다(항상 NOT NULL).
 * 식별 관계의 외래 키도 기본 키라 같은 규칙에 든다.
 */
export function effectiveFields(table: ErdTable, columnId: string): DomainField[] {
  const pk = table.primaryKey?.columnIds.includes(columnId) ?? false
  return DOMAIN_FIELDS.filter((field) => !(pk && field === 'nullable'))
}

/** 도메인 타입과 값이 다른 속성 */
export function differingFields(column: DomainValues, domainType: DomainType, fields: readonly DomainField[]): DomainField[] {
  const values = domainValues(domainType)
  return fields.filter((field) => column[field] !== values[field])
}

/** 적용 — 다루는 속성을 도메인 타입의 값으로 바꾸고 연결을 기록한다(overrides는 비운다) */
export function applyDomainPatch(domainType: DomainType, table: ErdTable, columnId: string): ColumnPatch {
  const values = domainValues(domainType)
  const patch: ColumnPatch = {}
  for (const field of effectiveFields(table, columnId)) Object.assign(patch, { [field]: values[field] })
  patch.domain = { id: domainType.domainTypeId, name: domainType.name, version: domainType.version, overrides: [] }
  return patch
}

/** 적용(테이블 없이) — 기본 키 여부만 알면 되는 곳(컬럼 행)에서 쓴다. 규칙은 applyDomainPatch와 같다 */
export function applyDomainPatchFor(domainType: DomainType, isPrimaryKey: boolean): ColumnPatch {
  const values = domainValues(domainType)
  const patch: ColumnPatch = {}
  for (const field of DOMAIN_FIELDS) {
    if (isPrimaryKey && field === 'nullable') continue
    Object.assign(patch, { [field]: values[field] })
  }
  patch.domain = { id: domainType.domainTypeId, name: domainType.name, version: domainType.version, overrides: [] }
  return patch
}

/** 연결 정보 만들기 — 폼에서 고른 값이 도메인 타입과 다른 속성을 overrides로 적는다 */
export function linkFor(domainType: DomainType, values: DomainValues, fields: readonly DomainField[]): ErdColumnDomain {
  return {
    id: domainType.domainTypeId,
    name: domainType.name,
    version: domainType.version,
    overrides: differingFields(values, domainType, fields),
  }
}

export type DomainLinkStatus =
  /** 도메인 타입을 쓰지 않는다 */
  | 'none'
  /** 맞춰져 있다 */
  | 'synced'
  /** 일부 속성을 다르게 쓴다 */
  | 'overridden'
  /** 맞춘 뒤에 도메인 타입이 바뀌었다 — 전파할지 정해야 한다 */
  | 'stale'
  /** 도메인 타입이 지워졌거나 이 워크스페이스에 없다 */
  | 'missing'

/** 컬럼의 연결 상태 — domainTypes가 undefined면(목록을 읽지 못했다) 끊김으로 보지 않는다 */
export function linkStatus(column: ErdColumn, domainTypes: readonly DomainType[] | undefined): DomainLinkStatus {
  if (!column.domain) return 'none'
  if (domainTypes) {
    const domainType = domainTypes.find((candidate) => candidate.domainTypeId === column.domain?.id)
    if (!domainType) return 'missing'
    if (domainType.version > column.domain.version) return 'stale'
  }
  return column.domain.overrides.length > 0 ? 'overridden' : 'synced'
}

export interface StaleFieldChange {
  field: DomainField
  from: ErdColumn[DomainField]
  to: ErdColumn[DomainField]
  /** 이 컬럼이 다르게 쓰기로 한 속성 — 전파에서 건너뛴다 */
  skipped: boolean
}

export interface StaleColumn {
  /** `tableId/columnId` — 미리보기에서 고르는 단위 */
  key: string
  tableId: string
  columnId: string
  tableName: string
  columnName: string
  domainType: DomainType
  /** 도메인 타입과 값이 다른 속성(바뀔 것과 건너뛸 것) — 비어 있을 수 있다(이름·설명만 바뀐 경우) */
  changes: StaleFieldChange[]
}

/** 맞춘 버전보다 도메인 타입이 새로운 컬럼 — 문서 순서대로 */
export function findStaleColumns(doc: EditorDocument, domainTypes: readonly DomainType[]): StaleColumn[] {
  const byId = new Map(domainTypes.map((domainType) => [domainType.domainTypeId, domainType] as const))
  const stale: StaleColumn[] = []
  for (const table of doc.model.tables) {
    for (const column of table.columns) {
      if (!column.domain) continue
      const domainType = byId.get(column.domain.id)
      if (!domainType || domainType.version <= column.domain.version) continue
      const values = domainValues(domainType)
      const overrides = new Set(column.domain.overrides)
      stale.push({
        key: `${table.id}/${column.id}`,
        tableId: table.id,
        columnId: column.id,
        tableName: table.physicalName,
        columnName: column.physicalName,
        domainType,
        changes: differingFields(column, domainType, effectiveFields(table, column.id)).map((field) => ({
          field,
          from: column[field],
          to: values[field],
          skipped: overrides.has(field),
        })),
      })
    }
  }
  return stale
}

/**
 * 전파 변경 묶음 — 고른 컬럼은 다르게 쓰지 않는 속성을 도메인 타입의 값으로 바꾸고,
 * 고르지 않은 컬럼은 값을 두고 달라진 속성을 overrides에 넣는다. 둘 다 맞춘 버전을 올려 다시 묻지 않는다.
 * commitAll로 한 번에 커밋하면 Undo 한 번으로 전체가 취소된다.
 */
export function buildPropagationChanges(stale: readonly StaleColumn[], selectedKeys: ReadonlySet<string>): ErdChange[] {
  return stale.map((item) => {
    const base = { id: item.domainType.domainTypeId, name: item.domainType.name, version: item.domainType.version }
    const skipped = item.changes.filter((change) => change.skipped).map((change) => change.field)
    if (selectedKeys.has(item.key)) {
      const patch: ColumnPatch = { domain: { ...base, overrides: skipped } }
      for (const change of item.changes) {
        if (!change.skipped) Object.assign(patch, { [change.field]: change.to })
      }
      return { type: 'column/patch', tableId: item.tableId, columnId: item.columnId, patch }
    }
    return {
      type: 'column/patch',
      tableId: item.tableId,
      columnId: item.columnId,
      patch: { domain: { ...base, overrides: item.changes.map((change) => change.field) } },
    }
  })
}

/** 이 문서에서 도메인 타입별로 쓰는 컬럼 수 */
export function domainUsage(doc: EditorDocument): Map<string, number> {
  const usage = new Map<string, number>()
  for (const table of doc.model.tables) {
    for (const column of table.columns) {
      if (column.domain) usage.set(column.domain.id, (usage.get(column.domain.id) ?? 0) + 1)
    }
  }
  return usage
}
