/**
 * 테마 (storyboard 00-common §3.3 — light | dark | system, 기본 system)
 *
 * - localStorage 'crowfoot.theme' — persist 미사용(수동)·index.html 인라인 스크립트와 키 공유(FOUC 방지)
 * - system 모드: prefers-color-scheme 변경 리스너로 실시간 반영
 * - 실제 적용은 documentElement.classList 'dark' 토글 — shadcn CSS 변수 체계
 */
import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'crowfoot.theme'

const listeners = new Set<() => void>()
let currentTheme = readStoredTheme()

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function notify(): void {
  for (const listener of listeners) listener()
}

/** system 모드에서 OS 설정 변경 시 실시간 반영 — 앱 진입점에서 1회 호출 */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (currentTheme === 'system') applyTheme()
    notify()
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function applyTheme(): void {
  const resolved = resolve(currentTheme)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function getTheme(): Theme {
  return currentTheme
}

export function getResolvedTheme(): ResolvedTheme {
  return resolve(currentTheme)
}

export function setTheme(theme: Theme): void {
  currentTheme = theme
  if (theme === 'system') {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
  } else {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
  applyTheme()
  notify()
}

/** React 연결 — 테마 토글·아이콘 표기용 */
export function useTheme(): { theme: Theme; resolved: ResolvedTheme; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => currentTheme,
    () => 'system' as const,
  )
  return { theme, resolved: resolve(theme), setTheme }
}
