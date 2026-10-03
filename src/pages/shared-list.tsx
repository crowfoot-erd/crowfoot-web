/**
 * 공유 문서 목록 /shared (04-front/storyboard/00-common.md S-00a, 08-core/12-share-feedback.md §1.5.1)
 *
 * - 랜딩 갤러리의 "모두 보기"가 여는 화면. 인증 없이 연다. 머리와 바닥은 랜딩과 같다
 * - 검색(문서 이름·설명), 정렬(최근 공유순·인기순), 페이지. 조건은 주소(?q=&sort=&page=)에 둔다 — 새로고침·공유해도 같은 목록이 나온다
 * - 카드는 랜딩 갤러리와 같은 꼴. 누르면 공유 문서를 새 창에서 연다
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Eye, Heart, Search } from 'lucide-react'

import { DbmsIcon } from '@/components/dbms-icon'
import { PublicFooter, PublicHeader } from '@/components/public-chrome'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { dbmsLabel } from '@/features/editor/model/dbms'
import type { SharedListSort } from '@/features/models/api'
import { useSharedList } from '@/features/models/hooks'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { usePageMeta } from '@/hooks/usePageMeta'
import { formatDate } from '@/lib/format'
import { cn } from 'cn'

const SORTS: SharedListSort[] = ['recent', 'popular']

export function SharedListPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const sort: SharedListSort = params.get('sort') === 'popular' ? 'popular' : 'recent'
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  usePageMeta({
    title: `${t('shared.title')} — ${t('common.appName')}`,
    description: t('shared.description'),
    canonicalPath: '/shared',
  })

  // 입력은 바로 보이고, 주소(=조회 조건)는 잠깐 멈춘 뒤에 바꾼다. 검색어가 바뀌면 첫 페이지로 돌아간다
  const [input, setInput] = useState(q)
  const debounced = useDebouncedValue(input.trim())
  useEffect(() => {
    if (debounced === q) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (debounced) next.set('q', debounced)
        else next.delete('q')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [debounced, q, setParams])

  const list = useSharedList({ q, sort, page })
  const items = list.data?.items ?? []
  const totalPages = list.data?.totalPages ?? 1

  function update(change: { sort?: SharedListSort; page?: number }) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (change.sort) {
        if (change.sort === 'recent') next.delete('sort')
        else next.set('sort', change.sort)
        next.delete('page')
      }
      if (change.page) {
        if (change.page <= 1) next.delete('page')
        else next.set('page', String(change.page))
      }
      return next
    })
    if (change.page) window.scrollTo?.({ top: 0 })
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('shared.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('shared.description')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('shared.search')}
              aria-label={t('shared.search')}
              maxLength={100}
              className="pl-8"
              data-testid="shared-search"
            />
          </div>
          <div role="group" aria-label={t('shared.sort.label')} className="flex gap-1">
            {SORTS.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={sort === name}
                onClick={() => update({ sort: name })}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  sort === name
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`shared.sort.${name}`)}
              </button>
            ))}
          </div>
          {list.data ? (
            <span className="ml-auto text-sm tabular-nums text-muted-foreground" data-testid="shared-count">
              {t('shared.count', { count: list.data.totalCount })}
            </span>
          ) : null}
        </div>

        {list.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={t('common.loading')}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-40 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground" role="alert">
            {t('shared.error')}
          </p>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground" data-testid="shared-empty">
            {q ? t('shared.emptySearch', { q }) : t('shared.empty')}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="shared-list">
            {items.map(({ shareToken, modelName, description, databaseType, updatedAt, reactionCount, viewCount }) => (
              <li key={shareToken}>
                <Link to={`/share/${shareToken}`} target="_blank" rel="noopener noreferrer" className="group block h-full">
                  <Card className="h-full transition-colors group-hover:border-primary/50">
                    <CardContent className="flex h-full flex-col gap-3 p-6">
                      <span className="flex w-fit items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                        <DbmsIcon databaseType={databaseType} className="size-3" />
                        {dbmsLabel(databaseType)}
                      </span>
                      <h2 className="break-words text-base font-semibold">{modelName}</h2>
                      {description ? <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p> : null}
                      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <span className="flex items-center gap-1 tabular-nums">
                            <Heart aria-hidden className="size-3.5" />
                            {t('landing.gallery.reactions', { count: reactionCount })}
                          </span>
                          <span className="flex items-center gap-1 tabular-nums">
                            <Eye aria-hidden className="size-3.5" />
                            {t('landing.gallery.views', { count: viewCount })}
                          </span>
                        </span>
                        {formatDate(updatedAt)}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <nav aria-label={t('shared.pages')} className="flex items-center justify-center gap-2" data-testid="shared-pager">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('common.pagination.prev')}
              disabled={page <= 1}
              onClick={() => update({ page: page - 1 })}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <span className="text-sm text-muted-foreground">{t('common.pagination.page', { page, totalPages })}</span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('common.pagination.next')}
              disabled={page >= totalPages}
              onClick={() => update({ page: page + 1 })}
            >
              <ChevronRight aria-hidden />
            </Button>
          </nav>
        ) : null}
      </main>
      <PublicFooter />
    </div>
  )
}
