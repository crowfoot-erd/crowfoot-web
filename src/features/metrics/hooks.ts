/**
 * 관리자 트래픽 통계 쿼리 훅 — 기간(days)·차원(dimension)이 쿼리 키에 들어가
 * 기간 전환 시 전체 재조회된다. 조회 자체가 감사(ADMIN_METRICS_VIEWED) 대상이라 재시도 없음.
 */
import { useQuery } from '@tanstack/react-query'

import {
  fetchTrafficActivity,
  fetchTrafficBreakdown,
  fetchTrafficSummary,
} from '@/features/metrics/api'
import type { TrafficDimension } from '@/api/types'

export const trafficKeys = {
  summary: (days: number) => ['admin', 'traffic', 'summary', days] as const,
  breakdown: (dimension: TrafficDimension, days: number) =>
    ['admin', 'traffic', 'breakdown', dimension, days] as const,
  activity: (days: number) => ['admin', 'traffic', 'activity', days] as const,
}

export function useTrafficSummary(days: number) {
  return useQuery({
    queryKey: trafficKeys.summary(days),
    queryFn: ({ signal }) => fetchTrafficSummary(days, signal),
  })
}

export function useTrafficBreakdown(dimension: TrafficDimension, days: number) {
  return useQuery({
    queryKey: trafficKeys.breakdown(dimension, days),
    queryFn: ({ signal }) => fetchTrafficBreakdown(dimension, days, signal),
  })
}

export function useTrafficActivity(days: number) {
  return useQuery({
    queryKey: trafficKeys.activity(days),
    queryFn: ({ signal }) => fetchTrafficActivity(days, signal),
  })
}
