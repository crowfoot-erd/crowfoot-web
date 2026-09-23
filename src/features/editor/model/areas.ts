/**
 * 주제 영역 헬퍼 (05-editor/02-ui.md §6 — v1.13)
 *
 * 영역은 "무엇을 묶어 보이게 하는가"라는 표현 계층이다 — 소속(tableIds)은 물리 위치와
 * 무관한 논리 묶음이고, 접힌 영역의 멤버는 캔버스에서 숨겨진다(ERDCloud·erwin 표준).
 * 멤버십을 바꿔도 테이블 위치·박스 경계는 자동으로 건드리지 않는다 — 배치는 온전히
 * 사용자 손에 있다(체크 시 자동 재배치는 실사용 평가 후 제거, 02-ui.md §6).
 */
import type { EditorDocument, TableColorValue } from '@/features/editor/model/content-schema'

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

/** 테이블 렌더 색의 우선순위 — **그룹 색이 멤버를 고정한다**(v1.13, 로컬 실사용 요청).
 *  소속 그룹(다중 소속이면 문서 순서 첫 번째)의 색을 반환한다 — 그룹 색이 default이거나
 *  어디에도 속하지 않았으면 null(호출자가 테이블 개별 색으로 폴백). 캔버스 노드와
 *  미니맵이 같은 식을 공유한다. */
export function groupColorOf(doc: EditorDocument, tableId: string): TableColorValue | null {
  for (const area of doc.diagram.areas) {
    if (!area.tableIds.includes(tableId)) continue
    return area.color === 'default' ? null : area.color
  }
  return null
}
