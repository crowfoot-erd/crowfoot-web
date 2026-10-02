/**
 * 열 때 자동 배치 — 위치 없는 테이블 놓기 (docs 05-editor/02-ui.md Section 18)
 */
import { describe, expect, it } from 'vitest'
import { applyChange } from '@/features/editor/model/changes'
import { parseContent } from '@/features/editor/model/content-io'
import { placeMissingTables } from '@/features/editor/model/initial-placement'
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/model/table-size'

const column = (id: string, name: string) => ({
  id,
  physicalName: name,
  logicalName: '',
  dataType: 'BIGINT',
  length: null,
  precision: null,
  scale: null,
  nullable: false,
  autoIncrement: false,
  defaultValue: null,
  comment: '',
})

const table = (id: string, name: string, columns = 2) => ({
  id,
  physicalName: name,
  logicalName: '',
  comment: '',
  columns: Array.from({ length: columns }, (_, index) => column(`${id}-c${index}`, `col_${index}`)),
  primaryKey: { name: `pk_${name}`, columnIds: [`${id}-c0`] },
  uniques: [],
  indexes: [],
})

const relationship = (id: string, parent: string, child: string) => ({
  id,
  name: `rel_${id}`,
  fkName: `fk_${id}`,
  parentTableId: parent,
  childTableId: child,
  type: 'ONE_TO_MANY',
  identifying: false,
  parentMultiplicity: 'EXACTLY_ONE',
  childMultiplicity: 'ZERO_OR_MORE',
  columnMappings: [{ parentColumnId: `${parent}-c0`, childColumnId: `${child}-c1` }],
  onDelete: 'NO_ACTION',
  onUpdate: 'NO_ACTION',
})

function content(tables: unknown[], relationships: unknown[], nodes: Record<string, unknown>, notes: unknown[] = []) {
  return parseContent(
    JSON.stringify({ schemaVersion: 1, model: { tables, relationships }, diagram: { nodes, notes, areas: [], viewport: null } }),
  )
}

const boxOf = (doc: ReturnType<typeof content>, id: string) => {
  const t = doc.model.tables.find((x) => x.id === id)!
  const n = doc.diagram.nodes[id]
  return { x: n.x, y: n.y, w: tableRenderWidth(n.width, 0), h: estimateTableHeight(t.columns.length) }
}
const overlap = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('placeMissingTables', () => {
  it('위치가 모두 있으면 받은 본체를 그대로 돌려준다', () => {
    const doc = content([table('a', 'users')], [], { a: { x: 10, y: 20, width: null, color: 'default' } })
    expect(placeMissingTables(doc)).toBe(doc)
  })

  it('모든 테이블에 위치가 없으면 전체를 겹치지 않게 놓는다', () => {
    const doc = content(
      [table('a', 'users'), table('b', 'orders', 5), table('c', 'order_items', 4), table('d', 'audit_logs')],
      [relationship('r1', 'a', 'b'), relationship('r2', 'b', 'c')],
      {},
    )
    const placed = placeMissingTables(doc)
    const ids = ['a', 'b', 'c', 'd']
    for (const id of ids) expect(placed.diagram.nodes[id]).toBeDefined()
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        expect(overlap(boxOf(placed, ids[i]), boxOf(placed, ids[j]))).toBe(false)
      }
    }
  })

  it('같은 문서는 몇 번을 놓아도 같은 자리다', () => {
    const make = () =>
      content([table('a', 'users'), table('b', 'orders'), table('c', 'payments')], [relationship('r1', 'a', 'b')], {})
    expect(placeMissingTables(make()).diagram.nodes).toEqual(placeMissingTables(make()).diagram.nodes)
  })

  it('테이블이 하나뿐인 새 문서도 위치를 받는다', () => {
    const placed = placeMissingTables(content([table('a', 'users')], [], {}))
    expect(placed.diagram.nodes.a).toMatchObject({ width: null, color: 'default' })
  })

  it('일부에만 위치가 없으면 기존 테이블과 메모를 옮기지 않는다', () => {
    const existing = { a: { x: 100, y: 100, width: null, color: 'blue' }, b: { x: 900, y: 100, width: 420, color: 'default' } }
    const notes = [{ id: 'n1', x: 100, y: 600, width: 240, text: 'memo', title: '', color: 'yellow', linkedTableId: null }]
    const doc = content(
      [table('a', 'users'), table('b', 'orders'), table('c', 'order_items'), table('d', 'audit_logs')],
      [relationship('r1', 'b', 'c')],
      existing,
      notes,
    )
    const placed = placeMissingTables(doc)
    expect(placed.diagram.nodes.a).toEqual(doc.diagram.nodes.a)
    expect(placed.diagram.nodes.b).toEqual(doc.diagram.nodes.b)
    expect(placed.diagram.notes).toEqual(doc.diagram.notes)
    // 새 테이블은 다른 테이블과 겹치지 않는다
    const ids = ['a', 'b', 'c', 'd']
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        expect(overlap(boxOf(placed, ids[i]), boxOf(placed, ids[j]))).toBe(false)
      }
    }
    // 관계가 있는 테이블(c)은 부모(b) 가까이에, 관계가 없는 테이블(d)은 기존 배치의 오른쪽에 놓인다
    const c = placed.diagram.nodes.c
    const d = placed.diagram.nodes.d
    expect(Math.abs(c.x - 900) + Math.abs(c.y - 100)).toBeLessThan(1200)
    expect(d.x).toBeGreaterThan(900 + 420)
  })

  it('받은 본체를 바꾸지 않는다', () => {
    const doc = content([table('a', 'users'), table('b', 'orders')], [], {})
    placeMissingTables(doc)
    expect(doc.diagram.nodes).toEqual({})
  })
})

describe('위치 없는 테이블과 자동 배치', () => {
  it('node/move는 위치가 없던 테이블에 위치를 만든다 — 도구 모음의 자동 배치가 MCP가 만든 테이블도 옮긴다', () => {
    const doc = content([table('a', 'users'), table('b', 'orders')], [], { a: { x: 10, y: 20, width: 400, color: 'blue' } })
    const moved = applyChange(
      { model: doc.model, diagram: doc.diagram },
      { type: 'node/move', positions: { a: { x: 100, y: 200 }, b: { x: 700, y: 200 }, gone: { x: 1, y: 1 } } },
      'mysql',
    )
    expect(moved.diagram.nodes).toEqual({
      a: { x: 100, y: 200, width: 400, color: 'blue' },
      b: { x: 700, y: 200, width: null, color: 'default' },
    })
  })
})
