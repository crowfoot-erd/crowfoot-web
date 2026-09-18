/**
 * 커뮤니티 게시판 목록 (08-core/08-community.md) — CommunityBoardPage({board})
 *
 * - RELEASE_NOTE(릴리스 노트) = 위키처럼 버전별 게시글. FEEDBACK(제안 및 신고) = 소개 글 노출.
 * - 검색 300ms 디바운스(변경 시 page=1)·오프셋 페이징 size 20·빈 문구 2종 — admin/users 관례
 * - "새 글"은 RELEASE_NOTE에서 관리자(me.admin)에게만 노출 — 서버가 최종 판정
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { useMe } from '@/features/auth'
import { useCommunityPosts } from '@/features/community'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { CommunityBoard } from '@/api/types'
import { formatDate } from '@/lib/format'

const PAGE_SIZE = 20

interface CommunityBoardPageProps {
  board: CommunityBoard
}

export function CommunityBoardPage({ board }: CommunityBoardPageProps) {
  const { t } = useTranslation()
  const me = useMe()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const [keyword, setKeyword] = useState(searchParams.get('keyword') ?? '')
  const debouncedKeyword = useDebouncedValue(keyword, 300)
  const trimmedKeyword = debouncedKeyword.trim()

  // 검색어가 바뀌면 page=1로 (admin/users §3.7 관례)
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    const current = next.get('keyword') ?? ''
    if (current === trimmedKeyword) return
    if (trimmedKeyword) next.set('keyword', trimmedKeyword)
    else next.delete('keyword')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }, [trimmedKeyword, searchParams, setSearchParams])

  const posts = useCommunityPosts(board, { keyword: trimmedKeyword || undefined, page, size: PAGE_SIZE })

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next)
  }

  const boardName = t(`community.boardName.${board}`)
  const hasKeyword = trimmedKeyword.length > 0
  const canCreate = board === 'FEEDBACK' || me.data?.admin === true

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{boardName}</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search aria-hidden className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('community.board.searchPlaceholder')}
              className="w-64 pl-8"
              aria-label={t('common.search')}
            />
          </div>
          {canCreate ? (
            <Button type="button" asChild>
              <Link to={`/community/posts/new?board=${board}`}>
                <Plus aria-hidden />
                {t('community.board.newPost')}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* 게시판 소개 — 제안 및 신고 전용 */}
      {board === 'FEEDBACK' ? (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t('community.board.intro')}
        </p>
      ) : null}

      {posts.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : posts.isError ? (
        <ErrorState onRetry={() => void posts.refetch()} />
      ) : posts.data && posts.data.items.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">{t('common.total', { count: posts.data.totalCount })}</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('community.board.table.title')}</TableHead>
                  <TableHead className="w-32">{t('community.board.table.author')}</TableHead>
                  <TableHead className="w-20">{t('community.board.table.comments')}</TableHead>
                  <TableHead className="w-32">{t('community.board.table.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.data.items.map((post) => (
                  <TableRow key={post.postId}>
                    <TableCell>
                      <Link
                        to={`/community/posts/${post.postId}`}
                        className="font-medium underline-offset-3 hover:underline"
                      >
                        {post.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{post.author.name}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {board === 'FEEDBACK' ? post.commentCount : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(post.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {posts.data.totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('common.pagination.prev')}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('common.pagination.page', { page: posts.data.page, totalPages: posts.data.totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('common.pagination.next')}
                disabled={page >= posts.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState illustration="search" title={hasKeyword ? t('community.board.empty.search') : t('community.board.empty.all')} />
      )}
    </div>
  )
}
