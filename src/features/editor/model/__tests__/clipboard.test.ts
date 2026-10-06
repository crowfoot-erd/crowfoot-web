/**
 * 클립보드 — 서브그래프 복사·FK 이중 삽입 방지·이름 유일화·오프셋 누적 (05-editor/02-ui.md §9)
 */
import { afterEach, describe, expect, it } from 'vitest'

import { applyChanges, createColumn, createTable, type ErdChange } from '@/features/editor/model/changes'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { clearClipboard, copyToClipboard, hasClipboard, pasteFromClipboard } from '@/features/editor/model/clipboard'
import { CLIPBOARD_STORAGE_KEY } from '@/features/editor/model/clipboard-storage'
import { emptyContent } from '@/features/editor/model/content-io'

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
    indexes: [{ id: 'idx-1', name: 'idx_users_email', columns: [{ columnId: 'col-email', order: 'ASC' }], type: 'BTREE', parser: null }],
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
      areas: [], requirements: [], validationExceptions: [],
      viewport: null,
    },
  }
}

/** 클립보드는 모듈 상태와 브라우저 저장소에 산다 — 테스트마다 비운다 */
afterEach(() => {
  clearClipboard()
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
    expect(copyToClipboard(doc, [users.id, orders.id, 'note-1']).copied).toBe(true)
    const both = pasteAll(doc)
    expect(both.doc.model.tables).toHaveLength(4)
    expect(both.doc.model.relationships).toHaveLength(2)

    // users만 선택 → 붙여넣어도 관계는 늘지 않는다(자식이 없으니 구성 불가)
    expect(copyToClipboard(doc, [users.id]).copied).toBe(true)
    const solo = pasteAll(doc)
    expect(solo.doc.model.tables).toHaveLength(3)
    expect(solo.doc.model.relationships).toHaveLength(1)
  })

  it('복사 가능한 객체가 없으면 false', () => {
    const doc = fixtureDoc()
    expect(copyToClipboard(doc, []).copied).toBe(false)
    expect(copyToClipboard(doc, ['rel-1']).copied).toBe(false) // 관계만으로는 복사 불가
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
    expect(copyToClipboard(doc, [users.id, orders.id, 'note-1', 'area-1']).copied).toBe(true)
    const pasted = pasteAll(doc)
    // 붙여넣기 후 영역은 1개 그대로 — 복제되지 않고 멤버 소속도 이어받지 않는다
    expect(pasted.doc.diagram.areas).toHaveLength(1)
    expect(pasted.doc.diagram.areas[0].tableIds).toEqual([users.id])

    // 영역만 선택했을 때는 복사 가능한 객체가 없다
    expect(copyToClipboard(doc, ['area-1']).copied).toBe(false)
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

describe('다른 문서로 붙여넣기', () => {
  /** 빈 문서 — 붙여 넣는 쪽(다른 탭에서 연 문서) */
  function emptyDoc(): EditorDocument {
    const content = emptyContent()
    return { model: content.model, diagram: content.diagram }
  }

  it('복사하면 브라우저 저장소에도 둔다 — 원본 문서와 테이블 위치를 함께 싣는다', () => {
    const doc = fixtureDoc()
    const [users] = doc.model.tables

    expect(copyToClipboard(doc, [users.id], 'model-A')).toEqual({ copied: true, shared: true })

    const stored = JSON.parse(window.localStorage.getItem(CLIPBOARD_STORAGE_KEY) ?? '{}')
    expect(stored.sourceModelId).toBe('model-A')
    expect(stored.payload.tables).toHaveLength(1)
    const origin = doc.diagram.nodes[users.id]
    expect(stored.payload.positions[users.id]).toEqual({ x: origin.x, y: origin.y })
  })

  it('다른 문서에는 화면 가운데에 놓인다 — 관계와 외래 키도 함께 온다', () => {
    const doc = fixtureDoc()
    const [users, orders] = doc.model.tables
    copyToClipboard(doc, [users.id, orders.id], 'model-A')

    const target = emptyDoc()
    const result = pasteFromClipboard(target, '사본', '', { modelId: 'model-B', center: { x: 1000, y: 500 } })
    if (!result) throw new Error('paste failed')
    const pasted = applyChanges(target, result.changes)

    expect(pasted.model.tables.map((table) => table.physicalName)).toEqual(['users_사본', 'orders_사본'])
    expect(pasted.model.relationships).toHaveLength(1)
    // 묶음이 화면 가운데를 둘러싼다 — 왼쪽 위는 가운데보다 앞에, 간격은 원본 그대로
    const a = pasted.diagram.nodes[pasted.model.tables[0].id]
    const b = pasted.diagram.nodes[pasted.model.tables[1].id]
    expect(Math.min(a.x, b.x)).toBeLessThan(1000)
    expect(Math.min(a.y, b.y)).toBeLessThan(500)
    expect(Math.max(a.x, b.x) + 330).toBeGreaterThan(1000)
    expect(b.x - a.x).toBe(doc.diagram.nodes[orders.id].x - doc.diagram.nodes[users.id].x)
  })

  it('같은 문서에서는 화면 가운데가 아니라 32px 오프셋 규칙을 따른다', () => {
    const doc = fixtureDoc()
    const [users] = doc.model.tables
    copyToClipboard(doc, [users.id], 'model-A')

    const result = pasteFromClipboard(doc, '사본', '', { modelId: 'model-A', center: { x: 1000, y: 500 } })
    const change = result?.changes[0]
    if (change?.type !== 'table/create') throw new Error('table/create expected')

    const origin = doc.diagram.nodes[users.id]
    expect(change.position).toEqual({ x: origin.x + 32, y: origin.y + 32 })
  })

  it('우클릭 붙여넣기는 누른 자리에 묶음의 왼쪽 위가 온다', () => {
    const doc = fixtureDoc()
    const [users, orders] = doc.model.tables
    copyToClipboard(doc, [users.id, orders.id], 'model-A')

    const result = pasteFromClipboard(doc, '사본', '', { modelId: 'model-A', anchor: { x: 700, y: 300 } })
    const positions = (result?.changes ?? []).flatMap((change) => (change.type === 'table/create' ? [change.position] : []))

    expect(Math.min(...positions.map((p) => p.x))).toBe(700)
    expect(Math.min(...positions.map((p) => p.y))).toBe(300)
  })

  it('다른 탭에서 더 나중에 복사한 것이 있으면 그것을 붙여 넣는다', () => {
    const doc = fixtureDoc()
    const [users, orders] = doc.model.tables
    copyToClipboard(doc, [users.id], 'model-A')
    // 다른 탭이 저장소에 새로 썼다
    window.localStorage.setItem(
      CLIPBOARD_STORAGE_KEY,
      JSON.stringify({
        payload: { tables: [orders], relationships: [], notes: [], positions: { [orders.id]: { x: 0, y: 0 } } },
        sourceModelId: 'model-C',
        copiedAt: Date.now() + 5_000,
      }),
    )

    const result = pasteFromClipboard(emptyDoc(), '사본', '', { modelId: 'model-B', center: { x: 0, y: 0 } })
    const change = result?.changes[0]
    if (change?.type !== 'table/create') throw new Error('table/create expected')
    expect(change.table.physicalName).toBe('orders_사본')
  })

  it('24시간이 지난 것과 형식이 깨진 것은 쓰지 않는다', () => {
    const doc = fixtureDoc()
    const payload = { tables: [doc.model.tables[0]], relationships: [], notes: [], positions: {} }
    window.localStorage.setItem(
      CLIPBOARD_STORAGE_KEY,
      JSON.stringify({ payload, sourceModelId: 'model-A', copiedAt: Date.now() - 25 * 60 * 60 * 1000 }),
    )
    expect(hasClipboard()).toBe(false)

    window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, '{"payload":{"tables":"nope"}')
    expect(hasClipboard()).toBe(false)
    expect(pasteFromClipboard(emptyDoc(), '사본')).toBeNull()
  })

  it('1MB를 넘으면 저장소에 두지 않는다 — 이 문서 안에서는 붙여 넣을 수 있다', () => {
    const doc = fixtureDoc()
    const [users] = doc.model.tables
    copyToClipboard(doc, [users.id], 'model-A') // 먼저 둔 작은 복사본
    const big: EditorDocument = {
      ...doc,
      model: { ...doc.model, tables: [{ ...users, comment: 'x'.repeat(1_000_001) }, doc.model.tables[1]] },
    }

    expect(copyToClipboard(big, [users.id], 'model-A')).toEqual({ copied: true, shared: false })
    // 낡은 복사본이 저장소에 남아 다른 탭에서 붙지 않게 지운다
    expect(window.localStorage.getItem(CLIPBOARD_STORAGE_KEY)).toBeNull()
    expect(pasteFromClipboard(big, '사본', '', { modelId: 'model-A' })).not.toBeNull()
  })
})

