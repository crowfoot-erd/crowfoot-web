import { describe, expect, it } from 'vitest'

import { applyChange, createColumn, createTable } from '@/features/editor/model/changes'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { emptyContent } from '@/features/editor/model/content-io'
import {
  CANVAS_MARGIN,
  NOTE_ESTIMATED_HEIGHT,
  canvasExtent,
  contentBounds,
  growExtent,
  viewportCenteredOn,
  viewportFittedTo,
  type CanvasExtent,
} from '@/features/editor/model/canvas-bounds'
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/components/canvas/TableNode'

function doc(): EditorDocument {
  return { model: emptyContent().model, diagram: emptyContent().diagram }
}

/** PK 하나 + 일반 컬럼 1개 테이블을 주어진 위치에 추가 */
function seedTable(d: EditorDocument, id: string, x: number, y: number): EditorDocument {
  const cols = [
    createColumn({ id: `${id}-pk`, physicalName: 'id', dataType: 'BIGINT', nullable: false }),
    createColumn({ id: `${id}-c1`, physicalName: 'col_1', dataType: 'VARCHAR', length: 50 }),
  ]
  const table = createTable(`tb_${id.toLowerCase()}`, {
    id,
    columns: cols,
    primaryKey: { name: `${id}_pk`, columnIds: [`${id}-pk`] },
  })
  return applyChange(d, { type: 'table/create', table, position: { x, y } })
}

function seedNote(d: EditorDocument, id: string, x: number, y: number, width = 360): EditorDocument {
  return applyChange(d, {
    type: 'note/create',
    note: { id, x, y, width, text: 'memo', title: '', color: 'yellow', linkedTableId: null },
  })
}

describe('canvas-bounds — contentBounds', () => {
  it('빈 문서(테이블·메모 없음)는 null', () => {
    expect(contentBounds(doc())).toBeNull()
  })

  it('테이블 1개 — 렌더 추정식(폭·높이)으로 AABB를 만든다', () => {
    const d = seedTable(doc(), 'A', 0, 0)
    expect(contentBounds(d)).toEqual({
      minX: 0,
      minY: 0,
      maxX: tableRenderWidth(null, 0),
      maxY: estimateTableHeight(2, 0),
    })
  })

  it('측정 크기 보고(sizeReports)가 있으면 추정 대신 쓴다', () => {
    const d = seedTable(doc(), 'A', 100, 200)
    expect(contentBounds(d, { A: { w: 500, h: 400 } })).toEqual({
      minX: 100,
      minY: 200,
      maxX: 600,
      maxY: 600,
    })
  })

  it('여러 테이블의 최외곽 좌표를 감싼다 — 음수 좌표 포함', () => {
    let d = seedTable(doc(), 'A', -500, -300)
    d = seedTable(d, 'B', 2000, 1500)
    const bounds = contentBounds(d, {
      A: { w: 340, h: 200 },
      B: { w: 400, h: 600 },
    })
    expect(bounds).toEqual({ minX: -500, minY: -300, maxX: 2400, maxY: 2100 })
  })

  it('메모는 저장 폭·추정 높이(NOTE_ESTIMATED_HEIGHT)로 포함한다', () => {
    let d = seedTable(doc(), 'A', 0, 0)
    d = seedNote(d, 'n1', 800, 900, 240)
    expect(contentBounds(d, { A: { w: 340, h: 200 } })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1040,
      maxY: 900 + NOTE_ESTIMATED_HEIGHT,
    })
  })

  it('레이아웃 없는 테이블은 건너뛴다(전체 맞춤 추정과 같은 규칙)', () => {
    const d = seedTable(doc(), 'A', 100, 100)
    const withoutLayout: EditorDocument = {
      model: { ...d.model, tables: [...d.model.tables, { ...d.model.tables[0], id: 'B' }] },
      diagram: d.diagram,
    }
    const bounds = contentBounds(withoutLayout, { A: { w: 340, h: 200 } })
    expect(bounds).toEqual({ minX: 100, minY: 100, maxX: 440, maxY: 300 })
  })

  it('onlyTableIds — 그 테이블들만의 경계를 낸다(그룹 보기 진입). 메모는 제외', () => {
    let d = seedTable(doc(), 'A', 0, 0)
    d = seedTable(d, 'B', 5000, 2000)
    d = seedNote(d, 'n1', 8000, 8000)
    const bounds = contentBounds(d, { A: { w: 340, h: 200 }, B: { w: 340, h: 200 } }, new Set(['B']))
    expect(bounds).toEqual({ minX: 5000, minY: 2000, maxX: 5340, maxY: 2200 })
  })

  it('onlyTableIds에 레이아웃 있는 멤버가 없으면 null', () => {
    const d = seedTable(doc(), 'A', 0, 0)
    expect(contentBounds(d, {}, new Set(['없는-아이디']))).toBeNull()
  })
})

describe('canvas-bounds — canvasExtent', () => {
  it('빈 문서는 null(호출자가 기본 extent를 쓴다)', () => {
    expect(canvasExtent(doc())).toBeNull()
  })

  it('콘텐츠 AABB 사방에 CANVAS_MARGIN을 더한다', () => {
    const d = seedNote(doc(), 'n1', 100, 200, 300)
    expect(canvasExtent(d)).toEqual([
      [100 - CANVAS_MARGIN, 200 - CANVAS_MARGIN],
      [400 + CANVAS_MARGIN, 200 + NOTE_ESTIMATED_HEIGHT + CANVAS_MARGIN],
    ])
  })

  it('노드를 옮기면 한계가 따라 자란다 — 경계가 곧 콘텐츠 범위의 함수', () => {
    let d = seedTable(doc(), 'A', 0, 0)
    const before = canvasExtent(d, { A: { w: 340, h: 200 } })
    d = applyChange(d, { type: 'node/move', positions: { A: { x: 5000, y: 5000 } } })
    const after = canvasExtent(d, { A: { w: 340, h: 200 } })
    expect(after![1][0]).toBe(5340 + CANVAS_MARGIN)
    expect(after![0][0]).toBe(5000 - CANVAS_MARGIN)
    expect(before![1][0]).toBeLessThan(after![0][0])
  })
})

describe('canvas-bounds — growExtent(세션 한계 병합)', () => {
  it('콘텐츠가 안쪽으로 움직여 한계가 줄어들어도, 늘어났던 폭은 그대로 유지한다', () => {
    // 왼쪽으로 크게 갔다가 다시 오른쪽으로 돌아온 경우 — 왼쪽 한계는 줄지 않는다
    const wide: CanvasExtent = [
      [-5000, -3000],
      [2000, 1500],
    ]
    const shrunk: CanvasExtent = [
      [0, 0],
      [2000, 1500],
    ]
    expect(growExtent(wide, shrunk)).toEqual(wide)
  })

  it('바깥으로 움직이면 그 방향으로만 넓어진다 — 좌우상하 각각 반영', () => {
    const base: CanvasExtent = [
      [0, 0],
      [1000, 800],
    ]
    // 오른쪽·아래로 확장
    expect(growExtent(base, [
      [0, 0],
      [3000, 2000],
    ])).toEqual([
      [0, 0],
      [3000, 2000],
    ])
    // 왼쪽·위로 확장(음수 좌표)
    expect(growExtent(base, [
      [-2000, -1200],
      [1000, 800],
    ])).toEqual([
      [-2000, -1200],
      [1000, 800],
    ])
  })
})

describe('canvas-bounds — viewportCenteredOn', () => {
  // extent [(-800,-1100), (2140, 1708)] · 화면 1200×800 · zoom 1 기준
  const extent: CanvasExtent = [
    [-800, -1100],
    [2140, 1708],
  ]
  const view = { width: 1200, height: 800 }

  const visible = (vp: { x: number; y: number; zoom: number }) => ({
    left: -vp.x / vp.zoom,
    top: -vp.y / vp.zoom,
    right: (-vp.x + view.width) / vp.zoom,
    bottom: (-vp.y + view.height) / vp.zoom,
  })

  it('extent 안쪽 지점은 그 지점을 정확히 화면 중심에 둔다', () => {
    const vp = viewportCenteredOn({ x: 1000, y: 700 }, 1, view, extent)
    const v = visible(vp)
    expect((v.left + v.right) / 2).toBe(1000)
    expect((v.top + v.bottom) / 2).toBe(700)
  })

  it('오른쪽 끝 클릭 — 보이는 오른쪽이 extent maxX에서 멈춘다', () => {
    const vp = viewportCenteredOn({ x: 5000, y: 700 }, 1, view, extent)
    const v = visible(vp)
    expect(v.right).toBe(2140)
    expect(v.left).toBe(2140 - 1200)
  })

  it('왼쪽·위 클릭 — 보이는 왼쪽·위가 extent min에서 멈춘다', () => {
    const vp = viewportCenteredOn({ x: -10000, y: -10000 }, 1, view, extent)
    const v = visible(vp)
    expect(v.left).toBe(-800)
    expect(v.top).toBe(-1100)
  })

  it('화면이 extent보다 넓을 때(양쪽 다 넘침)는 extent를 화면 중앙에 둔다 — d3-zoom constrain과 같은 식', () => {
    const narrow: CanvasExtent = [
      [0, 0],
      [600, 400],
    ]
    const vp = viewportCenteredOn({ x: 300, y: 200 }, 1, view, narrow)
    const v = visible(vp)
    expect((v.left + v.right) / 2).toBe(300)
    expect((v.top + v.bottom) / 2).toBe(200)
  })

  it('축소(zoom < 1)에서도 중심·클램프가 배율을 반영한다', () => {
    const vp = viewportCenteredOn({ x: 500, y: 300 }, 0.5, view, extent)
    const v = visible(vp)
    expect((v.left + v.right) / 2).toBe(500)
    expect((v.top + v.bottom) / 2).toBe(300)
    expect(vp.zoom).toBe(0.5)
  })
})

describe('canvas-bounds — viewportFittedTo(그룹 보기 진입)', () => {
  const loose: CanvasExtent = [
    [-1e9, -1e9],
    [1e9, 1e9],
  ]
  const view = { width: 1200, height: 800 }

  const visible = (vp: { x: number; y: number; zoom: number }) => ({
    left: -vp.x / vp.zoom,
    top: -vp.y / vp.zoom,
    right: (-vp.x + view.width) / vp.zoom,
    bottom: (-vp.y + view.height) / vp.zoom,
  })

  it('경계 중심을 화면 중심에 두고, fitView와 같은 배율(경계×(1+2·padding)을 화면에 맞춤)을 낸다', () => {
    const vp = viewportFittedTo({ minX: 0, minY: 0, maxX: 2400, maxY: 1400 }, view, loose)
    expect(vp.zoom).toBeCloseTo(1200 / (2400 * 1.5), 5) // 폭이 지배축
    const v = visible(vp)
    expect((v.left + v.right) / 2).toBeCloseTo(1200, 5) // 경계 중심 x
    expect((v.top + v.bottom) / 2).toBeCloseTo(700, 5) // 경계 중심 y
    // 지배축(폭)의 여유는 padding×경계폭 — fitView(getViewportForBounds)와 같은 식
    expect(v.left).toBeCloseTo(-600, 5)
    expect(v.right).toBeCloseTo(3000, 5)
  })

  it('작은 경계는 maxZoom 1로 클램프 — 확대 과잉 없음', () => {
    const vp = viewportFittedTo({ minX: 0, minY: 0, maxX: 300, maxY: 150 }, view, loose)
    expect(vp.zoom).toBe(1)
  })

  it('거대한 경계는 minZoom(기본 0.1)까지 내려가지 않는다 — 캔버스 줌 한계와 같다', () => {
    const vp = viewportFittedTo({ minX: 0, minY: 0, maxX: 30000, maxY: 20000 }, view, loose)
    expect(vp.zoom).toBe(0.1)
  })
})
