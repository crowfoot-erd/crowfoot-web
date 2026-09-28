/**
 * 알림 API (08-core/11-notification.md §5 — v1.22) — 피드백 3종 이벤트의 수신·읽음.
 * 수신은 폴링(30초 unread-count)뿐이다 — 실시간 푸시·이메일 없음. 전부 회원전용 경로.
 */
import { apiGet, apiGetPage, apiPatch, apiPost } from '@/api/client'
import type { NotificationItem } from '@/api/types'

/** 알림 목록 — 최신순(id DESC) 오프셋 페이징. 헤더 벨 드롭다운(page=1&size=10)과
 *  전체 페이지(size=20)가 같은 API를 나눠 쓴다 */
export function fetchNotifications(page: number, size: number, signal?: AbortSignal) {
  return apiGetPage<NotificationItem>('/api/v1/core/notifications', { page, size }, signal)
}

/** 안읽음 카운트 — 헤더 벨 배지의 원천. 폴링 주체가 부른다 */
export function fetchUnreadNotificationCount(signal?: AbortSignal) {
  return apiGet<number>('/api/v1/core/notifications/unread-count', undefined, signal)
}

/** 1건 읽음 — 멱등. 타인 알림·부재는 서버가 같은 404로 감춘다(존재 은닉 — 호출부가 무시) */
export function markNotificationRead(notificationId: string) {
  return apiPatch<void>(`/api/v1/core/notifications/${notificationId}/read`)
}

/** 전체 읽음 — 수신자의 안읽음 행 일괄 스탬프 */
export function markAllNotificationsRead() {
  return apiPost<void>('/api/v1/core/notifications/read-all')
}
