/**
 * 대상 DBMS 전환 — 다른 DBMS 문서로 복제할 때의 변환과 검사 (05-editor/04-dbms-engineering.md §3.5).
 *
 * 문서의 대상 DBMS는 만든 뒤 바꿀 수 없다. 다른 DBMS로 옮길 때는 대상 DBMS만 다른 새 문서를 만들고,
 * 그 본체로 이 모듈의 변환 결과를 저장한다. 원본 문서는 건드리지 않는다(순수 함수 — 입력을 바꾸지 않는다).
 *
 * 변환 규칙(§3.5):
 *  1. 공용 타입 코드로 저장된 컬럼 타입은 그대로 둔다 — 물리 표기는 대상 템플릿이 정한다
 *  2. 공용 코드가 아닌 타입 값은 원본 DBMS의 물리 표기로 해석해 공용 코드로 바꾼다
 *  3. 해석하지 못한 타입 값은 그대로 두고 "맞지 않는 타입"으로 보고한다
 *  4. 대상이 FK 인덱스를 자동으로 만들지 않는 DBMS면 비식별 1:N 관계의 FK 인덱스를 보충한다
 *     (대상이 자동으로 만드는 DBMS면 기존 인덱스를 지우지 않는다)
 *  5. 그 밖의 내용은 그대로 복사한다
 */
import { createIndex } from '@/features/editor/model/changes'
import type { EditorDocument, ErdColumn, ErdRelationship, ErdTable } from '@/features/editor/model/content-schema'
import {
  dataTypeSpec,
  dbmsAutoIndexesFk,
  parsePhysicalType,
  physicalType,
  templateIdForDatabase,
} from '@/features/editor/model/dbms'
import { defaultKeyName } from '@/features/editor/model/keys'

/** 공용 타입 코드의 물리 표기가 원본과 대상에서 다른 경우 — 안내 */
export interface TypeNotationChange {
  /** 공용 타입 코드 */
  code: string
  fromType: string
  toType: string
  /** 이 코드를 쓰는 컬럼 수 */
  columnCount: number
}

/** 공용 코드가 아니던 타입 값을 공용 코드로 정리한 컬럼 — 안내 */
export interface NormalizedColumn {
  tableName: string
  columnName: string
  from: string
  to: string
}

/** 해석하지 못해 그대로 둔 타입 값 — 경고 */
export interface UnsupportedColumn {
  tableName: string
  columnName: string
  dataType: string
}

/** 대상 DBMS 정책에 따라 보충한 FK 인덱스 — 안내 */
export interface AddedFkIndex {
  tableName: string
  indexName: string
  columnNames: string[]
}

export interface DbmsConversionReport {
  typeChanges: TypeNotationChange[]
  normalized: NormalizedColumn[]
  unsupported: UnsupportedColumn[]
  addedIndexes: AddedFkIndex[]
}

export interface DbmsConversionResult {
  document: EditorDocument
  report: DbmsConversionReport
}

/** 이 database_types 코드에 에디터 타입 템플릿이 있는지 — 없으면 전환 대상으로 고를 수 없다(§3.5) */
export function hasDbmsTemplate(databaseType: string): boolean {
  return templateIdForDatabase(databaseType) !== 'common'
}

/** FK 선두 컬럼으로 시작하는 인덱스·PK·UK가 자식 테이블에 있는지 (검증 FK_WITHOUT_INDEX와 같은 기준) */
function fkLeadingColumnIndexed(rel: ErdRelationship, child: ErdTable): boolean {
  const leading = rel.columnMappings[0]?.childColumnId
  if (!leading) return true // 매핑이 없으면 보충할 대상이 아니다
  if (child.primaryKey?.columnIds[0] === leading) return true
  if (child.uniques.some((uk) => uk.columnIds[0] === leading)) return true
  return child.indexes.some((ix) => ix.columns[0]?.columnId === leading)
}

/** 컬럼 타입 정리(규칙 1~3) — 바뀐 컬럼과 보고 항목을 돌려준다 */
function convertColumn(
  table: ErdTable,
  column: ErdColumn,
  fromTemplate: string,
  report: DbmsConversionReport,
): ErdColumn {
  if (dataTypeSpec(column.dataType)) return column // 규칙 1 — 공용 코드는 그대로

  const parsed = parsePhysicalType(column.dataType, fromTemplate)
  if (!parsed) {
    // 규칙 3 — 해석하지 못한 값은 그대로 두고 경고로 알린다
    report.unsupported.push({
      tableName: table.physicalName,
      columnName: column.physicalName,
      dataType: column.dataType,
    })
    return column
  }
  // 규칙 2 — 원본 방언 표기를 공용 코드로. 타입 값에 인자가 없으면 컬럼에 이미 있던 길이·정밀도를 지킨다
  report.normalized.push({
    tableName: table.physicalName,
    columnName: column.physicalName,
    from: column.dataType,
    to: parsed.code,
  })
  return {
    ...column,
    dataType: parsed.code,
    length: parsed.length ?? column.length,
    precision: parsed.precision ?? column.precision,
    scale: parsed.scale ?? column.scale,
  }
}

/**
 * 문서를 다른 대상 DBMS용으로 변환한다. 입력 문서는 바꾸지 않는다.
 *
 * @param document 원본 문서(클릭 시점의 편집 상태)
 * @param fromDatabaseType 원본 문서의 database_types 코드
 * @param toDatabaseType 대상 database_types 코드
 */
export function convertDocumentDbms(
  document: EditorDocument,
  fromDatabaseType: string,
  toDatabaseType: string,
): DbmsConversionResult {
  const fromTemplate = templateIdForDatabase(fromDatabaseType)
  const toTemplate = templateIdForDatabase(toDatabaseType)
  const report: DbmsConversionReport = { typeChanges: [], normalized: [], unsupported: [], addedIndexes: [] }

  // 규칙 1~3 — 컬럼 타입
  let tables = document.model.tables.map((table) => ({
    ...table,
    columns: table.columns.map((column) => convertColumn(table, column, fromTemplate, report)),
  }))

  // 안내 — 공용 코드별로 물리 표기가 바뀌는 타입(정리된 뒤의 코드 기준)
  const codeCounts = new Map<string, number>()
  for (const table of tables) {
    for (const column of table.columns) {
      if (dataTypeSpec(column.dataType)) {
        codeCounts.set(column.dataType, (codeCounts.get(column.dataType) ?? 0) + 1)
      }
    }
  }
  for (const [code, columnCount] of codeCounts) {
    const fromType = physicalType(code, fromTemplate)
    const toType = physicalType(code, toTemplate)
    if (fromType !== toType) report.typeChanges.push({ code, fromType, toType, columnCount })
  }
  report.typeChanges.sort((a, b) => a.code.localeCompare(b.code))

  // 규칙 4 — 대상이 FK 인덱스를 자동으로 만들지 않으면 비식별 1:N 관계의 FK 인덱스를 보충한다
  if (!dbmsAutoIndexesFk(toDatabaseType)) {
    for (const rel of document.model.relationships) {
      if (rel.type !== 'ONE_TO_MANY' || rel.identifying) continue
      const child = tables.find((table) => table.id === rel.childTableId)
      if (!child || fkLeadingColumnIndexed(rel, child)) continue
      const fkColumns = rel.columnMappings
        .map((mapping) => child.columns.find((column) => column.id === mapping.childColumnId))
        .filter((column): column is ErdColumn => column !== undefined)
      if (fkColumns.length === 0) continue
      // 이름은 관계를 만들 때와 같은 규칙 — 이미 보충한 인덱스 이름과도 겹치지 않게 현재 tables로 계산한다
      const indexName = defaultKeyName({ ...document.model, tables }, child, 'index', fkColumns)
      tables = tables.map((table) =>
        table.id === child.id
          ? {
              ...table,
              indexes: [
                ...table.indexes,
                createIndex({
                  name: indexName,
                  columns: fkColumns.map((column) => ({ columnId: column.id, order: 'ASC' as const })),
                }),
              ],
            }
          : table,
      )
      report.addedIndexes.push({
        tableName: child.physicalName,
        indexName,
        columnNames: fkColumns.map((column) => column.physicalName),
      })
    }
  }

  // 규칙 5 — 그 밖의 내용은 그대로
  return {
    document: { model: { ...document.model, tables }, diagram: document.diagram },
    report,
  }
}
