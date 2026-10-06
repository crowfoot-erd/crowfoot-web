/**
 * 조회 부하 안내 (09-database-manager/00-data-browser.md §5.11)
 */
import { describe, expect, it } from 'vitest'

import type { ObjectStructure } from '@/features/database/api'
import { indexHints, leadingIndexColumns } from '@/features/database/index-hints'

const structure = (patch: Partial<ObjectStructure> = {}): ObjectStructure => ({
  name: 'orders',
  kind: 'TABLE',
  comment: null,
  editable: true,
  columns: [],
  primaryKey: ['id'],
  indexes: [
    { name: 'uk_orders_no', unique: true, columns: ['order_no'] },
    { name: 'idx_orders_user_status', unique: false, columns: ['user_id', 'status'] },
  ],
  foreignKeys: [],
  ...patch,
})

describe('indexHints', () => {
  it('기본 키·고유 인덱스·인덱스의 첫 컬럼은 안내하지 않는다', () => {
    expect([...leadingIndexColumns(structure())]).toEqual(['id', 'order_no', 'user_id'])
    expect(
      indexHints(
        structure(),
        [
          { column: 'user_id', op: 'EQ', value: '1' },
          { column: 'ORDER_NO', op: 'IN', value: ['a'] },
        ],
        [{ column: 'id', direction: 'DESC' }],
      ),
    ).toEqual({ unindexed: [], pattern: [] })
  })

  it('인덱스의 첫 컬럼이 아닌 정렬·조건 컬럼을 한 번씩 모은다 — 둘째 컬럼도 포함', () => {
    expect(
      indexHints(
        structure(),
        [
          { column: 'status', op: 'EQ', value: 'PAID' },
          { column: 'memo', op: 'IS_NULL' },
        ],
        [{ column: 'memo', direction: 'ASC' }],
      ).unindexed,
    ).toEqual(['memo', 'status'])
  })

  it('포함·시작 조건은 인덱스가 있어도 따로 알린다', () => {
    expect(
      indexHints(
        structure(),
        [
          { column: 'order_no', op: 'CONTAINS', value: '12' },
          { column: 'user_id', op: 'STARTS_WITH', value: '1' },
        ],
        [],
      ),
    ).toEqual({ unindexed: [], pattern: ['order_no', 'user_id'] })
  })

  it('구조를 모르거나 뷰면 안내하지 않는다', () => {
    const filters = [{ column: 'memo', op: 'CONTAINS' as const, value: 'x' }]
    expect(indexHints(undefined, filters, [])).toEqual({ unindexed: [], pattern: [] })
    expect(
      indexHints(structure({ kind: 'VIEW', primaryKey: [], indexes: [] }), filters, []),
    ).toEqual({ unindexed: [], pattern: [] })
  })
})
