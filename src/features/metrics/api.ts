/**
 * 관리자 트래픽 통계 API (08-core/10-metrics.md §7) — 요약·차원 분포·활동 집계 3종.
 * days는 서버 화이트리스트(7·28·90) 밖이면 400이다.
 */
import { apiGet } from '@/api/client'
import type { TrafficActivity, TrafficBreakdown, TrafficDimension, TrafficSummary } from '@/api/types'

export function fetchTrafficSummary(days: number, signal?: AbortSignal): Promise<TrafficSummary | undefined> {
  return apiGet<TrafficSummary>('/api/v1/core/admin/metrics/summary', { days }, signal)
}

export function fetchTrafficBreakdown(
  dimension: TrafficDimension,
  days: number,
  signal?: AbortSignal,
): Promise<TrafficBreakdown | undefined> {
  return apiGet<TrafficBreakdown>('/api/v1/core/admin/metrics/breakdown', { dimension, days }, signal)
}

export function fetchTrafficActivity(days: number, signal?: AbortSignal): Promise<TrafficActivity | undefined> {
  return apiGet<TrafficActivity>('/api/v1/core/admin/metrics/activity', { days }, signal)
}
