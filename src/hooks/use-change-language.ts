/**
 * 언어 전환 훅 (storyboard 00-common §3.3) — 논리 경로를 유지한 채 URL prefix만 교체한다.
 * 언어 상태(흔적·i18n·html lang)는 setLanguage가, URL은 이 훅이 담당한다.
 * 쿼리 파라미터(WS 멤버·설정 탭)는 보존된다.
 */
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { LANGUAGE_PREFIXES, type Language, currentLanguage, setLanguage } from '@/lib/i18n'

export function useChangeLanguage(): (language: Language) => void {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  return useCallback(
    (language: Language) => {
      // 현재 언어는 setLanguage 이전에 읽는다 — i18n.changeLanguage가 동기적으로 바꿔
      // 이후에 읽으면 새 언어 prefix를 떼려 든다(/ja → zh 전환이 /zh/ja/… 가 되는 결함)
      const current = currentLanguage()
      setLanguage(language)

      // 현재 prefix를 떼어 논리 경로를 만들고 대상 prefix를 다시 붙인다
      const currentPrefix = LANGUAGE_PREFIXES[current]
      const logical =
        current === 'ko' || currentPrefix === ''
          ? pathname
          : pathname.replace(new RegExp(`^${currentPrefix}(?=/|$)`), '')
      const target = LANGUAGE_PREFIXES[language]
      navigate(`${target}${logical}${search}`, { replace: true })
    },
    [navigate, pathname, search],
  )
}
