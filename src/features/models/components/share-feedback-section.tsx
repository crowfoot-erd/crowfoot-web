/**
 * 공유 문서 피드백 섹션 (08-core/02-model.md §1.10.6·§1.10.7 — storyboard 00-common S-00c)
 *
 * 공개 뷰어(/share/{token})와 문서 열기 댓글 탭의 본문 — 문서 좋아요(회원전용)와 댓글.
 * (v1.21 재설계: 익명 쿠키 → 선택 인증 — 로그인 회원은 내용만, 비회원은 별명+비밀번호)
 * (문서 단위 진입 #261: target이 두 갈래 — token=공개 뷰어, model=문서 열기 댓글 탭.
 *  두 경로는 같은 문서 스레드를 본다 — 활성 링크가 있으면 댓글이 서로 섞여 보인다)
 * - 좋아요: 회원만 토글(즉시 낙관 전환 → 서버 정착값, 실패면 원복+토스트).
 *   비회원 클릭은 요청 없이 로그인 안내 토스트(게이트웨이가 어차피 401로 막는다)
 * - 댓글: flat 목록을 parentCommentId로 1단계 중첩. authorType 배지 —
 *   owner="작성자"(primary)·member="회원", 수정 이력은 edited로 표시
 * - 수정·삭제: 버튼은 항상 노출하고 본인 여부는 서버가 최종 판정(403 수신 시 토스트).
 *   비회원 댓글은 비밀번호 확인(수정=인라인 폼에, 삭제=비밀번호 다이얼로그)이 필요하다.
 *   문서 경로(model)에서는 비회원 댓글 수정이 불가(본인 회원 댓글만)라 수정 버튼을 숨긴다
 * - 문서 경로 게이트: canComment(Commenter 이상)가 아니면 폼 대신 읽기 전용 안내,
 *   답글은 문서 작성자(canReply)만 — 원댓글에 답글 버튼이 뜬다
 * - 로드 실패는 섹션 전체를 조용히 숨긴다 — 본체 조회는 이미 성공한 화면이니 깨뜨리지 않는다
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

import type { ShareComment, ShareFeedback } from '@/api/types'
import { isApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useSessionStore } from '@/stores/session'
import { errorMessage } from '@/lib/result-code'
import { formatDateTime } from '@/lib/format'
import {
  modelKeys,
  useCreateModelComment,
  useCreateShareComment,
  useDeleteModelComment,
  useDeleteShareComment,
  useModelFeedback,
  useShareFeedback,
  useToggleModelReaction,
  useToggleShareReaction,
  useUpdateModelComment,
  useUpdateShareComment,
} from '@/features/models/hooks'

/** 상한 — 서버 @Size와 동일(별명 30 · 비밀번호 4 · 내용 1000) */
const MAX_NICKNAME_LENGTH = 30
const MAX_CONTENT_LENGTH = 1000

/** 피드백 대상 — token=공개 뷰어(선택 인증), model=문서 열기 댓글 탭(인증 멤버 경로) */
export type FeedbackTarget =
  | { kind: 'token'; token: string }
  | {
      kind: 'model'
      workspaceId: string
      modelId: string
      /** 댓글 등록 가능(Commenter 이상) — Viewer는 읽기 전용 */
      canComment: boolean
      /** 답글은 문서 작성자(오너)만 달 수 있다 */
      canReply: boolean
    }

export function ShareFeedbackSection({ target }: { target: FeedbackTarget }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isModel = target.kind === 'model'
  // 선택 인증 모드 — 세션이 있으면 회원(내용만), 없으면 비회원(별명+비밀번호) 폼.
  // 문서 경로는 인증 라우트라 항상 회원 — 플래그는 좋아요 게이트에만 쓴다
  const isMember = useSessionStore((state) => state.status) === 'authenticated'

  // 두 경로 훅을 함께 두고 대상 쪽만 활성화(빈 식별자는 enabled=false) —
  // 조건부 훅 호출을 피하면서 쿼리 키는 각 경로 원천 그대로 쓴다
  const token = target.kind === 'token' ? target.token : ''
  const workspaceId = target.kind === 'model' ? target.workspaceId : ''
  const modelId = target.kind === 'model' ? target.modelId : ''
  const tokenFeedback = useShareFeedback(token)
  const modelFeedback = useModelFeedback(workspaceId, modelId)
  const feedback = isModel ? modelFeedback : tokenFeedback
  const feedbackKey = isModel
    ? modelKeys.modelFeedback(workspaceId, modelId)
    : modelKeys.shareFeedback(token)

  const toggleTokenReaction = useToggleShareReaction(token)
  const toggleModelReaction = useToggleModelReaction(workspaceId, modelId)
  const createTokenComment = useCreateShareComment(token)
  const createModelComment = useCreateModelComment(workspaceId, modelId)
  const updateTokenComment = useUpdateShareComment(token)
  const updateModelComment = useUpdateModelComment(workspaceId, modelId)
  const deleteTokenComment = useDeleteShareComment(token)
  const deleteModelComment = useDeleteModelComment(workspaceId, modelId)

  const createPending = isModel ? createModelComment.isPending : createTokenComment.isPending
  const updatePending = isModel ? updateModelComment.isPending : updateTokenComment.isPending
  const deletePending = isModel ? deleteModelComment.isPending : deleteTokenComment.isPending

  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [content, setContent] = useState('')
  // 인라인 수정 — 대상 댓글과 그 편집 버퍼. 비회원 댓글이면 비밀번호 칸이 함께 뜬다
  const [editing, setEditing] = useState<ShareComment | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editPassword, setEditPassword] = useState('')
  // 삭제 대상 — 비회원 댓글은 비밀번호 다이얼로그, 회원·오너 댓글은 확인 다이얼로그
  const [deleting, setDeleting] = useState<ShareComment | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  // 답글(오너 전용) — 대상 원댓글과 버퍼
  const [replying, setReplying] = useState<ShareComment | null>(null)
  const [replyContent, setReplyContent] = useState('')

  if (feedback.isError) return null

  const react = () => {
    if (!isMember) {
      // 회원전용 — 비회원은 게이트웨이 401 전에 여기서 안내한다(요청도 낭비 없음)
      toast.info(t('shareFeedback.reactionMemberOnly'))
      return
    }
    const current = feedback.data
    if (!current) return
    // 낙관 전환 — 즉시 filled·카운트 ±1. 정착은 onSuccess가 서버 값으로 덮어쓴다
    const optimistic = !current.reacted
    queryClient.setQueryData<ShareFeedback>(feedbackKey, {
      ...current,
      reacted: optimistic,
      reactionCount: current.reactionCount + (optimistic ? 1 : -1),
    })
    const onError = () => {
      queryClient.setQueryData<ShareFeedback>(feedbackKey, current) // 원복
      toast.error(t('shareFeedback.reactionFailed'))
    }
    if (isModel) toggleModelReaction.mutate(undefined, { onError })
    else toggleTokenReaction.mutate(undefined, { onError })
  }

  const submit = () => {
    const body = content.trim()
    if (!body) return
    const onDone = {
      onSuccess: () => {
        setContent('')
        toast.success(t('shareFeedback.commentCreatedToast'))
      },
      onError: (error: unknown) => toast.error(errorMessage(error)),
    }
    if (isModel) {
      createModelComment.mutate({ content: body }, onDone)
    } else {
      createTokenComment.mutate(
        isMember
          ? { content: body }
          : { nickname: nickname.trim(), password, content: body },
        onDone,
      )
    }
  }

  const submitReply = () => {
    if (!replying) return
    const body = replyContent.trim()
    if (!body) return
    createModelComment.mutate(
      { content: body, parentCommentId: replying.commentId },
      {
        onSuccess: () => {
          setReplying(null)
          setReplyContent('')
          toast.success(t('shareFeedback.commentCreatedToast'))
        },
        onError: (error: unknown) => toast.error(errorMessage(error)),
      },
    )
  }

  const startEdit = (comment: ShareComment) => {
    setEditing(comment)
    setEditContent(comment.content)
    setEditPassword('')
  }

  const submitEdit = () => {
    if (!editing) return
    const body = editContent.trim()
    if (!body) return
    // 비회원 댓글은 비밀번호 판정 — 비워두면 서버가 어차피 403이지만 미리 막는다
    if (!isModel && editing.authorType === 'guest' && editPassword.length < 4) return
    const onDone = {
      onSuccess: () => {
        setEditing(null)
        toast.success(t('shareFeedback.commentUpdatedToast'))
      },
      onError: (error: unknown) => {
        // 비밀번호 불일치·타인 댓글 — 서버 최종 판정
        if (isApiError(error) && error.resultCode === 'PERMISSION_DENIED') {
          toast.error(t('shareFeedback.forbidden'))
        } else {
          toast.error(errorMessage(error))
        }
      },
    }
    if (isModel) {
      updateModelComment.mutate({ commentId: editing.commentId, body: { content: body } }, onDone)
    } else {
      updateTokenComment.mutate(
        {
          commentId: editing.commentId,
          body:
            editing.authorType === 'guest'
              ? { content: body, password: editPassword }
              : { content: body },
        },
        onDone,
      )
    }
  }

  const confirmDelete = () => {
    if (!deleting) return
    if (!isModel && deleting.authorType === 'guest' && deletePassword.length < 4) return
    const onDone = {
      onSuccess: () => {
        setDeleting(null)
        setDeletePassword('')
        toast.success(t('shareFeedback.commentDeletedToast'))
      },
      onError: (error: unknown) => {
        setDeleting(null)
        setDeletePassword('')
        if (isApiError(error) && error.resultCode === 'PERMISSION_DENIED') {
          toast.error(t('shareFeedback.forbidden'))
        } else {
          toast.error(errorMessage(error))
        }
      },
    }
    if (isModel) {
      deleteModelComment.mutate(deleting.commentId, onDone)
    } else {
      deleteTokenComment.mutate(
        {
          commentId: deleting.commentId,
          password: deleting.authorType === 'guest' ? deletePassword : undefined,
        },
        onDone,
      )
    }
  }

  const comments = feedback.data?.comments ?? []
  // flat → 1단계 중첩 — 원댓글 순서(id ASC)를 유지한 채 답글을 각 원댓글 아래에 모은다
  const topLevel = comments.filter((comment) => comment.parentCommentId === null)
  const repliesOf = (parent: ShareComment) =>
    comments.filter((comment) => comment.parentCommentId === parent.commentId)

  // 문서 경로에서 비회원 댓글은 수정 경로가 없다(본인 회원 댓글만 수정 가능) — 버튼을 숨긴다
  const canEditComment = (comment: ShareComment) => !(isModel && comment.authorType === 'guest')

  const rowProps = (comment: ShareComment) => ({
    comment,
    editing: editing?.commentId === comment.commentId ? editing : null,
    editContent,
    editPassword,
    onEditContent: setEditContent,
    onEditPassword: setEditPassword,
    onStartEdit: () => startEdit(comment),
    onCancelEdit: () => setEditing(null),
    onSubmitEdit: submitEdit,
    editPending: updatePending,
    canEdit: canEditComment(comment),
    onDelete: () => setDeleting(comment),
    deleteLabel: t('common.delete'),
    editLabel: t('common.edit'),
    saveLabel: t('common.save'),
    cancelLabel: t('common.cancel'),
    // 답글(오너) — 원댓글에만, 댓글을 달 수 있을 때만
    canReply: isModel && target.kind === 'model' && target.canReply && target.canComment
      && comment.parentCommentId === null,
    replying: replying?.commentId === comment.commentId,
    replyContent,
    onReplyContent: setReplyContent,
    onStartReply: () => {
      setReplying(comment)
      setReplyContent('')
    },
    onCancelReply: () => setReplying(null),
    onSubmitReply: submitReply,
    replyPending: createModelComment.isPending,
    replyLabel: t('shareFeedback.reply'),
    ownerBadgeLabel: t('shareFeedback.ownerBadge'),
    memberBadgeLabel: t('shareFeedback.memberBadge'),
    editedMarkLabel: t('shareFeedback.editedMark'),
    passwordLabel: t('shareFeedback.passwordLabel'),
    passwordPlaceholder: t('shareFeedback.passwordPlaceholder'),
  })

  const showForm = !isModel || (target.kind === 'model' && target.canComment)

  return (
    <section
      className="min-h-0 flex-1 overflow-y-auto bg-background"
      aria-label={t('shareFeedback.title')}
      data-testid="share-feedback-section"
    >
      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-6">
        {/* 문서 좋아요 — 회원전용 토글. 비회원은 안내만. 아이콘만이면 기능이 안 읽혀
            라벨("좋아요")을 함께 노출한다 — 내가 남긴 상태는 붉은 채움 하트로 즉시 보인다 */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={react}
            disabled={
              (isModel ? toggleModelReaction.isPending : toggleTokenReaction.isPending) ||
              feedback.isPending
            }
            aria-pressed={feedback.data?.reacted ?? false}
            aria-label={t('shareFeedback.reactionLabel')}
            title={isMember ? undefined : t('shareFeedback.reactionMemberOnly')}
            data-testid="share-reaction-button"
            className={
              feedback.data?.reacted ? 'border-red-200 text-red-500 hover:text-red-500' : undefined
            }
          >
            <Heart
              aria-hidden
              className={`size-4 ${feedback.data?.reacted ? 'fill-current' : ''}`}
            />
            <span>{t('shareFeedback.reactionButtonLabel')}</span>
            <span data-testid="share-reaction-count">{feedback.data?.reactionCount ?? 0}</span>
          </Button>
        </div>

        {/* 댓글 수 — 하트 옆에 두면 좋아요 수로 읽혀 댓글 목록 머리에 단다 */}
        <p className="text-xs text-muted-foreground" data-testid="share-comment-count">
          {t('shareFeedback.commentCountLabel', { count: comments.length })}
        </p>

        {/* 댓글 목록 — 1단계 중첩(원댓글 아래 답글), authorType 배지(작성자·회원)·수정 표시 */}
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
                <CommentRow {...rowProps(comment)} />
                {repliesOf(comment).length > 0 ? (
                  <ul className="ml-4 grid gap-2 border-l pl-3">
                    {repliesOf(comment).map((reply) => (
                      <li key={reply.commentId}>
                        <CommentRow {...rowProps(reply)} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* 작성 폼 — 회원은 내용만, 비회원은 별명+비밀번호+내용 (빈 값이면 제출 불가).
            문서 경로에서 Viewer(댓글 권한 없음)는 폼 대신 읽기 전용 안내 */}
        {showForm ? (
          <div className="grid gap-2 rounded-md border p-3" data-testid="share-feedback-form">
            {isModel ? (
              <p className="text-xs text-muted-foreground">{t('shareFeedback.memberFormHint')}</p>
            ) : isMember ? (
              <p className="text-xs text-muted-foreground">{t('shareFeedback.memberFormHint')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
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
                <div className="grid gap-1">
                  <Label htmlFor="share-feedback-password" className="text-xs text-muted-foreground">
                    {t('shareFeedback.passwordLabel')}
                  </Label>
                  <Input
                    id="share-feedback-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder={t('shareFeedback.passwordPlaceholder')}
                    data-testid="share-feedback-password"
                  />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  {t('shareFeedback.passwordHint')}
                </p>
              </div>
            )}
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
                  content.trim().length === 0 ||
                  (!isModel &&
                    !isMember &&
                    (nickname.trim().length === 0 || password.length < 4)) ||
                  createPending
                }
                data-testid="share-feedback-submit"
              >
                {createPending ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                ) : null}
                {t('shareFeedback.submit')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="share-feedback-readonly">
            {t('shareFeedback.viewerReadonly')}
          </p>
        )}
      </div>

      {/* 삭제 확인 — 비회원 댓글은 비밀번호 확인, 회원·오너 댓글은 단순 확인(판정은 서버) */}
      {deleting?.authorType === 'guest' && !isModel ? (
        <PasswordConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDeleting(null)
              setDeletePassword('')
            }
          }}
          title={t('shareFeedback.confirmDeleteTitle')}
          description={t('shareFeedback.passwordPromptDescription')}
          password={deletePassword}
          onPasswordChange={setDeletePassword}
          confirmLabel={t('common.delete')}
          confirming={deletePending}
          onConfirm={confirmDelete}
        />
      ) : (
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title={t('shareFeedback.confirmDeleteTitle')}
          description={t('shareFeedback.confirmDeleteDescription')}
          destructive
          confirming={deletePending}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  )
}

/** 댓글 한 줄 — 작성자 배지(authorType)·시각·수정 표시·내용·수정(인라인 폼)·삭제(서버 최종 판정).
 *  오너 답글(문서 경로)은 원댓글 아래에 인라인 답글 폼을 추가로 갖는다 */
function CommentRow({
  comment,
  editing,
  editContent,
  editPassword,
  onEditContent,
  onEditPassword,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  editPending,
  canEdit,
  onDelete,
  deleteLabel,
  editLabel,
  saveLabel,
  cancelLabel,
  canReply,
  replying,
  replyContent,
  onReplyContent,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  replyPending,
  replyLabel,
  ownerBadgeLabel,
  memberBadgeLabel,
  editedMarkLabel,
  passwordLabel,
  passwordPlaceholder,
}: {
  comment: ShareComment
  editing: ShareComment | null
  editContent: string
  editPassword: string
  onEditContent: (value: string) => void
  onEditPassword: (value: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSubmitEdit: () => void
  editPending: boolean
  /** 문서 경로의 비회원 댓글은 수정 경로가 없어 버튼을 숨긴다 */
  canEdit: boolean
  onDelete: () => void
  deleteLabel: string
  editLabel: string
  saveLabel: string
  cancelLabel: string
  canReply: boolean
  replying: boolean
  replyContent: string
  onReplyContent: (value: string) => void
  onStartReply: () => void
  onCancelReply: () => void
  onSubmitReply: () => void
  replyPending: boolean
  replyLabel: string
  ownerBadgeLabel: string
  memberBadgeLabel: string
  editedMarkLabel: string
  passwordLabel: string
  passwordPlaceholder: string
}) {
  return (
    <div className="rounded-md border px-3 py-2" data-testid="share-comment-item">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{comment.nickname}</span>
        {comment.authorType === 'owner' ? (
          <span
            className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            data-testid="share-comment-owner-badge"
          >
            {ownerBadgeLabel}
          </span>
        ) : comment.authorType === 'member' ? (
          <span
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            data-testid="share-comment-member-badge"
          >
            {memberBadgeLabel}
          </span>
        ) : null}
        {comment.edited ? (
          <span className="text-[10px] text-muted-foreground" data-testid="share-comment-edited">
            {editedMarkLabel}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
        <div className="ml-auto flex items-center gap-1">
          {canReply && !editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={replying ? onCancelReply : onStartReply}
              data-testid="share-comment-reply-button"
            >
              {replyLabel}
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={onStartEdit}
              aria-label={editLabel}
            >
              {editLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
            aria-label={deleteLabel}
          >
            {deleteLabel}
          </Button>
        </div>
      </div>

      {editing ? (
        // 인라인 수정 폼 — 비회원 댓글은 비밀번호 칸이 함께 뜬다(작성 시 설정한 값)
        <div className="mt-2 grid gap-2" data-testid="share-comment-edit-form">
          <Textarea
            value={editContent}
            onChange={(event) => onEditContent(event.target.value)}
            maxLength={MAX_CONTENT_LENGTH}
            aria-label={editLabel}
            data-testid="share-comment-edit-content"
          />
          {comment.authorType === 'guest' ? (
            <Input
              type="password"
              value={editPassword}
              onChange={(event) => onEditPassword(event.target.value)}
              autoComplete="new-password"
              placeholder={passwordPlaceholder}
              aria-label={passwordLabel}
              data-testid="share-comment-edit-password"
            />
          ) : null}
          <div className="flex justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSubmitEdit}
              disabled={
                editContent.trim().length === 0 ||
                (comment.authorType === 'guest' && editPassword.length < 4) ||
                editPending
              }
              data-testid="share-comment-edit-submit"
            >
              {editPending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
              {saveLabel}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
      )}

      {replying && !editing ? (
        // 답글 폼(오너) — 원댓글 바로 아래, 내용만
        <div className="mt-2 grid gap-2" data-testid="share-comment-reply-form">
          <Textarea
            value={replyContent}
            onChange={(event) => onReplyContent(event.target.value)}
            maxLength={MAX_CONTENT_LENGTH}
            aria-label={replyLabel}
            data-testid="share-comment-reply-content"
          />
          <div className="flex justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={onCancelReply}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSubmitReply}
              disabled={replyContent.trim().length === 0 || replyPending}
              data-testid="share-comment-reply-submit"
            >
              {replyPending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
              {replyLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** 비밀번호 확인 다이얼로그 — 비회원 댓글 삭제(수정은 인라인 폼에 붙는다).
 *  ConfirmDialog에 입력 칸을 얹은 모양 — 확인은 4자 이상일 때만 움직인다 */
function PasswordConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  password,
  onPasswordChange,
  confirmLabel,
  confirming,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  password: string
  onPasswordChange: (value: string) => void
  confirmLabel: string
  confirming: boolean
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const ready = password.length >= 4

  return (
    <Dialog open={open} onOpenChange={confirming ? undefined : onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          autoComplete="new-password"
          placeholder={t('shareFeedback.passwordPlaceholder')}
          aria-label={t('shareFeedback.passwordLabel')}
          data-testid="share-delete-password"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && ready) onConfirm()
          }}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={confirming || !ready}
          >
            {confirming ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
