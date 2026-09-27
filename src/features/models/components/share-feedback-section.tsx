/**
 * 공유 문서 피드백 섹션 (08-core/02-model.md §1.10.6·§1.10.7 — storyboard 00-common S-00c)
 *
 * 공개 뷰어(/share/{token}) 하단 — 방문자의 반응(좋아요) 토글과 익명 댓글.
 * - 반응: 즉시 낙관 전환(filled·카운트 ±1) → 서버 정착값으로 맞추고, 실패면 원복+토스트
 * - 댓글: flat 목록을 parentCommentId로 1단계 중첩, 오너 답글은 "작성자" 배지 + 들여쓰기
 * - 식별: 서버 발급 방문자 쿠키(crowfoot_share_actor) — 삭제 버튼은 항상 노출하고
 *   본인 여부는 서버가 최종 판정한다(403 수신 시 토스트)
 * - 로드 실패는 섹션 전체를 조용히 숨긴다 — 본체 조회는 이미 성공한 화면이니 깨뜨리지 않는다
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

import type { ShareComment } from '@/api/types'
import { isApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { errorMessage } from '@/lib/result-code'
import { formatDateTime } from '@/lib/format'
import {
  modelKeys,
  useCreateShareComment,
  useDeleteShareComment,
  useShareFeedback,
  useToggleShareReaction,
} from '@/features/models/hooks'

/** 상한 — 서버 @Size와 동일(별명 30 · 내용 1000) */
const MAX_NICKNAME_LENGTH = 30
const MAX_CONTENT_LENGTH = 1000

export function ShareFeedbackSection({ token }: { token: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const feedback = useShareFeedback(token)
  const toggleReaction = useToggleShareReaction(token)
  const createComment = useCreateShareComment(token)
  const deleteComment = useDeleteShareComment(token)

  const [nickname, setNickname] = useState('')
  const [content, setContent] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (feedback.isError) return null

  const react = () => {
    const current = feedback.data
    if (!current) return
    // 낙관 전환 — 즉시 filled·카운트 ±1. 정착은 onSuccess가 서버 값으로 덮어쓴다
    const optimistic = !current.reacted
    queryClient.setQueryData(modelKeys.shareFeedback(token), {
      ...current,
      reacted: optimistic,
      reactionCount: current.reactionCount + (optimistic ? 1 : -1),
    })
    toggleReaction.mutate(undefined, {
      onError: () => {
        queryClient.setQueryData(modelKeys.shareFeedback(token), current) // 원복
        toast.error(t('shareFeedback.reactionFailed'))
      },
    })
  }

  const submit = () => {
    const name = nickname.trim()
    const body = content.trim()
    if (!name || !body) return
    createComment.mutate(
      { nickname: name, content: body },
      {
        onSuccess: () => {
          setContent('')
          toast.success(t('shareFeedback.commentCreatedToast'))
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const confirmDelete = () => {
    if (!deletingId) return
    deleteComment.mutate(deletingId, {
      onSuccess: () => {
        setDeletingId(null)
        toast.success(t('shareFeedback.commentDeletedToast'))
      },
      onError: (error) => {
        setDeletingId(null)
        // 방문자 쿠키 불일치·오너 댓글 — 서버 최종 판정(본인만 삭제 가능)
        if (isApiError(error) && error.resultCode === 'PERMISSION_DENIED') {
          toast.error(t('shareFeedback.deleteDenied'))
        } else {
          toast.error(errorMessage(error))
        }
      },
    })
  }

  const comments = feedback.data?.comments ?? []
  // flat → 1단계 중첩 — 원댓글 순서(id ASC)를 유지한 채 답글을 각 원댓글 아래에 모은다
  const topLevel = comments.filter((comment) => comment.parentCommentId === null)
  const repliesOf = (parent: ShareComment) =>
    comments.filter((comment) => comment.parentCommentId === parent.commentId)

  return (
    <section
      className="border-t bg-background"
      aria-label={t('shareFeedback.title')}
      data-testid="share-feedback-section"
    >
      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-6">
        {/* 반응 버튼 — 방문자당 1회 토글 */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={react}
            disabled={toggleReaction.isPending || feedback.isPending}
            aria-pressed={feedback.data?.reacted ?? false}
            aria-label={t('shareFeedback.reactionLabel')}
            data-testid="share-reaction-button"
            className={
              feedback.data?.reacted ? 'border-red-200 text-red-500 hover:text-red-500' : undefined
            }
          >
            <Heart
              aria-hidden
              className={`size-4 ${feedback.data?.reacted ? 'fill-current' : ''}`}
            />
            <span data-testid="share-reaction-count">{feedback.data?.reactionCount ?? 0}</span>
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('common.total', { count: comments.length })}
          </span>
        </div>

        {/* 댓글 목록 — 1단계 중첩(원댓글 아래 답글), 오너 답글은 "작성자" 배지 */}
        {feedback.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('common.loading')}
          </p>
        ) : topLevel.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('shareFeedback.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="share-comment-list">
            {topLevel.map((comment) => (
              <li key={comment.commentId} className="grid gap-2">
                <CommentRow
                  comment={comment}
                  onDelete={() => setDeletingId(comment.commentId)}
                  deleteLabel={t('common.delete')}
                  ownerBadgeLabel={t('shareFeedback.ownerBadge')}
                />
                {repliesOf(comment).length > 0 ? (
                  <ul className="ml-4 grid gap-2 border-l pl-3">
                    {repliesOf(comment).map((reply) => (
                      <li key={reply.commentId}>
                        <CommentRow
                          comment={reply}
                          onDelete={() => setDeletingId(reply.commentId)}
                          deleteLabel={t('common.delete')}
                          ownerBadgeLabel={t('shareFeedback.ownerBadge')}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* 익명 작성 폼 — 별명(30)·내용(1000), 빈 값이면 제출 불가 */}
        <div className="grid gap-2 rounded-md border p-3">
          <div className="grid gap-1">
            <Label htmlFor="share-feedback-nickname" className="text-xs text-muted-foreground">
              {t('shareFeedback.nicknameLabel')}
            </Label>
            <Input
              id="share-feedback-nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder={t('shareFeedback.nicknamePlaceholder')}
              data-testid="share-feedback-nickname"
            />
          </div>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={MAX_CONTENT_LENGTH}
            placeholder={t('shareFeedback.commentPlaceholder')}
            aria-label={t('shareFeedback.commentPlaceholder')}
            data-testid="share-feedback-content"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={
                nickname.trim().length === 0 || content.trim().length === 0 || createComment.isPending
              }
              data-testid="share-feedback-submit"
            >
              {createComment.isPending ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              ) : null}
              {t('shareFeedback.submit')}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
        title={t('shareFeedback.confirmDeleteTitle')}
        description={t('shareFeedback.confirmDeleteDescription')}
        destructive
        confirming={deleteComment.isPending}
        onConfirm={confirmDelete}
      />
    </section>
  )
}

/** 댓글 한 줄 — 닉네임(오너 답글은 작성자 배지)·시각·내용·삭제(서버 최종 판정) */
function CommentRow({
  comment,
  onDelete,
  deleteLabel,
  ownerBadgeLabel,
}: {
  comment: ShareComment
  onDelete: () => void
  deleteLabel: string
  ownerBadgeLabel: string
}) {
  return (
    <div className="rounded-md border px-3 py-2" data-testid="share-comment-item">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{comment.nickname}</span>
        {comment.owner ? (
          <span
            className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            data-testid="share-comment-owner-badge"
          >
            {ownerBadgeLabel}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-xs text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label={deleteLabel}
        >
          {deleteLabel}
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
    </div>
  )
}
