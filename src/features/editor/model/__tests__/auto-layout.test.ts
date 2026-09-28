import { describe, expect, it } from 'vitest'

import { applyChange, createColumn, createTable } from '@/features/editor/model/changes'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { emptyContent } from '@/features/editor/model/content-io'
import { buildRelationship } from '@/features/editor/model/relationship'
import { buildLayoutGraph, DEFAULT_LAYOUT_SPACING, layoutHubPositions, layoutTablePositions, orderFkColumns, positionNotes, refineHubAlignment } from '@/features/editor/model/auto-layout'
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/components/canvas/TableNode'
import { relationshipSharedRoutes } from '@/features/editor/components/canvas/edge-route-table'

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

describe('auto-layout — refineHubAlignment(허브를 아래 자식에 맞춤)', () => {
  const tw = tableRenderWidth(null, 0) // 시드 테이블 폭(추정식)
  /** 허브 구조: P → H, H → C1(왼쪽 멀리)·C2(오른쪽 가까이) — ELK가 H를 부모 P와
   *  정렬시킨 모양(중심 일치)을 position 시드로 흉내 낸다 */
  const hubDoc = () => {
    let d = doc()
    d = seedTable(d, 'P')
    d = seedTable(d, 'H')
    d = seedTable(d, 'C1')
    d = seedTable(d, 'C2')
    d = seedRelation(d, 'P', 'H')
    d = seedRelation(d, 'H', 'C1')
    d = seedRelation(d, 'H', 'C2')
    return d
  }

  it('부모 1·자식 2 이상인 허브는 아래 자식 중 중심이 가장 가까운 자식과 세로 정렬한다', () => {
    const d = hubDoc()
    const positions = {
      P: { x: 100, y: 0 },
      H: { x: 100, y: 300 }, // 중심 = P 중심(부모 정렬)
      C1: { x: -400, y: 600 }, // 왼쪽 멀리 — 좌측 관계선이 몰리는 패턴
      C2: { x: 180, y: 600 }, // 오른쪽 가까이 — 정렬 대상
    }
    const out = refineHubAlignment(d, positions)
    expect(out.H).toEqual({ x: 180, y: 300 }) // H 중심 = C2 중심
    expect(out.P).toEqual(positions.P) // 허브만 움직인다
    expect(out.C1).toEqual(positions.C1)
    expect(out.C2).toEqual(positions.C2)
  })

  it('이동한 자리에 같은 띈 테이블이 있으면 관계선 통로(96)를 남기고 되돌린다', () => {
    let d = hubDoc()
    d = seedTable(d, 'X') // 같은 띈 이웃 — 정렬 목표 지점을 막는다
    const positions = {
      P: { x: 100, y: 0 },
      H: { x: 100, y: 300 },
      C1: { x: -400, y: 600 },
      C2: { x: 420, y: 600 },
      X: { x: 500, y: 300 }, // H가 +320 가면(→420) X와 겹친다(500 < 420+tw)
    }
    const out = refineHubAlignment(d, positions)
    // 라우터 마진(24)+밀착 부풀림(±22) 양쪽 = 24+22+22+24 ≈ 92 — 두 테이블 사이에
    // 레인이 들어가려면 96은 필요하다(60이면 잔존 밀착 4px)
    expect(out.H.x).toBe(500 - 96 - tw) // X 좌측 면에 96px 두고 서는 그만큼만 간다
  })

  it('부모가 2면 허브가 아니다 — 그대로 둔다', () => {
    let d = hubDoc()
    d = seedTable(d, 'P2')
    d = seedRelation(d, 'P2', 'H')
    const positions = {
      P: { x: 100, y: 0 },
      P2: { x: 500, y: 0 },
      H: { x: 100, y: 300 },
      C1: { x: -400, y: 600 },
      C2: { x: 180, y: 600 },
    }
    expect(refineHubAlignment(d, positions).H).toEqual(positions.H)
  })
})

describe('auto-layout — 그룹 클러스터링 (v1.13)', () => {
  /** 문서에 그룹을 직접 심는다 — 체인지 경유 없이 배치 입력만 만든다 */
  function seedAreas(d: EditorDocument, ...areas: Array<{ id: string; name: string; tableIds: string[] }>): EditorDocument {
    return {
      ...d,
      diagram: {
        ...d.diagram,
        areas: areas.map((area) => ({ ...area, description: '', color: 'default' })),
      },
    }
  }

  /** 테이블들의 화면 AABB 합집합 — 그룹 덩어리의 경계 */
  function bboxOf(d: EditorDocument, positions: Record<string, { x: number; y: number }>, ids: string[]) {
    const boxes = boxesOf(d, positions).filter((box) => ids.includes(box.id))
    return {
      left: Math.min(...boxes.map((b) => b.x)),
      top: Math.min(...boxes.map((b) => b.y)),
      right: Math.max(...boxes.map((b) => b.x + b.w)),
      bottom: Math.max(...boxes.map((b) => b.y + b.h)),
    }
  }

  it('그래프 조립 — 그룹마다 컴파운드 노드, 그룹 내 엣지는 그룹에·경계 엣지는 루트에', () => {
    let d = doc()
    for (const id of ['A', 'B', 'C', 'D']) d = seedTable(d, id)
    const ab = seedRelation(d, 'A', 'B')
    d = ab
    d = seedRelation(d, 'C', 'D') // 그룹2 내부
    d = seedRelation(d, 'B', 'C') // 그룹 경계
    const bc = d.model.relationships[d.model.relationships.length - 1]!
    d = seedAreas(
      d,
      { id: 'G1', name: '회원', tableIds: ['A', 'B'] },
      { id: 'G2', name: '주문', tableIds: ['C', 'D'] },
    )

    const graph = buildLayoutGraph(d)
    expect(graph.children?.map((c) => c.id).sort()).toEqual(['group:G1', 'group:G2'])
    const g1 = graph.children?.find((c) => c.id === 'group:G1')
    expect(g1?.children?.map((c) => c.id)).toEqual(['A', 'B'])
    expect(g1?.edges?.map((e) => e.id)).toEqual([ab.model.relationships[0].id]) // A→B는 그룹 안에
    expect(graph.edges).toEqual([{ id: bc.id, sources: ['B'], targets: ['C'] }]) // B→C는 루트에
    expect(graph.layoutOptions?.['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN')
  })

  it('다중 소속 테이블은 문서 순서 첫 그룹에만 들어간다(groupColorOf와 같은 규칙)', () => {
    let d = doc()
    for (const id of ['A', 'SHARED', 'D']) d = seedTable(d, id)
    d = seedAreas(
      d,
      { id: 'G1', name: '회원', tableIds: ['A', 'SHARED'] },
      { id: 'G2', name: '주문', tableIds: ['SHARED', 'D'] },
    )

    const graph = buildLayoutGraph(d)
    const g1 = graph.children?.find((c) => c.id === 'group:G1')
    const g2 = graph.children?.find((c) => c.id === 'group:G2')
    expect(g1?.children?.map((c) => c.id)).toEqual(['A', 'SHARED'])
    expect(g2?.children?.map((c) => c.id)).toEqual(['D'])
  })

  it('같은 그룹은 하나의 덩어리로 모인다 — 그룹 bbox끼리 겹치지 않고 미소속은 밖', async () => {
    let d = doc()
    for (const id of ['A', 'B', 'C', 'D', 'ISLAND']) d = seedTable(d, id)
    d = seedRelation(d, 'A', 'B')
    d = seedRelation(d, 'C', 'D')
    d = seedAreas(
      d,
      { id: 'G1', name: '회원', tableIds: ['A', 'B'] },
      { id: 'G2', name: '주문', tableIds: ['C', 'D'] },
    )

    const positions = await layoutTablePositions(d)
    expect(Object.keys(positions).sort()).toEqual(['A', 'B', 'C', 'D', 'ISLAND'])
    const g1 = bboxOf(d, positions, ['A', 'B'])
    const g2 = bboxOf(d, positions, ['C', 'D'])
    // 덩어리끼리 겹치지 않는다 — 모여 있음의 판정
    const separated = g1.right <= g2.left || g2.right <= g1.left || g1.bottom <= g2.top || g2.bottom <= g1.top
    expect(separated).toBe(true)
    // 미소속 고립 테이블은 어느 덩어리 안에도 있지 않다
    const island = positions.ISLAND
    const inside = (b: ReturnType<typeof bboxOf>) => island.x >= b.left && island.x < b.right && island.y >= b.top && island.y < b.bottom
    expect(inside(g1)).toBe(false)
    expect(inside(g2)).toBe(false)
    // 그룹 안에서도 계층 규칙(부모가 위)은 유지된다
    const boxes = boxesOf(d, positions)
    const a = boxes.find((b) => b.id === 'A')
    const b = boxes.find((b) => b.id === 'B')
    expect(a!.y + a!.h).toBeLessThanOrEqual(b!.y)
  })

  it('그룹 경계 관계(B→C)에서도 부모 그룹이 위·자식 그룹이 아래로 배치된다', async () => {
    let d = doc()
    for (const id of ['A', 'B', 'C', 'D']) d = seedTable(d, id)
    d = seedRelation(d, 'A', 'B')
    d = seedRelation(d, 'C', 'D')
    d = seedRelation(d, 'B', 'C')
    d = seedAreas(
      d,
      { id: 'G1', name: '회원', tableIds: ['A', 'B'] },
      { id: 'G2', name: '주문', tableIds: ['C', 'D'] },
    )

    const positions = await layoutTablePositions(d)
    const g1 = bboxOf(d, positions, ['A', 'B'])
    const g2 = bboxOf(d, positions, ['C', 'D'])
    expect(g1.bottom).toBeLessThanOrEqual(g2.top) // B(부모) 그룹이 위
    // 덩어리 사이 복도 — 경계 관계선이 몰려 지나가는 곳이라 그룹 안 레이어 간격보다
    // 넉넉해야 한다(선이 인접 테이블에 밀착하는 실사용 회귀 방지, GROUP_PADDING×2)
    const boxes = boxesOf(d, positions)
    const a = boxes.find((b) => b.id === 'A')!
    const b = boxes.find((b) => b.id === 'B')!
    const intraGap = b.y - (a.y + a.h)
    const corridor = g2.top - g1.bottom
    expect(corridor).toBeGreaterThanOrEqual(intraGap + 150)
  })

  it('그룹이 없으면 계층 교차 처리를 켜지 않는다 — 평면 그래프는 예전 결과를 유지한다', () => {
    let d = doc()
    for (const id of ['A', 'B']) d = seedTable(d, id)
    d = seedRelation(d, 'A', 'B')

    const graph = buildLayoutGraph(d)
    expect(graph.children?.map((c) => c.id)).toEqual(['A', 'B']) // 루트에 테이블이 직접
    expect(graph.layoutOptions).not.toHaveProperty('elk.hierarchyHandling')
  })

  it('그룹 안 멤버 간격도 배치 간격 옵션을 따른다 — 같은 그룹 최소 간격 ≥ nodeNode', async () => {
    // 루트에만 spacing 옵션을 걸면 ELK가 컴파운드 자식에는 기본 간격(실측 110)을 써서
    // 그룹 안 테이블이 붙어 배치되고 관계선 식별이 안 되는 회귀(v1.13 실사용 피드백) —
    // 그룹 노드에도 옵션이 전파돼야 같은 그룹 간격이 nodeNode(140) 이상으로 벌어진다
    let d = doc()
    for (const id of ['P', 'L', 'C', 'R', 'ISLAND']) d = seedTable(d, id, 12)
    d = seedRelation(d, 'P', 'L')
    d = seedRelation(d, 'P', 'C')
    d = seedRelation(d, 'P', 'R')
    d = seedAreas(d, { id: 'G1', name: '회원', tableIds: ['P', 'L', 'C', 'R'] })

    const positions = await layoutTablePositions(d)
    const boxes = boxesOf(d, positions).filter((b) => b.id !== 'ISLAND')
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [p, q] = [boxes[i], boxes[j]]
        const dx = Math.max(p.x - (q.x + q.w), q.x - (p.x + p.w), 0)
        const dy = Math.max(p.y - (q.y + q.h), q.y - (p.y + p.h), 0)
        const gap = dx === 0 ? dy : dy === 0 ? dx : Math.hypot(dx, dy)
        expect(gap, `${p.id}↔${q.id} 간격 ${Math.round(gap)}`).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_SPACING.nodeNode)
      }
    }
  })

  it('그룹 클러스터 배치 위 라우팅 — 어떤 관계선도 양 끝이 아닌 테이블 뒤로 지나가지 않는다', async () => {
    // 클러스터링이 간격 전제를 무너뜨리면 라우터 복도 AABB 밖 장애물을 그리드가 못 보고
    // 선이 테이블 뒤로 숨는다(2026-09 실사용 회귀 — 실문서 유형 18테이블·18관계로 재현).
    // 배치→라우팅 통합 불변식: 관계선은 양 끝 테이블이 아닌 어떤 테이블 내부도 지나지 않는다
    const shapes: Array<[id: string, columns: number]> = [
      ['mbr', 12], ['mbr_grade', 8], ['mbr_addr', 10], ['login_hist', 14],
      ['prd', 16], ['prd_cat', 9], ['prd_img', 7], ['inv', 11],
      ['ord', 15], ['ord_item', 12], ['pay', 10], ['dlv', 8],
      ['rvw', 9], ['cart', 7], ['stc', 12], ['sup', 6], ['cnf', 5], ['bbs', 8],
    ]
    const links: Array<[parent: string, child: string]> = [
      ['mbr', 'mbr_grade'], ['mbr', 'mbr_addr'], ['mbr', 'login_hist'],
      ['prd_cat', 'prd'], ['prd', 'prd_img'], ['prd', 'inv'],
      ['mbr', 'ord'], ['ord', 'ord_item'], ['prd', 'ord_item'], ['ord', 'pay'], ['ord', 'dlv'],
      ['mbr', 'rvw'], ['prd', 'rvw'], ['mbr', 'cart'], ['prd', 'cart'],
      ['sup', 'stc'], ['prd', 'stc'], ['mbr', 'bbs'],
    ]
    let d = doc()
    for (const [id, columns] of shapes) d = seedTable(d, id, columns)
    for (const [parent, child] of links) d = seedRelation(d, parent, child)
    // g1: 내부 관계가 하나도 없는 그룹(관계선이 전부 복도 밖으로 나가는 형태) + g2: 잔여
    d = seedAreas(
      d,
      { id: 'G1', name: '내부무관계', tableIds: ['mbr', 'prd', 'ord', 'stc', 'cnf'] },
      { id: 'G2', name: '잔여', tableIds: ['mbr_grade', 'mbr_addr', 'login_hist', 'prd_cat', 'prd_img', 'inv', 'ord_item', 'pay', 'dlv', 'rvw', 'cart', 'sup', 'bbs'] },
    )

    const positions = await layoutTablePositions(d)
    const boxes = boxesOf(d, positions)
    const boxById = Object.fromEntries(boxes.map((b) => [b.id, { x: b.x, y: b.y, w: b.w, h: b.h }]))
    const { routes } = relationshipSharedRoutes(
      d,
      'sig-cluster-regression',
      d.model.tables,
      d.model.relationships,
      (id) => boxById[id] ?? null,
    )
    expect(routes.size).toBe(d.model.relationships.length)

    const EPS = 0.5 // 경계 스침 허용 — 내부 관통만 실패
    for (const relationship of d.model.relationships) {
      const points = routes.get(relationship.id)!.points
      expect(points.length).toBeGreaterThanOrEqual(2)
      for (let k = 1; k < points.length; k += 1) {
        const [p1, p2] = [points[k - 1]!, points[k]!]
        expect(p1.x === p2.x || p1.y === p2.y, `관계 ${relationship.id} 선분이 직교가 아님`).toBe(true)
        for (const box of boxes) {
          if (box.id === relationship.parentTableId || box.id === relationship.childTableId) continue
          const hit =
            p1.y === p2.y
              ? p1.y > box.y + EPS && p1.y < box.y + box.h - EPS && Math.max(p1.x, p2.x) > box.x + EPS && Math.min(p1.x, p2.x) < box.x + box.w - EPS
              : p1.x > box.x + EPS && p1.x < box.x + box.w - EPS && Math.max(p1.y, p2.y) > box.y + EPS && Math.min(p1.y, p2.y) < box.y + box.h - EPS
          expect(hit, `관계 ${relationship.id} 선분 (${p1.x},${p1.y})→(${p2.x},${p2.y})가 테이블 ${box.id} 뒤로 지나감`).toBe(false)
        }
      }
    }
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

describe('auto-layout — layoutHubPositions(허브 중심 방사형, v1.25)', () => {
  /** 문서에 그룹을 직접 심는다 — 체인지 경유 없이 배치 입력만 만든다 */
  function seedAreas(d: EditorDocument, ...areas: Array<{ id: string; name: string; tableIds: string[] }>): EditorDocument {
    return {
      ...d,
      diagram: {
        ...d.diagram,
        areas: areas.map((area) => ({ ...area, description: '', color: 'default' })),
      },
    }
  }

  const center = (box: { x: number; y: number; w: number; h: number }) => ({
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
  })
  const centerById = (d: EditorDocument, positions: Record<string, { x: number; y: number }>) =>
    Object.fromEntries(boxesOf(d, positions).map((box) => [box.id, center(box)]))
  /** 두 AABB의 최소 간격(대각이면 직선 거리) — 좌표는 int 반올림이라 허용치 2 */
  const gapOf = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }) => {
    const dx = Math.max(p.x - (q.x + q.w), q.x - (p.x + p.w), 0)
    const dy = Math.max(p.y - (q.y + q.h), q.y - (p.y + p.h), 0)
    return dx === 0 ? dy : dy === 0 ? dx : Math.hypot(dx, dy)
  }
  const bboxOf = (d: EditorDocument, positions: Record<string, { x: number; y: number }>, ids: string[]) => {
    const boxes = boxesOf(d, positions).filter((box) => ids.includes(box.id))
    return {
      left: Math.min(...boxes.map((b) => b.x)),
      top: Math.min(...boxes.map((b) => b.y)),
      right: Math.max(...boxes.map((b) => b.x + b.w)),
      bottom: Math.max(...boxes.map((b) => b.y + b.h)),
    }
  }

  it('테이블이 2개 미만이면 빈 객체를 돌려준다 (계층형 가드와 동일)', () => {
    expect(layoutHubPositions(doc())).toEqual({})
    let d = doc()
    d = seedTable(d, 'A')
    expect(layoutHubPositions(d)).toEqual({})
  })

  it('스타 — 허브가 중앙, 리프는 등거리 사분면(우상·우하·좌하·좌상)에 펼쳐진다', () => {
    let d = doc()
    d = seedTable(d, 'P')
    for (const id of ['L1', 'L2', 'L3', 'L4']) d = seedTable(d, id)
    for (const id of ['L1', 'L2', 'L3', 'L4']) d = seedRelation(d, 'P', id)

    const positions = layoutHubPositions(d)
    const c = centerById(d, positions)
    const distances = ['L1', 'L2', 'L3', 'L4'].map(
      (id) => Math.hypot(c[id].cx - c.P.cx, c[id].cy - c.P.cy),
    )
    for (const distance of distances) {
      expect(Math.abs(distance - distances[0])).toBeLessThanOrEqual(1.5)
    }
    // 시작각 12시·리프 균등 분할의 이등분선 — L1 우상(dx>0, dy<0), L2 우하, L3 좌하, L4 좌상
    const rel = (id: string) => ({ dx: c[id].cx - c.P.cx, dy: c[id].cy - c.P.cy })
    expect(rel('L1').dx).toBeGreaterThan(0)
    expect(rel('L1').dy).toBeLessThan(0)
    expect(rel('L2').dx).toBeGreaterThan(0)
    expect(rel('L2').dy).toBeGreaterThan(0)
    expect(rel('L3').dx).toBeLessThan(0)
    expect(rel('L3').dy).toBeGreaterThan(0)
    expect(rel('L4').dx).toBeLessThan(0)
    expect(rel('L4').dy).toBeLessThan(0)
  })

  it('추정 크기 기준 어떤 두 테이블도 겹치지 않는다 (스타 + 체인 꼬리 + 다양한 폭)', () => {
    let d = doc()
    d = seedTable(d, 'P', 10)
    d = seedTable(d, 'L1', 5)
    d = seedTable(d, 'L2', 14)
    d = seedTable(d, 'L3', 7)
    d = seedTable(d, 'C1', 12)
    d = seedTable(d, 'C2', 4)
    d = seedRelation(d, 'P', 'L1')
    d = seedRelation(d, 'P', 'L2')
    d = seedRelation(d, 'P', 'L3')
    d = seedRelation(d, 'L1', 'C1')
    d = seedRelation(d, 'C1', 'C2')

    const boxes = boxesOf(d, layoutHubPositions(d))
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [p, q] = [boxes[i], boxes[j]]
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
        expect(overlap, `${p.id}와 ${q.id}가 겹침`).toBe(false)
      }
    }
  })

  it('단일 성분 문서의 모든 쌍 최소 간격 ≥ nodeNode (반올림 허용치 2)', () => {
    let d = doc()
    d = seedTable(d, 'P', 10)
    d = seedTable(d, 'L1', 5)
    d = seedTable(d, 'L2', 14)
    d = seedTable(d, 'L3', 7)
    d = seedTable(d, 'C1', 12)
    d = seedRelation(d, 'P', 'L1')
    d = seedRelation(d, 'P', 'L2')
    d = seedRelation(d, 'P', 'L3')
    d = seedRelation(d, 'L2', 'C1')

    const boxes = boxesOf(d, layoutHubPositions(d))
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const gap = gapOf(boxes[i], boxes[j])
        expect(gap, `${boxes[i].id}↔${boxes[j].id} 간격 ${Math.round(gap)}`).toBeGreaterThanOrEqual(
          DEFAULT_LAYOUT_SPACING.nodeNode - 2,
        )
      }
    }
  })

  it('결정론 — 같은 문서를 두 번 배치하면 동일한 결과', () => {
    let d = doc()
    for (const id of ['P', 'L1', 'L2', 'C1', 'C2']) d = seedTable(d, id, 6)
    d = seedRelation(d, 'P', 'L1')
    d = seedRelation(d, 'P', 'L2')
    d = seedRelation(d, 'L1', 'C1')
    d = seedRelation(d, 'C1', 'C2')
    expect(layoutHubPositions(d)).toEqual(layoutHubPositions(d))
  })

  it('결정론 — 관계 생성 순서는 결과에 무영향 (인접은 Set, 방문은 문서 순)', () => {
    const build = (order: Array<[string, string]>) => {
      let d = doc()
      for (const id of ['P', 'L1', 'L2', 'C1']) d = seedTable(d, id, 6)
      for (const [parent, child] of order) d = seedRelation(d, parent, child)
      return d
    }
    const forward = build([
      ['P', 'L1'],
      ['P', 'L2'],
      ['L1', 'C1'],
    ])
    const reversed = build([
      ['L1', 'C1'],
      ['P', 'L2'],
      ['P', 'L1'],
    ])
    expect(layoutHubPositions(forward)).toEqual(layoutHubPositions(reversed))
  })

  it('체인(모든 degree ≤ 1) — 가운데 테이블이 허브, 일직선으로 뻗는다', () => {
    let d = doc()
    for (const id of ['A', 'B', 'C', 'D']) d = seedTable(d, id)
    d = seedRelation(d, 'A', 'B')
    d = seedRelation(d, 'B', 'C')
    d = seedRelation(d, 'C', 'D')

    const c = centerById(d, layoutHubPositions(d))
    // 허브 B의 이등분선(6시 방향)에서 단일 자식이 wedge를 승계 — 4개 전부 같은 수평선
    const ys = [c.A.cy, c.B.cy, c.C.cy, c.D.cy]
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1)
    expect(c.D.cx).toBeLessThan(c.C.cx)
    expect(c.C.cx).toBeLessThan(c.B.cx)
    expect(c.B.cx).toBeLessThan(c.A.cx)
    expect(Math.abs(c.C.cx - c.B.cx)).toBeLessThan(Math.abs(c.D.cx - c.B.cx))
  })

  it('성분 분리 — 부성분은 메인 아래(component 간격), 고립 테이블은 우측 열', () => {
    let d = doc()
    d = seedTable(d, 'P', 6)
    for (const id of ['L1', 'L2']) d = seedTable(d, id, 4)
    d = seedTable(d, 'X', 4)
    d = seedTable(d, 'Y', 4)
    d = seedTable(d, 'ISLAND', 4)
    d = seedRelation(d, 'P', 'L1')
    d = seedRelation(d, 'P', 'L2')
    d = seedRelation(d, 'X', 'Y')

    const positions = layoutHubPositions(d)
    expect(Object.keys(positions).sort()).toEqual(['ISLAND', 'L1', 'L2', 'P', 'X', 'Y'])
    const main = bboxOf(d, positions, ['P', 'L1', 'L2'])
    const pair = bboxOf(d, positions, ['X', 'Y'])
    expect(pair.top).toBeGreaterThanOrEqual(main.bottom + DEFAULT_LAYOUT_SPACING.component - 2)
    expect(positions.ISLAND.x).toBeGreaterThanOrEqual(main.right + DEFAULT_LAYOUT_SPACING.component - 2)
  })

  it('그룹 — 경계 관계로 이어진 두 그룹은 각자 응집된 덩어리로 분리 배치된다', () => {
    let d = doc()
    for (const id of ['A', 'B', 'C', 'D']) d = seedTable(d, id, 5)
    d = seedRelation(d, 'A', 'B')
    d = seedRelation(d, 'C', 'D')
    d = seedRelation(d, 'B', 'C') // 그룹 경계
    d = seedAreas(
      d,
      { id: 'G1', name: '회원', tableIds: ['A', 'B'] },
      { id: 'G2', name: '주문', tableIds: ['C', 'D'] },
    )

    const positions = layoutHubPositions(d)
    expect(Object.keys(positions).sort()).toEqual(['A', 'B', 'C', 'D'])
    const g1 = bboxOf(d, positions, ['A', 'B'])
    const g2 = bboxOf(d, positions, ['C', 'D'])
    const separated = g1.right <= g2.left || g2.right <= g1.left || g1.bottom <= g2.top || g2.bottom <= g1.top
    expect(separated).toBe(true)
    // 그룹 복도(GROUP_PADDING×2)가 있어 멤버 간 최소 간격은 nodeNode보다 훨씬 크다
    const boxes = boxesOf(d, positions)
    const a = boxes.find((b) => b.id === 'A')!
    const c = boxes.find((b) => b.id === 'C')!
    expect(gapOf(a, c)).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_SPACING.nodeNode)
  })

  it('내부 관계만 있는 그룹은 자체 허브 덩어리로 — 느슨한 쌍과 component 간격 분리', () => {
    let d = doc()
    for (const id of ['A', 'B', 'C', 'D']) d = seedTable(d, id, 5)
    d = seedRelation(d, 'A', 'B')
    d = seedRelation(d, 'C', 'D')
    d = seedAreas(d, { id: 'G1', name: '회원', tableIds: ['A', 'B'] })

    const positions = layoutHubPositions(d)
    expect(Object.keys(positions).sort()).toEqual(['A', 'B', 'C', 'D'])
    const group = bboxOf(d, positions, ['A', 'B'])
    const pair = bboxOf(d, positions, ['C', 'D'])
    const separated = group.right <= pair.left || pair.right <= group.left || group.bottom <= pair.top || pair.bottom <= group.top
    expect(separated).toBe(true)
    const vertical = pair.top - group.bottom
    const horizontal = Math.max(group.left - pair.right, pair.left - group.right)
    expect(Math.max(vertical, horizontal)).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_SPACING.component - 2)
  })

  it('고립 테이블(관계 0)은 우측 열에 문서 순서로 쌓인다', () => {
    let d = doc()
    d = seedTable(d, 'A', 5)
    d = seedTable(d, 'B', 5)
    for (const id of ['I1', 'I2', 'I3']) d = seedTable(d, id, 4)
    d = seedRelation(d, 'A', 'B')

    const positions = layoutHubPositions(d)
    expect(Math.abs(positions.I1.x - positions.I2.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(positions.I2.x - positions.I3.x)).toBeLessThanOrEqual(1)
    expect(positions.I2.y).toBeGreaterThan(positions.I1.y)
    expect(positions.I3.y).toBeGreaterThan(positions.I2.y)
    const boxes = boxesOf(d, positions).filter((b) => b.id.startsWith('I'))
    expect(gapOf(boxes[0], boxes[1])).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_SPACING.nodeNode - 2)
    expect(gapOf(boxes[1], boxes[2])).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_SPACING.nodeNode - 2)
  })

  it('자기 참조 관계는 배치에 무영향 — 관계 배열에서만 빠진 문서와 동일 결과', () => {
    let d = doc()
    d = seedTable(d, 'P', 4)
    for (const id of ['L1', 'L2']) d = seedTable(d, id, 4)
    d = seedRelation(d, 'P', 'L1')
    d = seedRelation(d, 'P', 'L2')
    const loop = d.model.relationships.length
    d = seedRelation(d, 'P', 'P') // FK 컬럼·인덱스까지 그대로 남긴 채 관계만 비교한다

    const withoutLoop = {
      ...d,
      model: { ...d.model, relationships: d.model.relationships.filter((_, i) => i !== loop) },
    }
    expect(layoutHubPositions(d)).toEqual(layoutHubPositions(withoutLoop))
  })

  it('측정 크기(sizes) 오버라이드가 링 반지름에 반영된다 — 허브가 크면 리프가 더 멀어진다', () => {
    let d = doc()
    d = seedTable(d, 'P', 4)
    for (const id of ['L1', 'L2', 'L3']) d = seedTable(d, id, 4)
    for (const id of ['L1', 'L2', 'L3']) d = seedRelation(d, 'P', id)

    const distanceOf = (positions: Record<string, { x: number; y: number }>) => {
      const c = centerById(d, positions)
      return Math.hypot(c.L1.cx - c.P.cx, c.L1.cy - c.P.cy)
    }
    const enlarged = layoutHubPositions(d, { sizes: { P: { w: 600, h: 400 } } })
    expect(distanceOf(enlarged)).toBeGreaterThan(distanceOf(layoutHubPositions(d)))
  })

  it('모든 좌표는 정수이고 전체 AABB의 min은 padding(계층형 관례)이다', () => {
    let d = doc()
    for (const id of ['P', 'L1', 'L2', 'C1', 'ISLAND']) d = seedTable(d, id, 5)
    d = seedRelation(d, 'P', 'L1')
    d = seedRelation(d, 'P', 'L2')
    d = seedRelation(d, 'L1', 'C1')

    const positions = layoutHubPositions(d)
    for (const pos of Object.values(positions)) {
      expect(Number.isInteger(pos.x)).toBe(true)
      expect(Number.isInteger(pos.y)).toBe(true)
    }
    const minX = Math.min(...Object.values(positions).map((pos) => pos.x))
    const minY = Math.min(...Object.values(positions).map((pos) => pos.y))
    expect(minX).toBe(DEFAULT_LAYOUT_SPACING.padding)
    expect(minY).toBe(DEFAULT_LAYOUT_SPACING.padding)
  })
})

describe('auto-layout — layoutHubPositions 하이브리드 전략(fill, v1.25)', () => {
  const fill = (d: EditorDocument) => layoutHubPositions(d, { strategy: 'fill' })

  /** 두 AABB의 최소 간격(대각이면 직선 거리) — fill은 SLACK(+1) 덕에 nodeNode 그대로 보증 */
  const gapOf = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }) => {
    const dx = Math.max(p.x - (q.x + q.w), q.x - (p.x + p.w), 0)
    const dy = Math.max(p.y - (q.y + q.h), q.y - (p.y + p.h), 0)
    return dx === 0 ? dy : dy === 0 ? dx : Math.hypot(dx, dy)
  }
  const centerById = (d: EditorDocument, positions: Record<string, { x: number; y: number }>) =>
    Object.fromEntries(
      boxesOf(d, positions).map((box) => [box.id, { cx: box.x + box.w / 2, cy: box.y + box.h / 2 }]),
    )

  it('가드·결정론·정수 좌표 — 링 전략과 같은 계약을 지킨다', () => {
    expect(fill(doc())).toEqual({})
    let d = doc()
    d = seedTable(d, 'A')
    expect(fill(d)).toEqual({})

    let mixed = doc()
    for (const id of ['P', 'L1', 'L2', 'C1', 'C2', 'ISLAND']) mixed = seedTable(mixed, id, 5)
    mixed = seedRelation(mixed, 'P', 'L1')
    mixed = seedRelation(mixed, 'P', 'L2')
    mixed = seedRelation(mixed, 'L1', 'C1')
    mixed = seedRelation(mixed, 'C1', 'C2')

    const first = fill(mixed)
    expect(fill(mixed)).toEqual(first)
    expect(Object.keys(first).sort()).toEqual(['C1', 'C2', 'ISLAND', 'L1', 'L2', 'P'])
    for (const pos of Object.values(first)) {
      expect(Number.isInteger(pos.x)).toBe(true)
      expect(Number.isInteger(pos.y)).toBe(true)
    }
    const minX = Math.min(...Object.values(first).map((pos) => pos.x))
    const minY = Math.min(...Object.values(first).map((pos) => pos.y))
    expect(minX).toBe(DEFAULT_LAYOUT_SPACING.padding)
    expect(minY).toBe(DEFAULT_LAYOUT_SPACING.padding)
  })

  it('스타 — 각도는 부채꼴 그대로라 허브 중심 등거리 사분면이 유지된다', () => {
    let d = doc()
    d = seedTable(d, 'P')
    for (const id of ['L1', 'L2', 'L3', 'L4']) d = seedTable(d, id)
    for (const id of ['L1', 'L2', 'L3', 'L4']) d = seedRelation(d, 'P', id)

    const c = centerById(d, fill(d))
    const distances = ['L1', 'L2', 'L3', 'L4'].map((id) => Math.hypot(c[id].cx - c.P.cx, c[id].cy - c.P.cy))
    for (const distance of distances) expect(Math.abs(distance - distances[0])).toBeLessThanOrEqual(1.5)
    expect(c.L1.cx - c.P.cx).toBeGreaterThan(0)
    expect(c.L1.cy - c.P.cy).toBeLessThan(0)
    expect(c.L3.cx - c.P.cx).toBeLessThan(0)
    expect(c.L3.cy - c.P.cy).toBeGreaterThan(0)
  })

  it('무겹침 — 크기가 제각각인 복합 문서에서 어떤 두 테이블도 겹치지 않고 간격 ≥ nodeNode', () => {
    let d = doc()
    d = seedTable(d, 'P', 12)
    d = seedTable(d, 'L1', 6)
    d = seedTable(d, 'L2', 15)
    d = seedTable(d, 'L3', 8)
    d = seedTable(d, 'C1', 13)
    d = seedTable(d, 'C2', 5)
    d = seedTable(d, 'G1', 9)
    d = seedTable(d, 'G2', 4)
    d = seedRelation(d, 'P', 'L1')
    d = seedRelation(d, 'P', 'L2')
    d = seedRelation(d, 'P', 'L3')
    d = seedRelation(d, 'L1', 'C1')
    d = seedRelation(d, 'L1', 'C2')
    d = seedRelation(d, 'L2', 'G1')
    d = seedRelation(d, 'G1', 'G2')

    const boxes = boxesOf(d, fill(d))
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [p, q] = [boxes[i], boxes[j]]
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
        expect(overlap, `${p.id}와 ${q.id}가 겹침`).toBe(false)
        expect(gapOf(p, q), `${p.id}↔${q.id} 간격`).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_SPACING.nodeNode)
      }
    }
  })

  it('압축 — 링이 큰 테이블 때문에 바깥으로 늘어날 때 첫 빈틈을 채워 더 안쪽에 들어간다', () => {
    // 스타 + 한쪽 가지에만 긴 체인 — ring은 링별 최대 지름이 반지름을 끌어올리지만
    // fill은 자기 레이의 장애물만 피하므로 꼬리가 훨씬 안쪽에 멈춘다
    let d = doc()
    d = seedTable(d, 'P', 4)
    d = seedTable(d, 'BIG', 40) // 링1에 거대 테이블 — ring 반지름을 크게 끌어올린다
    d = seedTable(d, 'S1', 3)
    d = seedTable(d, 'S2', 3)
    d = seedTable(d, 'T1', 3)
    d = seedTable(d, 'T2', 3)
    d = seedRelation(d, 'P', 'BIG')
    d = seedRelation(d, 'P', 'S1')
    d = seedRelation(d, 'P', 'S2')
    d = seedRelation(d, 'S1', 'T1')
    d = seedRelation(d, 'T1', 'T2')

    const ringPos = layoutHubPositions(d)
    const fillPos = fill(d)
    const ringC = centerById(d, ringPos)
    const fillC = centerById(d, fillPos)
    const dist = (c: Record<string, { cx: number; cy: number }>, id: string) =>
      Math.hypot(c[id].cx - c.P.cx, c[id].cy - c.P.cy)
    // 체인 꼬리(T2)는 ring보다 허브에 훨씬 가깝다 — 웨지 안쪽 빈틈을 채운 증거
    expect(dist(fillC, 'T2')).toBeLessThan(dist(ringC, 'T2'))
    // 전체 AABB 면적도 줄어든다(분산·압축)
    const area = (positions: Record<string, { x: number; y: number }>) => {
      const boxes = boxesOf(d, positions)
      const w = Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x))
      const h = Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y))
      return w * h
    }
    expect(area(fillPos)).toBeLessThan(area(ringPos))
  })

  it('관계 생성 순서 무영향·그룹 슈퍼노드 강체 — 링 전략 계약 그대로', () => {
    const build = (order: Array<[string, string]>) => {
      let d = doc()
      for (const id of ['A', 'B', 'C', 'D', 'X', 'Y']) d = seedTable(d, id, 5)
      for (const [parent, child] of order) d = seedRelation(d, parent, child)
      return {
        ...d,
        diagram: {
          ...d.diagram,
          areas: [
            { id: 'G1', name: '회원', description: '', color: 'default' as const, tableIds: ['A', 'B'] },
          ],
        },
      }
    }
    const forward = build([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['X', 'Y'],
    ])
    const reversed = build([
      ['X', 'Y'],
      ['C', 'D'],
      ['B', 'C'],
      ['A', 'B'],
    ])
    expect(fill(forward)).toEqual(fill(reversed))
    // 그룹 멤버는 GROUP_PADDING 복도 안에 있다
    const positions = fill(forward)
    const boxes = boxesOf(forward, positions)
    const a = boxes.find((b) => b.id === 'A')!
    const b = boxes.find((b) => b.id === 'B')!
    const innerGap = gapOf(a, b)
    expect(innerGap).toBeGreaterThan(0)
  })
})
