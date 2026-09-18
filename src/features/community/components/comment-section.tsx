/**
 * 코멘트 섹션 (커뮤니티 게시글 상세 — FEEDBACK 전용, 08-core/08-community.md)
 *
 * plain text 작성(Textarea) + 목록(오래된 순) + 인라인 수정 + 삭제 확인.
 * 수정·삭제 첨부는 작성자 본인 또는 관리자(me.admin)에게만 노출된다(서버가 최종 판정).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useMe } from '@/features/auth'
import {
  useCommunityComments,
  useCreateCommunityComment,
  useDeleteCommunityComment,
  useUpdateCommunityComment,
} from '@/features/community/hooks'
import { errorMessage } from '@/lib/result-code'
import { formatDateTime } from '@/lib/format'

/** 작성 폼 상한 — 서버 @Size(2000)와 동일 */
const MAX_COMMENT_LENGTH = 2000

export function CommentSection({ postId }: { postId: string }) {
  const { t } = useTranslation()
  const me = useMe()
  const comments = useCommunityComments(postId)
  const createComment = useCreateCommunityComment(postId)
  const updateComment = useUpdateCommunityComment()
  const deleteComment = useDeleteCommunityComment()

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const userId = me.data?.userId
  const canMutate = (authorUserId: string) => userId === authorUserId || me.data?.admin === true

  const submit = () => {
    const content = draft.trim()
    if (!content) return
    createComment.mutate(content, {
      onSuccess: () => {
        setDraft('')
        toast.success(t('community.comment.createdToast'))
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const submitEdit = (commentId: string) => {
    const content = editingDraft.trim()
    if (!content) return
    updateComment.mutate(
      { commentId, content },
      {
        onSuccess: () => {
          setEditingId(null)
          setEditingDraft('')
          toast.success(t('community.comment.updatedToast'))
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <section className="flex flex-col gap-3" aria-label={t('community.detail.comments')} data-testid="comment-section">
      <h2 className="text-sm font-semibold text-muted-foreground">{t('community.detail.comments')}</h2>

      {/* 작성 폼 — 로그인 사용자 누구나 */}
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder={t('community.comment.placeholder')}
          aria-label={t('community.comment.placeholder')}
          data-testid="comment-input"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t('common.total', { count: comments.data?.totalCount ?? 0 })}
          </span>
          <Button type="button" size="sm" onClick={submit} disabled={draft.trim().length === 0 || createComment.isPending}>
            {t('community.comment.submit')}
          </Button>
        </div>
      </div>

      {/* 목록 — 오래된 순 */}
      {comments.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : comments.isError ? (
        <p className="text-sm text-destructive">{errorMessage(comments.error)}</p>
      ) : (comments.data?.items.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">{t('community.comment.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {comments.data?.items.map((comment) => (
            <li key={comment.commentId} className="flex flex-col gap-2 p-4" data-testid="comment-item">
              <div className="flex items-center gap-2">
                <Avatar name={comment.author.name} className="size-6 text-xs" />
                <span className="text-sm font-medium">{comment.author.name}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
                {canMutate(comment.author.userId) && editingId !== comment.commentId ? (
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(comment.commentId)
                        setEditingDraft(comment.content)
                      }}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeletingId(comment.commentId)}
                    >
                      {t('common.delete')}
                    </Button>
                  </span>
                ) : null}
              </div>

              {editingId === comment.commentId ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={editingDraft}
                    onChange={(event) => setEditingDraft(event.target.value)}
                    maxLength={MAX_COMMENT_LENGTH}
                    aria-label={t('community.comment.edit')}
                    data-testid={`comment-edit-${comment.commentId}`}
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => submitEdit(comment.commentId)}
                      disabled={editingDraft.trim().length === 0 || updateComment.isPending}
                    >
                      {t('common.save')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(null)
                        setEditingDraft('')
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
        title={t('community.comment.confirmDeleteTitle')}
        description={t('community.comment.confirmDeleteDescription')}
        destructive
        confirming={deleteComment.isPending}
        onConfirm={() => {
          if (!deletingId) return
          deleteComment.mutate(deletingId, {
            onSuccess: () => {
              setDeletingId(null)
              toast.success(t('community.comment.deletedToast'))
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }}
      />
    </section>
  )
}
