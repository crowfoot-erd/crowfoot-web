/**
 * 커뮤니티 API (08-core/08-community.md)
 *
 * - 게시글(릴리스 노트·제안 및 신고)·코멘트·최근글(대시보드 위젯)
 * - 생성(POST) 성공은 201+본문, 수정(PATCH)은 갱신 본문, 삭제(DELETE)는 204 — client가 정규화
 * - 이미지는 본문에 base64 data URL로 인라인(업로드 API 없음)
 */
import { apiDelete, apiGet, apiGetList, apiGetPage, apiPatch, apiPost } from '@/api/client'
import type {
  CommunityBoard,
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
  CommunityRecentPost,
} from '@/api/types'

export interface CommunityPostListParams {
  keyword?: string
  page?: number
  size?: number
}

export function fetchCommunityPosts(
  board: CommunityBoard,
  params: CommunityPostListParams = {},
  signal?: AbortSignal,
) {
  return apiGetPage<CommunityPostSummary>('/api/v1/core/community/posts', { board, ...params }, signal)
}

/** 대시보드 통합 최근글 — 게시판 무관 최신순 */
export function fetchRecentCommunityPosts(limit = 5, signal?: AbortSignal) {
  return apiGetList<CommunityRecentPost>('/api/v1/core/community/posts/recent', { limit }, signal)
}

export function fetchCommunityPost(postId: string, signal?: AbortSignal) {
  return apiGet<CommunityPostDetail>(`/api/v1/core/community/posts/${postId}`, undefined, signal)
}

export function createCommunityPost(body: { board: CommunityBoard; title: string; content: string }) {
  return apiPost<CommunityPostDetail>('/api/v1/core/community/posts', body)
}

/** board는 변경 불가 — 제목·본문만 */
export function updateCommunityPost(postId: string, body: { title: string; content: string }) {
  return apiPatch<CommunityPostDetail>(`/api/v1/core/community/posts/${postId}`, body)
}

export function deleteCommunityPost(postId: string) {
  return apiDelete<void>(`/api/v1/core/community/posts/${postId}`)
}

/* ---------- 코멘트 (FEEDBACK 전용) ---------- */

export function fetchCommunityComments(postId: string, signal?: AbortSignal) {
  return apiGetList<CommunityComment>(`/api/v1/core/community/posts/${postId}/comments`, undefined, signal)
}

export function createCommunityComment(postId: string, body: { content: string }) {
  return apiPost<CommunityComment>(`/api/v1/core/community/posts/${postId}/comments`, body)
}

export function updateCommunityComment(commentId: string, content: string) {
  return apiPatch<CommunityComment>(`/api/v1/core/community/comments/${commentId}`, { content })
}

export function deleteCommunityComment(commentId: string) {
  return apiDelete<void>(`/api/v1/core/community/comments/${commentId}`)
}
