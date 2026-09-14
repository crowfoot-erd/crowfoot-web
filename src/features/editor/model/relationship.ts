/**
 * 관계 생성 빌더 — 부모 PK 기반 FK 자동 생성 (05-editor/01-core.md §5~6, storyboard 02-user §5A)
 *
 * FK 컬럼 이름 규칙: `{부모물리테이블명}_{부모물리컬럼명}` 소문자.
 * 자식 테이블에 같은 물리명이 있으면 `_1`, `_2`… 접미. 타입·길이는 부모 컬럼을 복사하고
 * nullable은 부모 기수를 따른다 — 정확히 1(|)이면 NOT NULL, 0 또는 1(○|)이면 nullable.
 * 식별 관계는 FK가 자식 PK에 포함되므로 항상 NOT NULL.
 */
import { createColumn, newId } from '@/features/editor/model/changes'
import {
  coerceChildMultiplicity,
  type ErdColumn,
  type ErdRelationship,
  type ErdTable,
  type Multiplicity,
  type ReferentialAction,
  type RelationshipType,
} from '@/features/editor/model/content-schema'

export interface BuildRelationshipInput {
  parentTable: ErdTable
  childTable: ErdTable
  type: RelationshipType
  identifying: boolean
  parentMultiplicity: Multiplicity
  childMultiplicity: Multiplicity
  fkName?: string
  onDelete?: ReferentialAction
  onUpdate?: ReferentialAction
}

export type BuildRelationshipResult =
  | { ok: true; relationship: ErdRelationship; fkColumns: ErdColumn[] }
  | { ok: false; reason: 'PARENT_HAS_NO_PK' }

/** 부모 PK 컬럼 목록 — 매핑 순서 = PK 정의 순서 */
export function primaryKeyColumns(table: ErdTable): ErdColumn[] {
  if (!table.primaryKey) return []
  const byId = new Map(table.columns.map((c) => [c.id, c]))
  return table.primaryKey.columnIds.map((id) => byId.get(id)).filter((c): c is ErdColumn => c !== undefined)
}

/** 물리명 충돌 회피 — base 이름이 있으면 `_1`, `_2`… */
function uniqueColumnName(existing: Set<string>, base: string): string {
  if (!existing.has(base)) return base
  for (let i = 1; ; i += 1) {
    const candidate = `${base}_${i}`
    if (!existing.has(candidate)) return candidate
  }
}

export function buildRelationship(input: BuildRelationshipInput): BuildRelationshipResult {
  const parentPk = primaryKeyColumns(input.parentTable)
  if (parentPk.length === 0) return { ok: false, reason: 'PARENT_HAS_NO_PK' }
  // 자식 기수는 유형별 유효값으로 보정 — 잘못 짝 지은 입력이 그대로 저장되지 않게
  const childMultiplicity = coerceChildMultiplicity(input.type, input.childMultiplicity)

  const parentName = input.parentTable.physicalName.toLowerCase()
  const childName = input.childTable.physicalName.toLowerCase()
  const existing = new Set(input.childTable.columns.map((c) => c.physicalName.toLowerCase()))

  const fkColumns: ErdColumn[] = parentPk.map((parentColumn) => {
    const base = `${parentName}_${parentColumn.physicalName.toLowerCase()}`
    const physicalName = uniqueColumnName(existing, base)
    existing.add(physicalName)
    return createColumn({
      physicalName,
      logicalName: parentColumn.logicalName,
      dataType: parentColumn.dataType,
      length: parentColumn.length,
      precision: parentColumn.precision,
      scale: parentColumn.scale,
      // 식별 관계는 자식 PK에 포함 → NOT NULL. 비식별은 부모 선택성을 따른다(필수=NOT NULL)
      nullable: !input.identifying && input.parentMultiplicity === 'ZERO_OR_ONE',
      autoIncrement: false,
    })
  })

  const relationship: ErdRelationship = {
    id: newId(),
    name: `fk_${childName}_${parentName}`,
    parentTableId: input.parentTable.id,
    childTableId: input.childTable.id,
    type: input.type,
    identifying: input.identifying,
    parentMultiplicity: input.parentMultiplicity,
    childMultiplicity,
    fkName: input.fkName ?? `fk_${childName}_${parentName}`,
    columnMappings: parentPk.map((parentColumn, i) => ({
      parentColumnId: parentColumn.id,
      childColumnId: fkColumns[i].id,
    })),
    onDelete: input.onDelete ?? 'NO_ACTION',
    onUpdate: input.onUpdate ?? 'NO_ACTION',
  }
  return { ok: true, relationship, fkColumns }
}
