/**
 * 테마 모듈 단위 테스트 (storyboard 00-common §3.3)
 *
 * light/dark/system — localStorage 'crowfoot.theme' 저장(system은 키 제거)·
 * documentElement 'dark' 클래스 토글.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { getResolvedTheme, getTheme, setTheme, THEME_STORAGE_KEY, useTheme } from '@/lib/theme'

describe('테마', () => {
  afterEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
    document.documentElement.classList.remove('dark')
    setTheme('system')
  })

  it('defaults to system and resolves via prefers-color-scheme', () => {
    // given: 저장 없음 (matchMedia 스텁 matches=false → light)
    window.localStorage.removeItem(THEME_STORAGE_KEY)

    // then
    expect(getTheme()).toBe('system')
    expect(getResolvedTheme()).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('persists light/dark and toggles the dark class', () => {
    // when: dark 선택
    setTheme('dark')

    // then
    expect(getTheme()).toBe('dark')
    expect(getResolvedTheme()).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    // when: light 선택
    setTheme('light')

    // then
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('removes the storage key when returning to system', () => {
    setTheme('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    // when: system 복귀
    setTheme('system')

    // then: 키 제거 (감지 우선순위가 없으면 navigator 기본)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('reflects changes in the useTheme hook', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('system')

    // when: 테마 변경
    act(() => result.current.setTheme('dark'))

    // then: 훅이 즉시 반영
    expect(result.current.theme).toBe('dark')
    expect(result.current.resolved).toBe('dark')
  })
})
