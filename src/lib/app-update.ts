/**
 * 새 배포 알아채기 (05-editor/02-ui.md §19)
 *
 * 배포 뒤에도 열려 있던 화면은 예전 코드로 계속 돈다. 예전 코드는 그 뒤에 생긴 문서 항목을 모르므로
 * 저장할 때 지운다(v1.31을 배포한 날 v1.30 화면이 요구사항을 지웠다). 화면이 /version.json을 주기적으로 읽어
 * 자기 빌드 식별자와 다르면 "새 버전" 상태가 된다. 에디터는 그 상태에서 저장을 멈추고 새로고침을 안내한다.
 * 개발 서버와 테스트(식별자 'dev')에서는 확인하지 않는다.
 */
import { useEffect } from 'react'
import { create } from 'zustand'

const CHECK_INTERVAL_MS = 60_000

interface AppUpdateState {
  available: boolean
}

export const useAppUpdateStore = create<AppUpdateState>(() => ({ available: false }))

/** 지금 배포된 빌드 식별자를 읽어 견준다 — 읽지 못하면(오프라인, 배포 중) 다음 주기에 다시 본다 */
export async function checkForAppUpdate(currentBuild: string = __APP_BUILD__): Promise<boolean> {
  if (currentBuild === 'dev' || useAppUpdateStore.getState().available) return useAppUpdateStore.getState().available
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return false
    const body = (await response.json()) as { build?: unknown }
    if (typeof body.build === 'string' && body.build.length > 0 && body.build !== currentBuild) {
      useAppUpdateStore.setState({ available: true })
      return true
    }
  } catch {
    // 다음 주기에 다시 본다
  }
  return false
}

/** 새 배포가 나왔는가 — 마운트된 동안 1분마다, 그리고 창으로 돌아올 때 확인한다 */
export function useAppUpdateAvailable(): boolean {
  const available = useAppUpdateStore((state) => state.available)
  useEffect(() => {
    if (available) return
    void checkForAppUpdate()
    const timer = window.setInterval(() => void checkForAppUpdate(), CHECK_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForAppUpdate()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [available])
  return available
}
