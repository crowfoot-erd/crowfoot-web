import { describe, expect, it } from 'vitest'

import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import { isDuplicateRelationship, validateModel } from '@/features/editor/model/validation'
import type { ErdColumnMapping, ErdModelData, ErdRelationship } from '@/features/editor/model/content-schema'

function model(): ErdModelData {
  return { ...emptyContent().model }
}

/** 관계 헬퍼 — 매핑·기수 등 필요한 것만 덮어쓴다 */
function rel(init: Partial<ErdRelationship> = {}): ErdRelationship {
  return {
    id: 'r1',
    name: 'fk',
    parentTableId: 'parent',
    childTableId: 'child',
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'EXACTLY_ONE',
    childMultiplicity: 'ONE_OR_MORE',
    fkName: 'fk_child_parent',
    columnMappings: [],
    onDelete: 'NO_ACTION',
    onUpdate: 'NO_ACTION',
    ...init,
  }
}

const mapping = (parentColumnId: string, childColumnId: string): ErdColumnMapping => ({
  parentColumnId,
  childColumnId,
})

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
    m.tables = [createTable('orders', { logicalName: '주문' })]
    const issues = validateModel(m).filter((i) => i.code === 'MISSING_PK')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'warning', code: 'MISSING_PK', tableId: m.tables[0].id })
  })

  it('정상 문서는 이슈가 없다', () => {
    const m = model()
    const table = createTable('orders', {
      logicalName: '주문',
      columns: [createColumn({ id: 'c1', physicalName: 'id', logicalName: 'ID', length: 20 })],
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
      createTable('users', { columns: [c2], primaryKey: { name: 'users_pk', columnIds: ['c2'] }, indexes: [{ id: 'i1', name: 'UK_EMAIL', columns: [{ columnId: 'c2', order: 'ASC' }], type: 'BTREE', parser: null }] }),
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

describe('validateModel — v1.20 규칙 (05-editor/05-validation.md §2)', () => {
  /** 부모(id PK)→자식(user_id FK) 관계 한 쌍 — 필요한 것만 덮어쓴다 */
  function fkPair(init: {
    parentColumn?: Partial<ReturnType<typeof createColumn>>
    childColumn?: Partial<ReturnType<typeof createColumn>>
    rel?: Partial<ErdRelationship>
  }) {
    const m = model()
    const parent = createTable('users', {
      id: 'parent',
      logicalName: '사용자',
      columns: [createColumn({ id: 'pc1', physicalName: 'id', logicalName: 'ID', dataType: 'BIGINT', nullable: false, ...init.parentColumn })],
      primaryKey: { name: 'users_pk', columnIds: ['pc1'] },
    })
    const child = createTable('orders', {
      id: 'child',
      logicalName: '주문',
      columns: [
        createColumn({ id: 'cc0', physicalName: 'id', logicalName: 'ID', dataType: 'BIGINT', nullable: false }),
        createColumn({ id: 'cc1', physicalName: 'user_id', logicalName: '사용자 ID', dataType: 'BIGINT', nullable: false, ...init.childColumn }),
      ],
      primaryKey: { name: 'orders_pk', columnIds: ['cc0'] },
    })
    m.tables = [parent, child]
    m.relationships = [
      rel({ columnMappings: [mapping('pc1', 'cc1')], fkName: 'fk_orders_user', ...init.rel }),
    ]
    return m
  }

  // ── Error: FK 무결성 ────────────────────────────────────────────────

  it('FK 양쪽 타입 서명이 다르면 FK_TYPE_MISMATCH error다', () => {
    const m = fkPair({ childColumn: { dataType: 'VARCHAR', length: 50 } })
    const issues = validateModel(m).filter((i) => i.code === 'FK_TYPE_MISMATCH')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'error', tableId: 'child', columnId: 'cc1' })
  })

  it('타입이 같고 length까지 같으면 FK_TYPE_MISMATCH가 아니다', () => {
    const m = fkPair({ parentColumn: { dataType: 'VARCHAR', length: 50 }, childColumn: { dataType: 'varchar', length: 50 } })
    expect(validateModel(m).filter((i) => i.code === 'FK_TYPE_MISMATCH')).toHaveLength(0)
  })

  it('FK가 부모의 PK·어느 UK도 지시하지 않으면 FK_TARGET_NOT_KEY error다', () => {
    const m = fkPair({})
    // 매핑을 PK가 아닌 컬럼으로 — 부모에 UK는 없다
    m.relationships[0].columnMappings = [mapping('pc1', 'cc1')]
    m.tables[0].primaryKey = { name: 'users_pk', columnIds: ['pc1'] }
    m.tables[0].columns.push(createColumn({ id: 'pc2', physicalName: 'email', logicalName: '이메일', dataType: 'VARCHAR', length: 100, nullable: true }))
    m.relationships[0].columnMappings = [mapping('pc2', 'cc1')]
    expect(validateModel(m).filter((i) => i.code === 'FK_TARGET_NOT_KEY')).toHaveLength(1)

    // 같은 컬럼이 UK에 있으면 통과
    m.tables[0].uniques = [{ id: 'u1', name: 'uk_users_email', columnIds: ['pc2'] }]
    const cleared = validateModel(m).filter((i) => i.code === 'FK_TARGET_NOT_KEY')
    expect(cleared).toHaveLength(0)
  })

  it('부모 필수 기수(EXACTLY_ONE)인데 FK 컬럼이 nullable이면 FK_NULLABILITY_MISMATCH error다', () => {
    const m = fkPair({ childColumn: { nullable: true } })
    const issues = validateModel(m).filter((i) => i.code === 'FK_NULLABILITY_MISMATCH')
    expect(issues).toHaveLength(1)
    expect(issues[0].level).toBe('error')

    const optional = fkPair({ childColumn: { nullable: true }, rel: { parentMultiplicity: 'ZERO_OR_ONE' } })
    expect(validateModel(optional).filter((i) => i.code === 'FK_NULLABILITY_MISMATCH')).toHaveLength(0)
  })

  it('비식별 1:1인데 FK 전체를 포함하는 UK가 없으면 ONE_TO_ONE_MISSING_UK error다', () => {
    const oneToOne = fkPair({ rel: { type: 'ONE_TO_ONE', childMultiplicity: 'EXACTLY_ONE' } })
    const issues = validateModel(oneToOne).filter((i) => i.code === 'ONE_TO_ONE_MISSING_UK')
    expect(issues).toHaveLength(1)
    expect(issues[0].level).toBe('error')

    oneToOne.tables[1].uniques = [{ id: 'u1', name: 'uk_orders_user', columnIds: ['cc1'] }]
    expect(validateModel(oneToOne).filter((i) => i.code === 'ONE_TO_ONE_MISSING_UK')).toHaveLength(0)

    // 식별 관계는 FK가 자식 PK 성분이라 대상이 아니다
    const identifying = fkPair({ rel: { type: 'ONE_TO_ONE', identifying: true, childMultiplicity: 'EXACTLY_ONE' } })
    expect(validateModel(identifying).filter((i) => i.code === 'ONE_TO_ONE_MISSING_UK')).toHaveLength(0)
  })

  it('복합 키에 같은 컬럼이 2회 있으면 COMPOSITE_KEY_DUPLICATE_COLUMN error다 — PK·UK·인덱스 모두', () => {
    const m = model()
    const t = createTable('orders', {
      logicalName: '주문',
      columns: [
        createColumn({ id: 'c1', physicalName: 'a', logicalName: 'A', nullable: false }),
        createColumn({ id: 'c2', physicalName: 'b', logicalName: 'B', nullable: false }),
      ],
      primaryKey: { name: 'pk', columnIds: ['c1', 'c1'] },
    })
    m.tables = [t]
    expect(validateModel(m).filter((i) => i.code === 'COMPOSITE_KEY_DUPLICATE_COLUMN')).toHaveLength(1)

    t.primaryKey = { name: 'pk', columnIds: ['c1'] }
    t.indexes = [{ id: 'i1', name: 'ix', columns: [{ columnId: 'c2', order: 'ASC' }, { columnId: 'c2', order: 'ASC' }], type: 'BTREE', parser: null }]
    expect(validateModel(m).filter((i) => i.code === 'COMPOSITE_KEY_DUPLICATE_COLUMN')).toHaveLength(1)
  })

  // ── Warning: 품질·관례 ─────────────────────────────────────────────

  it('컬럼이 0개면 EMPTY_TABLE warning이다', () => {
    const m = model()
    m.tables = [createTable('empty', { logicalName: '빈' })]
    const issues = validateModel(m).filter((i) => i.code === 'EMPTY_TABLE')
    expect(issues).toHaveLength(1)
    expect(issues[0].level).toBe('warning')
  })

  it('관계 매핑이 빈 배열이면 FK_MAPPING_EMPTY warning이다', () => {
    const m = fkPair({ rel: { columnMappings: [] } })
    const issues = validateModel(m).filter((i) => i.code === 'FK_MAPPING_EMPTY')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'warning', tableId: 'child' })
  })

  it('어느 관계에도 참여하지 않는 테이블은 ORPHAN_TABLE warning이다 — 1테이블 문서는 제외', () => {
    const m = fkPair({})
    expect(validateModel(m).filter((i) => i.code === 'ORPHAN_TABLE')).toHaveLength(0)

    m.tables.push(createTable('loner', { logicalName: '고립' }))
    const issues = validateModel(m).filter((i) => i.code === 'ORPHAN_TABLE')
    expect(issues).toHaveLength(1)
    expect(issues[0].tableId).toBe(m.tables[2].id)

    const single = model()
    single.tables = [createTable('only', { logicalName: '단일' })]
    expect(validateModel(single).filter((i) => i.code === 'ORPHAN_TABLE')).toHaveLength(0)
  })

  it('FK 순환(A→B→A)에 참여한 테이블만 CIRCULAR_REFERENCE warning이다 — 자기 참조·비순환은 제외', () => {
    const m = fkPair({})
    // parent(users) ← child(orders) 단방향 — 순환 아님
    expect(validateModel(m).filter((i) => i.code === 'CIRCULAR_REFERENCE')).toHaveLength(0)

    // 역방향 관계를 추가해 users↔orders 순환 완성
    m.relationships.push(
      rel({
        id: 'r2',
        name: 'fk2',
        parentTableId: 'child',
        childTableId: 'parent',
        fkName: 'fk_users_order',
        columnMappings: [mapping('cc0', 'pc1')],
      }),
    )
    const issues = validateModel(m).filter((i) => i.code === 'CIRCULAR_REFERENCE')
    expect(issues).toHaveLength(2)
    expect(issues.every((i) => i.level === 'warning')).toBe(true)

    // 자기 참조(길이 1)는 정당한 계층 표현 — 보고하지 않는다
    const self = fkPair({ rel: { parentTableId: 'child', childTableId: 'child', columnMappings: [mapping('cc0', 'cc1')] } })
    expect(validateModel(self).filter((i) => i.code === 'CIRCULAR_REFERENCE')).toHaveLength(0)
  })

  it('물리명이 식별자 규칙을 위반하면 NAMING_CONVENTION warning이다 — 테이블·컬럼 각각', () => {
    const m = model()
    m.tables = [
      createTable('User Orders', {
        logicalName: '주문',
        columns: [createColumn({ id: 'c1', physicalName: 'ID', logicalName: 'ID' })],
      }),
    ]
    const issues = validateModel(m).filter((i) => i.code === 'NAMING_CONVENTION')
    expect(issues).toHaveLength(2) // 테이블 "User Orders" + 컬럼 "ID"(대문자)
    expect(issues.every((i) => i.level === 'warning')).toBe(true)

    const ok = model()
    ok.tables = [
      createTable('user_orders', {
        logicalName: '주문',
        columns: [createColumn({ id: 'c1', physicalName: 'user_id', logicalName: '사용자 ID' })],
      }),
    ]
    expect(validateModel(ok).filter((i) => i.code === 'NAMING_CONVENTION')).toHaveLength(0)
  })

  it('63자를 넘는 물리명도 NAMING_CONVENTION warning이다', () => {
    const m = model()
    m.tables = [createTable('a'.repeat(64), { logicalName: '긴 이름' })]
    expect(validateModel(m).filter((i) => i.code === 'NAMING_CONVENTION')).toHaveLength(1)
  })

  it('논리명이 빈 테이블·컬럼은 MISSING_LOGICAL_NAME warning이다', () => {
    const m = model()
    m.tables = [
      createTable('orders', {
        columns: [createColumn({ id: 'c1', physicalName: 'id', logicalName: '' })],
        primaryKey: { name: 'pk', columnIds: ['c1'] },
      }),
    ]
    const issues = validateModel(m).filter((i) => i.code === 'MISSING_LOGICAL_NAME')
    expect(issues).toHaveLength(2) // 테이블 + c1 컬럼
    expect(issues.some((i) => i.columnId === 'c1')).toBe(true)
  })

  // ── Info: 참고 ─────────────────────────────────────────────────────

  it('FK 선두 컬럼으로 시작하는 인덱스·PK·UK가 없으면 FK_WITHOUT_INDEX info다', () => {
    const m = fkPair({ childColumn: { nullable: false } }) // FK 컬럼 cc1, 자식 PK는 cc0 선두
    const issues = validateModel(m).filter((i) => i.code === 'FK_WITHOUT_INDEX')
    expect(issues).toHaveLength(1)
    expect(issues[0].level).toBe('info')
    // 대상 컬럼(선두 자식 FK 컬럼)을 싣는다 — 패널이 orders.members_id 꼴로 보여주는 재료
    expect(issues[0].columnId).toBe('cc1')

    m.tables[1].indexes = [{ id: 'i1', name: 'ix_orders_user', columns: [{ columnId: 'cc1', order: 'ASC' }], type: 'BTREE', parser: null }]
    expect(validateModel(m).filter((i) => i.code === 'FK_WITHOUT_INDEX')).toHaveLength(0)
  })

  it('MySQL(InnoDB) 문서는 FK_WITHOUT_INDEX를 발화하지 않는다 — DB가 자식 인덱스를 만든다', () => {
    const m = fkPair({ childColumn: { nullable: false } }) // 같은 문서라도 DBMS에 따라 갈린다
    expect(validateModel(m, 'mysql').filter((i) => i.code === 'FK_WITHOUT_INDEX')).toHaveLength(0)
    expect(validateModel(m, 'postgresql').filter((i) => i.code === 'FK_WITHOUT_INDEX')).toHaveLength(1)
  })

  it('컬럼 30개는 통과, 31개부터 WIDE_TABLE info다', () => {
    const columns = Array.from({ length: 30 }, (_, i) =>
      createColumn({ id: `c${i}`, physicalName: `col_${i}`, logicalName: `컬럼 ${i}` }),
    )
    const m = model()
    m.tables = [createTable('wide', { logicalName: '넓음', columns })]
    expect(validateModel(m).filter((i) => i.code === 'WIDE_TABLE')).toHaveLength(0)

    columns.push(createColumn({ id: 'c30', physicalName: 'col_30', logicalName: '컬럼 30' }))
    const issues = validateModel(m).filter((i) => i.code === 'WIDE_TABLE')
    expect(issues).toHaveLength(1)
    expect(issues[0].level).toBe('info')
  })
})
