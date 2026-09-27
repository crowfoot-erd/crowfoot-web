/**
 * 문서 공유 링크 다이얼로그 (08-core/02-model.md §1.10 — storyboard 02-user §5A)
 *
 * - 발급: 무제한(기간 제한 없음) 또는 시작·종료일 지정. 링크는 문서당 여러 개 둘 수 있다.
 * - 목록: 각 링크의 공개 주소(/share/{token}) 복사·기간 표시·철회(즉시 무효화)·
 *   카운터 3종(조회·반응·댓글, v1.21) 표기.
 * - 댓글 관리(v1.21): 행을 확장하면 그 링크의 댓글(공개 GET 재사용)을 보고
 *   오너 답글("작성자" 배지로 공개 뷰어에 표시)을 달거나 모든 댓글을 삭제한다.
 * - 공개 주소는 토큰을 아는 누구나 읽기 전용으로 열 수 있다 — 발급은 Editor 이상.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Link2, Loader2, MessageSquare, Share2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import type { ModelShare, ShareComment } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { errorMessage } from '@/lib/result-code'
import { formatDateTime } from '@/lib/format'
import {
  useCreateModelShare,
  useCreateOwnerShareReply,
  useDeleteOwnerShareComment,
  useModelShares,
  useRevokeModelShare,
  useShareFeedback,
} from '@/features/models/hooks'

export interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  modelId: string
  modelName: string
}

type PeriodMode = 'unlimited' | 'period'

/** datetime-local 값(로컬 시각) → ISO 문자열. 빈 값·해석 불가는 null */
function toIsoOrNull(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 클립보드 복사 — 비보환 컨텍스트(비HTTPS 등)는 임시 textarea 폴백 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

export function ShareDialog({ open, onOpenChange, workspaceId, modelId, modelName }: ShareDialogProps) {
  const { t } = useTranslation()
  const shares = useModelShares(workspaceId, modelId, open)
  const createShare = useCreateModelShare(workspaceId, modelId)
  const revokeShare = useRevokeModelShare(workspaceId, modelId)

  /** 링크 기간 표시 — 무제한 / 시작~종료 / 시작부터 / 종료까지 */
  const periodLabel = (share: ModelShare): string => {
    if (!share.startsAt && !share.endsAt) return t('model.share.period.unlimited')
    if (share.startsAt && share.endsAt) {
      return `${formatDateTime(share.startsAt)} ~ ${formatDateTime(share.endsAt)}`
    }
    if (share.startsAt) return t('model.share.period.from', { at: formatDateTime(share.startsAt) })
    return t('model.share.period.until', { at: formatDateTime(share.endsAt) })
  }

  /** 카운터 표기 — 조회 n · 반응 n · 댓글 n */
  const countersLabel = (share: ModelShare): string =>
    t('model.share.feedback.counters', {
      view: share.viewCount,
      reaction: share.reactionCount,
      comment: share.commentCount,
    })

  const [mode, setMode] = useState<PeriodMode>('unlimited')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  /** 댓글 관리가 확장된 링크 — 1개만 */
  const [managingShareId, setManagingShareId] = useState<string | null>(null)

  const issue = () => {
    if (mode === 'period') {
      const start = toIsoOrNull(startsAt)
      const end = toIsoOrNull(endsAt)
      if (!start || !end) {
        toast.error(t('model.share.error.incompletePeriod'))
        return
      }
      if (new Date(end).getTime() < new Date(start).getTime()) {
        toast.error(t('model.share.error.reversedPeriod'))
        return
      }
      createShare.mutate({ startsAt: start, endsAt: end }, {
        onSuccess: () => toast.success(t('model.share.issuedToast')),
        onError: (error) => toast.error(errorMessage(error)),
      })
      return
    }
    createShare.mutate({ startsAt: null, endsAt: null }, {
      onSuccess: () => toast.success(t('model.share.issuedToast')),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const copyLink = async (share: ModelShare) => {
    if (await copyText(shareLink(share.shareToken))) {
      toast.success(t('model.share.copiedToast'))
    } else {
      toast.error(t('model.share.copyFailed'))
    }
  }

  const revoke = (share: ModelShare) => {
    revokeShare.mutate(share.shareId, {
      onSuccess: () => {
        if (managingShareId === share.shareId) setManagingShareId(null)
        toast.success(t('model.share.revokedToast'))
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 aria-hidden className="size-4" />
            {t('model.share.title')}
          </DialogTitle>
          <DialogDescription>
            {t('model.share.description', { name: modelName })}
          </DialogDescription>
        </DialogHeader>

        {/* 발급 — 무제한 / 기간 지정 */}
        <div className="grid gap-3 rounded-md border p-3">
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as PeriodMode)}
            className="grid gap-2"
          >
            <Label className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="unlimited" />
              {t('model.share.period.unlimited')}
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="period" />
              {t('model.share.period.custom')}
            </Label>
          </RadioGroup>

          {mode === 'period' ? (
            <div className="grid grid-cols-2 gap-2 pl-6">
              <div className="grid gap-1">
                <Label htmlFor="share-starts-at" className="text-xs text-muted-foreground">
                  {t('model.share.period.startsAt')}
                </Label>
                <Input
                  id="share-starts-at"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="share-ends-at" className="text-xs text-muted-foreground">
                  {t('model.share.period.endsAt')}
                </Label>
                <Input
                  id="share-ends-at"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 px-2"
              onClick={issue}
              disabled={createShare.isPending}
            >
              {createShare.isPending ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              ) : (
                <Link2 aria-hidden className="size-3.5" />
              )}
              {t('model.share.issue')}
            </Button>
          </div>
        </div>

        {/* 목록 — 최근 발급순 */}
        <div className="grid max-h-[60vh] gap-2 overflow-y-auto" data-testid="share-list">
          {shares.isPending ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              <Loader2 aria-hidden className="mx-auto size-4 animate-spin" />
            </p>
          ) : shares.data && shares.data.items.length > 0 ? (
            shares.data.items.map((share) => (
              <div key={share.shareId} className="grid gap-2 rounded-md border px-3 py-2" data-testid="share-item">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs" data-testid="share-token">
                      {shareLink(share.shareToken)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {periodLabel(share)} · {countersLabel(share)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setManagingShareId((current) =>
                        current === share.shareId ? null : share.shareId,
                      )
                    }
                    aria-label={t('model.share.feedback.manage')}
                    title={t('model.share.feedback.manage')}
                    aria-expanded={managingShareId === share.shareId}
                    data-testid="share-manage-comments"
                  >
                    <MessageSquare aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void copyLink(share)}
                    aria-label={t('model.share.copy')}
                    title={t('model.share.copy')}
                  >
                    <Copy aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => revoke(share)}
                    disabled={revokeShare.isPending}
                    aria-label={t('model.share.revoke')}
                    title={t('model.share.revoke')}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                {managingShareId === share.shareId ? (
                  <ShareCommentManager
                    workspaceId={workspaceId}
                    modelId={modelId}
                    share={share}
                  />
                ) : null}
              </div>
            ))
          ) : (
            <p className="py-2 text-center text-sm text-muted-foreground">{t('model.share.empty')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 오너 답글 등록 폼 상한 — 서버 @Size와 동일 */
const MAX_REPLY_LENGTH = 1000

/**
 * 링크 행 확장 — 댓글 관리 패널. 목록은 공개 GET(.../comments)를 그대로 재사용하고
 * 오너는 원댓글에만 답글(1단계 제한·서버 400), 모든 댓글·답글을 삭제할 수 있다.
 */
function ShareCommentManager({
  workspaceId,
  modelId,
  share,
}: {
  workspaceId: string
  modelId: string
  share: ModelShare
}) {
  const { t } = useTranslation()
  const feedback = useShareFeedback(share.shareToken)
  const createReply = useCreateOwnerShareReply(workspaceId, modelId)
  const deleteComment = useDeleteOwnerShareComment(workspaceId, modelId)

  /** 답글 폼이 열린 원댓글 */
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const submitReply = (parentCommentId: string) => {
    const content = replyDraft.trim()
    if (!content) return
    createReply.mutate(
      { shareId: share.shareId, token: share.shareToken, parentCommentId, content },
      {
        onSuccess: () => {
          setReplyTargetId(null)
          setReplyDraft('')
          toast.success(t('model.share.feedback.repliedToast'))
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const comments = feedback.data?.comments ?? []
  const topLevel = comments.filter((comment) => comment.parentCommentId === null)
  const repliesOf = (parent: ShareComment) =>
    comments.filter((comment) => comment.parentCommentId === parent.commentId)

  return (
    <div className="grid gap-2 rounded-md bg-muted/40 p-3" data-testid="share-comment-manager">
      {feedback.isPending ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
          {t('common.loading')}
        </p>
      ) : topLevel.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('model.share.feedback.emptyComments')}</p>
      ) : (
        <ul className="grid gap-2">
          {topLevel.map((comment) => (
            <li key={comment.commentId} className="grid gap-1.5">
              <ManagedCommentRow
                comment={comment}
                ownerBadgeLabel={t('shareFeedback.ownerBadge')}
                onReply={() => {
                  setReplyTargetId((current) =>
                    current === comment.commentId ? null : comment.commentId,
                  )
                  setReplyDraft('')
                }}
                onDelete={() => setDeletingId(comment.commentId)}
              />
              {repliesOf(comment).map((reply) => (
                <div key={reply.commentId} className="ml-4">
                  <ManagedCommentRow
                    comment={reply}
                    ownerBadgeLabel={t('shareFeedback.ownerBadge')}
                    onReply={undefined} // 답글에는 답글을 달 수 없다(1단계 제한)
                    onDelete={() => setDeletingId(reply.commentId)}
                  />
                </div>
              ))}
              {replyTargetId === comment.commentId ? (
                <div className="grid gap-1.5 pl-4">
                  <Textarea
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    maxLength={MAX_REPLY_LENGTH}
                    placeholder={t('model.share.feedback.replyPlaceholder')}
                    aria-label={t('model.share.feedback.replyPlaceholder')}
                    data-testid="owner-reply-input"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7"
                      onClick={() => submitReply(comment.commentId)}
                      disabled={replyDraft.trim().length === 0 || createReply.isPending}
                      data-testid="owner-reply-submit"
                    >
                      {createReply.isPending ? (
                        <Loader2 aria-hidden className="size-3.5 animate-spin" />
                      ) : null}
                      {t('model.share.feedback.replySubmit')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
        title={t('model.share.feedback.confirmDeleteTitle')}
        description={t('model.share.feedback.confirmDeleteDescription')}
        destructive
        confirming={deleteComment.isPending}
        onConfirm={() => {
          if (!deletingId) return
          deleteComment.mutate(
            { shareId: share.shareId, token: share.shareToken, commentId: deletingId },
            {
              onSuccess: () => {
                setDeletingId(null)
                toast.success(t('model.share.feedback.deletedToast'))
              },
              onError: (error) => toast.error(errorMessage(error)),
            },
          )
        }}
      />
    </div>
  )
}

/** 관리 패널의 댓글 한 줄 — 답글(원댓글만)·삭제 버튼 */
function ManagedCommentRow({
  comment,
  ownerBadgeLabel,
  onReply,
  onDelete,
}: {
  comment: ShareComment
  ownerBadgeLabel: string
  onReply?: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5" data-testid="share-comment-item">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">{comment.nickname}</span>
        {comment.owner ? (
          <span
            className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            data-testid="share-comment-owner-badge"
          >
            {ownerBadgeLabel}
          </span>
        ) : null}
        <span className="text-[11px] text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
        <span className="ml-auto flex items-center gap-1">
          {onReply ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onReply}
            >
              {t('model.share.feedback.reply')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            {t('common.delete')}
          </Button>
        </span>
      </div>
      <p className="whitespace-pre-wrap text-xs">{comment.content}</p>
    </div>
  )
}

/** 공개 주소 — 현재 오리진 + /share/{token} */
export function shareLink(token: string): string {
  return `${window.location.origin}/share/${token}`
}
