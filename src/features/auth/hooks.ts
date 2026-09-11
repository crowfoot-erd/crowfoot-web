/**
 * 인증 관련 훅 — me(1회)·providers(공개)·로그아웃
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

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

/** 로그아웃 — 서버 블랙리스트 등록 시도 후 성공/실패 무관 로컬 세션 폐기 → /login */
export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      resetSession()
      void queryClient.clear()
      navigate('/login')
    },
  })
}
