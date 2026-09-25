/**
 * 앱 엔트리 — Provider 구성·부트스트랩·전역 오버레이
 */
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import { SessionExpiredOverlay } from '@/components/session-expired-overlay'
import { Toaster } from '@/components/ui/sonner'
import { useAccountLanguage } from '@/features/auth'
import { watchSystemTheme, useTheme } from '@/lib/theme'
import { AppRoutes } from '@/routes/app-routes'
import { useSessionStore } from '@/stores/session'

// 재시도는 화면의 [다시 시도] 버튼이 담당 — 자동 재시도 없이 즉시 오류 상태로
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true },
  },
})

function GlobalToaster() {
  const { resolved } = useTheme()

  return (
    <Toaster
      theme={resolved}
      position="bottom-center"
      duration={3000}
    />
  )
}

/** 계정 로케일 동기화 — useMe(QueryClient)를 쓰므로 프로바이더 안에서 호출돼야 한다 */
function AccountLanguageSync() {
  useAccountLanguage()
  return null
}

export default function App() {
  const bootstrap = useSessionStore((state) => state.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // system 모드에서 OS 테마 변경 실시간 반영
  useEffect(() => watchSystemTheme(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AccountLanguageSync />
        <AppRoutes />
        <SessionExpiredOverlay />
        <GlobalToaster />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
