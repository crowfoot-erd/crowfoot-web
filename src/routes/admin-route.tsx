/**
 * 관리자 가드 (storyboard 03-admin §2 — 비관리자 /admin/* 접근은 리다이렉트 아닌 404 렌더)
 */
import { Outlet } from 'react-router-dom'

import { ErrorState } from '@/components/error-state'
import { SplashScreen } from '@/components/splash-screen'
import { useMe } from '@/features/auth'
import { NotFoundPage } from '@/pages/not-found'

export function AdminRoute() {
  const me = useMe()

  if (me.isPending) return <SplashScreen />
  if (me.isError) return <ErrorState onRetry={() => void me.refetch()} />
  if (!me.data?.admin) return <NotFoundPage />

  return <Outlet />
}
