/**
 * 내가 작성한 공유 문서 댓글 (08-core/02-model.md §1.10.9 → 08-core/08-community.md §5)
 *
 * - 커뮤니티 "내 댓글" 메뉴 — 공유 문서에 남긴 회원 댓글·오너 답글을 문서와 함께 모아본다
 * - 행 = ERD 이름(공유 뷰어 새 창 링크)+DB 배지 · 댓글 내용(답글 배지·수정 표시) · 작성 시각
 * - 게스트 댓글은 신원이 없어 포함되지 않고, 링크 철회분은 FK CASCADE로 이미 없다(서버 규칙)
 */
import { Link } from 'react-router-dom'
import { CornerDownRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DbmsIcon } from '@/components/dbms-icon'
import { dbmsLabel } from '@/features/editor/model/dbms'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { useMyShareComments } from '@/features/models'
import { formatDateTime } from '@/lib/format'

export function MyShareCommentsPage() {
  const { t } = useTranslation()
  const comments = useMyShareComments()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('community.myComments.title')}</h1>

      {comments.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : comments.isError ? (
        <ErrorState onRetry={() => void comments.refetch()} />
      ) : comments.data && comments.data.items.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">{t('common.total', { count: comments.data.totalCount })}</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('community.myComments.table.document')}</TableHead>
                  <TableHead>{t('community.myComments.table.content')}</TableHead>
                  <TableHead className="w-32">{t('community.myComments.table.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comments.data.items.map((comment) => (
                  <TableRow key={comment.commentId}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Link
                          to={`/share/${comment.shareToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium underline-offset-3 hover:underline"
                        >
                          {comment.modelName}
                        </Link>
                        <span className="flex w-fit items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                          <DbmsIcon databaseType={comment.databaseType} className="size-3" />
                          {dbmsLabel(comment.databaseType)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          {comment.parentCommentId !== null ? (
                            <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <CornerDownRight aria-hidden className="size-3" />
                              {t('community.myComments.replyBadge')}
                            </span>
                          ) : null}
                          {comment.edited ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {t('shareFeedback.editedMark')}
                            </span>
                          ) : null}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-foreground/90">{comment.content}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(comment.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <EmptyState illustration="search" title={t('community.myComments.empty')} />
      )}
    </div>
  )
}
