/**
 * S-13 감사 로그 (storyboard 03-admin §6)
 * 읽기 전용 — 액션 Select 필터·주체 검색 2자+·300ms 디바운스(변경 시 page=1)·오프셋 페이징 size 20
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import type { AdminAuditLog } from '@/api/types'
import { useAdminAuditLogs } from '@/features/admin'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatDateTime } from '@/lib/format'

const PAGE_SIZE = 20
const ALL_ACTIONS = 'all'

/** 액션 필터 옵션 — 백엔드가 기록하는 감사 액션(그룹별 대표) */
const ACTION_OPTIONS = [
  'ADMIN_USERS_LISTED',
  'ADMIN_USER_VIEWED',
  'ADMIN_SESSIONS_LISTED',
  'SESSION_REVOKED_BY_ADMIN',
  'ADMIN_PROVIDERS_LISTED',
  'ADMIN_PROVIDER_UPDATED',
  'ADMIN_ROLES_LISTED',
  'ADMIN_ROLE_UPDATED',
  'ADMIN_AUDIT_LOGS_LISTED',
  'USER_LOGGED_IN',
  'USER_LOGGED_OUT',
  'USER_WITHDRAWN',
  'REFRESH_REUSED',
  'WORKSPACE_CREATED',
  'WORKSPACE_UPDATED',
  'WORKSPACE_DELETED',
  'TEAM_CREATED',
  'TEAM_UPDATED',
  'TEAM_DISSOLVED',
  'TEAM_MEMBER_ADDED',
  'TEAM_MEMBER_REMOVED',
  'MEMBERSHIP_GRANTED',
  'MEMBERSHIP_REVOKED',
  'MEMBERSHIP_ROLE_CHANGED',
] as const

function formatDetail(detail: AdminAuditLog['detail']): string {
  if (!detail) return ''
  return Object.entries(detail)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' · ')
}

export function AdminAuditLogsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
  const action = searchParams.get('action') ?? ''

  const [keyword, setKeyword] = useState(searchParams.get('keyword') ?? '')
  const debouncedKeyword = useDebouncedValue(keyword, 300)
  const trimmedKeyword = debouncedKeyword.trim()

  // 검색어가 바뀌면 page=1로 (§3.7)
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    const current = next.get('keyword') ?? ''
    if (current === trimmedKeyword) return
    if (trimmedKeyword) next.set('keyword', trimmedKeyword)
    else next.delete('keyword')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }, [trimmedKeyword, searchParams, setSearchParams])

  const logs = useAdminAuditLogs({
    keyword: trimmedKeyword || undefined,
    action: action || undefined,
    page,
    size: PAGE_SIZE,
  })

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setSearchParams(next)
  }

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next)
  }

  const hasFilter = trimmedKeyword.length > 0 || action.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('admin.auditLogs.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={action || ALL_ACTIONS} onValueChange={(value) => setParam('action', value === ALL_ACTIONS ? '' : value)}>
            <SelectTrigger size="sm" className="w-56" aria-label={t('admin.auditLogs.actionFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACTIONS}>{t('admin.auditLogs.allActions')}</SelectItem>
              {ACTION_OPTIONS.map((option) => (
                <SelectItem key={option} value={option} className="font-mono text-xs">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search aria-hidden className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('admin.auditLogs.searchPlaceholder')}
              className="w-64 pl-8"
              aria-label={t('common.search')}
            />
          </div>
        </div>
      </div>

      {logs.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : logs.isError ? (
        <ErrorState onRetry={() => void logs.refetch()} />
      ) : logs.data && logs.data.items.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">{t('common.total', { count: logs.data.totalCount })}</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">{t('admin.auditLogs.table.createdAt')}</TableHead>
                  <TableHead className="w-44">{t('admin.auditLogs.table.actor')}</TableHead>
                  <TableHead className="w-52">{t('admin.auditLogs.table.action')}</TableHead>
                  <TableHead className="w-36">{t('admin.auditLogs.table.target')}</TableHead>
                  <TableHead>{t('admin.auditLogs.table.detail')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      {log.actorUserId ? (
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{log.actorName}</span>
                          <span className="truncate text-xs text-muted-foreground">{log.actorEmail ?? '—'}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('common.system')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="max-w-full truncate font-mono text-[10px]">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">
                        {log.targetType}/{log.targetId}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-0">
                      {log.detail ? (
                        <p className="truncate text-xs text-muted-foreground" title={formatDetail(log.detail)}>
                          {formatDetail(log.detail)}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {logs.data.totalPages > 1 ? (
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
                {t('common.pagination.page', { page: logs.data.page, totalPages: logs.data.totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('common.pagination.next')}
                disabled={page >= logs.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          illustration="search"
          title={hasFilter ? t('admin.auditLogs.empty.search') : t('admin.auditLogs.empty.all')}
        />
      )}
    </div>
  )
}
