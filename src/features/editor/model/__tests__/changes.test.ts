import { describe, expect, it } from 'vitest'

import { applyChange, applyChanges, createArea, createColumn, createTable, pkToggleChanges } from '@/features/editor/model/changes'
import {
  DEFAULT_CHILD_MULTIPLICITY,
  type EditorDocument,
  type Multiplicity,
} from '@/features/editor/model/content-schema'
import { emptyContent } from '@/features/editor/model/content-io'
import { buildRelationship } from '@/features/editor/model/relationship'

function doc(): EditorDocument {
  return { model: emptyContent().model, diagram: emptyContent().diagram }
}

function tableWithId(pk = true) {
  const idColumn = createColumn({ id: 'c-id', physicalName: 'id', dataType: 'BIGINT', nullable: false, autoIncrement: true })
  return createTable('t1', {
    id: 'T1',
    columns: [idColumn, createColumn({ id: 'c-name', physicalName: 'name', dataType: 'VARCHAR', length: 100 })],
    primaryKey: pk ? { name: 't1_pk', columnIds: ['c-id'] } : null,
  })
}

describe('applyChange — 테이블', () => {
  it('table/create는 테이블과 다이어그램 노드를 함께 추가한다', () => {
    const table = createTable('orders')
    const next = applyChange(doc(), { type: 'table/create', table, position: { x: 10, y: 20 } })

    expect(next.model.tables).toHaveLength(1)
    expect(next.diagram.nodes[table.id]).toEqual({ x: 10, y: 20, width: null, color: 'default' })
    // 원본 불변
    expect(doc().model.tables).toHaveLength(0)
  })

  it('table/remove는 붙은 관계와 상대 쪽 FK 컬럼까지 원자 삭제한다', () => {
    const parent = createTable('users', { id: 'PARENT' })
    const parentPk = createColumn({ id: 'pc-1', physicalName: 'id', dataType: 'BIGINT' })
    parent.columns = [parentPk]
    parent.primaryKey = { name: 'users_pk', columnIds: ['pc-1'] }

    const child = createTable('orders', { id: 'CHILD' })
    child.columns = [createColumn({ id: 'cc-1', physicalName: 'id', dataType: 'BIGINT' })]

    let d = doc()
    d = applyChange(d, { type: 'table/create', table: parent, position: { x: 0, y: 0 } })
    d = applyChange(d, { type: 'table/create', table: child, position: { x: 300, y: 0 } })

    const built = buildRelationship({ parentTable: parent, childTable: child, type: 'ONE_TO_MANY', identifying: false, parentMultiplicity: 'EXACTLY_ONE' as const, childMultiplicity: 'ONE_OR_MORE' as const })
    if (!built.ok) throw new Error('unreachable')
    d = applyChange(d, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns })

    // 자식에 PK가 없으면 FK 영역이 최상단 — users_id가 id 앞에 온다
    expect(d.model.tables.find((t) => t.id === 'CHILD')?.columns.map((c) => c.physicalName)).toEqual(['users_id', 'id'])

    // 부모 삭제 → 관계 제거 + 자식의 FK 컬럼(users_id)도 제거
    const after = applyChange(d, { type: 'table/remove', tableId: 'PARENT' })
    expect(after.model.tables).toHaveLength(1)
    expect(after.model.tables[0].id).toBe('CHILD')
    expect(after.model.relationships).toHaveLength(0)
    expect(after.model.tables[0].columns.map((c) => c.physicalName)).toEqual(['id'])
    expect(after.diagram.nodes['PARENT']).toBeUndefined()
  })

  it('table/patch는 논리명·물리명·설명만 바꾼다', () => {
    const d = applyChange(doc(), { type: 'table/create', table: tableWithId(), position: { x: 0, y: 0 } })
    const next = applyChange(d, { type: 'table/patch', tableId: 'T1', patch: { logicalName: '주문', comment: '비고' } })
    const t = next.model.tables[0]
    expect(t.logicalName).toBe('주문')
    expect(t.comment).toBe('비고')
    expect(t.physicalName).toBe('t1')
  })
})

describe('applyChange — 컬럼·PK', () => {
  it('column/add·patch·move·remove가 컬럼 배열을 불변 갱신한다', () => {
    let d = applyChange(doc(), { type: 'table/create', table: tableWithId(), position: { x: 0, y: 0 } })
    const added = createColumn({ id: 'c-new', physicalName: 'status', dataType: 'VARCHAR', length: 20 })
    d = applyChange(d, { type: 'column/add', tableId: 'T1', column: added })
    expect(d.model.tables[0].columns).toHaveLength(3)

    d = applyChange(d, { type: 'column/patch', tableId: 'T1', columnId: 'c-new', patch: { nullable: false } })
    expect(d.model.tables[0].columns.find((c) => c.id === 'c-new')?.nullable).toBe(false)

    d = applyChange(d, { type: 'column/move', tableId: 'T1', columnId: 'c-new', toIndex: 0 })
    expect(d.model.tables[0].columns[0].id).toBe('c-new')

    d = applyChange(d, { type: 'column/remove', tableId: 'T1', columnId: 'c-new' })
    expect(d.model.tables[0].columns.map((c) => c.id)).toEqual(['c-id', 'c-name'])
  })

  it('PK 컬럼을 삭제하면 PK에서도 빠지고, PK가 비면 null이 된다', () => {
    let d = applyChange(doc(), { type: 'table/create', table: tableWithId(), position: { x: 0, y: 0 } })
    d = applyChange(d, { type: 'column/remove', tableId: 'T1', columnId: 'c-id' })
    expect(d.model.tables[0].primaryKey).toBeNull()

    d = applyChange(d, { type: 'primaryKey/set', tableId: 'T1', primaryKey: { name: 't1_pk', columnIds: ['c-name'] } })
    expect(d.model.tables[0].primaryKey?.columnIds).toEqual(['c-name'])
  })
})

describe('pkToggleChanges — 복합 PK와 자동 증가', () => {
  it('PK가 복합(2개 이상)이 되는 순간 기존 PK의 AI를 함께 해제한다', () => {
    const table = tableWithId()
    table.columns[0].autoIncrement = true
    const changes = pkToggleChanges(table, 'c-name', true)

    const doc0 = applyChange(doc(), { type: 'table/create', table, position: { x: 0, y: 0 } })
    const after = applyChanges(doc0, changes)

    const t = after.model.tables[0]
    expect(t.primaryKey?.columnIds).toEqual(['c-id', 'c-name'])
    expect(t.columns[0].autoIncrement).toBe(false) // 복합 PK → 기존 AI 해제
  })

  it('AI가 켜져 있지 않으면 복합화 때 해제 patch가 추가되지 않는다 — nullable 정리만', () => {
    const table = tableWithId()
    table.columns[0].autoIncrement = false
    const changes = pkToggleChanges(table, 'c-name', true)
    expect(changes.some((c) => c.type === 'column/patch' && c.patch.autoIncrement === false)).toBe(false)
    expect(changes.some((c) => c.type === 'column/patch' && c.patch.nullable === false)).toBe(true)
  })
})

describe('applyChange — 관계·메모·노드', () => {
  it('relationship/create는 FK 컬럼 추가 + 식별 관계면 자식 PK에 FK를 포함한다', () => {
    const parent = createTable('users', { id: 'PARENT' })
    parent.columns = [createColumn({ id: 'pc-1', physicalName: 'id', dataType: 'BIGINT' })]
    parent.primaryKey = { name: 'users_pk', columnIds: ['pc-1'] }
    const child = createTable('orders', { id: 'CHILD' })

    let d = doc()
    d = applyChange(d, { type: 'table/create', table: parent, position: { x: 0, y: 0 } })
    d = applyChange(d, { type: 'table/create', table: child, position: { x: 300, y: 0 } })

    const built = buildRelationship({ parentTable: parent, childTable: child, type: 'ONE_TO_ONE', identifying: true, parentMultiplicity: 'ZERO_OR_ONE' as const, childMultiplicity: 'ZERO_OR_ONE' as const })
    if (!built.ok) throw new Error('unreachable')
    d = applyChange(d, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns })

    const childTable = d.model.tables.find((t) => t.id === 'CHILD')
    expect(childTable?.columns.map((c) => c.physicalName)).toEqual(['users_id'])
    expect(childTable?.columns[0].nullable).toBe(false) // 식별 관계 → NOT NULL
    expect(childTable?.primaryKey?.columnIds).toEqual([built.fkColumns[0].id]) // PK 없던 자식 → FK가 PK
    expect(d.model.relationships).toHaveLength(1)
  })

  it('relationship/create는 FK 컬럼을 PK 블록 바로 밑(FK 영역 선두)에 삽입한다', () => {
    const parent = createTable('users', { id: 'PARENT' })
    parent.columns = [createColumn({ id: 'pc-1', physicalName: 'id', dataType: 'BIGINT' })]
    parent.primaryKey = { name: 'users_pk', columnIds: ['pc-1'] }
    const child = createTable('orders', { id: 'CHILD' })
    child.columns = [
      createColumn({ id: 'cc-1', physicalName: 'id', dataType: 'INT', nullable: false }),
      createColumn({ id: 'cc-2', physicalName: 'memo' }),
    ]
    child.primaryKey = { name: 'orders_pk', columnIds: ['cc-1'] }

    let d = doc()
    d = applyChange(d, { type: 'table/create', table: parent, position: { x: 0, y: 0 } })
    d = applyChange(d, { type: 'table/create', table: child, position: { x: 300, y: 0 } })
    const built = buildRelationship({ parentTable: parent, childTable: child, type: 'ONE_TO_MANY', identifying: false, parentMultiplicity: 'EXACTLY_ONE' as const, childMultiplicity: 'ONE_OR_MORE' as const })
    if (!built.ok) throw new Error('unreachable')
    d = applyChange(d, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns })

    // PK(id) 바로 밑에 FK, 기존 일반 컬럼(memo)은 그 뒤로 밀린다
    expect(d.model.tables.find((t) => t.id === 'CHILD')?.columns.map((c) => c.physicalName)).toEqual(['id', 'users_id', 'memo'])
  })

  it('PK 해제 시 FK 컬럼은 FK 영역 선두로, 일반 컬럼은 FK 블록을 건너뛴 자리로 이동한다', () => {
    const table = createTable('orders', { id: 'T1' })
    table.columns = [
      createColumn({ id: 'c-pk', physicalName: 'id', nullable: false }),
      createColumn({ id: 'c-fk', physicalName: 'users_id', nullable: false }),
      createColumn({ id: 'c-fk2', physicalName: 'team_id' }),
      createColumn({ id: 'c-gen', physicalName: 'memo' }),
    ]
    table.primaryKey = { name: 'orders_pk', columnIds: ['c-pk', 'c-fk'] }
    const fkIds = new Set(['c-fk', 'c-fk2'])

    // c-fk(FK)를 PK에서 해제 → FK 영역 선두(남은 PK c-pk 바로 뒤)
    let changes = pkToggleChanges(table, 'c-fk', false, fkIds)
    expect(changes.find((c) => c.type === 'column/move')).toMatchObject({ columnId: 'c-fk', toIndex: 1 })

    // c-pk(일반)를 해제 → FK 블록(c-fk, c-fk2)을 건너뛴 index 3
    table.primaryKey = { name: 'orders_pk', columnIds: ['c-pk', 'c-fk2'] }
    changes = pkToggleChanges(table, 'c-pk', false, fkIds)
    expect(changes.find((c) => c.type === 'column/move')).toMatchObject({ columnId: 'c-pk', toIndex: 2 })
  })

  it('relationship/remove는 FK 컬럼도 함께 제거한다', () => {
    const parent = createTable('users', { id: 'PARENT' })
    parent.columns = [createColumn({ id: 'pc-1', physicalName: 'id', dataType: 'BIGINT' })]
    parent.primaryKey = { name: 'users_pk', columnIds: ['pc-1'] }
    const child = createTable('orders', { id: 'CHILD' })

    let d = doc()
    d = applyChange(d, { type: 'table/create', table: parent, position: { x: 0, y: 0 } })
    d = applyChange(d, { type: 'table/create', table: child, position: { x: 300, y: 0 } })
    const built = buildRelationship({ parentTable: parent, childTable: child, type: 'ONE_TO_MANY', identifying: false, parentMultiplicity: 'EXACTLY_ONE' as const, childMultiplicity: 'ONE_OR_MORE' as const })
    if (!built.ok) throw new Error('unreachable')
    d = applyChange(d, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns })

    const after = applyChange(d, { type: 'relationship/remove', relationshipId: built.relationship.id })
    expect(after.model.relationships).toHaveLength(0)
    expect(after.model.tables.find((t) => t.id === 'CHILD')?.columns).toHaveLength(0)
  })

  it('note 생성·수정·삭제와 노드 이동·리사이즈를 다이어그램에 반영한다', () => {
    const note = { id: 'N1', x: 50, y: 60, width: 200, text: '메모', title: '', color: 'yellow' as const, linkedTableId: null }
    let d = applyChange(doc(), { type: 'note/create', note })
    d = applyChange(d, { type: 'note/patch', noteId: 'N1', patch: { text: '수정', x: 70 } })
    expect(d.diagram.notes[0]).toEqual({ ...note, text: '수정', x: 70 })

    const table = createTable('t')
    d = applyChange(d, { type: 'table/create', table, position: { x: 0, y: 0 } })
    d = applyChange(d, { type: 'node/move', positions: { [table.id]: { x: 111, y: 222 } } })
    expect(d.diagram.nodes[table.id]).toEqual({ x: 111, y: 222, width: null, color: 'default' })

    d = applyChange(d, { type: 'node/resize', tableId: table.id, width: 320 })
    expect(d.diagram.nodes[table.id].width).toBe(320)

    // 강조색 지정·해제 — 레이아웃(위치·폭)은 그대로
    d = applyChange(d, { type: 'node/color', tableId: table.id, color: 'sky' })
    expect(d.diagram.nodes[table.id]).toEqual({ x: 111, y: 222, width: 320, color: 'sky' })
    d = applyChange(d, { type: 'node/color', tableId: table.id, color: 'default' })
    expect(d.diagram.nodes[table.id].color).toBe('default')

    d = applyChange(d, { type: 'note/remove', noteId: 'N1' })
    expect(d.diagram.notes).toHaveLength(0)
  })

  it('연관 테이블(linkedTableId)을 패치하고, 테이블 삭제 시 연관이 해제된다', () => {
    const table = createTable('member')
    const note = { id: 'N1', x: 0, y: 0, width: 200, text: '', title: '', color: 'yellow' as const, linkedTableId: null }
    let d = applyChange(doc(), { type: 'table/create', table, position: { x: 0, y: 0 } })
    d = applyChange(d, { type: 'note/create', note })

    // 드롭·편집 다이얼로그 지정 — note/patch로 연관을 붙인다
    d = applyChange(d, { type: 'note/patch', noteId: 'N1', patch: { linkedTableId: table.id } })
    expect(d.diagram.notes[0].linkedTableId).toBe(table.id)

    // 다이얼로그 해제 — null로 되돌린다
    d = applyChange(d, { type: 'note/patch', noteId: 'N1', patch: { linkedTableId: null } })
    expect(d.diagram.notes[0].linkedTableId).toBeNull()

    // 다시 지정 후 테이블을 지우면 연관도 정리된다
    d = applyChange(d, { type: 'note/patch', noteId: 'N1', patch: { linkedTableId: table.id } })
    d = applyChange(d, { type: 'table/remove', tableId: table.id })
    expect(d.diagram.notes[0].linkedTableId).toBeNull()
  })
})

describe('applyChange — 키(UK·인덱스)·설정', () => {
  it('uniqueKey/set·index/set은 테이블의 키 목록을 교체한다', () => {
    let d = doc()
    const table = createTable('orders', {
      id: 'T1',
      columns: [
        createColumn({ id: 'c1', physicalName: 'email' }),
        createColumn({ id: 'c2', physicalName: 'created_at' }),
      ],
    })
    d = applyChange(d, { type: 'table/create', table, position: { x: 0, y: 0 } })

    d = applyChange(d, {
      type: 'uniqueKey/set',
      tableId: 'T1',
      uniques: [{ id: 'u1', name: 'uk_orders_email', columnIds: ['c1'] }],
    })
    d = applyChange(d, {
      type: 'index/set',
      tableId: 'T1',
      indexes: [{ id: 'i1', name: 'idx_orders_created', columns: [{ columnId: 'c2', order: 'DESC' }] }],
    })
    expect(d.model.tables[0].uniques).toEqual([{ id: 'u1', name: 'uk_orders_email', columnIds: ['c1'] }])
    expect(d.model.tables[0].indexes).toEqual([{ id: 'i1', name: 'idx_orders_created', columns: [{ columnId: 'c2', order: 'DESC' }] }])

    // 교체 — 편집은 목록 전체를 한 번에
    d = applyChange(d, {
      type: 'uniqueKey/set',
      tableId: 'T1',
      uniques: [{ id: 'u1', name: 'uk_orders_email_created', columnIds: ['c1', 'c2'] }],
    })
    expect(d.model.tables[0].uniques[0]).toEqual({ id: 'u1', name: 'uk_orders_email_created', columnIds: ['c1', 'c2'] })
  })

  it('컬럼 삭제는 키에서 참조를 정리하고, 남는 컬럼이 없으면 키를 제거한다', () => {
    let d = doc()
    const table = createTable('orders', {
      id: 'T1',
      columns: [
        createColumn({ id: 'c1', physicalName: 'email' }),
        createColumn({ id: 'c2', physicalName: 'created_at' }),
      ],
      uniques: [{ id: 'u1', name: 'uk_orders', columnIds: ['c1', 'c2'] }],
      indexes: [{ id: 'i1', name: 'idx_orders', columns: [{ columnId: 'c1', order: 'ASC' }, { columnId: 'c2', order: 'DESC' }] }],
    })
    d = applyChange(d, { type: 'table/create', table, position: { x: 0, y: 0 } })

    // 복합 UK/IX에서 1개 제거 → 컬럼만 줄어든다(정렬 보존)
    d = applyChange(d, { type: 'column/remove', tableId: 'T1', columnId: 'c2' })
    expect(d.model.tables[0].uniques).toEqual([{ id: 'u1', name: 'uk_orders', columnIds: ['c1'] }])
    expect(d.model.tables[0].indexes).toEqual([{ id: 'i1', name: 'idx_orders', columns: [{ columnId: 'c1', order: 'ASC' }] }])

    // 마지막 컬럼 제거 → 키 자체가 사라진다
    d = applyChange(d, { type: 'column/remove', tableId: 'T1', columnId: 'c1' })
    expect(d.model.tables[0].uniques).toEqual([])
    expect(d.model.tables[0].indexes).toEqual([])
  })

})

describe('applyChange — 관계 제약 동기화', () => {
  /** 부모 users(PK 1~2개) ↔ 자식 orders(자체 PK code) 문서 — 관계 제약 경로 공통 픽스처 */
  function setupDoc(opts: { compositeParentPk?: boolean; childAutoIncrement?: boolean } = {}) {
    const parent = createTable('users', { id: 'PARENT' })
    parent.columns = [createColumn({ id: 'pc-1', physicalName: 'id', dataType: 'BIGINT' })]
    parent.primaryKey = { name: 'users_pk', columnIds: ['pc-1'] }
    if (opts.compositeParentPk) {
      parent.columns.push(createColumn({ id: 'pc-2', physicalName: 'email', dataType: 'VARCHAR', length: 255 }))
      parent.primaryKey = { name: 'users_pk', columnIds: ['pc-1', 'pc-2'] }
    }
    const child = createTable('orders', { id: 'CHILD' })
    child.columns = [
      createColumn({ id: 'cc-1', physicalName: 'code', nullable: false, autoIncrement: opts.childAutoIncrement ?? false }),
    ]
    child.primaryKey = { name: 'orders_pk', columnIds: ['cc-1'] }

    let d = doc()
    d = applyChange(d, { type: 'table/create', table: parent, position: { x: 0, y: 0 } })
    d = applyChange(d, { type: 'table/create', table: child, position: { x: 300, y: 0 } })
    return d
  }

  function createRelation(
    d: EditorDocument,
    init: { type: 'ONE_TO_ONE' | 'ONE_TO_MANY'; identifying: boolean; parentMultiplicity?: Multiplicity },
  ) {
    const parent = d.model.tables.find((t) => t.id === 'PARENT')
    const child = d.model.tables.find((t) => t.id === 'CHILD')
    if (!parent || !child) throw new Error('unreachable')
    const built = buildRelationship({
      parentTable: parent,
      childTable: child,
      type: init.type,
      identifying: init.identifying,
      parentMultiplicity: init.parentMultiplicity ?? 'EXACTLY_ONE',
      childMultiplicity: DEFAULT_CHILD_MULTIPLICITY[init.type],
    })
    if (!built.ok) throw new Error('unreachable')
    return {
      doc: applyChange(d, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns }),
      relationshipId: built.relationship.id,
    }
  }

  const childOf = (d: EditorDocument) => d.model.tables.find((t) => t.id === 'CHILD')!

  it('비식별 1:1 생성 — FK 전체 컬럼 UK가 자동 생성된다(1:1 강제)', () => {
    const { doc: d } = createRelation(setupDoc(), { type: 'ONE_TO_ONE', identifying: false })
    const fk = childOf(d).columns.find((c) => c.physicalName === 'users_id')
    expect(fk).toBeDefined()
    expect(childOf(d).uniques).toEqual([{ id: expect.any(String), name: 'uk_orders_users_id', columnIds: [fk!.id] }])
  })

  it('복합 PK 부모의 비식별 1:1 — FK 2개 전체가 하나의 UK를 이룬다', () => {
    const { doc: d } = createRelation(setupDoc({ compositeParentPk: true }), { type: 'ONE_TO_ONE', identifying: false })
    const fkIds = childOf(d).columns.filter((c) => c.physicalName.startsWith('users_')).map((c) => c.id)
    expect(childOf(d).uniques).toHaveLength(1)
    expect(childOf(d).uniques[0]).toMatchObject({ name: 'uk_orders_users_id_users_email', columnIds: fkIds })
  })

  it('식별 1:1 생성 — UK 없이 FK가 자식 PK에 편입된다(PK가 이미 유일성을 보장)', () => {
    const { doc: d } = createRelation(setupDoc(), { type: 'ONE_TO_ONE', identifying: true })
    const fk = childOf(d).columns.find((c) => c.physicalName === 'users_id')
    expect(childOf(d).uniques).toEqual([])
    expect(childOf(d).primaryKey?.columnIds).toEqual(['cc-1', fk!.id])
  })

  it('1:N 생성 — UK를 만들지 않는다', () => {
    const { doc: d } = createRelation(setupDoc(), { type: 'ONE_TO_MANY', identifying: false })
    expect(childOf(d).uniques).toEqual([])
  })

  it('관계 삭제 — FK 컬럼과 관계가 만든 UK도 함께 사라진다', () => {
    const { doc: d, relationshipId } = createRelation(setupDoc(), { type: 'ONE_TO_ONE', identifying: false })
    const after = applyChange(d, { type: 'relationship/remove', relationshipId })
    expect(after.model.relationships).toHaveLength(0)
    expect(childOf(after).columns.map((c) => c.physicalName)).toEqual(['code'])
    expect(childOf(after).uniques).toEqual([])
  })

  it('patch 1:N→1:1(비식별) — FK 전체 UK가 추가된다', () => {
    const { doc: d, relationshipId } = createRelation(setupDoc(), { type: 'ONE_TO_MANY', identifying: false })
    const after = applyChange(d, { type: 'relationship/patch', relationshipId, patch: { type: 'ONE_TO_ONE' } })
    expect(childOf(after).uniques).toHaveLength(1)
    expect(childOf(after).uniques[0].columnIds).toHaveLength(1)
  })

  it('patch 유형 전환 — 자식 기수가 새 유형에 없으면 기본값으로 보정된다', () => {
    const { doc: d, relationshipId } = createRelation(setupDoc(), { type: 'ONE_TO_MANY', identifying: false })
    // 1:N 기본(ONE_OR_MORE) → 1:1로 바뀌면 1:1 기본(EXACTLY_ONE)으로
    const after = applyChange(d, { type: 'relationship/patch', relationshipId, patch: { type: 'ONE_TO_ONE' } })
    expect(after.model.relationships[0].childMultiplicity).toBe('EXACTLY_ONE')
    // 다시 1:N으로 — 1:1 값은 1:N 후보에 없으므로 1:N 기본(ONE_OR_MORE)으로
    const back = applyChange(after, { type: 'relationship/patch', relationshipId, patch: { type: 'ONE_TO_MANY' } })
    expect(back.model.relationships[0].childMultiplicity).toBe('ONE_OR_MORE')
  })

  it('patch 비식별→식별 — FK가 자식 PK에 편입되고 NOT NULL·기존 AI 해제·UK 제거가 함께 일어난다', () => {
    const { doc: d, relationshipId } = createRelation(setupDoc({ childAutoIncrement: true }), {
      type: 'ONE_TO_ONE',
      identifying: false,
    })
    expect(childOf(d).uniques).toHaveLength(1) // 비식별 1:1 → UK 있음

    const after = applyChange(d, { type: 'relationship/patch', relationshipId, patch: { identifying: true } })
    const fk = childOf(after).columns.find((c) => c.physicalName === 'users_id')!
    expect(childOf(after).primaryKey?.columnIds).toEqual(['cc-1', fk.id]) // PK 편입(복합)
    expect(fk.nullable).toBe(false)
    expect(childOf(after).columns.find((c) => c.id === 'cc-1')?.autoIncrement).toBe(false) // 복합 PK → AI 해제
    expect(childOf(after).uniques).toEqual([]) // 식별은 PK가 유일성 보장 → UK 제거
    expect(childOf(after).columns.map((c) => c.physicalName)).toEqual(['code', 'users_id']) // 3영역 순서
  })

  it('patch 식별→비식별 — PK에서 FK가 빠지고 nullable·UK가 돌아온다', () => {
    const { doc: d, relationshipId } = createRelation(setupDoc(), { type: 'ONE_TO_ONE', identifying: true })
    const after = applyChange(d, { type: 'relationship/patch', relationshipId, patch: { identifying: false } })
    const fk = childOf(after).columns.find((c) => c.physicalName === 'users_id')!
    expect(childOf(after).primaryKey?.columnIds).toEqual(['cc-1']) // PK 해제
    expect(fk.nullable).toBe(false) // 부모 필수(기본값 EXACTLY_ONE) → NOT NULL 유지
    expect(childOf(after).uniques).toHaveLength(1) // 비식별 1:1 → UK 부활
  })

  it('patch 부모 선택성 전환 — 비식별 FK의 nullable이 선택성을 따른다', () => {
    const { doc: d, relationshipId } = createRelation(setupDoc(), { type: 'ONE_TO_MANY', identifying: false, parentMultiplicity: 'EXACTLY_ONE' as const })
    const mandatory = applyChange(d, { type: 'relationship/patch', relationshipId, patch: { parentMultiplicity: 'ZERO_OR_ONE' as const } })
    expect(childOf(mandatory).columns.find((c) => c.physicalName === 'users_id')?.nullable).toBe(true) // 선택 → NULL 허용
    const back = applyChange(mandatory, { type: 'relationship/patch', relationshipId, patch: { parentMultiplicity: 'EXACTLY_ONE' as const } })
    expect(childOf(back).columns.find((c) => c.physicalName === 'users_id')?.nullable).toBe(false) // 필수 → NOT NULL
  })

  it('복합 FK의 한 컬럼을 삭제하면 관계 전체와 나머지 FK도 함께 제거된다', () => {
    const { doc: d } = createRelation(setupDoc({ compositeParentPk: true }), { type: 'ONE_TO_MANY', identifying: false })
    const fkIds = childOf(d).columns.filter((c) => c.physicalName.startsWith('users_')).map((c) => c.id)

    // FK 2개 중 첫 번째만 삭제 → 매핑이 부분적으로 남지 않고 관계·FK 둘 다 제거
    const after = applyChange(d, { type: 'column/remove', tableId: 'CHILD', columnId: fkIds[0] })
    expect(after.model.relationships).toHaveLength(0)
    expect(childOf(after).columns.map((c) => c.physicalName)).toEqual(['code'])
  })

  it('부모 PK 컬럼을 삭제해도 관계·자식 FK가 함께 제거된다', () => {
    const { doc: d } = createRelation(setupDoc(), { type: 'ONE_TO_MANY', identifying: false })
    const after = applyChange(d, { type: 'column/remove', tableId: 'PARENT', columnId: 'pc-1' })
    expect(after.model.relationships).toHaveLength(0)
    expect(childOf(after).columns.map((c) => c.physicalName)).toEqual(['code'])
    // 부모의 남은 컬럼은 유지 — PK만 null이 된다
    const parent = after.model.tables.find((t) => t.id === 'PARENT')
    expect(parent?.columns).toHaveLength(0)
    expect(parent?.primaryKey).toBeNull()
  })
})

describe('applyChange — 주제 영역 (v1.13)', () => {
  function docWithArea() {
    const table = createTable('users', { id: 'T-USERS' })
    const other = createTable('logs', { id: 'T-LOGS' })
    const area = createArea('회원', { id: 'A1', tableIds: ['T-USERS'] })
    let d = doc()
    d = applyChange(d, { type: 'table/create', table, position: { x: 0, y: 0 } })
    d = applyChange(d, { type: 'table/create', table: other, position: { x: 400, y: 0 } })
    return applyChange(d, { type: 'area/create', area })
  }

  it('area/create는 기본값(800×560·펼침·무색)으로 diagram.areas에 추가한다', () => {
    const area = createArea('영역')
    expect(area.width).toBe(800)
    expect(area.height).toBe(560)
    expect(area.collapsed).toBe(false)
    const next = applyChange(doc(), { type: 'area/create', area })
    expect(next.diagram.areas).toHaveLength(1)
    expect(next.diagram.areas[0].name).toBe('영역')
  })

  it('area/patch는 이름·설명·색·접힘·멤버·위치·크기를 바꾼다', () => {
    const next = applyChange(docWithArea(), {
      type: 'area/patch',
      areaId: 'A1',
      patch: { name: '회원 도메인', description: '계정·프로필', color: 'sky', collapsed: true, x: 10, y: 20, width: 900, tableIds: ['T-USERS', 'T-LOGS'] },
    })
    const area = next.diagram.areas[0]
    expect(area).toMatchObject({ name: '회원 도메인', description: '계정·프로필', color: 'sky', collapsed: true, x: 10, y: 20, width: 900, tableIds: ['T-USERS', 'T-LOGS'] })
    // 원본 불변
    expect(docWithArea().diagram.areas[0].name).toBe('회원')
  })

  it('area/remove는 묶음 표시만 지운다 — 멤버 테이블은 그대로 남는다', () => {
    const after = applyChange(docWithArea(), { type: 'area/remove', areaId: 'A1' })
    expect(after.diagram.areas).toHaveLength(0)
    expect(after.model.tables).toHaveLength(2)
  })

  it('table/remove는 남은 영역의 tableIds에서 그 id를 정리한다 (notes linkedTableId와 동형 cascade)', () => {
    const after = applyChange(docWithArea(), { type: 'table/remove', tableId: 'T-USERS' })
    expect(after.model.tables.map((t) => t.physicalName)).toEqual(['logs'])
    expect(after.diagram.areas[0].tableIds).toEqual([])
  })
})
