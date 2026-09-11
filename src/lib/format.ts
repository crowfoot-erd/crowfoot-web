/**
 * Intl 기반 포맷터 (storyboard 00-common §3.3 — 언어 설정을 따르는 Intl 날짜·숫자)
 */
import i18n from '@/lib/i18n'

function locale(): string {
  return i18n.language.startsWith('en') ? 'en-US' : 'ko-KR'
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()

/** YYYY-MM-DD (ko) / M/D/YYYY (en) — 생성일·부여일 등 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  const key = locale()
  let formatter = dateFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(key, { dateStyle: 'medium' })
    dateFormatters.set(key, formatter)
  }
  return formatter.format(date)
}

/** 세션 목록 등 시간까지 필요한 곳 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  const key = locale()
  let formatter = dateTimeFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(key, { dateStyle: 'medium', timeStyle: 'short' })
    dateTimeFormatters.set(key, formatter)
  }
  return formatter.format(date)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale()).format(value)
}
