/**
 * 알림이 가리키는 곳 (08-core/11-notification.md Section 2.1·2.2) — 문서 알림은 문서로,
 * 게시글 알림(커뮤니티 댓글·제안 및 신고 새 글)은 게시글로 간다. 벨 드롭다운과 전체 목록이 함께 쓴다.
 */
import type { NotificationItem } from '@/api/types'

export function notificationTarget(item: NotificationItem): { path: string; label: string } {
  if (item.postId) {
    // 댓글 알림은 그 댓글까지 — 게시글 화면이 #comment-{id}로 스크롤·강조한다. 지워진 댓글이면 게시글로만
    const anchor = item.commentId ? `#comment-${item.commentId}` : ''
    return { path: `/community/posts/${item.postId}${anchor}`, label: item.postTitle ?? '' }
  }
  return { path: `/workspaces/${item.workspaceId}/models/${item.modelId}`, label: item.modelName ?? '' }
}

/** i18n 보간 값 — 문서 알림은 {{model}}, 게시글 알림은 {{title}}을 쓴다 */
export function notificationMessageValues(item: NotificationItem) {
  return { actor: item.actorDisplayName ?? '', model: item.modelName ?? '', title: item.postTitle ?? '' }
}
