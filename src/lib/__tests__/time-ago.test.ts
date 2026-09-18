/**
 * 상대시간 표기 단위 테스트
 *
 * given: 기준 시각(now)으로부터 떨어진 ISO 문자열
 * when: timeAgo 호출
 * then: 분/시간/일/주/월 분기와 폴백(방금 전·미래·무효값·30일 초과 절대 날짜)이 맞는다
 */
import { describe, expect, it } from 'vitest'

import i18n from '@/lib/i18n'
import { timeAgo } from '@/lib/time-ago'

const NOW = new Date('2026-09-18T12:00:00Z')

function iso(secondsAgo: number): string {
  return new Date(NOW.getTime() - secondsAgo * 1000).toISOString()
}

describe('timeAgo', () => {
  it('renders seconds for differences under a minute', () => {
    expect(timeAgo(iso(10), NOW)).toBe('10초 전')
  })

  it('renders minutes and hours in Korean', () => {
    expect(timeAgo(iso(5 * 60), NOW)).toBe('5분 전')
    expect(timeAgo(iso(3 * 60 * 60), NOW)).toBe('3시간 전')
  })

  it('renders days and weeks', () => {
    expect(timeAgo(iso(2 * 24 * 60 * 60), NOW)).toBe('2일 전')
    expect(timeAgo(iso(2 * 7 * 24 * 60 * 60), NOW)).toBe('2주 전')
  })

  it('renders months up to one year and falls back to absolute dates beyond it', () => {
    expect(timeAgo(iso(60 * 24 * 60 * 60), NOW)).toBe('2개월 전')
    expect(timeAgo(iso(31 * 24 * 60 * 60), NOW)).toBe('1개월 전')
    // 366일 — 상대 표기 상한 초과 → 절대 날짜 폴백(2025-09-17)
    expect(timeAgo(iso(366 * 24 * 60 * 60), NOW)).toMatch('2025. 9. 17.')
  })

  it('falls back to the absolute date for future timestamps and invalid input', () => {
    // 미래(시계 어긋남) — 절대 날짜
    expect(timeAgo(new Date(NOW.getTime() + 10 * 60 * 1000).toISOString(), NOW)).toMatch('2026. 9. 18.')
    expect(timeAgo(null)).toBe('-')
    expect(timeAgo('not-a-date')).toBe('-')
  })

  it('follows the current language for relative phrases', () => {
    // given: 영어로 전환
    i18n.changeLanguage('en')
    try {
      // when & then: en 상대 문구
      expect(timeAgo(iso(5 * 60), NOW)).toBe('5 minutes ago')
    } finally {
      i18n.changeLanguage('ko')
    }
  })
})
