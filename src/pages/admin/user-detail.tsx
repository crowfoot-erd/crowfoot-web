/**
 * S-10 사용자 상세 (storyboard 03-admin §4)
 * 프로필 정의표(역할 변경 UI 없음) + 활성 세션 표 + 강제 종료(확인 → 204 → 재조회)
 * 표시: 이메일 미제공 "—" / 제공자 배지에 식별자(providerUserId) 병기
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { NotFoundContent } from '@/components/not-found-content'
import { isApiError } from '@/api/client'
import type { AdminSession } from '@/api/types'
import { useAdminSessions, useAdminUser, useDeleteAdminSession } from '@/features/admin'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'

export function AdminUserDetailPage() {
  const { t } = useTranslation()
  const { userId = '' } = useParams()

  const user = useAdminUser(userId)
  const sessions = useAdminSessions(userId)
  const deleteMutation = useDeleteAdminSession(userId)
  const [terminateTarget, setTerminateTarget] = useState<AdminSession | null>(null)

  if (user.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (user.isError && isApiError(user.error) && user.error.status === 404) {
    return (
      <NotFoundContent
        title={t('notFound.title')}
        description={t('notFound.description')}
        backTo={{ to: '/admin/users', label: t('admin.users.title') }}
      />
    )
  }

  if (user.isError || !user.data) {
    return <ErrorState onRetry={() => void user.refetch()} />
  }

  const data = user.data

  const handleTerminate = () => {
    if (!terminateTarget) return
    deleteMutation.mutate(terminateTarget.sid, {
      onSuccess: () => {
        toast.success(t('admin.userDetail.sessions.terminatedToast'))
        setTerminateTarget(null)
      },
      onError: (error) => {
        setTerminateTarget(null)
        toast.error(errorMessage(error))
        // 이미 종료된 세션(타 관리자) → 목록 재조회 (§3.6)
        if (isApiError(error) && error.resultCode === 'SESSION_NOT_FOUND') {
          void sessions.refetch()
        }
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 w-fit gap-1 text-muted-foreground"
          asChild
        >
          <Link to="/admin/users">
            <ArrowLeft aria-hidden />
            {t('admin.users.back')}
          </Link>
        </Button>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/admin/users">{t('admin.users.title')}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{data.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-2xl font-semibold">{data.name}</h1>
      </div>

      {data.withdrawnAt ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <TriangleAlert aria-hidden className="h-4 w-4" />
          {t('admin.userDetail.withdrawnNotice')}
        </div>
      ) : null}

      {/* 프로필 — 역할(Admin) 지정·해제 UI는 제공하지 않는다 (운영자 SQL 전용) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.userDetail.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            {(
              [
                [
                  t('admin.userDetail.fields.email'),
                  data.email ?? <span key="email" className="text-muted-foreground">—</span>,
                ],
                [t('admin.userDetail.fields.name'), data.name],
                [
                  t('admin.userDetail.fields.providers'),
                  <span key="providers" className="flex gap-1">
                    {data.identities.map((identity) => (
                      <Badge key={identity.provider} variant="outline" className="text-[10px]">
                        {t(`common.provider.${identity.provider}`, { defaultValue: identity.provider })}
                        <span className="ml-1 font-mono text-muted-foreground">{identity.providerUserId}</span>
                      </Badge>
                    ))}
                  </span>,
                ],
                [
                  t('admin.userDetail.fields.admin'),
                  data.admin ? t('common.yes') : t('common.no'),
                ],
                [
                  t('admin.userDetail.fields.withdrawnAt'),
                  data.withdrawnAt ? formatDateTime(data.withdrawnAt) : t('common.no'),
                ],
                [t('admin.userDetail.fields.createdAt'), formatDateTime(data.createdAt)],
              ] as Array<[string, React.ReactNode]>
            ).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-4 px-1 py-2.5 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* 활성 세션 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t('admin.userDetail.sessions.title')}</h2>
        {sessions.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sessions.isError ? (
          <ErrorState onRetry={() => void sessions.refetch()} />
        ) : sessions.data && sessions.data.items.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">{t('admin.userDetail.sessions.table.sid')}</TableHead>
                  <TableHead className="w-36">{t('admin.userDetail.sessions.table.createdAt')}</TableHead>
                  <TableHead className="w-36">{t('admin.userDetail.sessions.table.lastUsedAt')}</TableHead>
                  <TableHead className="w-32">{t('admin.userDetail.sessions.table.ip')}</TableHead>
                  <TableHead>{t('admin.userDetail.sessions.table.userAgent')}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.data.items.map((session) => (
                  <TableRow key={session.sid}>
                    <TableCell className="max-w-44 truncate font-mono text-xs" title={session.sid}>
                      {session.sid}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(session.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(session.lastUsedAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{session.ip}</TableCell>
                    <TableCell className="max-w-52 truncate text-xs text-muted-foreground" title={session.userAgent}>
                      {session.userAgent}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setTerminateTarget(session)}
                      >
                        {t('admin.userDetail.sessions.terminate')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState illustration="search" title={t('admin.userDetail.sessions.empty')} />
        )}
      </section>

      <ConfirmDialog
        open={terminateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setTerminateTarget(null)
        }}
        title={t('admin.userDetail.sessions.terminateTitle')}
        description={t('admin.userDetail.sessions.terminateDescription')}
        confirmLabel={t('admin.userDetail.sessions.terminateConfirm')}
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={handleTerminate}
      />
    </div>
  )
}
