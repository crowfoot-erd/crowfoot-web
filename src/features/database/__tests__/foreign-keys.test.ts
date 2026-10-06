import { describe, expect, it } from 'vitest'

import type { CellValue, ColumnMeta } from '@/features/database/api'
import { childTarget, foreignKeyByColumn, parentTarget } from '@/features/database/foreign-keys'

const col = (name: string): ColumnMeta => ({
  name,
  typeName: 'BIGINT',
  category: 'integer',
  nullable: true,
  primaryKey: false,
})

describe('외래 키 따라가기 (09-database-manager/00-data-browser.md §5.9)', () => {
  const columns = [col('id'), col('tenant_id'), col('user_id')]
  const composite = {
    name: 'fk_c',
    columns: ['tenant_id', 'user_id'],
    referencedObject: 'users',
    referencedColumns: ['tenant_id', 'id'],
  }

  it('복합 외래 키는 모든 컬럼을 같음 조건으로 건다 — 컬럼 이름은 대소문자를 가리지 않는다', () => {
    expect(foreignKeyByColumn([composite]).get('user_id')).toBe(composite)
    expect(
      parentTarget(composite, [col('ID'), col('TENANT_ID'), col('USER_ID')], ['1', '7', '42']),
    ).toEqual({
      object: 'users',
      filters: [
        { column: 'tenant_id', op: 'EQ', value: '7' },
        { column: 'id', op: 'EQ', value: '42' },
      ],
    })
  })

  it('값 하나라도 NULL·잘림·이진이면 따라가지 않는다', () => {
    const truncated: CellValue = { truncated: true, text: '4', length: 9000 }
    expect(parentTarget(composite, columns, ['1', null, '42'])).toBeNull()
    expect(parentTarget(composite, columns, ['1', truncated, '42'])).toBeNull()
  })

  it('자식으로 — 참조하는 테이블을 이 행의 참조 컬럼 값으로 거른다', () => {
    const reference = {
      name: 'fk_orders_user',
      object: 'orders',
      columns: ['user_id'],
      referencedColumns: ['id'],
    }
    expect(childTarget(reference, columns, ['9', '7', '42'])).toEqual({
      object: 'orders',
      filters: [{ column: 'user_id', op: 'EQ', value: '9' }],
    })
  })
})
