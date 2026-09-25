/**
 * 커뮤니티 API (08-core/08-community.md)
 *
 * - 게시글(릴리스 노트·제안 및 신고)·코멘트·최근글(대시보드 위젯)
 * - 생성(POST) 성공은 201+본문, 수정(PATCH)은 갱신 본문, 삭제(DELETE)는 204 — client가 정규화
 * - 이미지는 본문에 base64 data URL로 인라인(업로드 API 없음)
 * - 읽기 경로는 ?lang=(ko/en/ja/zh)로 해석 언어를 고른다 — 서버 폴백: 요청언어 → en → ko
 * - 쓰기는 string-or-object 다형: 문자열은 {ko:값}(단일 폼), 객체는 값 있는 키만 병합(릴리스 노트 4언어)
 */
import { apiDelete, apiGet, apiGetList, apiGetPage, apiPatch, apiPost } from '@/api/client'
import type {
  CommunityBoard,
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
  CommunityRecentPost,
} from '@/api/types'

/** 릴리스 노트 4언어 폼의 본문 모양 — 값이 있는 언어만 서버에 병합된다 */
export type LocalizedTextInput = Partial<Record<'ko' | 'en' | 'ja' | 'zh', string>>

export interface CommunityPostListParams {
  keyword?: string
  page?: number
  size?: number
  lang?: string
}

export function fetchCommunityPosts(
  board: CommunityBoard,
  params: CommunityPostListParams = {},
  signal?: AbortSignal,
) {
  return apiGetPage<CommunityPostSummary>('/api/v1/core/community/posts', { board, ...params }, signal)
}

/** 대시보드 통합 최근글 — 게시판 무관 최신순 */
export function fetchRecentCommunityPosts(limit = 5, signal?: AbortSignal, lang?: string) {
  return apiGetList<CommunityRecentPost>(
    '/api/v1/core/community/posts/recent',
    lang ? { limit, lang } : { limit },
    signal,
  )
}

export function fetchCommunityPost(postId: string, signal?: AbortSignal, lang?: string) {
  return apiGet<CommunityPostDetail>(
    `/api/v1/core/community/posts/${postId}`,
    lang ? { lang } : undefined,
    signal,
  )
}

export function createCommunityPost(body: {
  board: CommunityBoard
  title: string | LocalizedTextInput
  content: string | LocalizedTextInput
}) {
  return apiPost<CommunityPostDetail>('/api/v1/core/community/posts', body)
}

/** board는 변경 불가 — 제목·본문만 */
export function updateCommunityPost(
  postId: string,
  body: { title: string | LocalizedTextInput; content: string | LocalizedTextInput },
) {
  return apiPatch<CommunityPostDetail>(`/api/v1/core/community/posts/${postId}`, body)
}

export function deleteCommunityPost(postId: string) {
  return apiDelete<void>(`/api/v1/core/community/posts/${postId}`)
}

/* ---------- 릴리스 노트 공개 조회 (§3.11 — 무인증, 랜딩·공개 뷰어 전용) ---------- */

/** 공개 최근 릴리스 노트 — RELEASE_NOTE만 최신순(랜딩 위젯) */
export function fetchPublicReleaseNotes(limit = 3, signal?: AbortSignal, lang?: string) {
  return apiGetList<CommunityRecentPost>(
    '/api/v1/core/community/release-notes/recent',
    lang ? { limit, lang } : { limit },
    signal,
  )
}

/** 공개 릴리스 노트 상세 — RELEASE_NOTE가 아니면 404(존재 은닉) */
export function fetchPublicReleaseNote(postId: string, signal?: AbortSignal, lang?: string) {
  return apiGet<CommunityPostDetail>(
    `/api/v1/core/community/release-notes/${postId}`,
    lang ? { lang } : undefined,
    signal,
  )
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
