/**
 * 문서 검증 (05-editor/01-core.md §12 — 1차 규칙: 이름 중복 Error·PK 없음 Warning)
 * Error는 저장 확인 대상, Warning은 저장을 막지 않는다.
 */
import type { ErdModelData } from '@/features/editor/model/content-schema'

export type ValidationCode =
  | 'DUPLICATE_TABLE_NAME'
  | 'DUPLICATE_COLUMN_NAME'
  | 'MISSING_PK'
  | 'DUPLICATE_KEY_NAME'

export interface ValidationIssue {
  level: 'error' | 'warning'
  code: ValidationCode
  /** 관련 테이블 — 캔버스 하이라이트용 */
  tableId?: string
}

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

export function validateModel(model: ErdModelData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

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
        issues.push({ level: 'error', code: 'DUPLICATE_COLUMN_NAME', tableId: table.id })
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

    if (!table.primaryKey) {
      issues.push({ level: 'warning', code: 'MISSING_PK', tableId: table.id })
    }
  }
  return issues
}
