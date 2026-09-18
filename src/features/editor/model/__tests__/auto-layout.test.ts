import { describe, expect, it } from 'vitest'

import { applyChange, createColumn, createTable } from '@/features/editor/model/changes'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { emptyContent } from '@/features/editor/model/content-io'
import { buildRelationship } from '@/features/editor/model/relationship'
import { buildLayoutGraph, layoutTablePositions, orderFkColumns, positionNotes } from '@/features/editor/model/auto-layout'
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/components/canvas/TableNode'

function doc(): EditorDocument {
  return { model: emptyContent().model, diagram: emptyContent().diagram }
}

/** PK 하나 + 일반 컬럼 (columns-1)개 테이블을 (0,0)에 추가 */
function seedTable(d: EditorDocument, id: string, columns = 2): EditorDocument {
  const cols = [createColumn({ id: `${id}-pk`, physicalName: 'id', dataType: 'BIGINT', nullable: false })]
  for (let i = 1; i < columns; i += 1) {
    cols.push(createColumn({ id: `${id}-c${i}`, physicalName: `col_${i}`, dataType: 'VARCHAR', length: 50 }))
  }
  const table = createTable(`tb_${id.toLowerCase()}`, {
    id,
    columns: cols,
    primaryKey: { name: `${id}_pk`, columnIds: [`${id}-pk`] },
  })
  return applyChange(d, { type: 'table/create', table, position: { x: 0, y: 0 } })
}

function seedRelation(d: EditorDocument, parentId: string, childId: string, identifying = false): EditorDocument {
  const parent = d.model.tables.find((t) => t.id === parentId)
  const child = d.model.tables.find((t) => t.id === childId)
  if (!parent || !child) throw new Error('seed 테이블 없음')
  const built = buildRelationship({
    parentTable: parent,
    childTable: child,
    type: 'ONE_TO_MANY',
    identifying,
    parentMultiplicity: 'EXACTLY_ONE',
    childMultiplicity: 'ONE_OR_MORE',
  })
  if (!built.ok) throw new Error('unreachable')
  return applyChange(d, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns })
}

/** 추정 크기(라우터 장애물과 같은 식)로 AABB를 만든다 */
function boxesOf(d: EditorDocument, positions: Record<string, { x: number; y: number }>) {
  return d.model.tables.map((table) => {
    const layout = d.diagram.nodes[table.id]
    return {
      id: table.id,
      x: positions[table.id].x,
      y: positions[table.id].y,
      w: tableRenderWidth(layout?.width ?? null, 0),
      h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length),
    }
  })
}

describe('auto-layout — buildLayoutGraph 조립', () => {
  it('노드 = 테이블 전체(노트 제외), 크기 = 렌더 추정식, 엣지 = 부모→자식', () => {
    let d = doc()
    d = seedTable(d, 'A')
    d = seedTable(d, 'B')
    d = seedRelation(d, 'A', 'B')
    d = { ...d, diagram: { ...d.diagram, notes: [{ id: 'n-1', x: 0, y: 0, width: 360, text: '메모', title: '', color: 'yellow', linkedTableId: null }] } }

    const graph = buildLayoutGraph(d)
    expect(graph.children).toHaveLength(2) // 노트는 그래프에 없다
    expect(graph.children?.map((c) => c.id).sort()).toEqual(['A', 'B'])
    const a = d.model.tables[0]
    expect(graph.children?.[0].width).toBe(tableRenderWidth(d.diagram.nodes['A'].width, 0))
    expect(graph.children?.[0].height).toBe(estimateTableHeight(a.columns.length, a.uniques.length + a.indexes.length))
    expect(graph.edges).toEqual([{ id: d.model.relationships[0].id, sources: ['A'], targets: ['B'] }])
    expect(graph.layoutOptions?.['elk.algorithm']).toBe('layered')
    expect(graph.layoutOptions?.['elk.direction']).toBe('DOWN')
  })

  it('자기 참조(부모===자식) 관계는 엣지에서 제외한다', () => {
    let d = doc()
    d = seedTable(d, 'A')
    d = seedRelation(d, 'A', 'A') // 자기 참조 — 생성은 허용된다(01-core.md §12.1)
    const graph = buildLayoutGraph(d)
    expect(graph.edges).toHaveLength(0)
    expect(graph.children).toHaveLength(1)
  })
})

describe('auto-layout — layoutTablePositions (실 elkjs)', () => {
  it('A→B→C 체인은 부모가 위 레벨로 배치된다 (FK 참조 방향 = DOWN)', async () => {
    let d = doc()
    d = seedTable(d, 'A')
    d = seedTable(d, 'B')
    d = seedTable(d, 'C')
    d = seedRelation(d, 'A', 'B')
    d = seedRelation(d, 'B', 'C')

    const positions = await layoutTablePositions(d)
    expect(positions.A.y).toBeLessThan(positions.B.y)
    expect(positions.B.y).toBeLessThan(positions.C.y)
    // 노드가 세로로 겹치지 않는다 (부모 하단 ≤ 자식 상단)
    const boxes = boxesOf(d, positions)
    expect(boxes[0].y + boxes[0].h).toBeLessThanOrEqual(boxes[1].y)
    expect(boxes[1].y + boxes[1].h).toBeLessThanOrEqual(boxes[2].y)
  })

  it('모든 테이블 좌표를 포함한다 — 관계 없는 테이블도 포함', async () => {
    let d = doc()
    d = seedTable(d, 'A')
    d = seedTable(d, 'B')
    d = seedTable(d, 'ISLAND') // 관계 없는 고립 테이블
    d = seedRelation(d, 'A', 'B')

    const positions = await layoutTablePositions(d)
    expect(Object.keys(positions).sort()).toEqual(['A', 'B', 'ISLAND'])
    for (const p of Object.values(positions)) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('추정 크기 기준 어떤 두 테이블도 겹치지 않는다', async () => {
    let d = doc()
    for (const id of ['A', 'B', 'C', 'D']) d = seedTable(d, id, 5)
    d = seedRelation(d, 'A', 'B')
    d = seedRelation(d, 'A', 'C')
    d = seedRelation(d, 'C', 'D')

    const positions = await layoutTablePositions(d)
    const boxes = boxesOf(d, positions)
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [p, q] = [boxes[i], boxes[j]]
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
        expect(overlap, `${p.id}와 ${q.id}가 겹침`).toBe(false)
      }
    }
  })

  it('상호 참조(A↔B 순환)에서도 예외 없이 좌표를 낸다', async () => {
    let d = doc()
    d = seedTable(d, 'A')
    d = seedTable(d, 'B')
    d = seedRelation(d, 'A', 'B')
    d = seedRelation(d, 'B', 'A')

    const positions = await layoutTablePositions(d)
    expect(Object.keys(positions).sort()).toEqual(['A', 'B'])
  })

  it('테이블이 2개 미만이면 빈 객체를 돌려준다', async () => {
    expect(await layoutTablePositions(doc())).toEqual({})
    let d = doc()
    d = seedTable(d, 'A')
    expect(await layoutTablePositions(d)).toEqual({})
  })
})

describe('auto-layout — positionNotes(노트 겹침 방지 배치)', () => {
  it('연관 노트를 테이블 우측(폭+24)에 상단 정렬로 붙인다', () => {
    let d = doc()
    d = seedTable(d, 'A')
    d = seedTable(d, 'B')
    d = {
      ...d,
      diagram: {
        ...d.diagram,
        notes: [{ id: 'n-1', x: 0, y: 0, width: 360, text: '메모', title: '', color: 'yellow', linkedTableId: 'A' }],
      },
    }

    const positions = { A: { x: 100, y: 200 }, B: { x: 100, y: 500 } }
    const notes = positionNotes(d, positions)
    const aWidth = tableRenderWidth(d.diagram.nodes['A'].width, 0)
    expect(notes['n-1']).toEqual({ x: 100 + aWidth + 24, y: 200 })
  })

  it('같은 테이블에 여러 노트가 붙으면 문서 순서로 아래에 쌓는다', () => {
    let d = doc()
    d = seedTable(d, 'A')
    const note = (id: string) => ({ id, x: 0, y: 0, width: 200, text: '', title: '', color: 'yellow' as const, linkedTableId: 'A' })
    d = { ...d, diagram: { ...d.diagram, notes: [note('n-1'), note('n-2')] } }

    const notes = positionNotes(d, { A: { x: 0, y: 0 } })
    expect(notes['n-1']!.y).toBe(0)
    expect(notes['n-2']!.y).toBe(150 + 16) // 노트 높이 추정 150 + 간격 16
    expect(notes['n-2']!.x).toBe(notes['n-1']!.x)
  })

  it('연관 노트의 우측 스택 자리에 다른 테이블이 있으면 겹치지 않게 오른쪽으로 민다', () => {
    let d = doc()
    d = seedTable(d, 'A')
    d = seedTable(d, 'B')
    d = {
      ...d,
      diagram: {
        ...d.diagram,
        notes: [{ id: 'n-1', x: 0, y: 0, width: 360, text: '', title: '', color: 'yellow', linkedTableId: 'A' }],
      },
    }

    // A 우측(폭+24)에 B가 배치돼 있어 노트가 B와 포개진다
    const aWidth = tableRenderWidth(d.diagram.nodes['A'].width, 0)
    const notes = positionNotes(d, { A: { x: 0, y: 0 }, B: { x: aWidth + 100, y: 0 } })
    expect(notes['n-1']!.x).toBe(aWidth + 100 + aWidth + 24) // B 우측으로 밀려난다
    expect(notes['n-1']!.y).toBe(0)
  })

  it('측정 크기(sizes)를 주면 추정치 대신 우선한다 — 컬럼명이 길어 실측 폭이 더 클 때 간격이 벌어진다', () => {
    let d = doc()
    d = seedTable(d, 'A')
    d = {
      ...d,
      diagram: {
        ...d.diagram,
        notes: [{ id: 'n-1', x: 0, y: 0, width: 200, text: '', title: '', color: 'yellow', linkedTableId: 'A' }],
      },
    }

    const notes = positionNotes(d, { A: { x: 0, y: 0 } }, { A: { w: 400, h: 200 } })
    expect(notes['n-1']).toEqual({ x: 400 + 24, y: 0 }) // 추정 폭 340이 아니라 실측 400 기준
  })

  it('자유 노트는 겹칠 때만 콘텐츠 우측 여백 열로 옮기고, 대상 테이블이 없는 연관 노트도 자유 노트로 다룬다', () => {
    let d = doc()
    d = seedTable(d, 'A')
    d = {
      ...d,
      diagram: {
        ...d.diagram,
        notes: [
          { id: 'n-free', x: 10, y: 10, width: 200, text: '', title: '', color: 'yellow', linkedTableId: null },
          { id: 'n-away', x: 900, y: 10, width: 200, text: '', title: '', color: 'yellow', linkedTableId: null },
          { id: 'n-gone', x: 20, y: 20, width: 200, text: '', title: '', color: 'yellow', linkedTableId: 'GONE' },
        ],
      },
    }

    const notes = positionNotes(d, { A: { x: 0, y: 0 } })
    const aWidth = tableRenderWidth(d.diagram.nodes['A'].width, 0)
    // A(0,0)와 포개진 노트만 콘텐츠 우측 열로 — 안 겹친 n-away는 움직이지 않는다(키도 없다)
    expect(notes['n-free']).toEqual({ x: aWidth + 24, y: 0 })
    expect(notes['n-gone']).toEqual({ x: aWidth + 24, y: 150 + 16 })
    expect(notes['n-away']).toBeUndefined()
    // 배치 결과가 비어도(테이블 2개 미만 등) 노트는 움직이지 않는다
    expect(positionNotes(d, {})).toEqual({})
  })
})

describe('auto-layout — orderFkColumns(FK 순서 = 부모 위치 정렬)', () => {
  /** CHILD에 L·M·R 부모를 붙인다 — 관계는 선두 PK 블록 뒤에 FK를 끼워 넣으므로
   *  생성 순서 [p1, p2, p3]의 문서 FK 순서는 [p3, p2, p1](역순)이 된다 */
  function childWithParents(order: string[], identifyingFirst = false) {
    let d = doc()
    for (const id of ['L', 'M', 'R']) d = seedTable(d, id)
    d = seedTable(d, 'CHILD')
    order.forEach((parent, i) => {
      d = seedRelation(d, parent, 'CHILD', identifyingFirst && i === 0)
    })
    return d
  }

  /** CHILD(500,600) 위에 부모들이 y=0 행에 좌·중·우로 늘어선 배치 좌표 */
  const aboveLayout: Record<string, { x: number; y: number }> = {
    L: { x: 0, y: 0 },
    M: { x: 500, y: 0 },
    R: { x: 1000, y: 0 },
    CHILD: { x: 500, y: 600 },
  }

  const names = (d: EditorDocument, tableId: string) =>
    d.model.tables.find((t) => t.id === tableId)!.columns.map((c) => c.physicalName)
  const colId = (d: EditorDocument, tableId: string, physicalName: string) => {
    const col = d.model.tables.find((t) => t.id === tableId)!.columns.find((c) => c.physicalName === physicalName)
    if (!col) throw new Error(`컬럼 없음: ${physicalName}`)
    return col.id
  }
  const applyAll = (d: EditorDocument, changes: ReturnType<typeof orderFkColumns>) =>
    changes.reduce((acc, change) => applyChange(acc, change), d)

  it('위 레이어 부모들은 좌→우 순으로 FK가 재배치되고, PK·일반 컬럼 자리는 그대로다', () => {
    const d = childWithParents(['M', 'L', 'R']) // 문서 FK 순서 [r, l, m]
    const changes = orderFkColumns(d, aboveLayout)
    // 원하는 순서 [l, m, r]로 가는 최소 이동 — 비FK(id, col_1) 자리는 침범하지 않는다
    expect(changes).toEqual([
      { type: 'column/move', tableId: 'CHILD', columnId: colId(d, 'CHILD', 'tb_l_id'), toIndex: 1 },
      { type: 'column/move', tableId: 'CHILD', columnId: colId(d, 'CHILD', 'tb_m_id'), toIndex: 2 },
    ])
    expect(names(applyAll(d, changes), 'CHILD')).toEqual(['id', 'tb_l_id', 'tb_m_id', 'tb_r_id', 'col_1'])
  })

  it('이미 부모 위치 순이면 변경을 만들지 않는다', () => {
    const d = childWithParents(['R', 'M', 'L']) // 문서 FK 순서 [l, m, r] — 이미 정렬
    expect(orderFkColumns(d, aboveLayout)).toEqual([])
  })

  it('좌·우로 붙은 부모는 좌측 면의 FK가 먼저 온다', () => {
    let d = doc()
    d = seedTable(d, 'L')
    d = seedTable(d, 'R')
    d = seedTable(d, 'CHILD')
    d = seedRelation(d, 'L', 'CHILD')
    d = seedRelation(d, 'R', 'CHILD') // 문서 FK 순서 [r, l]
    const changes = orderFkColumns(d, { L: { x: 0, y: 600 }, R: { x: 1000, y: 600 }, CHILD: { x: 500, y: 600 } })
    expect(names(applyAll(d, changes), 'CHILD')).toEqual(['id', 'tb_l_id', 'tb_r_id', 'col_1'])
  })

  it('식별 관계 FK(자식 PK 소속)는 순서를 바꾸지 않는다', () => {
    const d = childWithParents(['L', 'R', 'M'], true) // L만 식별 — PK 블록에 속한다
    const changes = orderFkColumns(d, aboveLayout)
    // PK 소속 tb_l_id는 index 1 그대로, 비식별 m·r만 부모 x 순으로
    expect(names(applyAll(d, changes), 'CHILD')).toEqual(['id', 'tb_l_id', 'tb_m_id', 'tb_r_id', 'col_1'])
  })

  it('위치를 모르는 부모의 FK는 현 순서를 유지한다(정렬된 형제들 뒤로 간다)', () => {
    const d = childWithParents(['M', 'L', 'R']) // 문서 FK 순서 [r, l, m]
    const partial = { ...aboveLayout }
    delete partial.M
    const changes = orderFkColumns(d, partial)
    // l·r만 좌→우로 정렬되고, 위치를 모르는 m은 그 뒤 원순으로
    expect(names(applyAll(d, changes), 'CHILD')).toEqual(['id', 'tb_l_id', 'tb_r_id', 'tb_m_id', 'col_1'])
  })

  it('FK가 하나뿐이거나 배치 결과가 비면 정렬하지 않는다', () => {
    let d = doc()
    d = seedTable(d, 'L')
    d = seedTable(d, 'CHILD')
    d = seedRelation(d, 'L', 'CHILD')
    expect(orderFkColumns(d, { L: { x: 0, y: 0 }, CHILD: { x: 500, y: 600 } })).toEqual([])
    expect(orderFkColumns(d, {})).toEqual([])
  })
})
