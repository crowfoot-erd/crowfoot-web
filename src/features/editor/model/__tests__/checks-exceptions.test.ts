/**
 * v1.34 문서 모델 확장 — CHECK 제약·생성 컬럼·ON UPDATE·인덱스 종류·검증 예외
 * (08-core/02-model.md §1.5.1, 05-editor/05-validation.md §4.4)
 *
 * given: 새 키를 쓰는 문서
 * when:  check/set·validationException/add·remove·column/patch, 테이블·컬럼·관계 삭제, 되돌리기
 * then:  기본값 팩토리, 키 네임스페이스, cascade, 예외 분리, 버전 비교 항목, 협업 diff가 맞다
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyChange,
  createColumn,
  createIndex,
  createTable,
  type ErdChange,
} from '@/features/editor/model/changes'
import { deriveChanges } from '@/features/editor/model/collab-merge'
import { emptyContent } from '@/features/editor/model/content-io'
import type { EditorDocument, ErdValidationException } from '@/features/editor/model/content-schema'
import { diffDocuments } from '@/features/editor/model/doc-diff'
import { defaultCheckName, documentKeyNames, stripOuterParens } from '@/features/editor/model/keys'
import { buildRelationship } from '@/features/editor/model/relationship'
import { issueTargetKey, partitionByExceptions, validateModel } from '@/features/editor/model/validation'
import { useEditorStore } from '@/features/editor/store/editor-store'

function baseDoc(): EditorDocument {
  const empty = emptyContent()
  let doc: EditorDocument = { model: empty.model, diagram: empty.diagram }
  const users = createTable('users', {
    id: 'T-users',
    columns: [createColumn({ id: 'C-id', physicalName: 'id', dataType: 'BIGINT', nullable: false })],
    primaryKey: { name: 'users_pk', columnIds: ['C-id'] },
  })
  const orders = createTable('orders', {
    id: 'T-orders',
    columns: [
      createColumn({ id: 'C-oid', physicalName: 'id', dataType: 'BIGINT', nullable: false }),
      createColumn({ id: 'C-price', physicalName: 'price', dataType: 'INT' }),
    ],
    primaryKey: { name: 'orders_pk', columnIds: ['C-oid'] },
  })
  doc = applyChange(doc, { type: 'table/create', table: users, position: { x: 0, y: 0 } })
  doc = applyChange(doc, { type: 'table/create', table: orders, position: { x: 400, y: 0 } })
  return doc
}

const exception = (init: Partial<ErdValidationException> = {}): ErdValidationException => ({
  id: 'X1',
  ruleId: 'ORPHAN_TABLE',
  target: 'table:T-users',
  reason: '감사 로그 테이블이라 관계가 없다',
  createdBy: '홍길동',
  createdAt: '2026-10-06T00:00:00.000Z',
  ...init,
})

describe('새 객체 기본값 — 문서 편집 API와 같은 본체', () => {
  it('createTable은 checks []·createColumn은 generated·onUpdate null·createIndex는 BTREE·파서 없음', () => {
    expect(createTable('t').checks).toEqual([])
    expect(createColumn()).toMatchObject({ generated: null, onUpdate: null })
    expect(createIndex({ name: 'idx', columns: [{ columnId: 'c', order: 'ASC' }] })).toMatchObject({ type: 'BTREE', parser: null })
  })

  it('비식별 1:N 관계가 만드는 FK 인덱스도 BTREE·파서 없음이다', () => {
    const doc = baseDoc()
    const built = buildRelationship({
      parentTable: doc.model.tables[0],
      childTable: doc.model.tables[1],
      type: 'ONE_TO_MANY',
      identifying: false,
      parentMultiplicity: 'EXACTLY_ONE',
      childMultiplicity: 'ONE_OR_MORE',
      onDelete: 'NO_ACTION',
      onUpdate: 'NO_ACTION',
    })
    if (!built.ok) throw new Error('관계를 만들지 못했다')
    const next = applyChange(doc, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns }, 'postgresql')
    expect(next.model.tables[1].indexes[0]).toMatchObject({ type: 'BTREE', parser: null })
  })
})

describe('CHECK 제약', () => {
  it('check/set은 목록을 교체하고 이름은 문서 키 네임스페이스에 든다', () => {
    const doc = applyChange(baseDoc(), {
      type: 'check/set',
      tableId: 'T-orders',
      checks: [{ id: 'K1', name: 'ck_orders_1', expression: 'price >= 0' }],
    })
    expect(doc.model.tables[1].checks).toEqual([{ id: 'K1', name: 'ck_orders_1', expression: 'price >= 0' }])
    expect(documentKeyNames(doc.model).has('ck_orders_1')).toBe(true)
    // 다음 기본 이름은 겹치지 않는 번호
    expect(defaultCheckName(doc.model, doc.model.tables[1])).toBe('ck_orders_2')
  })

  it('CHECK 이름이 다른 키와 겹치면 DUPLICATE_KEY_NAME', () => {
    const doc = applyChange(baseDoc(), {
      type: 'check/set',
      tableId: 'T-orders',
      checks: [{ id: 'K1', name: 'users_pk', expression: 'price >= 0' }],
    })
    expect(validateModel(doc.model).filter((issue) => issue.code === 'DUPLICATE_KEY_NAME')).not.toHaveLength(0)
  })

  it('컬럼을 지워도 CHECK 제약은 남는다 — 식은 컬럼 id에 묶이지 않는다', () => {
    let doc = applyChange(baseDoc(), {
      type: 'check/set',
      tableId: 'T-orders',
      checks: [{ id: 'K1', name: 'ck_orders_1', expression: 'price >= 0' }],
    })
    doc = applyChange(doc, { type: 'column/remove', tableId: 'T-orders', columnId: 'C-price' })
    expect(doc.model.tables[1].checks).toHaveLength(1)
  })

  it('바깥 괄호 한 겹만 벗긴다', () => {
    expect(stripOuterParens(' (price >= 0) ')).toBe('price >= 0')
    expect(stripOuterParens('(a > 0) AND (b > 0)')).toBe('(a > 0) AND (b > 0)')
    expect(stripOuterParens('a > 0')).toBe('a > 0')
  })
})

describe('되돌리기 — 스토어', () => {
  beforeEach(() => {
    useEditorStore.getState().hydrate({ modelId: 'm-v134', baseVersion: 1, document: baseDoc() }, { force: true })
  })

  it('check/set과 생성 컬럼 패치를 되돌리고 다시 한다', () => {
    const { commit, undo, redo } = useEditorStore.getState()
    commit({ type: 'check/set', tableId: 'T-orders', checks: [{ id: 'K1', name: 'ck_orders_1', expression: 'price >= 0' }] })
    commit({
      type: 'column/patch',
      tableId: 'T-orders',
      columnId: 'C-price',
      patch: { generated: { expression: 'id * 2', stored: false }, onUpdate: null },
    })
    const orders = () => useEditorStore.getState().present.model.tables[1]
    expect(orders().columns[1].generated).toEqual({ expression: 'id * 2', stored: false })

    undo()
    expect(orders().columns[1].generated).toBeNull()
    expect(orders().checks).toHaveLength(1)
    undo()
    expect(orders().checks).toEqual([])
    redo()
    expect(orders().checks).toHaveLength(1)
  })

  it('검증 예외를 두고 되돌린다', () => {
    const { commit, undo } = useEditorStore.getState()
    commit({ type: 'validationException/add', exception: exception() })
    expect(useEditorStore.getState().present.diagram.validationExceptions).toHaveLength(1)
    undo()
    expect(useEditorStore.getState().present.diagram.validationExceptions).toEqual([])
  })
})

describe('검증 예외', () => {
  it('같은 규칙·대상에 다시 두면 바꿔 끼우고, remove는 id로 지운다', () => {
    let doc = applyChange(baseDoc(), { type: 'validationException/add', exception: exception() })
    doc = applyChange(doc, { type: 'validationException/add', exception: exception({ id: 'X2', reason: '다른 사유' }) })
    expect(doc.diagram.validationExceptions.map((e) => e.id)).toEqual(['X2'])
    doc = applyChange(doc, { type: 'validationException/remove', exceptionId: 'X2' })
    expect(doc.diagram.validationExceptions).toEqual([])
  })

  it('예외로 둔 경고는 active에서 빠지고, 발화하지 않는 예외는 issue null(해당 없음)', () => {
    const doc = baseDoc()
    const issues = validateModel(doc.model)
    const orphan = issues.find((issue) => issue.code === 'ORPHAN_TABLE' && issue.tableId === 'T-users')!
    expect(issueTargetKey(orphan)).toBe('table:T-users')

    const exceptions = [exception(), exception({ id: 'X9', ruleId: 'WIDE_TABLE', target: 'table:T-orders' })]
    const { active, excepted } = partitionByExceptions(issues, exceptions)
    expect(active.some((issue) => issue.code === 'ORPHAN_TABLE' && issue.tableId === 'T-users')).toBe(false)
    expect(active.some((issue) => issue.code === 'ORPHAN_TABLE' && issue.tableId === 'T-orders')).toBe(true)
    expect(excepted.find((entry) => entry.exception.id === 'X1')?.issue).toBe(orphan)
    expect(excepted.find((entry) => entry.exception.id === 'X9')?.issue).toBeNull()
  })

  it('오류 등급은 기록이 있어도 빠지지 않는다', () => {
    const doc = applyChange(baseDoc(), {
      type: 'column/patch',
      tableId: 'T-orders',
      columnId: 'C-price',
      patch: { dataType: 'NOPE' },
    })
    const issues = validateModel(doc.model)
    const unknown = issues.find((issue) => issue.code === 'UNKNOWN_DATA_TYPE')!
    const { active } = partitionByExceptions(issues, [
      exception({ ruleId: 'UNKNOWN_DATA_TYPE', target: issueTargetKey(unknown) }),
    ])
    expect(active).toContain(unknown)
  })

  it('대상 테이블·컬럼·관계를 지우면 예외도 지운다', () => {
    const doc = baseDoc()
    const built = buildRelationship({
      parentTable: doc.model.tables[0],
      childTable: doc.model.tables[1],
      type: 'ONE_TO_MANY',
      identifying: false,
      parentMultiplicity: 'EXACTLY_ONE',
      childMultiplicity: 'ONE_OR_MORE',
      onDelete: 'NO_ACTION',
      onUpdate: 'NO_ACTION',
    })
    if (!built.ok) throw new Error('관계를 만들지 못했다')
    const relId = built.relationship.id
    let next = applyChange(doc, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns }, 'mysql')
    const add = (e: ErdValidationException): ErdChange => ({ type: 'validationException/add', exception: e })
    next = applyChange(next, add(exception({ id: 'X-col', ruleId: 'MISSING_LOGICAL_NAME', target: 'column:T-orders:C-price' })))
    next = applyChange(next, add(exception({ id: 'X-rel', ruleId: 'FK_WITHOUT_INDEX', target: `relationship:${relId}` })))
    next = applyChange(next, add(exception({ id: 'X-users', ruleId: 'MISSING_LOGICAL_NAME', target: 'table:T-users' })))

    const afterColumn = applyChange(next, { type: 'column/remove', tableId: 'T-orders', columnId: 'C-price' })
    expect(afterColumn.diagram.validationExceptions.map((e) => e.id)).toEqual(['X-rel', 'X-users'])

    const afterRel = applyChange(afterColumn, { type: 'relationship/remove', relationshipId: relId })
    expect(afterRel.diagram.validationExceptions.map((e) => e.id)).toEqual(['X-users'])

    // 테이블 삭제는 붙어 있던 관계의 예외까지 지운다
    const afterTable = applyChange(next, { type: 'table/remove', tableId: 'T-users' })
    expect(afterTable.diagram.validationExceptions.map((e) => e.id)).toEqual(['X-col'])
  })
})

describe('버전 비교·협업 diff', () => {
  it('CHECK·생성 컬럼·ON UPDATE·인덱스 종류 변경을 항목으로 낸다', () => {
    let from = baseDoc()
    from = applyChange(from, {
      type: 'index/set',
      tableId: 'T-orders',
      indexes: [createIndex({ id: 'I1', name: 'idx_orders_price', columns: [{ columnId: 'C-price', order: 'ASC' }] })],
    })
    let to = applyChange(from, { type: 'check/set', tableId: 'T-orders', checks: [{ id: 'K1', name: 'ck_orders_1', expression: 'price >= 0' }] })
    to = applyChange(to, {
      type: 'column/patch',
      tableId: 'T-orders',
      columnId: 'C-price',
      patch: { generated: { expression: 'id * 2', stored: true }, onUpdate: 'CURRENT_TIMESTAMP' },
    })
    to = applyChange(to, {
      type: 'index/set',
      tableId: 'T-orders',
      indexes: [{ ...to.model.tables[1].indexes[0], type: 'FULLTEXT', parser: 'ngram' }],
    })
    to = applyChange(to, { type: 'validationException/add', exception: exception() })

    const { items, layoutOnly } = diffDocuments(from, to)
    expect(layoutOnly).toBe(false)
    expect(items).toContainEqual({ kind: 'check', action: 'add', table: 'orders', name: 'ck_orders_1', detail: 'price >= 0' })
    expect(items).toContainEqual({ kind: 'column', action: 'update', table: 'orders', name: 'price', detail: 'generated, onUpdate' })
    expect(items).toContainEqual({ kind: 'index', action: 'update', table: 'orders', name: 'idx_orders_price', detail: 'FULLTEXT price' })
    expect(items).toContainEqual(expect.objectContaining({ kind: 'validationException', action: 'add', name: 'ORPHAN_TABLE' }))

    // 협업 diff로 재생하면 같은 문서가 된다
    const replayed = deriveChanges(from, to).reduce((doc, change) => applyChange(doc, change), from)
    expect(replayed.model.tables[1]).toEqual(to.model.tables[1])
    expect(replayed.diagram.validationExceptions).toEqual(to.diagram.validationExceptions)
  })
})
