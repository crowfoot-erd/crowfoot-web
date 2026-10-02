/**
 * 관계의 컬럼 매핑 편집 — 외래 키 컬럼 교체와 규칙 옮기기 (05-editor/02-ui.md §4.2)
 */
import { describe, expect, it } from 'vitest'

import { applyChanges, createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import type { EditorDocument, ErdRelationship } from '@/features/editor/model/content-schema'
import { buildRelationship } from '@/features/editor/model/relationship'
import { NEW_COLUMN, buildRemapChanges } from '@/features/editor/model/relationship-remap'

interface Fixture {
  doc: EditorDocument
  relationship: ErdRelationship
  /** 부모 기본 키 컬럼 id */
  parentPk: string
  /** 관계가 만든 외래 키 컬럼 id */
  fk: string
}

/** members(PK id) ← orders(PK id, member_no VARCHAR, legacy_member BIGINT) + 관계 1개 */
function fixture(options: { identifying?: boolean; type?: 'ONE_TO_MANY' | 'ONE_TO_ONE'; databaseType?: string } = {}): Fixture {
  const memberId = createColumn({ id: 'm-id', physicalName: 'id', dataType: 'BIGINT', nullable: false })
  const members = createTable('members', { columns: [memberId], primaryKey: { name: 'members_pk', columnIds: ['m-id'] } })
  const orders = createTable('orders', {
    columns: [
      createColumn({ id: 'o-id', physicalName: 'id', dataType: 'BIGINT', nullable: false }),
      createColumn({ id: 'o-no', physicalName: 'member_no', dataType: 'VARCHAR', length: 20, nullable: true }),
      createColumn({ id: 'o-legacy', physicalName: 'legacy_member', dataType: 'BIGINT', nullable: true }),
    ],
    primaryKey: { name: 'orders_pk', columnIds: ['o-id'] },
  })
  const base = emptyContent()
  const built = buildRelationship({
    parentTable: members,
    childTable: orders,
    type: options.type ?? 'ONE_TO_MANY',
    identifying: options.identifying ?? false,
    parentMultiplicity: 'EXACTLY_ONE',
    childMultiplicity: 'ZERO_OR_MORE',
  })
  if (!built.ok) throw new Error('fixture')
  const doc = applyChanges(
    { model: base.model, diagram: base.diagram },
    [
      { type: 'table/create', table: members, position: { x: 0, y: 0 } },
      { type: 'table/create', table: orders, position: { x: 400, y: 0 } },
      { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns },
    ],
    options.databaseType ?? 'postgresql',
  )
  return { doc, relationship: doc.model.relationships[0], parentPk: 'm-id', fk: built.fkColumns[0].id }
}

const ordersOf = (doc: EditorDocument) => doc.model.tables.find((table) => table.physicalName === 'orders')!
const columnNames = (doc: EditorDocument) => ordersOf(doc).columns.map((column) => column.physicalName)

function remap(f: Fixture, input: Parameters<typeof buildRemapChanges>[2], databaseType = 'postgresql') {
  const result = buildRemapChanges(f.doc, f.relationship, input)
  if (!result.ok) throw new Error(result.reason)
  return { result, doc: applyChanges(f.doc, result.changes, databaseType) }
}

describe('외래 키 컬럼을 기존 컬럼으로 바꾸기', () => {
  it('매핑이 바뀌고 외래 키 인덱스가 새 컬럼으로 옮겨 간다 — 이전 컬럼은 일반 컬럼으로 남는다', () => {
    const f = fixture()
    expect(ordersOf(f.doc).indexes.map((ix) => ix.columns.map((c) => c.columnId))).toEqual([[f.fk]])

    const { doc, result } = remap(f, { selection: { [f.parentPk]: 'o-legacy' } })

    expect(result.changed).toBe(true)
    expect(doc.model.relationships[0].columnMappings).toEqual([{ parentColumnId: 'm-id', childColumnId: 'o-legacy' }])
    const orders = ordersOf(doc)
    expect(orders.indexes.map((ix) => ix.columns.map((c) => c.columnId))).toEqual([['o-legacy']])
    expect(columnNames(doc)).toContain('members_id')
    // 부모 기수가 "정확히 1"이라 새 외래 키는 NOT NULL이 된다
    expect(orders.columns.find((c) => c.id === 'o-legacy')?.nullable).toBe(false)
    // PK → FK → 일반 순서
    expect(columnNames(doc).slice(0, 2)).toEqual(['id', 'legacy_member'])
  })

  it('"쓰지 않게 된 컬럼 삭제"를 켜면 이전 외래 키 컬럼을 지운다 — 다른 관계가 쓰는 컬럼은 남긴다', () => {
    const f = fixture()
    const removed = remap(f, { selection: { [f.parentPk]: 'o-legacy' }, removeReleased: true })
    expect(columnNames(removed.doc)).not.toContain('members_id')
    expect(removed.doc.model.relationships).toHaveLength(1)

    // 같은 컬럼을 다른 관계도 외래 키로 쓰고 있으면 지우지 않는다
    const shared: Fixture = {
      ...f,
      doc: {
        ...f.doc,
        model: {
          ...f.doc.model,
          relationships: [
            ...f.doc.model.relationships,
            { ...f.relationship, id: 'rel-other', fkName: 'fk_other', columnMappings: [{ parentColumnId: 'm-id', childColumnId: f.fk }] },
          ],
        },
      },
    }
    const kept = remap(shared, { selection: { [f.parentPk]: 'o-legacy' }, removeReleased: true })
    expect(columnNames(kept.doc)).toContain('members_id')
  })

  it('타입이 다른 컬럼도 고를 수 있다 — "부모 타입에 맞추기"를 켠 컬럼만 타입이 바뀐다', () => {
    const f = fixture()
    const asIs = remap(f, { selection: { [f.parentPk]: 'o-no' } })
    expect(ordersOf(asIs.doc).columns.find((c) => c.id === 'o-no')).toMatchObject({ dataType: 'VARCHAR', length: 20 })

    const aligned = remap(f, { selection: { [f.parentPk]: 'o-no' }, alignTypeColumnIds: ['o-no'] })
    expect(ordersOf(aligned.doc).columns.find((c) => c.id === 'o-no')).toMatchObject({ dataType: 'BIGINT', length: null })
  })

  it('MySQL 문서는 외래 키 인덱스를 만들지 않는다', () => {
    const f = fixture({ databaseType: 'mysql' })
    expect(ordersOf(f.doc).indexes).toEqual([])
    const { doc } = remap(f, { selection: { [f.parentPk]: 'o-legacy' } }, 'mysql')
    expect(ordersOf(doc).indexes).toEqual([])
  })
})

describe('관계의 규칙 옮기기', () => {
  it('식별 관계 — 이전 컬럼은 기본 키에서 빠지고 새 컬럼이 기본 키에 들어간다', () => {
    const f = fixture({ identifying: true })
    expect(ordersOf(f.doc).primaryKey?.columnIds).toEqual(['o-id', f.fk])

    const { doc } = remap(f, { selection: { [f.parentPk]: 'o-legacy' } })

    const orders = ordersOf(doc)
    expect(orders.primaryKey?.columnIds).toEqual(['o-id', 'o-legacy'])
    expect(orders.columns.find((c) => c.id === 'o-legacy')?.nullable).toBe(false)
  })

  it('비식별 1:1 — 관계가 만든 유니크 키가 새 컬럼으로 옮겨 간다. 사용자가 만든 키는 그대로다', () => {
    const f = fixture({ type: 'ONE_TO_ONE' })
    const withUserKey: Fixture = {
      ...f,
      doc: applyChanges(f.doc, [
        { type: 'uniqueKey/set', tableId: ordersOf(f.doc).id, uniques: [...ordersOf(f.doc).uniques, { id: 'uk-user', name: 'uk_orders_no', columnIds: ['o-no'] }] },
      ]),
    }
    expect(ordersOf(withUserKey.doc).uniques.map((u) => u.columnIds)).toEqual([[f.fk], ['o-no']])

    const { doc } = remap(withUserKey, { selection: { [f.parentPk]: 'o-legacy' } })

    expect(ordersOf(doc).uniques.map((u) => u.columnIds).sort()).toEqual([['o-legacy'], ['o-no']].sort())
  })

  it('유형과 매핑을 함께 바꿔도 한 번에 맞는다 — 1:N에서 1:1로', () => {
    const f = fixture()
    const { doc } = remap(f, { selection: { [f.parentPk]: 'o-legacy' }, patch: { type: 'ONE_TO_ONE', childMultiplicity: 'ZERO_OR_ONE' } })

    const orders = ordersOf(doc)
    expect(doc.model.relationships[0].type).toBe('ONE_TO_ONE')
    expect(orders.uniques.map((u) => u.columnIds)).toEqual([['o-legacy']])
    expect(orders.indexes).toEqual([])
  })
})

describe('새 컬럼 만들기와 검증', () => {
  it('"새 컬럼 만들기"는 부모 컬럼의 타입으로 컬럼을 만들고 이름이 겹치면 접미를 붙인다', () => {
    const f = fixture()
    const { doc } = remap(f, { selection: { [f.parentPk]: NEW_COLUMN } })

    expect(columnNames(doc)).toContain('members_id_1')
    const created = ordersOf(doc).columns.find((c) => c.physicalName === 'members_id_1')
    expect(created).toMatchObject({ dataType: 'BIGINT', nullable: false })
    expect(doc.model.relationships[0].columnMappings[0].childColumnId).toBe(created?.id)
  })

  it('고른 것이 그대로면 매핑 변경은 없다 — 나머지 패치만 나간다', () => {
    const f = fixture()
    const unchanged = buildRemapChanges(f.doc, f.relationship, { selection: {} })
    expect(unchanged).toEqual({ ok: true, changed: false, changes: [] })

    const onlyPatch = buildRemapChanges(f.doc, f.relationship, { selection: {}, patch: { onDelete: 'CASCADE' } })
    expect(onlyPatch).toMatchObject({ ok: true, changed: false })
    if (onlyPatch.ok) {
      expect(onlyPatch.changes).toEqual([{ type: 'relationship/patch', relationshipId: f.relationship.id, patch: { onDelete: 'CASCADE' } }])
    }
  })

  it('복합 키에서 같은 자식 컬럼을 두 번 고르면 거절한다', () => {
    const a = createColumn({ id: 'p-a', physicalName: 'a', dataType: 'INT', nullable: false })
    const b = createColumn({ id: 'p-b', physicalName: 'b', dataType: 'INT', nullable: false })
    const parent = createTable('pairs', { columns: [a, b], primaryKey: { name: 'pairs_pk', columnIds: ['p-a', 'p-b'] } })
    const child = createTable('items', { columns: [createColumn({ id: 'i-x', physicalName: 'x', dataType: 'INT' })] })
    const built = buildRelationship({ parentTable: parent, childTable: child, type: 'ONE_TO_MANY', identifying: false, parentMultiplicity: 'EXACTLY_ONE', childMultiplicity: 'ZERO_OR_MORE' })
    if (!built.ok) throw new Error('fixture')
    const base = emptyContent()
    const doc = applyChanges({ model: base.model, diagram: base.diagram }, [
      { type: 'table/create', table: parent, position: { x: 0, y: 0 } },
      { type: 'table/create', table: child, position: { x: 400, y: 0 } },
      { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns },
    ])

    const result = buildRemapChanges(doc, doc.model.relationships[0], { selection: { 'p-a': 'i-x', 'p-b': 'i-x' } })
    expect(result).toEqual({ ok: false, reason: 'DUPLICATE_CHILD_COLUMN' })
  })
})
