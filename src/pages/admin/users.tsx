/**
 * S-09 사용자 관리 (storyboard 03-admin §3)
 * 검색 2자+·300ms 디바운스(변경 시 page=1)·오프셋 페이징 size 20·빈 문구 2종
 * 표시: 정상 "활동" 초록 배지 / 이메일 미제공 "—" / 제공자 배지에 식별자(providerUserId) 병기
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronRightIcon, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { useAdminUsers } from '@/features/admin'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatDate } from '@/lib/format'

const PAGE_SIZE = 20

export function AdminUsersPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

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

  const users = useAdminUsers({ keyword: trimmedKeyword || undefined, page, size: PAGE_SIZE })

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next)
  }

  const hasKeyword = trimmedKeyword.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('admin.users.title')}</h1>
        <div className="relative">
          <Search aria-hidden className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            className="w-64 pl-8"
            aria-label={t('common.search')}
          />
        </div>
      </div>

      {users.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : users.isError ? (
        <ErrorState onRetry={() => void users.refetch()} />
      ) : users.data && users.data.items.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('common.total', { count: users.data.totalCount })}
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.users.table.email')}</TableHead>
                  <TableHead>{t('admin.users.table.name')}</TableHead>
                  <TableHead>{t('admin.users.table.providers')}</TableHead>
                  <TableHead className="w-24">{t('admin.users.table.admin')}</TableHead>
                  <TableHead className="w-24">{t('admin.users.table.status')}</TableHead>
                  <TableHead className="w-32">{t('admin.users.table.createdAt')}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.items.map((user) => (
                  <TableRow key={user.userId} className="cursor-pointer">
                    <TableCell>
                      <Link to={`/admin/users/${user.userId}`} className="font-medium underline-offset-3 hover:underline">
                        {user.email ?? <span className="text-muted-foreground">—</span>}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link to={`/admin/users/${user.userId}`} className="underline-offset-3 hover:underline">
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {user.identities.map((identity) => (
                          <Badge key={identity.provider} variant="outline" className="text-[10px]">
                            {t(`common.provider.${identity.provider}`, { defaultValue: identity.provider })}
                            <span className="ml-1 font-mono text-muted-foreground">{identity.providerUserId}</span>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.admin ? <Badge variant="secondary">{t('common.admin')}</Badge> : null}
                    </TableCell>
                    <TableCell>
                      {user.withdrawnAt ? (
                        <Badge variant="destructive">{t('common.withdrawn')}</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          {t('admin.users.status.active')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="sm" asChild>
                        <Link to={`/admin/users/${user.userId}`} className="gap-1">
                          {t('admin.users.detail')}
                          <ChevronRightIcon aria-hidden className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {users.data.totalPages > 1 ? (
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
                {t('common.pagination.page', { page: users.data.page, totalPages: users.data.totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('common.pagination.next')}
                disabled={page >= users.data.totalPages}
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
          title={hasKeyword ? t('admin.users.empty.search') : t('admin.users.empty.all')}
        />
      )}
    </div>
  )
}
