/**
 * 컬럼 행 위치 레지스트리 — 자기 참조 루프가 컬럼 행 높이에 붙기 위한 실측값 (05-editor/02-ui.md §5)
 *
 * 관계선 앵커는 기본 테이블 4면 중심 하나라 어느 행에 붙는지 알 수 없다. 자기 참조는 FK 행과
 * PK 행을 직접 잇는 루프라 행 단위 위치가 필요한데, 엣지(SVG)는 노드(DOM) 내부 레이아웃을
 * 가질 수 없다 — TableNode가 레이아웃 후 행의 offsetTop·offsetHeight를 노드 루트 기준으로
 * 등록하고, 엣지는 노드 좌표(RF 실측 positionAbsolute)와 합쳐 앵커를 만든다.
 *
 * 값은 흐름 좌표(offsetTop — 줌·팬 무관)라 드래그 중에도 유효하고, 행 구성(컬럼 증감·영역
 * 순서·키만 보기)이 바뀌면 TableNode가 다시 등록한다. 등록 전(첫 프레임·테스트)은 조회가
 * 비어 엣지가 면 중심 루프로 폴백한다 — RF measured 갱신과 같은 2프레임 수렴 구조.
 */
const byTable = new Map<string, Map<string, { top: number; height: number }>>()

/** 테이블 노드의 컬럼 행 위치 일괄 등록 — 이전 내용을 통째로 교체한다(행 감쇠 잔여 방지) */
export function registerColumnRowAnchors(tableId: string, rows: Map<string, { top: number; height: number }>): void {
  byTable.set(tableId, rows)
}

/** 노드 언마운트(문서에서 테이블 삭제) 시 등록 해제 */
export function unregisterColumnRowAnchors(tableId: string): void {
  byTable.delete(tableId)
}

/** 컬럼 행 위치 조회 — 미등록 컬럼(키만 보기 전환 직후 등)은 null */
export function columnRowAnchor(tableId: string, columnId: string): { top: number; height: number } | null {
  return byTable.get(tableId)?.get(columnId) ?? null
}
