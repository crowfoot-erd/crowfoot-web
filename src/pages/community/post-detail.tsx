/**
 * 커뮤니티 게시글 상세 (08-core/08-community.md)
 *
 * - 마크다운 본문은 lazy MarkdownViewer(toast-ui 전용 청크)로 렌더
 * - 수정·삭제 첨부는 작성자 본인 또는 관리자에게만 노출(서버가 최종 판정)
 * - 코멘트 섹션은 FEEDBACK 게시글에만 — 릴리스 노트는 읽기 전용
 */
import { Suspense, lazy } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { useMe } from '@/features/auth'
import { CommentSection, useCommunityPost, useDeleteCommunityPost } from '@/features/community'
import { errorMessage } from '@/lib/result-code'
import { formatDateTime } from '@/lib/format'

// toast-ui 청크 분리 — 메인 번들에 포함하지 않는다
const MarkdownViewer = lazy(() => import('@/features/community/components/markdown-viewer'))

export function CommunityPostDetailPage() {
  const { t } = useTranslation()
  const me = useMe()
  const navigate = useNavigate()
  const { postId = '' } = useParams()
  const post = useCommunityPost(postId)
  const deletePost = useDeleteCommunityPost()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const canMutate =
    post.data != null && (me.data?.userId === post.data.author.userId || me.data?.admin === true)

  const confirmDelete = () => {
    deletePost.mutate(postId, {
      onSuccess: () => {
        toast.success(t('community.detail.deletedToast'))
        // 목록으로 — 게시판 경로는 삭제된 글 정보 대신 목록 기본값
        navigate(post.data?.board === 'FEEDBACK' ? '/community/feedback' : '/community/release-notes')
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  if (post.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (post.isError || !post.data) {
    return <ErrorState onRetry={() => void post.refetch()} message={post.isError ? errorMessage(post.error) : undefined} />
  }

  const detail = post.data

  return (
    <article className="flex flex-col gap-4" data-testid="community-post-detail">
      <div>
        <Button type="button" variant="ghost" size="sm" asChild className="text-muted-foreground">
          <Link to={detail.board === 'FEEDBACK' ? '/community/feedback' : '/community/release-notes'}>
            <ArrowLeft aria-hidden />
            {t('community.detail.back')}
          </Link>
        </Button>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant="secondary" className="mb-2">
              {t(`community.boardName.${detail.board}`)}
            </Badge>
            <h1 className="text-2xl font-semibold break-words">{detail.title}</h1>
          </div>
          {canMutate ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to={`/community/posts/${detail.postId}/edit`}>
                  <Pencil aria-hidden />
                  {t('common.edit')}
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 aria-hidden />
                {t('common.delete')}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Avatar name={detail.author.name} className="size-6 text-xs" />
          <span className="font-medium text-foreground">{detail.author.name}</span>
          <span>·</span>
          <span>{formatDateTime(detail.createdAt)}</span>
        </div>
      </div>

      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <MarkdownViewer markdown={detail.content} className="min-h-24" />
      </Suspense>

      {/* 코멘트 — FEEDBACK 전용(릴리스 노트는 읽기 전용) */}
      {detail.board === 'FEEDBACK' ? <CommentSection postId={detail.postId} /> : null}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('community.detail.confirmDeleteTitle')}
        description={t('community.detail.confirmDeleteDescription')}
        destructive
        confirming={deletePost.isPending}
        onConfirm={confirmDelete}
      />
    </article>
  )
}
