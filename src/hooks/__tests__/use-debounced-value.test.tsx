/**
 * 디바운스 훅 단위 테스트 (frontend-testing.md A4)
 *
 * given: 값 변경
 * when: 지연 시간 경과 전/후
 * then: 지연 전에는 이전 값, 경과 후 최신 값
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDebouncedValue } from '@/hooks/useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 300))
    expect(result.current).toBe('initial')
  })

  it('updates only after the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'ab' })
    // when: 지연 시간 경과 전 — 아직 이전 값
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    // then: 경과 후 최신 값
    expect(result.current).toBe('ab')
  })

  it('resets the timer on rapid changes (trailing only)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'ab' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: 'abc' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    // when: 첫 변경 후 400ms지만 두 번째 변경이 타이머를 리셋 — 아직 이전 값
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    // then: 최종적으로 최신 값
    expect(result.current).toBe('abc')
  })
})
