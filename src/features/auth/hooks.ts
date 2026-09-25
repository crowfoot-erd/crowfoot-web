/**
 * 인증 관련 훅 — me(1회)·providers(공개)·로그아웃·계정 로케일 동기화
 */
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import i18n, {
  LANGUAGE_STORAGE_KEY,
  htmlLang,
  isLanguage,
  languageFromPath,
  type Language,
  currentLanguage,
} from '@/lib/i18n'
import { fetchMe, fetchProviders, logout, updateMyLocale } from '@/features/auth/api'
import type { Me } from '@/api/types'
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
 * 문서 교체 직전의 마지막 리렌더에서도 가드가 /login을 그리는 섬광이 남아, 폐기 전에
 * beginLogout() 플래그로 가드를 억제한다 (protected-route — 로그아웃 중엔 아무것도 그리지 않음).
 */
export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      useSessionStore.getState().beginLogout()
      resetSession()
      void queryClient.clear()
      window.location.assign('/')
    },
  })
}

/**
 * 계정 로케일 동기화 (storyboard 00-common §3.3 — 언어 상태 우선순위)
 * me 도착 시 1회:
 * - locale이 저장돼 있고 수동 변경 흔적(localStorage)이 없으면 → 계정 언어 적용(재로그인 유지)
 * - locale이 null이고 흔적도 없으면 → 감지 언어를 계정에 등록(1회 PATCH)
 * 흔적이 있으면 수동값이 이긴다 — 저장하지 않는다. URL prefix가 있는 영역은 LocaleRoute가 이미 처리했다.
 */
export function useAccountLanguage() {
  const me = useMe()

  useEffect(() => {
    const user = me.data
    if (!user) return
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (isLanguage(stored)) return // 수동 변경 흔적 — 최우선

    if (isLanguage(user.locale)) {
      if (!languageFromPath(window.location.pathname) && currentLanguage() !== user.locale) {
        document.documentElement.lang = htmlLang(user.locale)
        void i18n.changeLanguage(user.locale)
      }
      return
    }
    // 첫 로그인 — 감지 언어 등록. 실패해도 UI는 유지된다(다음 로그인 재시도)
    void updateMyLocale(currentLanguage()).catch(() => undefined)
  }, [me.data])
}

/** 계정 로케일 변경 — 서버 저장 + me 캐시 갱신(URL·i18n 전환은 호출부의 useChangeLanguage이 담당) */
export function useUpdateMyLocale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (locale: Language) => updateMyLocale(locale),
    onSuccess: (_data, locale) => {
      queryClient.setQueryData<Me | undefined>(['me'], (me) =>
        me ? { ...me, locale } : me,
      )
    },
  })
}
