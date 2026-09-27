/**
 * 문서 검증 — ERD 린터 (05-editor/05-validation.md §2 규칙 카탈로그 원천 구현)
 * 순수 함수: 스토어·네트워크 의존 없이 문서만 받아 같은 결과를 낸다.
 * Error는 무결성 위반이지만 저장을 막지 않는다(시스템 태도) — 진입 차단은 생성 UI 담당.
 */
import type {
  ErdColumn,
  ErdModelData,
  ErdRelationship,
  ErdTable,
} from '@/features/editor/model/content-schema'

export type ValidationCode =
  | 'DUPLICATE_TABLE_NAME'
  | 'DUPLICATE_COLUMN_NAME'
  | 'DUPLICATE_KEY_NAME'
  | 'FK_TYPE_MISMATCH'
  | 'FK_TARGET_NOT_KEY'
  | 'FK_NULLABILITY_MISMATCH'
  | 'ONE_TO_ONE_MISSING_UK'
  | 'COMPOSITE_KEY_DUPLICATE_COLUMN'
  | 'MISSING_PK'
  | 'EMPTY_TABLE'
  | 'FK_MAPPING_EMPTY'
  | 'ORPHAN_TABLE'
  | 'CIRCULAR_REFERENCE'
  | 'NAMING_CONVENTION'
  | 'MISSING_LOGICAL_NAME'
  | 'FK_WITHOUT_INDEX'
  | 'WIDE_TABLE'

export type ValidationLevel = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  level: ValidationLevel
  code: ValidationCode
  /** 관련 테이블 — 캔버스 하이라이트·포커스용 */
  tableId?: string
  /** 컬럼 규칙의 대상 컬럼 — 패널 표기 `테이블.컬럼`용 */
  columnId?: string
  /** 관계 규칙의 대상 관계 */
  relationshipId?: string
}

/** 물리명 식별자 규칙 — 소문자 시작·소문자/숫자/밑줄·63자 상한 (NAMING_CONVENTION) */
export const PHYSICAL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/

/** WIDE_TABLE(info) 임계값 — 이 수를 "초과"하면 보고 */
export const WIDE_TABLE_COLUMN_THRESHOLD = 30

/** 다른 테이블이 이미 같은 물리명을 쓰는지 — 확정(생성) 시점 차단용.
 *  validateModel과 같은 기준: 공백 제거·대소문자 무시. 자기 자신(tableId)은 제외. */
export function isDuplicateTableName(
  model: ErdModelData,
  tableId: string,
  physicalName: string,
): boolean {
  const key = physicalName.trim().toLowerCase()
  return model.tables.some(
    (tb) => tb.id !== tableId && tb.physicalName.trim().toLowerCase() === key,
  )
}

/** 같은 부모→자식 방향의 관계가 이미 있는지 — 중복 관계 생성 차단용.
 *  역방향(자식→부모)은 상호 참조로 별개의 정당한 관계다. FK 매핑이 항상 부모 PK 기준으로
 *  자동 생성되므로 같은 쌍의 두 번째 관계는 항상 같은 매핑이 된다(순수 중복). */
export function isDuplicateRelationship(
  model: ErdModelData,
  parentTableId: string,
  childTableId: string,
): boolean {
  return model.relationships.some(
    (r) => r.parentTableId === parentTableId && r.childTableId === childTableId,
  )
}

/** 두 컬럼의 타입 서명이 같은지 — dataType(대소문자 무시)·length·precision·scale 전부 (FK_TYPE_MISMATCH) */
function sameTypeSignature(a: ErdColumn, b: ErdColumn): boolean {
  return (
    a.dataType.trim().toLowerCase() === b.dataType.trim().toLowerCase() &&
    a.length === b.length &&
    a.precision === b.precision &&
    a.scale === b.scale
  )
}

/** 컬럼 id 배열에 중복이 있는지 (COMPOSITE_KEY_DUPLICATE_COLUMN) */
function hasDuplicateColumn(ids: string[]): boolean {
  return new Set(ids).size !== ids.length
}

/** FK 참조 대상이 부모의 PK 또는 어느 UK와 일치하는지 — 순서 무시·집합 비교 (FK_TARGET_NOT_KEY).
 *  인덱스는 비유니크라 대상이 아니다. */
function fkTargetsAKey(rel: ErdRelationship, parent: ErdTable): boolean {
  const fkColumns = new Set(
    rel.columnMappings.map((m) => m.parentColumnId).filter((id) => parent.columns.some((c) => c.id === id)),
  )
  if (fkColumns.size === 0) return false
  const keySets: Array<Set<string>> = []
  if (parent.primaryKey) keySets.push(new Set(parent.primaryKey.columnIds))
  for (const uk of parent.uniques) keySets.push(new Set(uk.columnIds))
  return keySets.some(
    (key) => key.size === fkColumns.size && [...key].every((id) => fkColumns.has(id)),
  )
}

/** FK 선두 컬럼으로 시작하는 인덱스/PK/UK가 자식에 있는지 (FK_WITHOUT_INDEX — 선두 컬럼 일치) */
function fkLeadingColumnIndexed(rel: ErdRelationship, child: ErdTable): boolean {
  const leading = rel.columnMappings[0]?.childColumnId
  if (!leading) return false
  if (child.primaryKey?.columnIds[0] === leading) return true
  if (child.uniques.some((uk) => uk.columnIds[0] === leading)) return true
  return child.indexes.some((ix) => ix.columns[0]?.columnId === leading)
}

/** 순환 참조에 참여하는 테이블 — 방향 간선(부모→자식) 그래프의 크기 ≥2 SCC.
 *  자기 참조(길이 1 사이클)는 정당한 계층 표현이므로 제외한다. 반복형 Tarjan. */
function tablesInFkCycles(model: ErdModelData): Set<string> {
  const edges = new Map<string, string[]>()
  for (const t of model.tables) edges.set(t.id, [])
  for (const rel of model.relationships) {
    if (rel.parentTableId === rel.childTableId) continue
    edges.get(rel.parentTableId)?.push(rel.childTableId)
  }

  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const inCycle = new Set<string>()
  let counter = 0

  for (const start of edges.keys()) {
    if (index.has(start)) continue
    const work: Array<{ node: string; edgePos: number }> = [{ node: start, edgePos: 0 }]
    while (work.length > 0) {
      const frame = work[work.length - 1]
      if (frame.edgePos === 0) {
        index.set(frame.node, counter)
        low.set(frame.node, counter)
        counter++
        stack.push(frame.node)
        onStack.add(frame.node)
      }
      const neighbors = edges.get(frame.node) ?? []
      if (frame.edgePos < neighbors.length) {
        const next = neighbors[frame.edgePos]
        frame.edgePos += 1
        if (!index.has(next)) {
          work.push({ node: next, edgePos: 0 })
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(next)!))
        }
      } else {
        work.pop()
        if (work.length > 0) {
          const parentFrame = work[work.length - 1]
          low.set(parentFrame.node, Math.min(low.get(parentFrame.node)!, low.get(frame.node)!))
        }
        if (low.get(frame.node) === index.get(frame.node)) {
          const members: string[] = []
          for (;;) {
            const node = stack.pop()!
            onStack.delete(node)
            members.push(node)
            if (node === frame.node) break
          }
          if (members.length > 1) for (const m of members) inCycle.add(m)
        }
      }
    }
  }
  return inCycle
}

export function validateModel(model: ErdModelData): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const tableById = new Map(model.tables.map((t) => [t.id, t] as const))
  const columnOf = (tableId: string, columnId: string): ErdColumn | undefined =>
    tableById.get(tableId)?.columns.find((c) => c.id === columnId)

  // 키 이름 네임스페이스 — PK·UK·인덱스·FK 제약 이름까지 모은다(keys.ts와 같은 규칙).
  // 중복 보고는 UK·인덱스에만 건다 — 그 둘이 이 규칙의 편집 대상이다.
  const keyCounts = new Map<string, number>()
  const bump = (name: string) => {
    const key = name.toLowerCase()
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
  }
  for (const table of model.tables) {
    if (table.primaryKey) bump(table.primaryKey.name)
    for (const unique of table.uniques) bump(unique.name)
    for (const index of table.indexes) bump(index.name)
  }
  for (const rel of model.relationships) bump(rel.fkName)

  const tableNames = new Map<string, number>()
  for (const table of model.tables) {
    const key = table.physicalName.toLowerCase()
    tableNames.set(key, (tableNames.get(key) ?? 0) + 1)
  }

  // 관계 참여 표(ORPHAN_TABLE)·순환 표(CIRCULAR_REFERENCE) — 테이블 루프 전에 한 번 계산
  const relatedTableIds = new Set<string>()
  for (const rel of model.relationships) {
    relatedTableIds.add(rel.parentTableId)
    relatedTableIds.add(rel.childTableId)
  }
  const cycleTableIds = tablesInFkCycles(model)

  for (const table of model.tables) {
    if ((tableNames.get(table.physicalName.toLowerCase()) ?? 0) > 1) {
      issues.push({ level: 'error', code: 'DUPLICATE_TABLE_NAME', tableId: table.id })
    }

    const columnNames = new Map<string, number>()
    for (const column of table.columns) {
      const key = column.physicalName.toLowerCase()
      columnNames.set(key, (columnNames.get(key) ?? 0) + 1)
    }
    for (const column of table.columns) {
      if ((columnNames.get(column.physicalName.toLowerCase()) ?? 0) > 1) {
        issues.push({
          level: 'error',
          code: 'DUPLICATE_COLUMN_NAME',
          tableId: table.id,
          columnId: column.id,
        })
      }
    }

    for (const unique of table.uniques) {
      if ((keyCounts.get(unique.name.toLowerCase()) ?? 0) > 1) {
        issues.push({ level: 'error', code: 'DUPLICATE_KEY_NAME', tableId: table.id })
      }
    }
    for (const index of table.indexes) {
      if ((keyCounts.get(index.name.toLowerCase()) ?? 0) > 1) {
        issues.push({ level: 'error', code: 'DUPLICATE_KEY_NAME', tableId: table.id })
      }
    }

    if (
      (table.primaryKey && hasDuplicateColumn(table.primaryKey.columnIds)) ||
      table.uniques.some((uk) => hasDuplicateColumn(uk.columnIds)) ||
      table.indexes.some((ix) => hasDuplicateColumn(ix.columns.map((c) => c.columnId)))
    ) {
      issues.push({ level: 'error', code: 'COMPOSITE_KEY_DUPLICATE_COLUMN', tableId: table.id })
    }

    if (!table.primaryKey) {
      issues.push({ level: 'warning', code: 'MISSING_PK', tableId: table.id })
    }
    if (table.columns.length === 0) {
      issues.push({ level: 'warning', code: 'EMPTY_TABLE', tableId: table.id })
    }
    if (model.tables.length >= 2 && !relatedTableIds.has(table.id)) {
      issues.push({ level: 'warning', code: 'ORPHAN_TABLE', tableId: table.id })
    }
    if (cycleTableIds.has(table.id)) {
      issues.push({ level: 'warning', code: 'CIRCULAR_REFERENCE', tableId: table.id })
    }
    if (!PHYSICAL_NAME_PATTERN.test(table.physicalName)) {
      issues.push({ level: 'warning', code: 'NAMING_CONVENTION', tableId: table.id })
    }
    if (table.logicalName.trim() === '') {
      issues.push({ level: 'warning', code: 'MISSING_LOGICAL_NAME', tableId: table.id })
    }
    for (const column of table.columns) {
      if (!PHYSICAL_NAME_PATTERN.test(column.physicalName)) {
        issues.push({
          level: 'warning',
          code: 'NAMING_CONVENTION',
          tableId: table.id,
          columnId: column.id,
        })
      }
      if (column.logicalName.trim() === '') {
        issues.push({
          level: 'warning',
          code: 'MISSING_LOGICAL_NAME',
          tableId: table.id,
          columnId: column.id,
        })
      }
    }
    if (table.columns.length > WIDE_TABLE_COLUMN_THRESHOLD) {
      issues.push({ level: 'info', code: 'WIDE_TABLE', tableId: table.id })
    }
  }

  for (const rel of model.relationships) {
    const parent = tableById.get(rel.parentTableId)
    const child = tableById.get(rel.childTableId)
    if (!parent || !child) continue

    if (rel.columnMappings.length === 0) {
      issues.push({
        level: 'warning',
        code: 'FK_MAPPING_EMPTY',
        tableId: child.id,
        relationshipId: rel.id,
      })
      continue
    }

    for (const mapping of rel.columnMappings) {
      const parentColumn = columnOf(parent.id, mapping.parentColumnId)
      const childColumn = columnOf(child.id, mapping.childColumnId)
      if (!parentColumn || !childColumn) continue
      if (!sameTypeSignature(parentColumn, childColumn)) {
        issues.push({
          level: 'error',
          code: 'FK_TYPE_MISMATCH',
          tableId: child.id,
          columnId: childColumn.id,
          relationshipId: rel.id,
        })
      }
    }

    if (!fkTargetsAKey(rel, parent)) {
      issues.push({
        level: 'error',
        code: 'FK_TARGET_NOT_KEY',
        tableId: child.id,
        relationshipId: rel.id,
      })
    }

    // §6.5 동기화 — 부모측 필수(EXACTLY_ONE)면 FK 컬럼 전부 NOT NULL이어야 한다
    if (rel.parentMultiplicity === 'EXACTLY_ONE') {
      const nullableFk = rel.columnMappings
        .map((m) => columnOf(child.id, m.childColumnId))
        .find((c) => c?.nullable)
      if (nullableFk) {
        issues.push({
          level: 'error',
          code: 'FK_NULLABILITY_MISMATCH',
          tableId: child.id,
          columnId: nullableFk.id,
          relationshipId: rel.id,
        })
      }
    }

    // §6.5 동기화 — 비식별 1:1은 FK 컬럼 전체를 포함하는 UK가 규격(자동 생성 대상)
    if (rel.type === 'ONE_TO_ONE' && !rel.identifying) {
      const fkColumns = new Set(
        rel.columnMappings
          .map((m) => m.childColumnId)
          .filter((id) => child.columns.some((c) => c.id === id)),
      )
      const covered = child.uniques.some(
        (uk) => fkColumns.size > 0 && [...fkColumns].every((id) => uk.columnIds.includes(id)),
      )
      if (!covered) {
        issues.push({
          level: 'error',
          code: 'ONE_TO_ONE_MISSING_UK',
          tableId: child.id,
          relationshipId: rel.id,
        })
      }
    }

    if (!fkLeadingColumnIndexed(rel, child)) {
      issues.push({
        level: 'info',
        code: 'FK_WITHOUT_INDEX',
        tableId: child.id,
        // 대상 컬럼(선두 자식 FK 컬럼)을 싣는다 — 매핑 오류가 아니라 "이 컬럼에 인덱스가
        // 없다"는 성능 권고임을 패널 표기(테이블.컬럼)로 바로 읽히게 한다
        columnId: rel.columnMappings[0]?.childColumnId,
        relationshipId: rel.id,
      })
    }
  }
  return issues
}
