/**
 * 저장 시점 변경 요약 — 스냅샷 diff (05-editor/01-core.md §13)
 *
 * 두 문서는 같은 계보(객체 id 공유)임이 전제다 — id를 그대로 유지한 채 일부만 바꿔
 * 요약 항목·layoutOnly·truncated를 검증한다. 멱등성: 같은 문서를 diff하면 빈 요약.
 */
import { describe, expect, it } from 'vitest'

import { createColumn, createTable } from '@/features/editor/model/changes'
import type {
  ErdArea,
  ErdColumn,
  ErdIndex,
  ErdNote,
  ErdRelationship,
  ErdTable,
  EditorDocument,
} from '@/features/editor/model/content-schema'
import { DOC_DIFF_ITEM_LIMIT, diffDocuments } from '@/features/editor/model/doc-diff'

/* ---------- 빌더 ---------- */

const col = (id: string, physicalName: string, init: Partial<ErdColumn> = {}): ErdColumn =>
  createColumn({ id, physicalName, ...init })

function makeTable(init: Partial<ErdTable> = {}): ErdTable {
  return createTable('orders', {
    id: 't-orders',
    logicalName: '주문',
    columns: [
      col('c-id', 'id', { dataType: 'BIGINT', nullable: false, autoIncrement: true }),
      col('c-status', 'status', { dataType: 'VARCHAR', length: 20, nullable: false, defaultValue: '' }),
    ],
    primaryKey: { name: 'orders_pkey', columnIds: ['c-id'] },
    ...init,
  })
}

function makeNote(init: Partial<ErdNote> = {}): ErdNote {
  return {
    id: 'n-1',
    x: 100,
    y: 200,
    width: 220,
    text: '리마인더',
    title: '회고 메모',
    color: 'yellow',
    linkedTableId: null,
    ...init,
  }
}

function makeRel(init: Partial<ErdRelationship> = {}): ErdRelationship {
  return {
    id: 'r-1',
    name: 'fk_orders_users',
    parentTableId: 't-users',
    childTableId: 't-orders',
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'ZERO_OR_ONE',
    childMultiplicity: 'ZERO_OR_MORE',
    fkName: 'fk_orders_users',
    columnMappings: [],
    onDelete: 'NO_ACTION',
    onUpdate: 'NO_ACTION',
    ...init,
  }
}

const rel = (init: Partial<ErdRelationship> = {}): ErdRelationship =>
  makeRel({
    columnMappings: [{ parentColumnId: 'c-u-id', childColumnId: 'c-id' }],
    ...init,
  })

function makeDoc(
  tables: ErdTable[] = [],
  init: {
    relationships?: ErdRelationship[]
    notes?: ErdNote[]
    areas?: EditorDocument['diagram']['areas']
    nodes?: EditorDocument['diagram']['nodes']
    viewport?: EditorDocument['diagram']['viewport']
  } = {},
): EditorDocument {
  return {
    model: { tables, relationships: init.relationships ?? [] },
    diagram: {
      nodes: init.nodes ?? {},
      notes: init.notes ?? [],
      areas: init.areas ?? [],
      viewport: init.viewport ?? null,
    },
  }
}

/** 구조 복제 — 깊은 카피 후 일부만 바꾸는 시나리오용 */
const clone = <T,>(value: T): T => structuredClone(value)

/* ---------- 기본 ---------- */

describe('diffDocuments', () => {
  it('같은 문서는 빈 요약 — layoutOnly 아님(변경 없음)', () => {
    const doc = makeDoc([makeTable()], { notes: [makeNote()], nodes: { 't-orders': { x: 1, y: 2, width: null, color: 'default' } } })

    const summary = diffDocuments(doc, clone(doc))

    expect(summary.items).toEqual([])
    expect(summary.layoutOnly).toBe(false)
    expect(summary.truncated).toBe(false)
  })

  it('테이블 추가 — "member 테이블 추가" 항목 형태', () => {
    const from = makeDoc([makeTable()])
    const to = makeDoc([makeTable(), createTable('member', { id: 't-member', columns: [col('c-m-id', 'id')] })])

    const summary = diffDocuments(from, to)

    expect(summary.items).toEqual([
      { kind: 'table', action: 'add', table: 'member', name: 'member', detail: 'columns 1' },
    ])
    expect(summary.layoutOnly).toBe(false)
  })

  it('테이블 제거·갱신(논리명·comment) — id 매칭', () => {
    const from = makeDoc([
      makeTable(),
      makeTable({ id: 't-member', physicalName: 'member', logicalName: '회원' }),
    ])
    const to = makeDoc([
      makeTable({ logicalName: '주문서', comment: '팀 합의' }),
    ])

    const summary = diffDocuments(from, to)

    expect(summary.items).toEqual([
      { kind: 'table', action: 'update', table: 'orders', name: 'orders', detail: 'logicalName, comment' },
      { kind: 'table', action: 'remove', table: 'member', name: 'member', detail: '' },
    ])
  })

  it('컬럼 추가·제거·갱신 — dataType·nullable·defaultValue 정규화', () => {
    const from = makeDoc([makeTable({ columns: [col('c-id', 'id'), col('c-status', 'status'), col('c-memo', 'memo')] })])
    const to = makeDoc([
      makeTable({
        columns: [
          col('c-id', 'id'),
          col('c-status', 'status', { length: 40, nullable: false, defaultValue: 'draft' }),
          col('c-amount', 'amount', { dataType: 'DECIMAL', precision: 10, scale: 2 }),
        ],
      }),
    ])

    const summary = diffDocuments(from, to)

    expect(summary.items).toEqual([
      { kind: 'column', action: 'update', table: 'orders', name: 'status', detail: 'nullable, length, defaultValue' },
      { kind: 'column', action: 'remove', table: 'orders', name: 'memo', detail: '' },
      { kind: 'column', action: 'add', table: 'orders', name: 'amount', detail: 'DECIMAL(10,2)' },
    ])
  })

  it("defaultValue ''≡null — 빈 문자열과 null은 같은 값으로 본다(드리프트 방지)", () => {
    const from = makeDoc([makeTable()])
    const to = clone(from)
    to.model.tables[0]!.columns[1]!.defaultValue = null // '' → null

    const summary = diffDocuments(from, to)

    expect(summary.items).toEqual([])
  })

  it('PK — 설정·해제·구성 변경', () => {
    // 해제: PK 있음 → 없음
    const noPk = makeDoc([makeTable({ primaryKey: null })])
    const withPk = makeDoc([makeTable()])
    // 구성 변경: 같은 컬럼 집합으로 복합 PK — 컬럼 항목 없이 PK만 바뀐다
    const composite = makeDoc([
      makeTable({ primaryKey: { name: 'orders_pkey', columnIds: ['c-status', 'c-id'] } }),
    ])

    expect(diffDocuments(withPk, noPk).items).toEqual([
      { kind: 'primaryKey', action: 'remove', table: 'orders', name: 'orders_pkey', detail: '' },
    ])
    expect(diffDocuments(noPk, withPk).items).toEqual([
      { kind: 'primaryKey', action: 'add', table: 'orders', name: 'orders_pkey', detail: 'id' },
    ])
    expect(diffDocuments(withPk, composite).items).toEqual([
      { kind: 'primaryKey', action: 'update', table: 'orders', name: 'orders_pkey', detail: 'status, id' },
    ])
  })

  it('UK·인덱스 — id 매칭 add/remove/update(컬럼 구성·이름)', () => {
    const columns = () => [col('c-id', 'id'), col('c-status', 'status'), col('c-code', 'code')]
    const ukA = { id: 'u-1', name: 'uq_orders_status', columnIds: ['c-status'] }
    const ukB = { id: 'u-2', name: 'uq_orders_code', columnIds: ['c-code'] }
    const idxA: ErdIndex = {
      id: 'i-1',
      name: 'ix_orders_status',
      columns: [{ columnId: 'c-status', order: 'ASC' as const }],
    }
    const idxAFlipped: ErdIndex = {
      id: 'i-1',
      name: 'ix_orders_status',
      columns: [{ columnId: 'c-status', order: 'DESC' as const }],
    }

    const from = makeDoc([makeTable({ columns: columns(), uniques: [ukA], indexes: [idxA] })])
    const to = makeDoc([makeTable({ columns: columns(), uniques: [{ ...ukB }], indexes: [idxAFlipped] })])

    const summary = diffDocuments(from, to)

    expect(summary.items).toEqual([
      { kind: 'uniqueKey', action: 'remove', table: 'orders', name: 'uq_orders_status', detail: '' },
      { kind: 'uniqueKey', action: 'add', table: 'orders', name: 'uq_orders_code', detail: 'code' },
      { kind: 'index', action: 'update', table: 'orders', name: 'ix_orders_status', detail: 'status' },
    ])
  })

  it('관계 — 생성(부모→자식 detail)·제거·속성 갱신', () => {
    const users = createTable('users', { id: 't-users', columns: [col('c-u-id', 'id')] })
    const doc = (relationships: ErdRelationship[] = []) => makeDoc([users, makeTable()], { relationships })

    const created = diffDocuments(doc(), doc([rel()]))
    expect(created.items).toEqual([
      { kind: 'relationship', action: 'add', table: 'orders', name: 'fk_orders_users', detail: 'users → orders' },
    ])

    const removed = diffDocuments(doc([rel()]), doc())
    expect(removed.items).toEqual([
      { kind: 'relationship', action: 'remove', table: 'orders', name: 'fk_orders_users', detail: '' },
    ])

    const patched = diffDocuments(
      doc([rel()]),
      doc([rel({ childMultiplicity: 'ONE_OR_MORE', onDelete: 'CASCADE' })]),
    )
    expect(patched.items).toEqual([
      { kind: 'relationship', action: 'update', table: 'orders', name: 'fk_orders_users', detail: 'childMultiplicity, onDelete' },
    ])
  })

  it('노트 — 추가·제거·내용 갱신(update)·이동(move) 분리', () => {
    const from = makeDoc([makeTable()], { notes: [makeNote()] })
    const to = makeDoc([makeTable()], {
      notes: [
        makeNote({ text: '리마인더 v2', x: 400 }),
        makeNote({ id: 'n-2', title: '', text: '제목 없음' }),
      ],
    })

    const summary = diffDocuments(from, to)

    expect(summary.items).toEqual([
      { kind: 'note', action: 'update', table: '', name: '회고 메모', detail: 'text' },
      { kind: 'note', action: 'move', table: '', name: '회고 메모', detail: 'x' },
      { kind: 'note', action: 'add', table: '', name: '제목 없음', detail: '' },
    ])
  })

  it('노트 이름 — 제목 없으면 빈 줄을 건너뛴 본문 첫 줄', () => {
    const summary = diffDocuments(
      makeDoc([makeTable()]),
      makeDoc([makeTable()], { notes: [makeNote({ title: '', text: '\n  \n배포 전 확인\n나머지' })] }),
    )

    expect(summary.items[0]!.name).toBe('배포 전 확인')
  })

  it('노드 — 이동(move)·폭/색(update). 신규 노드는 테이블 항목이 대신한다', () => {
    const from = makeDoc([makeTable()], {
      nodes: { 't-orders': { x: 10, y: 20, width: 240, color: 'default' as const } },
    })
    const to = makeDoc([makeTable(), createTable('member', { id: 't-member' })], {
      nodes: {
        't-orders': { x: 30, y: 20, width: 240, color: 'sky' as const },
        't-member': { x: 500, y: 20, width: null, color: 'default' as const },
      },
    })

    const summary = diffDocuments(from, to)

    expect(summary.items).toEqual([
      { kind: 'table', action: 'add', table: 'member', name: 'member', detail: 'columns 0' },
      { kind: 'node', action: 'move', table: 'orders', name: 'orders', detail: 'x, y' },
      { kind: 'node', action: 'update', table: 'orders', name: 'orders', detail: 'color' },
    ])
    expect(summary.layoutOnly).toBe(false) // member 추가는 model 변경
  })

  it('layoutOnly — 노트·노드 이동·뷰포트만 바뀐 저장', () => {
    const from = makeDoc([makeTable()], {
      nodes: { 't-orders': { x: 10, y: 20, width: null, color: 'default' as const } },
    })
    const to = clone(from)
    to.diagram.nodes['t-orders']!.x = 999
    to.diagram.viewport = { x: 5, y: 5, zoom: 1.5 }

    const summary = diffDocuments(from, to)

    expect(summary.items).toEqual([
      { kind: 'node', action: 'move', table: 'orders', name: 'orders', detail: 'x, y' },
    ])
    expect(summary.layoutOnly).toBe(true)
  })

  it('뷰포트만 바뀌어도 layoutOnly — 항목은 비지만 레이아웃 저장임을 나타낸다', () => {
    const from = makeDoc([makeTable()])
    const to = clone(from)
    to.diagram.viewport = { x: 1, y: 2, zoom: 0.8 }

    const summary = diffDocuments(from, to)

    expect(summary.items).toEqual([])
    expect(summary.layoutOnly).toBe(true)
  })

  it('항목 상한 50 — 초과분은 자르고 truncated=true', () => {
    const manyTables = Array.from({ length: 60 }, (_, i) =>
      createTable(`t${i}`, { id: `t-${i}`, columns: [col(`c-${i}`, 'id')] }),
    )
    const summary = diffDocuments(makeDoc(), makeDoc(manyTables))

    expect(summary.items).toHaveLength(DOC_DIFF_ITEM_LIMIT)
    expect(summary.items[49]!.name).toBe('t49')
    expect(summary.truncated).toBe(true)
  })

  it('undo 되돌리기 — A→B 저장 후 B→A diff는 B의 추가 항목을 제거로 보고한다(대칭)', () => {
    const base = makeDoc([makeTable()])
    const added = makeDoc([makeTable(), createTable('member', { id: 't-member' })])

    const forward = diffDocuments(base, added)
    const backward = diffDocuments(added, base)

    expect(forward.items[0]!.action).toBe('add')
    expect(backward.items[0]).toEqual({
      kind: 'table',
      action: 'remove',
      table: 'member',
      name: 'member',
      detail: '',
    })
  })
})

describe('diffDocuments — 주제 영역 (v1.13)', () => {
  const area = (init: Partial<ErdArea> = {}) => ({
    id: 'a-1',
    name: '회원',
    description: '',
    x: 0,
    y: 0,
    width: 800,
    height: 560,
    collapsed: false,
    color: 'default' as const,
    tableIds: ['t-orders'],
    ...init,
  })

  it('추가·제거는 이름과 멤버 수로 남는다', () => {
    const add = diffDocuments(makeDoc(), makeDoc([], { areas: [area()] }))
    expect(add.items[0]).toMatchObject({ kind: 'area', action: 'add', name: '회원', detail: 'tables 1' })

    const remove = diffDocuments(makeDoc([], { areas: [area()] }), makeDoc())
    expect(remove.items[0]).toMatchObject({ kind: 'area', action: 'remove', name: '회원' })
  })

  it('내용(이름·색·접힘·멤버)은 update, 위치·크기는 move — 별개 항목으로', () => {
    const from = makeDoc([], { areas: [area()] })
    const to = makeDoc([], {
      areas: [area({ name: '회원 도메인', color: 'sky', collapsed: true, tableIds: [], x: 100, y: 50, width: 900 })],
    })
    const summary = diffDocuments(from, to)
    expect(summary.items).toEqual([
      { kind: 'area', action: 'update', table: '', name: '회원 도메인', detail: 'name, color, collapsed, tableIds' },
      { kind: 'area', action: 'move', table: '', name: '회원 도메인', detail: 'x, y, width' },
    ])
  })

  it('영역만 바뀐 저장은 layoutOnly다 — model 항목이 없으면', () => {
    const from = makeDoc([makeTable()])
    const to = makeDoc([makeTable()], { areas: [area()] })
    const summary = diffDocuments(from, to)
    expect(summary.items.every((item) => item.kind === 'area')).toBe(true)
    expect(summary.layoutOnly).toBe(true)
  })
})
