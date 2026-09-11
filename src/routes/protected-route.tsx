/**
 * 인증 가드 (storyboard 00-common §3.1 §4.2)
 * - bootstrapping → 스플래시 / error → 재시도 / unauthenticated → /login?next= 보존
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { SplashScreen } from '@/components/splash-screen'
import { useSessionStore } from '@/stores/session'

export function ProtectedRoute() {
  const status = useSessionStore((state) => state.status)
  const location = useLocation()

  if (status === 'bootstrapping') {
    return <SplashScreen />
  }

  if (status === 'error') {
    return <SplashScreen error onRetry={() => void useSessionStore.getState().bootstrap()} />
  }

  if (status === 'unauthenticated') {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  return <Outlet />
}
