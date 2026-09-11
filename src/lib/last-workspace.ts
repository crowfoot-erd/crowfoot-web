/**
 * 마지막으로 선택한 워크스페이스 기억 (storyboard 02-user §2 — S-03 진입 리다이렉트용)
 * localStorage 'crowfoot.lastWorkspaceId' — theme 키와 같은 crowfoot.* 네임스페이스.
 * 삭제된 워크스페이스가 남아 있어도 진입 게이트가 목록에서 찾지 못하면 첫 항목으로 폴백한다.
 */
const LAST_WORKSPACE_KEY = 'crowfoot.lastWorkspaceId'

export function getLastWorkspaceId(): string | null {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY)
  } catch {
    return null
  }
}

export function setLastWorkspaceId(workspaceId: string): void {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId)
  } catch {
    // 저장 실패는 무시 — 폴백(첫 항목) 동작에 영향 없음
  }
}
