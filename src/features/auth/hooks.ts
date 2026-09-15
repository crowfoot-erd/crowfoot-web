/**
 * 인증 관련 훅 — me(1회)·providers(공개)·로그아웃
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchMe, fetchProviders, logout } from '@/features/auth/api'
import { resetSession, useSessionStore } from '@/stores/session'

/** 공개 — 로그인 방식 목록 */
export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: ({ signal }) => fetchProviders(signal),
  })
}

/**
 * 내 정보 — 인증 후 1회 조회(§3.2)·재조회 없음(staleTime/gcTime Infinity).
 * 화면 전환·탭 복귀에도 다시 호출하지 않는다.
 */
export function useMe() {
  const status = useSessionStore((state) => state.status)

  return useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => fetchMe(signal),
    enabled: status === 'authenticated',
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/**
 * 로그아웃 — 서버 블랙리스트 등록 시도 후 성공/실패 무관 로컬 세션 폐기 → 시작 페이지(랜딩 /).
 * 이동은 SPA navigate가 아니라 **문서 단위 이동**을 쓴다: 세션 폐기(긴급 리렌더)가 라우트
 * 이동(transition)보다 먼저 확정되어 보호 라우트 가드(unauthenticated → /login?next=보존)가
 * 목적지를 가로채기 때문이다. startOAuthLogin과 같은 전체 이동 관례.
 */
export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      resetSession()
      void queryClient.clear()
      window.location.assign('/')
    },
  })
}
