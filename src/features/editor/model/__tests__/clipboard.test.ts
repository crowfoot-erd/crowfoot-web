/**
 * 클립보드 — 서브그래프 복사·FK 이중 삽입 방지·이름 유일화·오프셋 누적 (05-editor/02-ui.md §9)
 */
import { afterEach, describe, expect, it } from 'vitest'

import { applyChanges, createColumn, createTable, type ErdChange } from '@/features/editor/model/changes'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { copyToClipboard, pasteFromClipboard } from '@/features/editor/model/clipboard'

/** users(PK id, UK email, 인덱스) ← orders(FK user_id, 식별 관계) + 정책 메모(linked users) */
function fixtureDoc(): EditorDocument {
  const users = createTable('users', {
    logicalName: '회원',
    columns: [
      createColumn({ id: 'col-id', physicalName: 'id', nullable: false }),
      createColumn({ id: 'col-email', physicalName: 'email', nullable: true }),
    ],
    primaryKey: { name: 'pk_users', columnIds: ['col-id'] },
    uniques: [{ id: 'uk-1', name: 'uk_users_email', columnIds: ['col-email'] }],
    indexes: [{ id: 'idx-1', name: 'idx_users_email', columns: [{ columnId: 'col-email', order: 'ASC' }] }],
  })
  const orders = createTable('orders', {
    columns: [
      createColumn({ id: 'col-order-id', physicalName: 'order_id', nullable: false }),
      createColumn({ id: 'col-fk', physicalName: 'user_id', logicalName: '회원 id', nullable: false }),
    ],
    primaryKey: { name: 'pk_orders', columnIds: ['col-order-id', 'col-fk'] }, // 식별 관계 — FK가 PK에 편입돼 있다
  })
  return {
    model: {
      tables: [users, orders],
      relationships: [
        {
          id: 'rel-1',
          name: 'fk_orders_users',
          fkName: 'fk_orders_users',
          parentTableId: users.id,
          childTableId: orders.id,
          type: 'ONE_TO_MANY',
          identifying: true,
          parentMultiplicity: 'EXACTLY_ONE',
          childMultiplicity: 'ONE_OR_MORE',
          columnMappings: [{ parentColumnId: 'col-id', childColumnId: 'col-fk' }],
          onDelete: 'NO_ACTION',
          onUpdate: 'NO_ACTION',
        },
      ],
    },
    diagram: {
      nodes: {
        [users.id]: { x: 100, y: 50, width: null, color: 'default' },
        [orders.id]: { x: 500, y: 50, width: null, color: 'default' },
      },
      notes: [{ id: 'note-1', x: 0, y: 400, width: 200, text: '내용', title: '정책', color: 'yellow', linkedTableId: users.id }],
      areas: [],
      viewport: null,
    },
  }
}

/** 클립보드는 모듈 상태 — 테스트마다 최신 복사로 시작한다 */
afterEach(() => {
  copyToClipboard(fixtureDoc(), [])
})

function pasteAll(doc: EditorDocument, copyLabel = '사본'): { doc: EditorDocument; changes: ErdChange[]; selectedIds: string[] } {
  const result = pasteFromClipboard(doc, copyLabel)
  if (!result) throw new Error('paste failed')
  return { doc: applyChanges(doc, result.changes), ...result }
}

describe('copyToClipboard', () => {
  it('테이블·메모 선택을 담는다 — 관계는 양끝 테이블이 모두 선택됐을 때만', () => {
    const doc = fixtureDoc()
    const [users, orders] = doc.model.tables

    // 양쪽 선택 → 관계까지 복사된다
    expect(copyToClipboard(doc, [users.id, orders.id, 'note-1'])).toBe(true)
    const both = pasteAll(doc)
    expect(both.doc.model.tables).toHaveLength(4)
    expect(both.doc.model.relationships).toHaveLength(2)

    // users만 선택 → 붙여넣어도 관계는 늘지 않는다(자식이 없으니 구성 불가)
    expect(copyToClipboard(doc, [users.id])).toBe(true)
    const solo = pasteAll(doc)
    expect(solo.doc.model.tables).toHaveLength(3)
    expect(solo.doc.model.relationships).toHaveLength(1)
  })

  it('복사 가능한 객체가 없으면 false', () => {
    const doc = fixtureDoc()
    expect(copyToClipboard(doc, [])).toBe(false)
    expect(copyToClipboard(doc, ['rel-1'])).toBe(false) // 관계만으로는 복사 불가
  })

  it('주제 영역 id를 선택에 넣어도 복사 대상이 아니다 — 붙여넣기에 영역·소속은 늘지 않는다', () => {
    const doc = fixtureDoc()
    doc.diagram.areas = [
      {
        id: 'area-1',
        name: '회원 도메인',
        description: '',
        color: 'default',
        tableIds: [doc.model.tables[0].id],
      },
    ]
    const [users, orders] = doc.model.tables

    // 전체 선택(Ctrl+A가 영역 id를 포함한다)으로 복사해도
    expect(copyToClipboard(doc, [users.id, orders.id, 'note-1', 'area-1'])).toBe(true)
    const pasted = pasteAll(doc)
    // 붙여넣기 후 영역은 1개 그대로 — 복제되지 않고 멤버 소속도 이어받지 않는다
    expect(pasted.doc.diagram.areas).toHaveLength(1)
    expect(pasted.doc.diagram.areas[0].tableIds).toEqual([users.id])

    // 영역만 선택했을 때는 복사 가능한 객체가 없다
    expect(copyToClipboard(doc, ['area-1'])).toBe(false)
  })
})

describe('pasteFromClipboard', () => {
  it('id 재발급·물리명 접미·+32px 오프셋·붙여넣은 객체 선택', () => {
    const doc = fixtureDoc()
    const [users, orders] = doc.model.tables
    copyToClipboard(doc, [users.id, orders.id])

    const pasted = pasteAll(doc)
    expect(pasted.changes.length).toBeGreaterThan(0)

    const copiedUsers = pasted.doc.model.tables.find((t) => t.physicalName === 'users_사본')
    const copiedOrders = pasted.doc.model.tables.find((t) => t.physicalName === 'orders_사본')
    expect(copiedUsers).toBeDefined()
    expect(copiedOrders).toBeDefined()
    expect(copiedUsers!.id).not.toBe(users.id)
    expect(pasted.doc.diagram.nodes[copiedUsers!.id]).toMatchObject({ x: 132, y: 82 }) // 100+32, 50+32
    expect(pasted.selectedIds).toContain(copiedUsers!.id)
    expect(pasted.selectedIds).toContain(copiedOrders!.id)
  })

  it('FK 컬럼은 1회만 삽입 — 식별 관계면 자식 PK에도 편입된다', () => {
    const doc = fixtureDoc()
    copyToClipboard(doc, doc.model.tables.map((t) => t.id))

    const pasted = pasteAll(doc)
    const copiedOrders = pasted.doc.model.tables.find((t) => t.physicalName === 'orders_사본')!

    // user_id는 relationship/create가 삽입한 정확히 1개
    const fkColumns = copiedOrders.columns.filter((c) => c.physicalName === 'user_id')
    expect(fkColumns).toHaveLength(1)
    // 식별 관계 — FK가 자식 PK에 편입돼 있다
    const fkId = fkColumns[0].id
    expect(copiedOrders.primaryKey?.columnIds).toEqual(
      expect.arrayContaining([fkId, copiedOrders.columns.find((c) => c.physicalName === 'order_id')!.id]),
    )
    // 관계 매핑도 새 컬럼을 가리킨다
    const copiedRel = pasted.doc.model.relationships.find((r) => r.childTableId === copiedOrders.id)
    expect(copiedRel?.columnMappings[0].childColumnId).toBe(fkId)
  })

  it('키 이름은 문서에서 유일하게 다시 만든다', () => {
    const doc = fixtureDoc()
    copyToClipboard(doc, doc.model.tables.map((t) => t.id))

    const pasted = pasteAll(doc)
    const copiedUsers = pasted.doc.model.tables.find((t) => t.physicalName === 'users_사본')!
    expect(copiedUsers.primaryKey?.name).toBe('pk_users_1')
    expect(copiedUsers.uniques[0].name).toBe('uk_users_email_1')
    expect(copiedUsers.indexes[0].name).toBe('idx_users_email_1')
    const copiedRel = pasted.doc.model.relationships.find((r) => r.childTableId !== doc.model.tables[1].id)
    expect(copiedRel?.fkName).toBe('fk_orders_users_1')
  })

  it('메모 linkedTableId — 같이 복사된 테이블이면 새 id로, 아니면 링크 해제', () => {
    const doc = fixtureDoc()
    const [users] = doc.model.tables

    copyToClipboard(doc, [users.id, 'note-1'])
    const withTable = pasteAll(doc)
    const copiedNote = withTable.doc.diagram.notes.find((n) => n.id !== 'note-1')!
    expect(copiedNote.linkedTableId).toBe(withTable.doc.model.tables.find((t) => t.physicalName === 'users_사본')!.id)

    copyToClipboard(doc, ['note-1'])
    const solo = pasteAll(doc)
    const bareNote = solo.doc.diagram.notes.find((n) => n.id !== 'note-1')!
    expect(bareNote.linkedTableId).toBeNull()
  })

  it('연속 붙여넣기 — 오프셋 누적(+32 → +64)·이름도 계속 유일', () => {
    const doc = fixtureDoc()
    const [users] = doc.model.tables
    copyToClipboard(doc, [users.id])

    const first = pasteAll(doc)
    const firstCopy = first.doc.model.tables.find((t) => t.physicalName === 'users_사본')!
    expect(first.doc.diagram.nodes[firstCopy.id]).toMatchObject({ x: 132 })

    const second = pasteAll(first.doc)
    const secondCopy = second.doc.model.tables.find((t) => t.physicalName === 'users_사본_1')!
    expect(second.doc.diagram.nodes[secondCopy.id]).toMatchObject({ x: 164 }) // 100+64
    expect(second.doc.model.tables).toHaveLength(4)
  })
})
