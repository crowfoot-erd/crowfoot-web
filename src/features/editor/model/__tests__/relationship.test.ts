import { describe, expect, it } from 'vitest'

import { createColumn, createTable } from '@/features/editor/model/changes'
import { buildRelationship, primaryKeyColumns } from '@/features/editor/model/relationship'

function parentTable() {
  const table = createTable('USERS', { id: 'PARENT' })
  table.columns = [
    createColumn({ id: 'pc-1', physicalName: 'ID', dataType: 'BIGINT', length: null }),
    createColumn({ id: 'pc-2', physicalName: 'EMAIL', dataType: 'VARCHAR', length: 255 }),
  ]
  table.primaryKey = { name: 'users_pk', columnIds: ['pc-1', 'pc-2'] } // 복합 PK
  return table
}

function childTable() {
  const table = createTable('ORDERS', { id: 'CHILD' })
  table.columns = [createColumn({ id: 'cc-1', physicalName: 'users_id', dataType: 'INT' })] // 이름 충돌 유도
  return table
}

describe('buildRelationship', () => {
  it('부모 PK별 FK 컬럼을 `{부모테이블}_{컬럼}` 소문자로 생성하고 타입·길이를 복사한다', () => {
    const result = buildRelationship({
      parentTable: parentTable(),
      childTable: createTable('ORDERS', { id: 'CHILD2' }),
      type: 'ONE_TO_MANY',
      identifying: false,
      parentMultiplicity: 'ZERO_OR_ONE' as const, // 부모 선택(0 또는 1) → FK nullable
      childMultiplicity: 'ONE_OR_MORE' as const,
    })
    if (!result.ok) throw new Error('unreachable')

    expect(result.fkColumns.map((c) => c.physicalName)).toEqual(['users_id', 'users_email'])
    expect(result.fkColumns[0]).toMatchObject({ dataType: 'BIGINT', length: null })
    expect(result.fkColumns[1]).toMatchObject({ dataType: 'VARCHAR', length: 255 })
    expect(result.fkColumns.every((c) => c.nullable)).toBe(true) // 비식별 + 부모 선택 → nullable
    expect(result.relationship.columnMappings).toEqual([
      { parentColumnId: 'pc-1', childColumnId: result.fkColumns[0].id },
      { parentColumnId: 'pc-2', childColumnId: result.fkColumns[1].id },
    ])
    expect(result.relationship.name).toBe('fk_orders_users')
  })

  it('부모가 필수(정확히 1)면 비식별 FK도 NOT NULL이 된다 — 선택성이 제약으로 내려간다', () => {
    const result = buildRelationship({
      parentTable: parentTable(),
      childTable: createTable('ORDERS', { id: 'CHILD5' }),
      type: 'ONE_TO_MANY',
      identifying: false,
      parentMultiplicity: 'EXACTLY_ONE' as const,
      childMultiplicity: 'ONE_OR_MORE' as const,
    })
    if (!result.ok) throw new Error('unreachable')
    expect(result.fkColumns.every((c) => !c.nullable)).toBe(true)
  })

  it('자식에 같은 물리명이 있으면 `_1` 접미로 회피한다', () => {
    const result = buildRelationship({
      parentTable: parentTable(),
      childTable: childTable(), // 이미 users_id 보유
      type: 'ONE_TO_MANY',
      identifying: false,
      parentMultiplicity: 'EXACTLY_ONE' as const,
      childMultiplicity: 'ONE_OR_MORE' as const,
    })
    if (!result.ok) throw new Error('unreachable')
    expect(result.fkColumns[0].physicalName).toBe('users_id_1')
  })

  it('식별 관계면 FK 컬럼이 NOT NULL이 된다', () => {
    const result = buildRelationship({
      parentTable: parentTable(),
      childTable: createTable('ORDERS', { id: 'CHILD3' }),
      type: 'ONE_TO_ONE',
      identifying: true,
      parentMultiplicity: 'EXACTLY_ONE' as const,
      childMultiplicity: 'EXACTLY_ONE' as const,
    })
    if (!result.ok) throw new Error('unreachable')
    expect(result.fkColumns.every((c) => !c.nullable)).toBe(true)
  })

  it('부모에 PK가 없으면 생성을 거부한다', () => {
    const noPk = parentTable()
    noPk.primaryKey = null
    const result = buildRelationship({
      parentTable: noPk,
      childTable: createTable('ORDERS', { id: 'CHILD4' }),
      type: 'ONE_TO_MANY',
      identifying: false,
      parentMultiplicity: 'EXACTLY_ONE' as const,
      childMultiplicity: 'ONE_OR_MORE' as const,
    })
    expect(result).toEqual({ ok: false, reason: 'PARENT_HAS_NO_PK' })
  })
})

describe('primaryKeyColumns', () => {
  it('PK 정의 순서대로 컬럼을 반환한다 — 존재하지 않는 id는 건너뛴다', () => {
    const columns = primaryKeyColumns(parentTable())
    expect(columns.map((c) => c.id)).toEqual(['pc-1', 'pc-2'])

    const dangling = parentTable()
    dangling.primaryKey = { name: 'x', columnIds: ['pc-2', 'gone'] }
    expect(primaryKeyColumns(dangling).map((c) => c.id)).toEqual(['pc-2'])
  })
})
