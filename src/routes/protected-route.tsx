/**
 * 인증 가드 (storyboard 00-common §3.1 §4.2)
 * - bootstrapping → 스플래시 / error → 재시도 / unauthenticated → /login?next= 보존
 * - 단, 로그아웃 진행 중(loggingOut)에는 아무것도 그리지 않는다 — 세션 폐기 리렌더가
 *   문서 이동(랜딩 /)보다 먼저 확정되는 순간 가드가 /login으로 보내 섬광처럼 로그인
 *   화면이 스치는 경쟁을 끊는다 (§4.1, useLogout).
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { SplashScreen } from '@/components/splash-screen'
import { LANGUAGE_PREFIXES, languageFromPath } from '@/lib/i18n'
import { useSessionStore } from '@/stores/session'

export function ProtectedRoute() {
  const status = useSessionStore((state) => state.status)
  const loggingOut = useSessionStore((state) => state.loggingOut)
  const location = useLocation()

  if (status === 'bootstrapping') {
    return <SplashScreen />
  }

  if (status === 'error') {
    return <SplashScreen error onRetry={() => void useSessionStore.getState().bootstrap()} />
  }

  if (status === 'unauthenticated') {
    // 로그아웃 중 — 문서가 곧 교체된다. 가드의 /login 리다이렉트가 그 사이 그려지지 않게 한다
    if (loggingOut) return null

    const next = location.pathname + location.search
    // 로그인은 같은 언어 영역 안으로 — URL prefix를 경로에서 다시 읽어 보존한다(렌더 시점 결정,
    // LocaleRoute effect와 경쟁하지 않는다). 무prefix(ko)는 LANGUAGE_PREFIXES.ko = ''
    const prefix = LANGUAGE_PREFIXES[languageFromPath(location.pathname) ?? 'ko']
    return <Navigate to={`${prefix}/login?next=${encodeURIComponent(next)}`} replace />
  }

  return <Outlet />
}
