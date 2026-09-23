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
 * onlyTableIds를 주면 그 테이블들만의 경계를 낸다(그룹 보기 진입) — 메모는 그룹 밖 객체라 제외.
 */
export function contentBounds(
  doc: EditorDocument,
  sizeReports: Record<string, { w: number; h: number }> = {},
  onlyTableIds?: ReadonlySet<string>,
): ContentBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const table of doc.model.tables) {
    if (onlyTableIds && !onlyTableIds.has(table.id)) continue
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
  // 메모는 그룹 밖 객체라 전체 경계에만 들어간다(그룹 경계는 멤버 테이블만)
  if (!onlyTableIds) {
    for (const note of doc.diagram.notes) {
      minX = Math.min(minX, note.x)
      minY = Math.min(minY, note.y)
      maxX = Math.max(maxX, note.x + note.width)
      maxY = Math.max(maxY, note.y + NOTE_ESTIMATED_HEIGHT)
    }
  }
  // 그룹(주제 영역)은 캔버스 객체가 아니라(논리 소속) 경계 계산에서 빠진다 — 멤버 테이블이
  // 이미 콘텐츠 AABB를 이룬다
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

/** 한계 확장 병합 — 두 한계를 감싸는 최소 사각형. 팬 한계는 세션 동안 이 병합으로만
 *  갱신된다(high-water mark): 객체를 안쪽으로 옮겨 콘텐츠 AABB가 줄어도 한계가 따라
 *  줄면 지금 보고 있는 뷰가 클램프되며 화면이 뚝 끌려온다. 늘어난 적 있는 영역은 그대로
 *  두고, 넓어지는 방향으로만 변한다 — 팬 한계가 줄어드는 순간이 아예 없어진다. */
export function growExtent(prev: CanvasExtent, next: CanvasExtent): CanvasExtent {
  return [
    [Math.min(prev[0][0], next[0][0]), Math.min(prev[0][1], next[0][1])],
    [Math.max(prev[1][0], next[1][0]), Math.max(prev[1][1], next[1][1])],
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

/**
 * 사각형을 화면에 맞추는 뷰포트 — 그룹 보기 진입용. fitView와 같은 결과(padding은 경계
 * 크기의 비율 여유, 줌은 [minZoom, maxZoom] 클램프)를 **스토어 좌표 경계**로 계산한다.
 * fitView는 현재 렌더된
 * 노드만 찾을 수 있어 다른 그룹에서 곧바로 전환할 때(새 그룹 노드가 렌더 전) 무시되지만,
 * 이 계산은 노드 렌더 타이밍과 무관하게 항상 그 그룹을 맞춘다(2026-09-23 실사용 회귀).
 * 줌 한계 기본값은 캔버스(0.1)·초기 전체 맞춤(상한 1)과 같다.
 */
export function viewportFittedTo(
  bounds: ContentBounds,
  viewSize: { width: number; height: number },
  extent: CanvasExtent,
  minZoom = 0.1,
  maxZoom = 1,
  padding = 0.25,
): ViewportTranslate {
  const bw = Math.max(1, bounds.maxX - bounds.minX)
  const bh = Math.max(1, bounds.maxY - bounds.minY)
  // fitView(getViewportForBounds)와 같은 식 — padding은 경계 크기의 비율로 사방 여유를 둔다
  const zoom = Math.min(
    maxZoom,
    Math.max(minZoom, Math.min(viewSize.width / (bw * (1 + padding * 2)), viewSize.height / (bh * (1 + padding * 2)))),
  )
  return viewportCenteredOn(
    { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    zoom,
    viewSize,
    extent,
  )
}
