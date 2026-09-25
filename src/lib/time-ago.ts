/**
 * 상대시간 표기 (커뮤니티 최근글·게시글 목록 — "5분 전" / "5 minutes ago")
 *
 * Intl.RelativeTimeFormat이 로케일 문구를 내장하므로 i18n 리소스 키가 필요 없다.
 * 1년을 넘으면 상대 표기가 부정확해져 formatDate(절대 날짜)로 폴백한다.
 */
import { INTL_LOCALES, currentLanguage } from '@/lib/i18n'
import { formatDate } from '@/lib/format'

function locale(): string {
  return INTL_LOCALES[currentLanguage()]
}

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>()

function formatter(): Intl.RelativeTimeFormat {
  const key = locale()
  let formatter = relativeFormatters.get(key)
  if (!formatter) {
    // numeric: 'auto'는 로케일 자연 표기("그저께")를 만들어 문구 예측이 어렵다 — 항상 숫자형
    formatter = new Intl.RelativeTimeFormat(key, { numeric: 'always' })
    relativeFormatters.set(key, formatter)
  }
  return formatter
}

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/** 상대 표기 상한 — 이 기간을 넘으면 절대 날짜로 돌아간다 */
export const RELATIVE_TIME_LIMIT_SECONDS = YEAR

/** ISO 문자열의 상대시간 — n초 전/n분 전/n시간 전/n일 전/n주 전/n개월 전, 1년 초과 시 절대 날짜 */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (seconds < -MINUTE) return formatDate(iso) // 미래 시각(시계 어긋남) — 절대 날짜 폴백
  if (seconds < MINUTE) return formatter().format(-Math.max(seconds, 0), 'second')
  if (seconds < HOUR) return formatter().format(-Math.floor(seconds / MINUTE), 'minute')
  if (seconds < DAY) return formatter().format(-Math.floor(seconds / HOUR), 'hour')
  if (seconds < WEEK) return formatter().format(-Math.floor(seconds / DAY), 'day')
  if (seconds < MONTH) return formatter().format(-Math.floor(seconds / WEEK), 'week')
  if (seconds < YEAR) return formatter().format(-Math.floor(seconds / MONTH), 'month')
  return formatDate(iso)
}
