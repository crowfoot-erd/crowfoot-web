/**
 * S-14 알림 (storyboard 02-user 본문 Section 9 — 계약 08-core/11-notification.md §5)
 * 전체 목록 페이지 — 오프셋 페이징 20(URL ?page=, admin/users 관례). 행 클릭 = 읽음 처리 후
 * 문서로 이동(문서가 삭제돼 알림만 남은 경우에도 이동 시도 — 도착지 404는 공통 패턴).
 * 문구는 서버에 없다 — type별 i18n(shell.notifications.type.*)로 렌더한다.
 * v1.25부터 커뮤니티 좌측 메뉴 안(/community/notifications) — 구 /notifications는 리다이렉트.
 */
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/features/notifications'
import { timeAgo } from '@/lib/time-ago'

const PAGE_SIZE = 20

export function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const notifications = useNotifications(page, PAGE_SIZE)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next)
  }

  /** 행 클릭 — 읽음 처리 후 문서로. 타인 id·직전 삭제 404는 이동 없이 행을 그대로 둔다(조용히 무시) */
  const openNotification = (item: { id: string; workspaceId: string; modelId: string }) => {
    markRead.mutate(item.id, {
      onSuccess: () => navigate(`/workspaces/${item.workspaceId}/models/${item.modelId}`),
    })
  }

  const hasUnread = notifications.data?.items.some((item) => !item.read) ?? false

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('shell.notifications.title')}</h1>
        {notifications.data && hasUnread ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck aria-hidden className="h-4 w-4" />
            {t('shell.notifications.markAll')}
          </Button>
        ) : null}
      </div>

      {notifications.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : notifications.isError ? (
        <ErrorState onRetry={() => void notifications.refetch()} />
      ) : notifications.data && notifications.data.items.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('common.total', { count: notifications.data.totalCount })}
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">{t('shell.notifications.table.type')}</TableHead>
                  <TableHead>{t('shell.notifications.table.content')}</TableHead>
                  <TableHead className="w-48">{t('shell.notifications.table.document')}</TableHead>
                  <TableHead className="w-24">{t('shell.notifications.table.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.data.items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => openNotification(item)}
                  >
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={`size-2 shrink-0 rounded-full ${item.read ? 'border border-muted-foreground/40' : 'bg-primary'}`}
                        />
                        <Badge variant="secondary" className="text-xs">
                          {t(`shell.notifications.typeBadge.${item.type}`)}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {t(`shell.notifications.type.${item.type}`, {
                        actor: item.actorDisplayName ?? '',
                        model: item.modelName,
                      })}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/workspaces/${item.workspaceId}/models/${item.modelId}`}
                        className="underline-offset-3 hover:underline"
                      >
                        {item.modelName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(item.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {notifications.data.totalPages > 1 ? (
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
                {t('common.pagination.page', { page: notifications.data.page, totalPages: notifications.data.totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('common.pagination.next')}
                disabled={page >= notifications.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState illustration="search" title={t('shell.notifications.empty')} />
      )}
    </div>
  )
}
