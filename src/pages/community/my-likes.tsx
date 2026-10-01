/**
 * 내가 좋아요한 공유 문서 (08-core/02-model.md §1.10.9 → 08-core/08-community.md §5)
 *
 * - 커뮤니티 "좋아한 문서" 메뉴 — 반응(좋아요)을 남긴 공유 문서의 역방향 모아보기
 * - 행 = ERD 이름(공유 뷰어 새 창 링크)+설명+DB 배지 · 카운터 3종(반응·댓글·조회) · 좋아요 시각
 * - 토글로 제거한 문서는 행이 없어 자동 제외, 링크 철회분도 CASCADE로 소멸한다(서버 규칙)
 */
import { Link } from 'react-router-dom'
import { Eye, Heart, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DbmsIcon } from '@/components/dbms-icon'
import { dbmsLabel } from '@/features/editor/model/dbms'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { useMyShareReactions } from '@/features/models'
import { formatDate, formatDateTime } from '@/lib/format'

export function MyShareLikesPage() {
  const { t } = useTranslation()
  const likes = useMyShareReactions()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('community.myLikes.title')}</h1>

      {likes.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : likes.isError ? (
        <ErrorState onRetry={() => void likes.refetch()} />
      ) : likes.data && likes.data.items.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">{t('common.total', { count: likes.data.totalCount })}</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('community.myLikes.table.document')}</TableHead>
                  <TableHead className="w-20">{t('community.myLikes.table.reactions')}</TableHead>
                  <TableHead className="w-20">{t('community.myLikes.table.comments')}</TableHead>
                  <TableHead className="w-20">{t('community.myLikes.table.views')}</TableHead>
                  <TableHead className="w-32">{t('community.myLikes.table.likedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {likes.data.items.map((like) => (
                  <TableRow key={like.shareToken}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/share/${like.shareToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline-offset-3 hover:underline"
                          >
                            {like.modelName}
                          </Link>
                          <span className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                            <DbmsIcon databaseType={like.databaseType} className="size-3" />
                            {dbmsLabel(like.databaseType)}
                          </span>
                        </div>
                        {like.description ? (
                          <p className="line-clamp-1 text-sm text-muted-foreground">{like.description}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    {/* 반응 수를 red 하트로 — 랜딩 갤러리와 같은 신호(능동 피드백 강조) */}
                    <TableCell className="tabular-nums text-red-600 dark:text-red-400">
                      <span className="flex items-center gap-1 font-medium">
                        <Heart aria-hidden className="size-3.5 fill-current" />
                        {like.reactionCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-1">
                        <MessageSquare aria-hidden className="size-3.5" />
                        {like.commentCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-1">
                        <Eye aria-hidden className="size-3.5" />
                        {like.viewCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span title={formatDateTime(like.reactedAt)}>{formatDate(like.reactedAt)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <EmptyState illustration="search" title={t('community.myLikes.empty')} />
      )}
    </div>
  )
}
