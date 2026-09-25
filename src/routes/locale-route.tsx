/**
 * 언어 prefix 라우트 (storyboard 00-common §3.3) — 각 언어 서브트리의 감싸는 라우트.
 *
 * URL prefix(/en·/ja·/zh)가 언어를 결정한다(우선순위 1위): prefix면 그 언어를 강제하고
 * 수동 변경 흔적(localStorage)으로 남긴다. 무prefix(ko 영역)는 흔적이 있으면 그 언어를
 * 유지하고(수동 변경 유지 요구), 없으면 ko다. 루트 리다이렉트는 하지 않는다 —
 * 프리렌더 ko 산출물 보호(크롤러 우발 색인 방지).
 */
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import i18n, {
  LANGUAGE_STORAGE_KEY,
  currentLanguage,
  htmlLang,
  isLanguage,
  languageFromPath,
  setLanguage,
} from '@/lib/i18n'

export function LocaleRoute() {
  const location = useLocation()
  // 언어 변경이 컴포넌트 트리 재렌더를 유발한다 — i18n 반응 연결
  useTranslation()

  useEffect(() => {
    const fromUrl = languageFromPath(location.pathname)
    if (fromUrl) {
      setLanguage(fromUrl) // 강제 + 흔적 + html lang + i18n
      return
    }
    // 무prefix(ko 영역) — 흔적을 남기지 않는다(방문만으로 언어가 고정되지 않게)
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    const target = isLanguage(stored) ? stored : 'ko'
    if (currentLanguage() !== target) {
      document.documentElement.lang = htmlLang(target)
      void i18n.changeLanguage(target)
    }
  }, [location.pathname])

  return <Outlet />
}
