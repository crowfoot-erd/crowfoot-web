/**
 * 열 때 자동 배치 — 위치 없는 테이블을 놓는다 (docs 05-editor/02-ui.md Section 18)
 *
 * 문서 편집 API(MCP)가 만든 테이블에는 위치가 없다(diagram.nodes에 항목이 없다). 에디터가 본체를 읽을 때
 * 이 함수로 위치를 채운다. 순수 함수이고 결정적이다 — 같은 문서는 누가 열어도 같은 자리에 놓인다.
 * 크기는 추정식만 쓴다(렌더 실측은 글꼴에 따라 달라 결정적이지 않다).
 *
 *  · 모든 테이블에 위치가 없다 → 문서 전체를 배치한다(하이브리드 방식, 위에서 아래)
 *  · 일부에만 없다 → 기존 테이블과 메모는 그대로 두고 새 테이블만 놓는다.
 *    관계가 있는 테이블 가까이의 빈자리를 찾고, 관계가 없으면 기존 배치의 오른쪽에 쌓는다
 *
 * 채운 위치는 문서의 일부가 된다. 편집자가 다음에 저장할 때 함께 저장된다.
 */
import { layoutHubPositions } from '@/features/editor/model/auto-layout'
import type { ErdContent, ErdNodeLayout, ErdTable } from '@/features/editor/model/content-schema'
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/model/table-size'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** 테이블 사이의 간격 — 관계선과 까마귀발이 들어갈 자리 */
const GAP_X = 140
const GAP_Y = 120
/** 문서에 아무것도 없을 때의 시작 자리 */
const ORIGIN = { x: 80, y: 80 }

const sizeOf = (table: ErdTable, width: number | null) => ({
  w: tableRenderWidth(width, 0),
  h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length),
})

const overlaps = (a: Box, b: Box, margin = 40): boolean =>
  a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin

const node = (x: number, y: number): ErdNodeLayout => ({ x: Math.round(x), y: Math.round(y), width: null, color: 'default' })

/** 위치 없는 테이블이 있으면 위치를 채운 새 본체를, 없으면 받은 본체를 그대로 돌려준다 */
export function placeMissingTables(content: ErdContent): ErdContent {
  const tables = content.model.tables
  const missing = tables.filter((table) => content.diagram.nodes[table.id] === undefined)
  if (missing.length === 0) return content

  const nodes: Record<string, ErdNodeLayout> = { ...content.diagram.nodes }

  if (missing.length === tables.length) {
    // 새 문서 — 전체를 배치한다. 테이블이 하나뿐이면 배치기가 빈 결과를 주므로 시작 자리에 놓는다
    const positions = layoutHubPositions({ model: content.model, diagram: content.diagram }, { strategy: 'tree', direction: 'down' })
    let fallbackY = ORIGIN.y
    for (const table of tables) {
      const position = positions[table.id]
      if (position) {
        nodes[table.id] = node(position.x, position.y)
      } else {
        nodes[table.id] = node(ORIGIN.x, fallbackY)
        fallbackY += sizeOf(table, null).h + GAP_Y
      }
    }
    return { ...content, diagram: { ...content.diagram, nodes } }
  }

  // 기존 문서에 추가 — 이미 놓인 것(테이블과 메모)을 피해서 새 테이블만 놓는다
  const placed = new Map<string, Box>()
  for (const table of tables) {
    const layout = nodes[table.id]
    if (layout) placed.set(table.id, { x: layout.x, y: layout.y, ...sizeOf(table, layout.width) })
  }
  const obstacles: Box[] = [
    ...placed.values(),
    ...content.diagram.notes.map((note) => ({ x: note.x, y: note.y, w: note.width, h: note.height ?? 150 })),
  ]
  const free = (box: Box): boolean => obstacles.every((other) => !overlaps(box, other))

  /** 관계로 이어진 테이블 가운데 이미 놓인 첫 테이블(문서의 관계 순서) */
  const anchorOf = (tableId: string): Box | null => {
    for (const relationship of content.model.relationships) {
      const other =
        relationship.childTableId === tableId
          ? relationship.parentTableId
          : relationship.parentTableId === tableId
            ? relationship.childTableId
            : null
      if (other !== null && other !== tableId && placed.has(other)) return placed.get(other) ?? null
    }
    return null
  }

  for (const table of missing) {
    const size = sizeOf(table, null)
    const anchor = anchorOf(table.id)
    let spot: Box | null = null
    if (anchor) {
      // 기준 테이블의 오른쪽 → 아래 → 왼쪽 → 위. 자리가 없으면 한 칸씩 더 멀리 본다
      for (let ring = 1; ring <= 12 && spot === null; ring += 1) {
        const dx = (anchor.w + GAP_X) * ring
        const dy = (anchor.h + GAP_Y) * ring
        const candidates: Box[] = [
          { x: anchor.x + dx, y: anchor.y, ...size },
          { x: anchor.x, y: anchor.y + dy, ...size },
          { x: anchor.x - (size.w + GAP_X) * ring, y: anchor.y, ...size },
          { x: anchor.x, y: anchor.y - (size.h + GAP_Y) * ring, ...size },
          { x: anchor.x + dx, y: anchor.y + dy, ...size },
        ]
        spot = candidates.find(free) ?? null
      }
    }
    if (spot === null) {
      // 관계가 없거나 가까운 자리가 없다 — 지금 배치의 오른쪽 열에 위에서부터 쌓는다
      const right = obstacles.length > 0 ? Math.max(...obstacles.map((box) => box.x + box.w)) + GAP_X : ORIGIN.x
      let y = obstacles.length > 0 ? Math.min(...obstacles.map((box) => box.y)) : ORIGIN.y
      spot = { x: right, y, ...size }
      while (!free(spot)) {
        y += GAP_Y
        spot = { x: right, y, ...size }
      }
    }
    nodes[table.id] = node(spot.x, spot.y)
    const box = { x: Math.round(spot.x), y: Math.round(spot.y), ...size }
    placed.set(table.id, box)
    obstacles.push(box)
  }
  return { ...content, diagram: { ...content.diagram, nodes } }
}
