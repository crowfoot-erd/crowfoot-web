/**
 * 배포 뒤 지워진 코드 조각 불러오기 실패 → 한 번만 새로고침
 *
 * 배포하면 /assets/의 해시 파일명이 바뀌고 옛 파일은 사라진다. 배포 전에 열어 둔 화면이 lazy 조각(SQL 편집기 등)을
 * 처음 열면 옛 파일을 찾다 404가 나 화면이 깨진다. Vite가 이때 내는 vite:preloadError를 받아 새 HTML로 다시 연다.
 * 새로고침 뒤에도 실패하면(진짜 네트워크 오류) 되풀이하지 않도록 같은 탭에서 30초 안에는 한 번만 한다.
 */
const RELOAD_KEY = 'crowfoot:chunk-reload-at'
const RELOAD_GUARD_MS = 30_000

/** 방금 같은 이유로 새로고침했으면 false — 저장소를 못 쓰는 환경에서는 새로고침하지 않는다 */
export function shouldReloadForChunkError(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (now - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

export function installChunkReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (!shouldReloadForChunkError()) return
    event.preventDefault()
    window.location.reload()
  })
}
