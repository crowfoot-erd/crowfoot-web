/**
 * 커뮤니티 쿼리/뮤테이션 훅 — 변경 성공 후 invalidate (낙관적 갱신 금지 §3.5)
 *
 * 읽기 경로는 UI 언어(currentLanguage)를 ?lang=으로 넘긴다 — 쿼리 키에 lang이 들어가
 * 언어 전환 시 해당 언어 해석으로 재조회된다(서버 폴백: 요청언어 → en → ko).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  fetchCommunityComments,
  fetchCommunityPost,
  fetchCommunityPosts,
  fetchPublicReleaseNote,
  fetchPublicReleaseNotes,
  fetchRecentCommunityPosts,
  updateCommunityComment,
  updateCommunityPost,
} from '@/features/community/api'
import type { CommunityBoard } from '@/api/types'
import { currentLanguage } from '@/lib/i18n'

/** 루트 키 ['community'] — 게시글·코멘트·최근글 전부 무효화의 공통 조상 */
export const communityKeys = {
  all: ['community'] as const,
  list: (board: CommunityBoard, params: { keyword?: string; page?: number; size?: number }) =>
    ['community', 'posts', board, params, currentLanguage()] as const,
  recent: (limit: number) => ['community', 'recent', limit, currentLanguage()] as const,
  detail: (postId: string, lang: string) => ['community', 'post', postId, lang] as const,
  comments: (postId: string) => ['community', 'post', postId, 'comments'] as const,
  /** 공개(무인증) 릴리스 노트 — 인증 조회 키와 분리된 서브트리 */
  releaseNotesRecent: (limit: number) =>
    ['community', 'release-notes', 'recent', limit, currentLanguage()] as const,
  releaseNoteDetail: (postId: string, lang: string) =>
    ['community', 'release-notes', 'post', postId, lang] as const,
}

export function useCommunityPosts(
  board: CommunityBoard,
  params: { keyword?: string; page?: number; size?: number } = {},
) {
  const lang = currentLanguage()
  return useQuery({
    queryKey: communityKeys.list(board, params),
    queryFn: ({ signal }) => fetchCommunityPosts(board, { ...params, lang }, signal),
  })
}

/** 대시보드 통합 최근글 — 항상 조회(로그인 사용자면 게시글 유무와 무관하게 위젯 렌더) */
export function useRecentCommunityPosts(limit = 5) {
  const lang = currentLanguage()
  return useQuery({
    queryKey: communityKeys.recent(limit),
    queryFn: ({ signal }) => fetchRecentCommunityPosts(limit, signal, lang),
  })
}

/** 상세 — lang은 기본 현재 UI 언어, 뷰어의 콘텐츠 언어 전환기가 override한다 */
export function useCommunityPost(postId: string, lang: string = currentLanguage()) {
  return useQuery({
    queryKey: communityKeys.detail(postId, lang),
    queryFn: ({ signal }) => fetchCommunityPost(postId, signal, lang),
    enabled: postId.length > 0,
  })
}

/** 공개 최근 릴리스 노트(랜딩 위젯) — 게스트 조회라 retry 없이(useSharedGallery 관례) */
export function usePublicReleaseNotes(limit = 3) {
  const lang = currentLanguage()
  return useQuery({
    queryKey: communityKeys.releaseNotesRecent(limit),
    queryFn: ({ signal }) => fetchPublicReleaseNotes(limit, signal, lang),
    retry: false,
  })
}

/** 공개 릴리스 노트 상세(공개 뷰어) — 게스트 조회라 retry 없이. lang: 콘텐츠 언어 전환기 값 */
export function usePublicReleaseNote(postId: string, lang: string = currentLanguage()) {
  return useQuery({
    queryKey: communityKeys.releaseNoteDetail(postId, lang),
    queryFn: ({ signal }) => fetchPublicReleaseNote(postId, signal, lang),
    enabled: postId.length > 0,
    retry: false,
  })
}

export function useCommunityComments(postId: string) {
  return useQuery({
    queryKey: communityKeys.comments(postId),
    queryFn: ({ signal }) => fetchCommunityComments(postId, signal),
    enabled: postId.length > 0,
  })
}

export function useCreateCommunityPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createCommunityPost,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.all })
    },
  })
}

export function useUpdateCommunityPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      postId,
      body,
    }: {
      postId: string
      body: { title: string | object; content: string | object }
    }) => updateCommunityPost(postId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.all })
    },
  })
}

export function useDeleteCommunityPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (postId: string) => deleteCommunityPost(postId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.all })
    },
  })
}

export function useCreateCommunityComment(postId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (content: string) => createCommunityComment(postId, { content }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.all })
    },
  })
}

export function useUpdateCommunityComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      updateCommunityComment(commentId, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.all })
    },
  })
}

export function useDeleteCommunityComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (commentId: string) => deleteCommunityComment(commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.all })
    },
  })
}
