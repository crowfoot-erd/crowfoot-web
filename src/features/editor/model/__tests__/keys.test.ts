/**
 * UK·인덱스 이름 규칙 — 문서 전체 유일 네임스페이스·기본 이름·충돌 접미 (05-editor/01-core.md §18)
 */
import { describe, expect, it } from 'vitest'

import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import { defaultKeyName, documentKeyNames } from '@/features/editor/model/keys'
import type { ErdModelData } from '@/features/editor/model/content-schema'

function model(): ErdModelData {
  return structuredClone(emptyContent().model)
}

describe('keys — 문서 키 이름 네임스페이스', () => {
  it('PK·UK·인덱스·FK 제약 이름을 모두 소문자로 모은다', () => {
    const m = model()
    const email = createColumn({ id: 'c-email', physicalName: 'email' })
    m.tables = [
      createTable('orders', {
        id: 'T1',
        columns: [email],
        primaryKey: { name: 'orders_pk', columnIds: ['c-email'] },
        uniques: [{ id: 'u1', name: 'uk_orders_email', columnIds: ['c-email'] }],
      }),
    ]
    m.relationships = [
      {
        id: 'r1',
        name: 'fk_orders_users',
        parentTableId: 'T2',
        childTableId: 'T1',
        type: 'ONE_TO_MANY',
        identifying: false,
        parentMultiplicity: 'ZERO_OR_ONE' as const,
        childMultiplicity: 'ZERO_OR_MORE' as const,
        fkName: 'fk_orders_users',
        columnMappings: [],
        onDelete: 'NO_ACTION',
        onUpdate: 'NO_ACTION',
      },
    ]
    expect(documentKeyNames(m)).toEqual(new Set(['orders_pk', 'uk_orders_email', 'fk_orders_users']))
  })
})

describe('keys — 기본 이름', () => {
  it('uk_/idx_ 접두 + 테이블 + 컬럼 물리명(선택 순서)', () => {
    const m = model()
    const table = createTable('orders', {
      columns: [
        createColumn({ id: 'c1', physicalName: 'email' }),
        createColumn({ id: 'c2', physicalName: 'created_at' }),
      ],
    })
    const email = table.columns[0]
    const createdAt = table.columns[1]
    expect(defaultKeyName(m, table, 'unique', [email, createdAt])).toBe('uk_orders_email_created_at')
    expect(defaultKeyName(m, table, 'index', [createdAt])).toBe('idx_orders_created_at')
  })

  it('문서 내 같은 이름이 있으면 _1 접미로 회피한다 — PK·FK 이름과도 충돌하지 않는다', () => {
    const m = model()
    const table = createTable('orders', {
      columns: [createColumn({ id: 'c1', physicalName: 'email' })],
      primaryKey: { name: 'pk', columnIds: ['c1'] },
    })
    // 다른 테이블이 이미 uk_orders_email을 쓰고 있다
    m.tables = [
      table,
      createTable('orders_archive', {
        columns: [createColumn({ id: 'c9', physicalName: 'email' })],
        uniques: [{ id: 'u1', name: 'uk_orders_email', columnIds: ['c9'] }],
      }),
    ]
    expect(defaultKeyName(m, table, 'unique', [table.columns[0]])).toBe('uk_orders_email_1')
  })
})
