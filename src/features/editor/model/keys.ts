/**
 * 유니크 키·인덱스 이름 규칙 (05-editor/01-core.md §18)
 *
 * 키 이름은 **문서 전체에서 유일**하다. DBMS마다 제약·인덱스 이름 네임스페이스가
 * 다르지만(MySQL은 테이블 단위, PostgreSQL·Oracle은 스키마 단위) 문서 수준 유일이
 * 어느 쪽에도 안전하다. 네임스페이스는 UK·인덱스끼리만이 아니라 PK·FK 제약 이름까지
 * 포함한다 — DDL 생성 시 같은 스키마에서 충돌하지 않게.
 *
 * 기본 이름: `uk_테이블_컬럼…` / `idx_테이블_컬럼…` 소문자(복합은 선택 순서).
 * 충돌 시 `_1`, `_2` 접미 — FK 컬럼 이름 규칙(relationship.ts)과 같은 방식.
 */
import type { ErdColumn, ErdModelData, ErdTable } from '@/features/editor/model/content-schema'

export type KeyKind = 'unique' | 'index'

/** 문서 전체 키 이름 집합(소문자) — 자동 이름 충돌 회피·중복 검증이 같은 집합을 쓴다 */
export function documentKeyNames(model: ErdModelData): Set<string> {
  const names = new Set<string>()
  for (const table of model.tables) {
    if (table.primaryKey) names.add(table.primaryKey.name.toLowerCase())
    for (const unique of table.uniques) names.add(unique.name.toLowerCase())
    for (const index of table.indexes) names.add(index.name.toLowerCase())
  }
  for (const rel of model.relationships) names.add(rel.fkName.toLowerCase())
  return names
}

/** 충돌 회피 접미 — base가 있으면 `_1`, `_2`… */
function nextName(existing: ReadonlySet<string>, base: string): string {
  if (!existing.has(base)) return base
  for (let i = 1; ; i += 1) {
    const candidate = `${base}_${i}`
    if (!existing.has(candidate)) return candidate
  }
}

/** 기본 키 이름 — kind 접두(uk/idx) + 테이블 물리명 + 컬럼 물리명들(선택 순서), 문서 내 유일 보장 */
export function defaultKeyName(
  model: ErdModelData,
  table: ErdTable,
  kind: KeyKind,
  columns: ErdColumn[],
): string {
  const parts = [
    kind === 'unique' ? 'uk' : 'idx',
    table.physicalName.toLowerCase() || 'table',
    ...columns.map((column) => column.physicalName.toLowerCase() || 'column'),
  ]
  return nextName(documentKeyNames(model), parts.join('_'))
}
