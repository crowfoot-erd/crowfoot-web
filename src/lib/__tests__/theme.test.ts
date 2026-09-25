/**
 * 테마 모듈 단위 테스트 (storyboard 00-common §3.3)
 *
 * light/dark — localStorage 'crowfoot.theme' 저장·documentElement 'dark' 클래스 토글.
 * 기본은 light(저장 없음·구버전 'system' 잔여값 모두).
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getTheme, setTheme, THEME_STORAGE_KEY, useTheme } from '@/lib/theme'

describe('테마', () => {
  afterEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
    document.documentElement.classList.remove('dark')
    setTheme('light')
  })

  it('defaults to light with no dark class', () => {
    // given: 저장 없음 — 모듈 로드 시점 기본 light
    // then
    expect(getTheme()).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists light/dark and toggles the dark class', () => {
    // when: dark 선택
    setTheme('dark')

    // then
    expect(getTheme()).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    // when: light 선택
    setTheme('light')

    // then
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('treats a legacy stored "system" as light', async () => {
    // given: v1.15 이하의 저장값 'system' 잔여
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system')

    // when: 모듈 초기화 재실행
    vi.resetModules()
    const fresh = await import('@/lib/theme')

    // then: OS 추종 없이 light로 해석
    expect(fresh.getTheme()).toBe('light')
  })

  it('reflects changes in the useTheme hook', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')

    // when: 테마 변경
    act(() => result.current.setTheme('dark'))

    // then: 훅이 즉시 반영
    expect(result.current.theme).toBe('dark')
  })
})
