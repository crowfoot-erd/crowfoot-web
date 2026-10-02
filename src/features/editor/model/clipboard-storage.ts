/**
 * 에디터 클립보드의 브라우저 저장소 (05-editor/02-ui.md §9)
 *
 * 로그아웃 처리(auth)가 에디터 코드를 끌어오지 않고 저장소만 지울 수 있게 따로 둔다.
 */

/** 브라우저 저장소 키 — 탭 사이에 클립보드를 나눈다 */
export const CLIPBOARD_STORAGE_KEY = 'crowfoot.editor.clipboard'

/** 저장소의 클립보드를 지운다 — 로그아웃할 때 부른다(다음 사용자가 붙여 넣지 못하게) */
export function removeStoredClipboard(): void {
  try {
    window.localStorage.removeItem(CLIPBOARD_STORAGE_KEY)
  } catch {
    // 저장소를 쓸 수 없는 환경 — 지울 것도 없다
  }
}
