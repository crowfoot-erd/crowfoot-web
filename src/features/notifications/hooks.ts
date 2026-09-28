/**
 * 알림 쿼리 훅 (08-core/11-notification.md §6 — v1.22) — 수신은 폴링뿐이다.
 * 폴링 계약: refetchInterval 30초 + staleTime 0 + retry false + gcTime 15초 + enabled 인증
 * (에디터 버전 폴링 VERSION_POLL_MS와 같은 조합 — 오류는 조용히 사라지고 다음 창에 재시도).
 * 읽음 처리 성공·실패 무관 알림 쿼리 전체를 무효화해 정착한다(낙관적 갱신 금지 — 스토리보드 공통 규칙).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/features/notifications/api'
import { useSessionStore } from '@/stores/session'

export const NOTIFICATION_POLL_MS = 30_000

export const notificationKeys = {
  /** 알림 전체 — 읽음 처리 무효화의 루트(목록·카운트 함께 갱신) */
  all: ['notifications'] as const,
  list: (page: number, size: number) => ['notifications', 'list', page, size] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
}

/** 안읽음 카운트(30초 폴링) — 헤더 벨 배지. 로그아웃이면 쿼리 자체가 꺼진다 */
export function useUnreadNotificationCount() {
  const status = useSessionStore((state) => state.status)

  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: ({ signal }) => fetchUnreadNotificationCount(signal),
    enabled: status === 'authenticated',
    refetchInterval: NOTIFICATION_POLL_MS,
    staleTime: 0,
    gcTime: 15_000,
    retry: false,
  })
}

/** 알림 목록 — 전체 페이지(size 20)·벨 드롭다운(size 10)이 page로 구분해 호출.
 *  드롭다운은 패널이 열렸을 때만 땡긴다(enabled={open}) */
export function useNotifications(page: number, size: number, enabled = true) {
  const status = useSessionStore((state) => state.status)

  return useQuery({
    queryKey: notificationKeys.list(page, size),
    queryFn: ({ signal }) => fetchNotifications(page, size, signal),
    enabled: status === 'authenticated' && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** 1건 읽음 — 성공 후 알림 전체 무효화(배지·목록·드롭다운 동시 정착) */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

/** 전체 읽음 — 성공 후 알림 전체 무효화 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}
