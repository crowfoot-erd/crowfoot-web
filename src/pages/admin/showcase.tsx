/**
 * 사이트 쇼케이스 관리 (08-core/19-site-showcase.md Section 3.8·3.9·6 — 관리자 화면)
 *
 * - 숨긴 사이트도 나온다. 정렬은 서버가 신고 수 내림차순, 그다음 최근 등록순으로 한다
 * - 숨김 필터(전체·보이는 것·숨긴 것)와 페이지는 주소(?hidden=&page=)에 둔다
 * - 숨김 스위치 = 즉시 PATCH(되돌릴 수 있으므로 확인 없음). 다시 보이게 하면 서버가 신고 수를 0으로 되돌린다
 */
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { siteHost, type AdminShowcaseFilter } from '@/features/showcase/api'
import { SiteThumbnail, SITE_LINK_REL } from '@/features/showcase/components/showcase-card'
import { useAdminShowcaseSites, useUpdateAdminShowcaseSite } from '@/features/showcase/hooks'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'
import { cn } from 'cn'

const FILTERS: AdminShowcaseFilter[] = ['all', 'visible', 'hidden']

export function AdminShowcasePage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawFilter = searchParams.get('hidden')
  const filter: AdminShowcaseFilter = rawFilter === 'true' ? 'hidden' : rawFilter === 'false' ? 'visible' : 'all'
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const sites = useAdminShowcaseSites(filter, page)
  const updateMutation = useUpdateAdminShowcaseSite()
  const items = sites.data?.items ?? []
  const totalPages = sites.data?.totalPages ?? 1

  const update = (change: { filter?: AdminShowcaseFilter; page?: number }) => {
    const next = new URLSearchParams(searchParams)
    if (change.filter) {
      if (change.filter === 'all') next.delete('hidden')
      else next.set('hidden', change.filter === 'hidden' ? 'true' : 'false')
      next.delete('page')
    }
    if (change.page) {
      if (change.page <= 1) next.delete('page')
      else next.set('page', String(change.page))
    }
    setSearchParams(next)
  }

  const toggleHidden = (siteId: string, hidden: boolean) => {
    updateMutation.mutate(
      { siteId, hidden },
      {
        onSuccess: () => toast.success(hidden ? t('admin.showcase.hiddenToast') : t('admin.showcase.shownToast')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('admin.showcase.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.showcase.notice')}</p>
        </div>
        <div role="group" aria-label={t('admin.showcase.filter.label')} className="flex gap-1">
          {FILTERS.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={filter === name}
              onClick={() => update({ filter: name })}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                filter === name
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`admin.showcase.filter.${name}`)}
            </button>
          ))}
        </div>
      </div>

      {sites.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : sites.isError ? (
        <ErrorState onRetry={() => void sites.refetch()} />
      ) : items.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('common.total', { count: sites.data?.totalCount ?? 0 })}
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">{t('admin.showcase.table.thumbnail')}</TableHead>
                  <TableHead>{t('admin.showcase.table.site')}</TableHead>
                  <TableHead>{t('admin.showcase.table.model')}</TableHead>
                  <TableHead className="w-20 text-right">{t('admin.showcase.table.reports')}</TableHead>
                  <TableHead className="w-28">{t('admin.showcase.table.createdAt')}</TableHead>
                  <TableHead className="w-24 text-right">{t('admin.showcase.table.hidden')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((site) => (
                  <TableRow key={site.siteId} data-testid="admin-showcase-row">
                    <TableCell>
                      <SiteThumbnail
                        thumbnailUrl={site.thumbnailUrl}
                        faviconUrl={site.faviconUrl}
                        name={site.siteName || siteHost(site.url)}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex max-w-md flex-col gap-1">
                        <span className="break-words font-medium">{site.title}</span>
                        <a
                          href={site.url}
                          target="_blank"
                          rel={SITE_LINK_REL}
                          className="break-all text-xs text-muted-foreground underline-offset-3 hover:underline"
                        >
                          {site.url}
                        </a>
                        <div className="flex flex-wrap gap-1">
                          {site.hidden ? (
                            <Badge variant={site.autoHidden ? 'destructive' : 'secondary'}>
                              {site.autoHidden ? t('admin.showcase.autoHidden') : t('admin.showcase.manualHidden')}
                            </Badge>
                          ) : null}
                          {site.captureError ? (
                            <Badge variant="outline" title={site.captureError}>
                              {t('admin.showcase.captureError', { reason: site.captureError })}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="text-sm">{site.modelName}</span>
                        <span className="font-mono text-muted-foreground">
                          {t('admin.showcase.ids', { workspaceId: site.workspaceId, modelId: site.modelId })}
                        </span>
                        {site.createdBy ? (
                          <span className="text-muted-foreground">{site.createdBy}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={site.reportCount > 0 ? 'destructive' : 'secondary'} className="font-mono">
                        {site.reportCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(site.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={site.hidden}
                        onCheckedChange={(checked) => toggleHidden(site.siteId, checked)}
                        disabled={updateMutation.isPending}
                        aria-label={t('admin.showcase.toggleLabel', { title: site.title })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2">
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
              <span className="text-sm text-muted-foreground">
                {t('common.pagination.page', { page, totalPages })}
              </span>
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
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState illustration="search" title={t('admin.showcase.empty')} />
      )}
    </div>
  )
}
