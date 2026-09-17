/**
 * 캔버스 경계 계산 (05-editor/02-ui.md §2.1)
 *
 * 콘텐츠(테이블·메모)의 최외곽 좌표를 기준으로 팬·노드 드래그 한계(translateExtent·nodeExtent)를
 * 만든다 — 캔버스가 콘텐츠와 상관없이 무한대로 늘어나는 것을 막는다. 한계는 최외곽 객체의
 * 사방 좌표에서 CANVAS_MARGIN까지만 여유를 두므로, 객체를 경계 밖으로 옮기면 문서가 커지고
 * 한계도 그 객체를 감싸도록 따라 자란다(경계가 곧 콘텐츠 범위의 함수).
 */
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/components/canvas/TableNode'
import type { EditorDocument } from '@/features/editor/model/content-schema'

/** 메모 노드 추정 높이 — 헤더 밴드 28 + 본문 textarea 4줄(높이가 사실상 고정이라 추정이 정확하다) */
export const NOTE_ESTIMATED_HEIGHT = 120

/** 최외곽 객체 사방 좌표에서 캔버스가 더 늘어날 수 있는 여유 (플로우 좌표 px) */
export const CANVAS_MARGIN = 800

export interface ContentBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type CanvasExtent = [[number, number], [number, number]]

/**
 * 문서 전체 콘텐츠의 AABB — 테이블(측정 크기 > 렌더 추정식)과 메모(폭 저장값·높이 추정)를 포함한다.
 * 레이아웃 없는 테이블은 건너뛴다(전체 맞춤 추정과 같은 규칙). 콘텐츠가 없으면 null.
 */
export function contentBounds(
  doc: EditorDocument,
  sizeReports: Record<string, { w: number; h: number }> = {},
): ContentBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const table of doc.model.tables) {
    const layout = doc.diagram.nodes[table.id]
    if (!layout) continue
    const size = sizeReports[table.id] ?? {
      w: tableRenderWidth(layout.width ?? null, 0),
      h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length),
    }
    minX = Math.min(minX, layout.x)
    minY = Math.min(minY, layout.y)
    maxX = Math.max(maxX, layout.x + size.w)
    maxY = Math.max(maxY, layout.y + size.h)
  }
  for (const note of doc.diagram.notes) {
    minX = Math.min(minX, note.x)
    minY = Math.min(minY, note.y)
    maxX = Math.max(maxX, note.x + note.width)
    maxY = Math.max(maxY, note.y + NOTE_ESTIMATED_HEIGHT)
  }
  if (minX === Infinity) return null
  return { minX, minY, maxX, maxY }
}

/** 팬·드래그 한계 — 콘텐츠 AABB 사방에 CANVAS_MARGIN을 더한 영역. 콘텐츠가 없으면 null(호출자 기본값) */
export function canvasExtent(
  doc: EditorDocument,
  sizeReports: Record<string, { w: number; h: number }> = {},
): CanvasExtent | null {
  const bounds = contentBounds(doc, sizeReports)
  if (!bounds) return null
  return [
    [bounds.minX - CANVAS_MARGIN, bounds.minY - CANVAS_MARGIN],
    [bounds.maxX + CANVAS_MARGIN, bounds.maxY + CANVAS_MARGIN],
  ]
}

/** 뷰포트 translate — x·y는 화면 좌표, zoom은 배율(@xyflow/react Viewport와 구조가 같다) */
export interface ViewportTranslate {
  x: number
  y: number
  zoom: number
}

/**
 * 지점을 화면 중심에 두는 뷰포트 — 미니맵 클릭 이동용. 프로그램 setViewport는 d3-zoom의
 * constrain(제스처에서만 적용)을 우회하므로, 보이는 사각형이 extent에 들어가도록 클램프를
 * 직접 한다. 식은 d3-zoom defaultConstrain 그대로 — 제스처 팬이 받는 클램프와 같은 결과:
 * 넘침이 한쪽만 있으면 그만큼 당기고, 뷰가 extent보다 넓으면 양쪽 넘침의 중앙에 둔다.
 */
export function viewportCenteredOn(
  point: { x: number; y: number },
  zoom: number,
  viewSize: { width: number; height: number },
  extent: CanvasExtent,
): ViewportTranslate {
  const [[minX, minY], [maxX, maxY]] = extent
  const left = point.x - viewSize.width / (2 * zoom)
  const top = point.y - viewSize.height / (2 * zoom)
  // d3-zoom defaultConstrain — dx0(왼쪽 넘침, 음수)·dx1(오른쪽 넘침, 양수)
  const dx0 = left - minX
  const dx1 = left + viewSize.width / zoom - maxX
  const dy0 = top - minY
  const dy1 = top + viewSize.height / zoom - maxY
  const shiftX = dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1)
  const shiftY = dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1)
  return { x: -(left - shiftX) * zoom, y: -(top - shiftY) * zoom, zoom }
}
