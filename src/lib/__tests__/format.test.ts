/**
 * Intl 포맷터 단위 테스트 (frontend-testing.md A3)
 *
 * 언어 설정(ko/en)을 따르는 날짜·날짜시간·숫자 포맷 — null·무효값은 '-'.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import i18n from '@/lib/i18n'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'

describe('Intl 포맷터', () => {
  beforeEach(() => {
    i18n.changeLanguage('ko')
  })

  it('formats dates per the current language', () => {
    // given
    i18n.changeLanguage('ko')
    expect(formatDate('2026-01-02T09:30:00Z')).toMatch('2026. 1. 2.')

    // when: 영어로 전환
    i18n.changeLanguage('en')
    // then: en-US medium 스타일
    expect(formatDate('2026-01-02T09:30:00Z')).toMatch('Jan')
    expect(formatDate('2026-01-02T09:30:00Z')).toMatch('2026')
  })

  it('formats date and time with the short time style', () => {
    expect(formatDateTime('2026-01-02T23:59:00Z')).toMatch(/\d{1,2}:\d{2}/)
  })

  it('formats numbers with locale grouping', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('returns a dash for null·undefined·invalid values', () => {
    expect(formatDate(null)).toBe('-')
    expect(formatDate(undefined)).toBe('-')
    expect(formatDate('not-a-date')).toBe('-')
    expect(formatDateTime(null)).toBe('-')
  })
})
