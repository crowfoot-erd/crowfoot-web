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

/** 멤버 테이블들을 감싸는 영역 경계 — 멤버십이 바뀔 때 영역이 멤버를 감싸게 재계산한다.
 *  테이블 위치는 옮기지 않는다(박스가 테이블을 감싼다 — 레이아웃을 해치지 않는 방향).
 *  테이블 크기는 캔버스 경계(contentBounds 폴백)와 같은 렌더 추정식으로 계산한다.
 *  감쌀 멤버가 없으면(0개·전부 레이아웃 없음) null — 호출자가 경계를 그대로 둔다. */
export function fitAreaToMembers(doc: EditorDocument, tableIds: readonly string[]): AreaBounds | null {
  const byId = new Map(doc.model.tables.map((table) => [table.id, table]))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of tableIds) {
    const table = byId.get(id)
    const layout = doc.diagram.nodes[id]
    if (!table || !layout) continue
    const w = tableRenderWidth(layout.width ?? null, 0)
    const h = estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length)
    minX = Math.min(minX, layout.x)
    minY = Math.min(minY, layout.y)
    maxX = Math.max(maxX, layout.x + w)
    maxY = Math.max(maxY, layout.y + h)
  }
  if (minX === Infinity) return null
  return {
    x: minX - AREA_MEMBER_PADDING,
    y: minY - AREA_MEMBER_PADDING - AREA_HEADER_RESERVE,
    width: Math.max(maxX - minX + AREA_MEMBER_PADDING * 2, AREA_MIN_WIDTH),
    height: Math.max(maxY - minY + AREA_MEMBER_PADDING * 2 + AREA_HEADER_RESERVE, AREA_MIN_HEIGHT),
  }
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
