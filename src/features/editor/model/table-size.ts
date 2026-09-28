/** 테이블 노드 렌더 크기 산수 — 순수 모델 영역(캔버스 컴포넌트가 아닌 곳에서도 재사용).
 *  TableNode.tsx·auto-layout·canvas-bounds·note-overlap이 같은 값을 쓰므로 여기가 단일 원천이다. */

const DEFAULT_WIDTH = 370
/** 컬럼 그리드 고정 칸(그립·PK·사이즈·NN·AI·삭제 ≈ 172px + 간격·행 패딩)을 감당하는 렌더 하한 —
 *  과거에 좁게 저장된 width도 이름 칸이 안 눌리게 한다 */
export const MIN_WIDTH = 330

/** 노드 렌더 폭 — 저장 폭·측정 콘텐츠 폭·하한 중 최대 (ErdCanvas 겹침 해소도 같은 값 사용).
 *  하한은 기본 MIN_WIDTH — 타입 칸이 넓게 측정된 표는 노드가 더 큰 하한을 넘긴다. */
export function tableRenderWidth(stored: number | null, contentWidth: number, minWidth = MIN_WIDTH): number {
  return Math.max(stored ?? DEFAULT_WIDTH, contentWidth, minWidth)
}

/** 겹침 판정용 높이 추정 — Chrome 실측 기준(컬럼 행 47, 키 행 25):
 *  밴드 28 + 컬럼 툴바 29 + PK 구분선 2 + 컬럼 행 × 47 + 컬럼 추가 버튼 24
 *  + UK/IX 컨테이너(빈 28) + 키 행 × 25 + 테두리. 자동 배치(elkjs) 레이어 간격의 기준이 된다. */
export function estimateTableHeight(columnCount: number, keyRowCount = 0): number {
  return 112 + columnCount * 47 + keyRowCount * 25
}
