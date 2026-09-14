import { describe, expect, it } from 'vitest'

import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import { isDuplicateRelationship, validateModel } from '@/features/editor/model/validation'
import type { ErdModelData } from '@/features/editor/model/content-schema'

function model(): ErdModelData {
  return { ...emptyContent().model }
}

describe('validateModel — 1차 규칙', () => {
  it('테이블 물리명 중복은 error다', () => {
    const m = model()
    m.tables = [createTable('orders'), createTable('orders')]
    const issues = validateModel(m)
    expect(issues.filter((i) => i.code === 'DUPLICATE_TABLE_NAME')).toHaveLength(2)
    expect(issues[0].level).toBe('error')
  })

  it('테이블 내 컬럼 물리명 중복은 error다', () => {
    const m = model()
    const table = createTable('orders', {
      columns: [
        createColumn({ physicalName: 'name' }),
        createColumn({ physicalName: 'NAME' }), // 대소문자 무시 중복
      ],
      primaryKey: { name: 'pk', columnIds: [] },
    })
    m.tables = [table]
    const issues = validateModel(m)
    expect(issues.filter((i) => i.code === 'DUPLICATE_COLUMN_NAME')).toHaveLength(2)
  })

  it('PK 없는 테이블은 warning이다 — 저장을 막지 않는다', () => {
    const m = model()
    m.tables = [createTable('orders')]
    const issues = validateModel(m)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'warning', code: 'MISSING_PK', tableId: m.tables[0].id })
  })

  it('정상 문서는 이슈가 없다', () => {
    const m = model()
    const table = createTable('orders', {
      columns: [createColumn({ id: 'c1', physicalName: 'id' })],
      primaryKey: { name: 'orders_pk', columnIds: ['c1'] },
      uniques: [{ id: 'u1', name: 'uk_orders_id', columnIds: ['c1'] }],
    })
    m.tables = [table]
    expect(validateModel(m)).toEqual([])
  })

  it('UK·인덱스 이름이 문서 내(다른 테이블 포함)에서 중복이면 error다', () => {
    const m = model()
    const c1 = createColumn({ id: 'c1', physicalName: 'email' })
    const c2 = createColumn({ id: 'c2', physicalName: 'email' })
    m.tables = [
      createTable('orders', { columns: [c1], primaryKey: { name: 'orders_pk', columnIds: ['c1'] }, uniques: [{ id: 'u1', name: 'uk_email', columnIds: ['c1'] }] }),
      createTable('users', { columns: [c2], primaryKey: { name: 'users_pk', columnIds: ['c2'] }, indexes: [{ id: 'i1', name: 'UK_EMAIL', columns: [{ columnId: 'c2', order: 'ASC' }] }] }),
    ]
    const issues = validateModel(m).filter((i) => i.code === 'DUPLICATE_KEY_NAME')
    expect(issues).toHaveLength(2)
    expect(issues.every((i) => i.level === 'error')).toBe(true)
  })

  it('키 이름이 PK·FK 이름과 겹쳐도 error다 — DDL 생성 시 같은 네임스페이스', () => {
    const m = model()
    const c1 = createColumn({ id: 'c1', physicalName: 'email' })
    m.tables = [
      createTable('orders', { columns: [c1], primaryKey: { name: 'pk_shared', columnIds: ['c1'] }, uniques: [{ id: 'u1', name: 'pk_shared', columnIds: ['c1'] }] }),
    ]
    expect(validateModel(m).filter((i) => i.code === 'DUPLICATE_KEY_NAME')).toHaveLength(1)
  })
})

describe('isDuplicateRelationship — 중복 관계 생성 차단', () => {
  const rel = (parentTableId: string, childTableId: string) => ({
    id: `r-${parentTableId}-${childTableId}`,
    name: 'fk',
    parentTableId,
    childTableId,
    type: 'ONE_TO_MANY' as const,
    identifying: false,
    parentMultiplicity: 'EXACTLY_ONE' as const,
    childMultiplicity: 'ONE_OR_MORE' as const,
    fkName: 'fk',
    columnMappings: [],
    onDelete: 'NO_ACTION' as const,
    onUpdate: 'NO_ACTION' as const,
  })

  it('같은 부모→자식 방향이면 중복, 역방향·다른 테이블은 허용한다', () => {
    const m = model()
    m.relationships = [rel('A', 'B')]
    expect(isDuplicateRelationship(m, 'A', 'B')).toBe(true) // 동일 방향 → 차단
    expect(isDuplicateRelationship(m, 'B', 'A')).toBe(false) // 역방향(상호 참조) → 별개 관계
    expect(isDuplicateRelationship(m, 'A', 'C')).toBe(false)
    expect(isDuplicateRelationship(m, 'C', 'B')).toBe(false)
  })

  it('관계가 없으면 중복이 아니다', () => {
    expect(isDuplicateRelationship(model(), 'A', 'B')).toBe(false)
  })
})
