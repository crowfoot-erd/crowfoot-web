/**
 * 주제 영역 헬퍼 (05-editor/02-ui.md §6 — v1.13)
 *
 * 영역은 "무엇을 묶어 보이게 하는가"라는 표현 계층이다 — 소속(tableIds)은 물리 위치와
 * 무관한 논리 묶음이고, 접힌 영역의 멤버는 캔버스에서 숨겨진다(ERDCloud·erwin 표준).
 */
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/components/canvas/TableNode'
import type { EditorDocument } from '@/features/editor/model/content-schema'

/** 영역 경계 최소 크기 — NodeResizer 하한과 같은 값(단일 원천) */
export const AREA_MIN_WIDTH = 240
export const AREA_MIN_HEIGHT = 160

/** 멤버를 감쌀 때 사방 여유 */
export const AREA_MEMBER_PADDING = 28
/** 헤더 밴드만큼 위쪽에 추가로 확보하는 여유 — 멤버 테이블이 헤더 밑에 깔리지 않게 */
export const AREA_HEADER_RESERVE = 48

/** 영역 경계 사각형 — area/patch의 x·y·width·height와 같은 모양 */
export interface AreaBounds {
  x: number
  y: number
  width: number
  height: number
}

/** 멤버를 박스 안 그리드로 묶을 때 테이블 사이 간격 */
export const AREA_ARRANGE_GAP = 40

/** 멤버 배치 후 박스와 교차하는 비멤버를 박스 아래로 밀어낼 때의 아래쪽 여유 */
export const AREA_PUSH_GAP = 60

/** 멤버 테이블들을 영역(그룹 박스) 안 그리드로 배치한다 — 영역이 기준이고 테이블이 따라간다.
 *  박스의 x/y(사용자가 만든 그룹 앵커)는 그대로 두고, 헤더 여유 아래부터 행-주요 그리드로
 *  채운다. 열 폭은 가장 넓은 멤버에 맞추고(균일 열 — 그룹으로 읽히게), 열 수는 박스 안쪽
 *  폭에 들어가는 만큼. 그리드가 박스보다 크면 필요한 만큼만 늘리고 줄이지는 않는다
 *  (사용자가 만든 "적당한 크기" 존중). 배치 순서는 **문서 순서** — 멤버 체크 목록
 *  (AreaDialog)과 같은 순서라 다이얼로그에서 보는 그대로 채워지고, 체크 순서·이미
 *  배치된 위치와 무관하게 항상 같은 그리드가 나온다. 테이블 크기는 캔버스 경계
 *  (contentBounds 폴백)와 같은 렌더 추정식.
 *  배치할 멤버가 없으면(0개·전부 레이아웃 없음) null — 호출자가 경계를 그대로 둔다. */
export function arrangeAreaMembers(
  doc: EditorDocument,
  area: AreaBounds,
  tableIds: readonly string[],
): { bounds: AreaBounds; positions: Record<string, { x: number; y: number }> } | null {
  const order = new Map(doc.model.tables.map((table, index) => [table.id, index]))
  const byId = new Map(doc.model.tables.map((table) => [table.id, table]))
  const members = tableIds
    .slice()
    .sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity))
    .flatMap((id) => {
      const table = byId.get(id)
      const layout = doc.diagram.nodes[id]
      if (!table || !layout) return []
      return [{
        id,
        w: tableRenderWidth(layout.width ?? null, 0),
        h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length),
      }]
    })
  if (members.length === 0) return null

  const colW = Math.max(...members.map((m) => m.w))
  const innerX = area.x + AREA_MEMBER_PADDING
  const innerY = area.y + AREA_MEMBER_PADDING + AREA_HEADER_RESERVE
  const availW = Math.max(area.width - AREA_MEMBER_PADDING * 2, colW)
  const cols = Math.max(1, Math.floor((availW + AREA_ARRANGE_GAP) / (colW + AREA_ARRANGE_GAP)))

  const positions: Record<string, { x: number; y: number }> = {}
  let maxX = innerX
  let maxY = innerY
  let cursorY = innerY
  for (let row = 0; row * cols < members.length; row += 1) {
    const slice = members.slice(row * cols, row * cols + cols)
    const rowH = Math.max(...slice.map((m) => m.h))
    slice.forEach((m, col) => {
      positions[m.id] = {
        x: Math.round(innerX + col * (colW + AREA_ARRANGE_GAP)),
        y: Math.round(cursorY),
      }
    })
    const last = slice[slice.length - 1]
    maxX = Math.max(maxX, innerX + (slice.length - 1) * (colW + AREA_ARRANGE_GAP) + last.w)
    maxY = Math.max(maxY, cursorY + rowH)
    cursorY += rowH + AREA_ARRANGE_GAP
  }
  return {
    bounds: {
      x: area.x,
      y: area.y,
      width: Math.max(area.width, Math.round(maxX - area.x + AREA_MEMBER_PADDING)),
      height: Math.max(area.height, Math.round(maxY - area.y + AREA_MEMBER_PADDING)),
    },
    positions,
  }
}

/** 멤버 배치 후의 박스와 교차하는(걸침 포함) **비멤버** 테이블을 박스 아래로 밀어낸 좌표 —
 *  영역은 선택한 테이블만 담는다는 규칙(02-ui.md §6). 멤버·경계 밖 테이블은 그대로 두고,
 *  이미 밖에 있는 테이블은 결과에 없다(node/move positions와 같은 모양). x는 유지하고
 *  밀어낸 테이블끼리 x가 겹치면 위에서부터 세로로 쌓는다 — 상대 배치를 최대한 보존. */
export function relocateNonMembers(
  doc: EditorDocument,
  bounds: AreaBounds,
  memberIds: readonly string[],
): Record<string, { x: number; y: number }> {
  const members = new Set(memberIds)
  const movers: Array<{ id: string; x: number; y: number; w: number; h: number }> = []
  for (const table of doc.model.tables) {
    if (members.has(table.id)) continue
    const layout = doc.diagram.nodes[table.id]
    if (!layout) continue
    const w = tableRenderWidth(layout.width ?? null, 0)
    const h = estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length)
    const intersects = layout.x < bounds.x + bounds.width
      && layout.x + w > bounds.x
      && layout.y < bounds.y + bounds.height
      && layout.y + h > bounds.y
    if (intersects) movers.push({ id: table.id, x: layout.x, y: layout.y, w, h })
  }
  movers.sort((a, b) => a.y - b.y || a.x - b.x)
  const positions: Record<string, { x: number; y: number }> = {}
  const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (const m of movers) {
    let top = bounds.y + bounds.height + AREA_PUSH_GAP
    // 아래 행에 먼저 놓인 것과 겹치면 그 아래로 — 놓인 것은 y 오름차순이라 재확인 1회면 충분
    for (let guard = 0; guard < movers.length; guard += 1) {
      const hit = placed.find((p) => m.x < p.x2 && m.x + m.w > p.x1 && top < p.y2 && top + m.h > p.y1)
      if (!hit) break
      top = Math.max(top, hit.y2 + AREA_PUSH_GAP)
    }
    placed.push({ x1: m.x, y1: top, x2: m.x + m.w, y2: top + m.h })
    positions[m.id] = { x: m.x, y: top }
  }
  return positions
}

/** 문서에서 유일한 영역 이름 — "영역 N" 기본명의 접미 규칙(테이블 물리명 유일화와 같은 방식) */
export function uniqueAreaName(doc: EditorDocument, base: string): string {
  const taken = new Set(doc.diagram.areas.map((area) => area.name))
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** 영역의 살아 있는 멤버 테이블 id 집합 — 삭제된 테이블 id는 cascade가 정리하지만,
 *  외부 문서 병합 등으로 남아 있을 수 있어 조회 시점에 한 번 걸러 쓴다 */
export function tablesOfArea(doc: EditorDocument, areaId: string): Set<string> {
  const area = doc.diagram.areas.find((a) => a.id === areaId)
  if (!area) return new Set()
  const alive = new Set(doc.model.tables.map((table) => table.id))
  return new Set(area.tableIds.filter((id) => alive.has(id)))
}

/** 캔버스에 숨겨야 할 테이블 id 집합 — 접힌 영역의 멤버 전체(여러 영역에 걸쳐 있어도 숨긴다) */
export function hiddenTableIds(doc: EditorDocument): Set<string> {
  const hidden = new Set<string>()
  for (const area of doc.diagram.areas) {
    if (!area.collapsed) continue
    const alive = tablesOfArea(doc, area.id)
    for (const id of alive) hidden.add(id)
  }
  return hidden
}

/** 캔버스 표시 테이블 id 집합 — 캔버스·엣지·익스플로러가 같은 식을 공유한다.
 *  activeAreaId가 없으면 전체(접힌 멤버 제외), 있으면 그 영역의 멤버(접힌 멤버 제외)만.
 *  필터 하나로 통합 — 뷰 전환과 접기가 같은 노드 빌드 경로를 탄다. */
export function visibleTableIds(doc: EditorDocument, activeAreaId: string | null): Set<string> {
  const scope = activeAreaId ? tablesOfArea(doc, activeAreaId) : new Set(doc.model.tables.map((table) => table.id))
  const hidden = hiddenTableIds(doc)
  return new Set([...scope].filter((id) => !hidden.has(id)))
}
