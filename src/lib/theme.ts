/**
 * 테마 (storyboard 00-common §3.3 — light | dark, 기본 light)
 *
 * - localStorage 'crowfoot.theme' — persist 미사용(수동)·index.html 인라인 스크립트와 키 공유(FOUC 방지)
 * - 저장값이 없거나 구버전 'system'이면 light — OS 설정 추종은 v1.16에서 제거(기본은 항상 light)
 * - 실제 적용은 documentElement.classList 'dark' 토글 — shadcn CSS 변수 체계
 */
import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'crowfoot.theme'

const listeners = new Set<() => void>()
let currentTheme = readStoredTheme()

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

function notify(): void {
  for (const listener of listeners) listener()
}

function applyTheme(): void {
  document.documentElement.classList.toggle('dark', currentTheme === 'dark')
}

export function getTheme(): Theme {
  return currentTheme
}

export function setTheme(theme: Theme): void {
  currentTheme = theme
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme()
  notify()
}

/** React 연결 — 테마 토글·아이콘 표기용 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => currentTheme,
    () => 'light' as const,
  )
  return { theme, setTheme }
}
