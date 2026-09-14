/**
 * 매니지드 DB 섹션 (08-core/07 §3.5~3.7 — 데이터베이스 탭 최상단)
 *
 * - 인스턴스별 한도 요약(사용량·잔여) + 발급 버튼 — 발급 즉시 커넥션이 자동 등록된다
 * - 발급 목록(워크스페이스 멤버 전체) — 스키마·커넥션·발급자
 * - 본인 발급 행: 접속 정보(주소·계정·비밀번호 — 다이얼로그), 철회
 * - 관리자가 인스턴스를 하나도 등록하지 않았으면(limitSummary 빈) 섹션 자체를 숨긴다
 */
import { useState } from 'react'
import { KeyRound, Sparkles, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import type { ManagedDatabase, ManagedLimitSummary } from '@/api/types'
import { useMe } from '@/features/auth/hooks'
import {
  useIssueManagedDatabase,
  useManagedDatabases,
  useRevokeManagedDatabase,
} from '@/features/managed/hooks'
import { CredentialDialog } from '@/features/managed/components/credential-dialog'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'

export interface ManagedSectionProps {
  workspaceId: string
  canEdit: boolean
}

/** 한도 행 — 인스턴스 이름·사용량·발급 버튼(활성·잔여 있을 때) */
function LimitRow({
  summary,
  disabled,
  pending,
  onIssue,
}: {
  summary: ManagedLimitSummary
  disabled: boolean
  pending: boolean
  onIssue: (instanceId: string) => void
}) {
  const { t } = useTranslation()
  const exhausted = summary.remaining <= 0
  const issueDisabled = disabled || !summary.isActive || exhausted || pending

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{summary.displayName}</span>
        <Badge variant="outline" className="font-mono text-[10px]">
          {t('managed.usage', { used: summary.used, limit: summary.limit })}
        </Badge>
        {!summary.isActive ? (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {t('managed.inactive')}
          </Badge>
        ) : exhausted ? (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {t('managed.exhausted')}
          </Badge>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={issueDisabled}
        onClick={() => onIssue(summary.instanceId)}
      >
        <Sparkles aria-hidden />
        {pending ? t('managed.issuing') : t('managed.issue')}
      </Button>
    </div>
  )
}

export function ManagedSection({ workspaceId, canEdit }: ManagedSectionProps) {
  const { t } = useTranslation()
  const me = useMe()
  const databases = useManagedDatabases(workspaceId)
  const issueMutation = useIssueManagedDatabase(workspaceId)
  const revokeMutation = useRevokeManagedDatabase(workspaceId)

  const [revoking, setRevoking] = useState<ManagedDatabase | null>(null)
  const [viewing, setViewing] = useState<ManagedDatabase | null>(null)

  // 목록 조회 실패는 조용히 넘긴다(매니지드 미제공 환경 등) — 커넥션 탭 본체는 그대로 쓸 수 있게
  if (!databases.isPending && !databases.isError && (databases.data?.limitSummary.length ?? 0) === 0) {
    return null
  }

  const myUserId = me.data?.userId
  const issued = databases.data?.items ?? []

  const handleIssue = (instanceId: string) => {
    issueMutation.mutate(instanceId, {
      onSuccess: (database) => {
        if (!database) return
        toast.success(
          t('managed.issueSuccessToast', {
            schema: database.schemaName,
            connection: database.connectionName ?? '',
          }),
        )
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const handleRevoke = () => {
    if (!revoking) return
    revokeMutation.mutate(revoking.databaseId, {
      onSuccess: () => {
        setRevoking(null)
        toast.success(t('managed.revokeSuccessToast', { schema: revoking.schemaName }))
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('managed.sectionTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('managed.sectionDescription')}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {databases.isPending ? (
          <>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : databases.isError ? (
          <ErrorState onRetry={() => void databases.refetch()} />
        ) : (
          <>
            {/* 인스턴스별 한도 + 발급 */}
            <div className="flex flex-col divide-y">
              {(databases.data?.limitSummary ?? []).map((summary) => (
                <LimitRow
                  key={summary.instanceId}
                  summary={summary}
                  disabled={!canEdit}
                  pending={issueMutation.isPending}
                  onIssue={handleIssue}
                />
              ))}
            </div>

            {/* 발급 목록 — 워크스페이스 멤버 전체 */}
            {issued.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('managed.list.schema')}</TableHead>
                    <TableHead>{t('managed.list.instance')}</TableHead>
                    <TableHead>{t('managed.list.connection')}</TableHead>
                    <TableHead>{t('managed.list.createdBy')}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issued.map((database) => {
                    const mine = database.createdBy?.userId === myUserId
                    return (
                      <TableRow key={database.databaseId}>
                        <TableCell className="font-mono text-xs">{database.schemaName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {database.instanceDisplayName ?? '—'}
                        </TableCell>
                        <TableCell>{database.connectionName ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {database.createdBy?.name ?? t('common.system')}
                          {' · '}
                          {formatDate(database.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {mine ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewing(database)}
                                aria-label={t('managed.credential.button', { schema: database.schemaName })}
                                title={t('managed.credential.button', { schema: database.schemaName })}
                              >
                                <KeyRound aria-hidden className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {canEdit && mine ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setRevoking(database)}
                                aria-label={t('managed.revokeTitle', { schema: database.schemaName })}
                              >
                                <Trash2 aria-hidden className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : null}
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('managed.revokeTitle', { schema: revoking?.schemaName ?? '' })}
        description={t('managed.revokeDescription', { schema: revoking?.schemaName ?? '' })}
        confirmLabel={t('managed.revokeConfirm')}
        destructive
        confirming={revokeMutation.isPending}
        onConfirm={handleRevoke}
      />

      <CredentialDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        workspaceId={workspaceId}
        database={viewing}
      />
    </Card>
  )
}
