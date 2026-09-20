/**
 * 컴포넌트 테스트 공용 유틸 (frontend-testing.md B)
 *
 * - 라우터·쿼리 프로바이더로 감싼 렌더 (호출부에서 <Route>를 전달한다)
 * - 인증 상태 시딩 — 스토어 + 메모리 Access 토큰
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Routes } from 'react-router-dom'

import { setAccessToken } from '@/api/client'
import '@/lib/i18n'
import { useSessionStore } from '@/stores/session'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
  queryClient?: QueryClient
  /** true(기본): ui를 <Routes>로 감싼다 — <Route> 전달용. false: 컴포넌트를 그대로 렌더 */
  wrapRoutes?: boolean
}

export function renderWithProviders(
  ui: ReactNode,
  {
    route = '/',
    queryClient = createTestQueryClient(),
    wrapRoutes = true,
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          {wrapRoutes ? (
            // 호출부는 <Route path=... element=.../>를 전달한다
            <Routes>{ui}</Routes>
          ) : (
            children
          )}
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  }
}

/** 보호된 화면 테스트용 — 인증 완료 상태로 시딩 */
export function asAuthenticated(token = 'test-access-token'): void {
  setAccessToken(token)
  useSessionStore.setState({ status: 'authenticated', sessionExpiredReason: null })
}

/** 세션 상태 원복 */
export function resetSessionState(): void {
  useSessionStore.setState({ status: 'bootstrapping', sessionExpiredReason: null, loggingOut: false })
}
