/**
 * 에디터 마지막 화면(줌·팬) 기억 — 문서별 브라우저(localStorage) 저장 (05-editor/02-ui.md §2.1)
 *
 * 문서 저장(자동 저장)은 편집이 있을 때만 일어나서, 줌만 바꾸고 나간 화면은 content의
 * viewport에 남지 않는다. 줌·팬이 끝날 때마다 여기 기록해 다음 열기에서 가장 최근
 * 화면을 복원한다(복원 우선순위: 브라우저 기억 > 저장된 content viewport > 전체 맞춤).
 * 서버 왕복이 없으니 다른 브라우저·기기에는 따라가지 않는다.
 */

export interface StoredViewport {
  x: number
  y: number
  zoom: number
}

export const viewportStorageKey = (modelId: string): string => `crowfoot.editor.viewport.${modelId}`

/** 문서별 마지막 화면 — 기록이 없거나 깨졌으면 null */
export function readStoredViewport(modelId: string | null): StoredViewport | null {
  if (!modelId) return null
  try {
    const raw = localStorage.getItem(viewportStorageKey(modelId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      Number.isFinite((parsed as StoredViewport).x) &&
      Number.isFinite((parsed as StoredViewport).y) &&
      Number.isFinite((parsed as StoredViewport).zoom)
    ) {
      return parsed as StoredViewport
    }
  } catch {
    // 깨진 기록은 없는 셈친다
  }
  return null
}

/** 줌·팬 종료 시점의 화면 기록 — 쓰기 실패(사설 모드 등)는 조용히 넘긴다 */
export function storeViewport(modelId: string | null, viewport: StoredViewport): void {
  if (!modelId) return
  try {
    localStorage.setItem(viewportStorageKey(modelId), JSON.stringify(viewport))
  } catch {
    // 저장 실패는 기억 없음과 같다 — 치명 상황이 아니다
  }
}
