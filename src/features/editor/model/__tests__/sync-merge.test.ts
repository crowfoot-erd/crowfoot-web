/**
 * DB 동기화 차분 — 보존 규칙·단계 순서·멱등성 (05-editor/04-dbms-engineering.md §3.3)
 *
 * db 문서는 서버가 새로 조립한 것이라 객체 id가 문서와 전혀 다르다 — 매칭이 물리명 기준임을
 * 전제로 id를 전부 다르게 준다. 핵심 불변식은 고정점: 적용 결과를 다시 diff하면 빈 diff가 나온다.
 */
import { describe, expect, it } from 'vitest'

import { applyChanges, createColumn, createTable } from '@/features/editor/model/changes'
import type {
  ErdColumn,
  ErdNote,
  ErdRelationship,
  ErdTable,
  EditorDocument,
} from '@/features/editor/model/content-schema'
import { diffSync } from '@/features/editor/model/sync-merge'

/* ---------- 빌더 ---------- */

const col = (id: string, physicalName: string, init: Partial<ErdColumn> = {}): ErdColumn =>
  createColumn({ id, physicalName, ...init })

/** DB 측 컬럼 — 조립 규칙(ReverseContentAssembler)대로 코멘트가 없으면 논리명=물리명 */
const dbCol = (id: string, physicalName: string, init: Partial<ErdColumn> = {}): ErdColumn =>
  createColumn({ id, physicalName, logicalName: physicalName, ...init })

function makeDoc(
  tables: ErdTable[],
  relationships: ErdRelationship[] = [],
  diagram: {
    nodes?: EditorDocument['diagram']['nodes']
    notes?: ErdNote[]
    areas?: EditorDocument['diagram']['areas']
  } = {},
): EditorDocument {
  return {
    model: { tables, relationships },
    diagram: { nodes: diagram.nodes ?? {}, notes: diagram.notes ?? [], areas: diagram.areas ?? [], viewport: null },
  }
}

function makeRel(parentTableId: string, childTableId: string, init: Partial<ErdRelationship> = {}): ErdRelationship {
  return {
    id: 'r1',
    name: 'fk',
    parentTableId,
    childTableId,
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'ZERO_OR_ONE',
    childMultiplicity: 'ZERO_OR_MORE',
    fkName: 'fk',
    columnMappings: [],
    onDelete: 'NO_ACTION',
    onUpdate: 'NO_ACTION',
    ...init,
  }
}

/* ---------- 현재 문서 픽스처 ---------- */

function curUsers(): ErdTable {
  return createTable('users', {
    id: 't-users',
    columns: [col('t-c-users-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true })],
    primaryKey: { name: 'users_pkey', columnIds: ['t-c-users-id'] },
  })
}

function curOrders(): ErdTable {
  return createTable('orders', {
    id: 't-orders',
    comment: '팀 공유 메모',
    columns: [
      col('t-c-orders-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true }),
      col('t-c-orders-user-id', 'user_id', { dataType: 'BIGINT', nullable: true, logicalName: '주문자' }),
      col('t-c-orders-status', 'status', { dataType: 'VARCHAR', length: 20, nullable: false, defaultValue: '' }),
      col('t-c-orders-memo', 'memo', { dataType: 'VARCHAR', length: 100, nullable: true, comment: '내부 메모' }),
    ],
    primaryKey: { name: 'orders_pkey', columnIds: ['t-c-orders-id'] },
  })
}

function curRelOrdersUsers(init: Partial<ErdRelationship> = {}): ErdRelationship {
  return makeRel('t-users', 't-orders', {
    id: 'r-orders-users',
    name: 'fk_orders_users',
    fkName: 'fk_orders_users',
    columnMappings: [{ parentColumnId: 't-c-users-id', childColumnId: 't-c-orders-user-id' }],
    ...init,
  })
}

/* ---------- DB 문서 픽스처(서버 조립 — id 전부 다름) ---------- */

function dbUsers(): ErdTable {
  return createTable('users', {
    id: 'db-t-users',
    logicalName: 'users',
    columns: [dbCol('db-c-users-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true })],
    primaryKey: { name: 'users_pkey', columnIds: ['db-c-users-id'] },
  })
}

function dbOrders(): ErdTable {
  return createTable('orders', {
    id: 'db-t-orders',
    logicalName: 'orders',
    columns: [
      dbCol('db-c-orders-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true }),
      dbCol('db-c-orders-user-id', 'user_id', { dataType: 'BIGINT', nullable: true }),
      dbCol('db-c-orders-status', 'status', { dataType: 'VARCHAR', length: 20, nullable: false }),
      dbCol('db-c-orders-memo', 'memo', { dataType: 'VARCHAR', length: 100, nullable: true }),
    ],
    primaryKey: { name: 'orders_pkey', columnIds: ['db-c-orders-id'] },
  })
}

function dbRelOrdersUsers(init: Partial<ErdRelationship> = {}): ErdRelationship {
  return makeRel('db-t-users', 'db-t-orders', {
    id: 'db-r-orders-users',
    name: 'fk_orders_users',
    fkName: 'fk_orders_users',
    columnMappings: [{ parentColumnId: 'db-c-users-id', childColumnId: 'db-c-orders-user-id' }],
    ...init,
  })
}

describe('diffSync — 보존 규칙', () => {
  it('색상·위치·폭·메모 노트·테이블/컬럼 comment는 어떤 동기화에도 불변이다', () => {
    const cur = makeDoc([curOrders()], [], {
      nodes: { 't-orders': { x: 111, y: 222, width: 260, color: 'sky' } },
      notes: [
        { id: 'n1', x: 10, y: 20, width: 180, text: '배포 전 확인', title: '', color: 'yellow', linkedTableId: 't-orders' },
      ],
    })
    // DB — amount 정밀도가 달라졌다(패치 유발)
    const db = dbOrders()
    db.columns = db.columns.map((c) => (c.physicalName === 'memo' ? c : c))
    const amount = dbCol('db-c-orders-amount', 'amount', { dataType: 'DECIMAL', precision: 12, scale: 2, nullable: false })
    db.columns = [...db.columns, amount]
    const curWithAmount = structuredClone(cur)
    curWithAmount.model.tables[0]!.columns.push(
      col('t-c-orders-amount', 'amount', { dataType: 'DECIMAL', precision: 10, scale: 2, nullable: false }),
    )

    const { changes } = diffSync(curWithAmount, makeDoc([db]))
    const next = applyChanges(curWithAmount, changes)

    expect(next.diagram.nodes['t-orders']).toEqual({ x: 111, y: 222, width: 260, color: 'sky' })
    expect(next.diagram.notes).toHaveLength(1)
    expect(next.model.tables[0]!.comment).toBe('팀 공유 메모')
    expect(next.model.tables[0]!.columns.find((c) => c.physicalName === 'memo')!.comment).toBe('내부 메모')
    expect(next.model.tables[0]!.columns.find((c) => c.physicalName === 'amount')!.precision).toBe(12)
  })

  it('db 조립 다이어그램(그리드 좌표·색상)은 무시한다 — 문서 레이아웃이 우선', () => {
    const cur = makeDoc([curUsers()], [], { nodes: { 't-users': { x: 5, y: 6, width: null, color: 'red' } } })
    const db = makeDoc([dbUsers()])
    db.diagram.nodes['db-t-users'] = { x: 9999, y: 9999, width: 400, color: 'pink' }

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)
    expect(next.diagram.nodes['t-users']).toEqual({ x: 5, y: 6, width: null, color: 'red' })
  })

  it('논리명 — DB 코멘트(db 논리명≠물리명)가 있으면 덮어쓴다', () => {
    const cur = makeDoc([curUsers()])
    const dbTable = dbUsers()
    dbTable.columns[0]!.logicalName = '사용자 식별자'
    const db = makeDoc([dbTable])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)
    expect(next.model.tables[0]!.columns[0]!.logicalName).toBe('사용자 식별자')
  })

  it('논리명 — DB 코멘트가 없으면(db 논리명=물리명) 문서 값을 보존한다', () => {
    const cur = curUsers()
    cur.columns[0]!.logicalName = '내가 정한 이름'
    const doc = makeDoc([cur])
    const db = makeDoc([dbUsers()]) // logicalName === 'id' (코멘트 없음)

    const { changes } = diffSync(doc, db)
    const next = applyChanges(doc, changes)
    expect(next.model.tables[0]!.columns[0]!.logicalName).toBe('내가 정한 이름')
  })

  it('FK가 사라져 cascade로 지워졌다 재추가되는 컬럼의 문서 논리명·comment를 이어받는다', () => {
    const cur = makeDoc([curUsers(), curOrders()], [curRelOrdersUsers()])
    const db = makeDoc([dbUsers(), dbOrders()]) // 관계 없음 — user_id는 일반 컬럼로 존재

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)

    expect(next.model.relationships).toHaveLength(0)
    const user_id = next.model.tables.find((t) => t.physicalName === 'orders')!.columns.find((c) => c.physicalName === 'user_id')
    expect(user_id).toBeDefined()
    expect(user_id!.logicalName).toBe('주문자')
  })
})

describe('diffSync — 컬럼', () => {
  it('추가 — DB 신규 컬럼을 끝에 붙인다', () => {
    const cur = makeDoc([curUsers()])
    const dbTable = dbUsers()
    dbTable.columns.push(dbCol('db-c-users-email', 'email', { dataType: 'VARCHAR', length: 100, nullable: false }))
    const db = makeDoc([dbTable])

    const { changes, summary } = diffSync(cur, db)
    const next = applyChanges(cur, changes)

    expect(next.model.tables[0]!.columns.map((c) => c.physicalName)).toEqual(['id', 'email'])
    expect(summary.items).toContainEqual(
      expect.objectContaining({ kind: 'column', action: 'add', name: 'email' }),
    )
  })

  it('제거 — DB에 없는 문서 전용 컬럼을 지운다', () => {
    const cur = makeDoc([curOrders()])
    const dbTable = dbOrders()
    dbTable.columns = dbTable.columns.filter((c) => c.physicalName !== 'memo')
    const db = makeDoc([dbTable])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)
    expect(next.model.tables[0]!.columns.map((c) => c.physicalName)).not.toContain('memo')
  })

  it('패치 — dataType·length·nullable·defaultValue 차이만 반영한다', () => {
    const cur = makeDoc([curOrders()])
    const dbTable = dbOrders()
    dbTable.columns = dbTable.columns.map((c) => {
      if (c.physicalName === 'status') return { ...c, length: 50, defaultValue: '0' }
      return c
    })
    const db = makeDoc([dbTable])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)
    const status = next.model.tables[0]!.columns.find((c) => c.physicalName === 'status')!
    expect(status.length).toBe(50)
    expect(status.defaultValue).toBe('0')
    // id·memo 등 차이 없는 컬럼은 패치되지 않는다
    const patched = changes.filter((c) => c.type === 'column/patch')
    expect(patched).toHaveLength(1)
  })

  it("defaultValue — ''≡null 정규화로 드리프트 패치를 내지 않는다", () => {
    const cur = makeDoc([curOrders()]) // status defaultValue ''
    const db = makeDoc([dbOrders()]) // status defaultValue null

    const { changes } = diffSync(cur, db)
    expect(changes.filter((c) => c.type === 'column/patch')).toHaveLength(0)
  })
})

describe('diffSync — PK·UK', () => {
  it('PK 구성 변화를 반영하고 신규 PK 컬럼을 PK 존으로 옮긴다', () => {
    const cur = makeDoc([curUsers()])
    const dbTable = dbUsers()
    dbTable.columns.push(dbCol('db-c-users-tenant', 'tenant_id', { dataType: 'BIGINT', nullable: false }))
    dbTable.primaryKey = { name: 'users_pkey', columnIds: ['db-c-users-id', 'db-c-users-tenant'] }
    const db = makeDoc([dbTable])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)

    const users = next.model.tables[0]!
    expect(users.primaryKey!.columnIds).toHaveLength(2)
    expect(users.columns.map((c) => c.physicalName)).toEqual(['id', 'tenant_id'])
  })

  it('DB에 PK가 없으면 문서 PK를 제거한다', () => {
    const cur = makeDoc([curUsers()])
    const dbTable = dbUsers()
    dbTable.primaryKey = null
    const db = makeDoc([dbTable])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)
    expect(next.model.tables[0]!.primaryKey).toBeNull()
  })

  it('UK는 DB 우선 전체 교체 — 문서 전용 UK는 사라진다(v1 정책)', () => {
    const cur = curOrders()
    cur.uniques = [{ id: 'u-doc', name: 'uk_orders_status', columnIds: ['t-c-orders-status'] }]
    const db = dbOrders()
    db.uniques = [{ id: 'db-u', name: 'uk_orders_user', columnIds: ['db-c-orders-user-id'] }]

    const { changes } = diffSync(makeDoc([cur]), makeDoc([db]))
    const next = applyChanges(makeDoc([cur]), changes)

    const orders = next.model.tables[0]!
    expect(orders.uniques.map((u) => u.name)).toEqual(['uk_orders_user'])
    expect(orders.uniques[0]!.columnIds).toEqual(['t-c-orders-user-id'])
  })
})

describe('diffSync — 테이블', () => {
  it('추가 — 콘텐츠 우측에 배치하고 키 이름 충돌을 회피한다', () => {
    const cur = makeDoc([curUsers()], [], { nodes: { 't-users': { x: 100, y: 50, width: null, color: 'default' } } })
    const db = dbUsers()
    const payments = createTable('payments', {
      id: 'db-t-payments',
      logicalName: 'payments',
      columns: [dbCol('db-c-payments-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true })],
      // 문서 users PK와 같은 이름 — 문서 전체 키 네임스페이스에서 접미로 피한다
      primaryKey: { name: 'users_pkey', columnIds: ['db-c-payments-id'] },
    })

    const { changes } = diffSync(cur, makeDoc([db, payments]))
    const next = applyChanges(cur, changes)

    const created = next.model.tables.find((t) => t.physicalName === 'payments')!
    expect(created.primaryKey!.name).toBe('users_pkey_1')
    const node = next.diagram.nodes[created.id]!
    expect(node.x).toBeGreaterThan(200) // 기존 콘텐츠 우측
    expect(node.y).toBe(80)
  })

  it('제거 — cascade로 관계·피어 FK 컬럼·노드를 정리하고 메모는 연관 해제로 남는다', () => {
    const logs = createTable('logs', {
      id: 't-logs',
      columns: [
        col('t-c-logs-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true }),
        col('t-c-logs-user-id', 'user_id', { dataType: 'BIGINT', nullable: true }),
      ],
      primaryKey: { name: 'logs_pkey', columnIds: ['t-c-logs-id'] },
    })
    const rel = makeRel('t-users', 't-logs', {
      id: 'r-logs-users',
      fkName: 'fk_logs_users',
      columnMappings: [{ parentColumnId: 't-c-users-id', childColumnId: 't-c-logs-user-id' }],
    })
    const cur = makeDoc([curUsers(), logs], [rel], {
      nodes: {
        't-users': { x: 0, y: 0, width: null, color: 'default' },
        't-logs': { x: 0, y: 400, width: null, color: 'green' },
      },
      notes: [{ id: 'n-logs', x: 5, y: 5, width: 160, text: '로그', title: '', color: 'blue', linkedTableId: 't-logs' }],
    })

    const { changes } = diffSync(cur, makeDoc([dbUsers()]))
    const next = applyChanges(cur, changes)

    expect(next.model.tables.map((t) => t.physicalName)).toEqual(['users'])
    expect(next.model.relationships).toHaveLength(0)
    expect(next.diagram.nodes['t-logs']).toBeUndefined()
    expect(next.diagram.notes).toHaveLength(1)
    expect(next.diagram.notes[0]!.linkedTableId).toBeNull()
  })

  it('리네임은 remove+add로 나타난다 — 물리명이 신원이라 v1 한계', () => {
    const cur = makeDoc([curUsers()])
    const db = dbUsers()
    db.physicalName = 'members'

    const { summary } = diffSync(cur, makeDoc([db]))
    const actions = summary.items.filter((i) => i.kind === 'table').map((i) => i.action)
    expect(actions).toContain('remove')
    expect(actions).toContain('add')
  })
})

describe('diffSync — 관계', () => {
  it('제거 — DB에 관계와 FK 컬럼이 모두 없으면 컬럼도 함께 정리한다', () => {
    const cur = makeDoc([curUsers(), curOrders()], [curRelOrdersUsers()])
    const dbOrdersPlain = dbOrders()
    dbOrdersPlain.columns = dbOrdersPlain.columns.filter((c) => c.physicalName !== 'user_id')
    const db = makeDoc([dbUsers(), dbOrdersPlain])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)

    expect(next.model.relationships).toHaveLength(0)
    expect(next.model.tables.find((t) => t.physicalName === 'orders')!.columns.map((c) => c.physicalName)).not.toContain('user_id')
    // 컬럼은 relationship/remove의 cascade가 정리한다 — 별도 column/remove 불필요
    expect(changes.some((c) => c.type === 'column/remove')).toBe(false)
  })

  it('기존 컬럼에 FK가 생기면 중복 삽입 없이 관계만 만든다', () => {
    const cur = makeDoc([curUsers(), curOrders()]) // user_id 컬럼 존재, 관계 없음
    const db = makeDoc([dbUsers(), dbOrders()], [dbRelOrdersUsers()])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)

    const orders = next.model.tables.find((t) => t.physicalName === 'orders')!
    expect(orders.columns.filter((c) => c.physicalName === 'user_id')).toHaveLength(1)
    expect(next.model.relationships).toHaveLength(1)
    // 생성된 관계는 기존 컬럼을 참조한다(id 불변)
    expect(next.model.relationships[0]!.columnMappings[0]!.childColumnId).toBe('t-c-orders-user-id')
    expect(changes).not.toContainEqual(expect.objectContaining({ type: 'column/add' }))
  })

  it('스칼라(onDelete 등) 변화는 관계 신원을 유지한 채 patch한다', () => {
    const cur = makeDoc([curUsers(), curOrders()], [curRelOrdersUsers()])
    const db = makeDoc([dbUsers(), dbOrders()], [dbRelOrdersUsers({ onDelete: 'CASCADE' })])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)

    expect(next.model.relationships[0]!.id).toBe('r-orders-users')
    expect(next.model.relationships[0]!.onDelete).toBe('CASCADE')
    expect(changes).toContainEqual({ type: 'relationship/patch', relationshipId: 'r-orders-users', patch: { onDelete: 'CASCADE' } })
  })

  it('부모 컬럼 재지정은 remove+재생성으로 반영한다', () => {
    const cur = makeDoc([curUsers(), curOrders()], [curRelOrdersUsers()])
    const dbUsersWithUuid = dbUsers()
    dbUsersWithUuid.columns.push(dbCol('db-c-users-uuid', 'uuid', { dataType: 'VARCHAR', length: 36, nullable: false }))
    const db = makeDoc([dbUsersWithUuid, dbOrders()], [
      dbRelOrdersUsers({
        columnMappings: [{ parentColumnId: 'db-c-users-uuid', childColumnId: 'db-c-orders-user-id' }],
      }),
    ])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)

    expect(next.model.relationships).toHaveLength(1)
    expect(next.model.relationships[0]!.id).not.toBe('r-orders-users')
    const parentColId = next.model.relationships[0]!.columnMappings[0]!.parentColumnId
    const users = next.model.tables.find((t) => t.physicalName === 'users')!
    expect(users.columns.find((c) => c.id === parentColId)!.physicalName).toBe('uuid')
  })

  it('같은 순서쌍의 FK 리네임은 patch로 반영한다(신원 유지)', () => {
    const cur = makeDoc([curUsers(), curOrders()], [
      curRelOrdersUsers({ name: 'fk_old', fkName: 'fk_old' }),
    ])
    const db = makeDoc([dbUsers(), dbOrders()], [
      dbRelOrdersUsers({ name: 'fk_new', fkName: 'fk_new' }),
    ])

    const { changes } = diffSync(cur, db)
    const next = applyChanges(cur, changes)

    expect(next.model.relationships[0]!.id).toBe('r-orders-users')
    expect(next.model.relationships[0]!.fkName).toBe('fk_new')
    expect(changes).toContainEqual({ type: 'relationship/patch', relationshipId: 'r-orders-users', patch: { name: 'fk_new', fkName: 'fk_new' } })
  })
})

describe('diffSync — 멱등성', () => {
  it('내용이 같으면 빈 diff를 낸다(객체 id가 달라도)', () => {
    const diff = diffSync(makeDoc([curUsers()]), makeDoc([dbUsers()]))
    expect(diff.changes).toEqual([])
    expect(diff.summary.items).toEqual([])
  })

  it('고정점 — 혼합 시나리오 적용 결과를 다시 diff하면 빈 diff다', () => {
    const logs = createTable('logs', {
      id: 't-logs',
      columns: [
        col('t-c-logs-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true }),
        col('t-c-logs-user-id', 'user_id', { dataType: 'BIGINT', nullable: true }),
      ],
      primaryKey: { name: 'logs_pkey', columnIds: ['t-c-logs-id'] },
    })
    const relLogs = makeRel('t-users', 't-logs', {
      id: 'r-logs-users',
      fkName: 'fk_logs_users',
      columnMappings: [{ parentColumnId: 't-c-users-id', childColumnId: 't-c-logs-user-id' }],
    })
    const users = createTable('users', {
      id: 't-users',
      columns: [
        col('t-c-users-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true }),
        col('t-c-users-email', 'email', { dataType: 'VARCHAR', length: 100, nullable: false }),
      ],
      primaryKey: { name: 'users_pkey', columnIds: ['t-c-users-id'] },
    })
    const cur = makeDoc([users, curOrders(), logs], [curRelOrdersUsers(), relLogs], {
      nodes: {
        't-users': { x: 0, y: 0, width: null, color: 'blue' },
        't-orders': { x: 400, y: 0, width: 280, color: 'default' },
        't-logs': { x: 800, y: 0, width: null, color: 'default' },
      },
      notes: [{ id: 'n1', x: 10, y: 500, width: 180, text: '확인', title: '', color: 'yellow', linkedTableId: null }],
    })

    // DB — 컬럼 추가·제거·패치, 관계 스칼라 변경, 테이블 추가·제거, UK 추가
    const dbUsers2 = dbUsers()
    dbUsers2.columns.push(dbCol('db-c-users-email', 'email', { dataType: 'VARCHAR', length: 100, nullable: false }))
    dbUsers2.columns.push(dbCol('db-c-users-created', 'created_at', { dataType: 'TIMESTAMP', nullable: true }))
    dbUsers2.uniques = [{ id: 'db-uk-users-email', name: 'uk_users_email', columnIds: ['db-c-users-email'] }]
    const dbOrders2 = dbOrders()
    dbOrders2.columns = dbOrders2.columns.filter((c) => c.physicalName !== 'memo')
    const payments = createTable('payments', {
      id: 'db-t-payments',
      logicalName: 'payments',
      columns: [
        dbCol('db-c-payments-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true }),
        dbCol('db-c-payments-amount', 'amount', { dataType: 'DECIMAL', precision: 12, scale: 2, nullable: false }),
      ],
      primaryKey: { name: 'payments_pkey', columnIds: ['db-c-payments-id'] },
    })
    const db = makeDoc(
      [dbUsers2, dbOrders2, payments],
      [dbRelOrdersUsers({ onDelete: 'CASCADE' })],
    )

    const { changes, summary } = diffSync(cur, db)
    expect(summary.items.length).toBeGreaterThan(0)
    const next = applyChanges(cur, changes)

    // 사후 상태 — 주요 결과 확인
    expect(next.model.tables.map((t) => t.physicalName).sort()).toEqual(['orders', 'payments', 'users'])
    expect(next.model.relationships).toHaveLength(1)
    expect(next.model.relationships[0]!.onDelete).toBe('CASCADE')
    expect(next.diagram.notes).toHaveLength(1)
    const usersAfter = next.model.tables.find((t) => t.physicalName === 'users')!
    expect(usersAfter.uniques.map((u) => u.name)).toEqual(['uk_users_email'])

    // 고정점 — 재 diff는 빈이다
    expect(diffSync(next, db).changes).toEqual([])
  })
})
