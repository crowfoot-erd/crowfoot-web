/**
 * 데이터베이스 탭 (storyboard 02-user §7 — 워크스페이스 상세 ?tab=database)
 *
 * - 커넥션 목록 — 이름·DBMS·host:port·database·사용자·등록자. 비밀번호는 내려오지 않는다
 * - 등록/편집(Editor 이상)·삭제·접속 테스트(토스트)·"문서로 가져오기"(리버스 다이얼로그)
 * - 목록은 멤버 전체가 본다, 변경은 Editor 이상 (§1 권한)
 */
import { useState } from 'react'
import { Database, FileDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import type { DbConnection } from '@/api/types'
import {
  useConnections,
  useDeleteConnection,
  useTestConnection,
} from '@/features/connections/hooks'
import { ConnectionDialog } from '@/features/connections/components/connection-dialog'
import { ReverseDialog } from '@/features/connections/components/reverse-dialog'
import { ManagedSection } from '@/features/managed/components/managed-section'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'

export interface DatabaseTabProps {
  workspaceId: string
  canEdit: boolean
}

export function DatabaseTab({ workspaceId, canEdit }: DatabaseTabProps) {
  const { t } = useTranslation()
  const connections = useConnections(workspaceId)
  const deleteMutation = useDeleteConnection(workspaceId)
  const testMutation = useTestConnection(workspaceId)

  const [editing, setEditing] = useState<DbConnection | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<DbConnection | null>(null)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reversePreset, setReversePreset] = useState<string | undefined>(undefined)
  // 마지막 접속 테스트 결과(행 배지) — 토스트와 달리 사라지지 않는다. 새로고침하면 초기화
  const [testResults, setTestResults] = useState<
    Record<string, { connected: boolean; latencyMs: number | null }>
  >({})

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (connection: DbConnection) => {
    setEditing(connection)
    setDialogOpen(true)
  }

  /** 리버스 다이얼로그 — 커넥션 행에서 열 때 사전 선택 */
  const openReverse = (connectionId?: string) => {
    setReversePreset(connectionId)
    setReverseOpen(true)
  }

  const handleDelete = () => {
    if (!deleting) return
    deleteMutation.mutate(deleting.connectionId, {
      onSuccess: () => {
        setDeleting(null)
        toast.success(t('connection.delete.successToast', { name: deleting.name }))
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const handleTest = (connection: DbConnection) => {
    testMutation.mutate(connection.connectionId, {
      onSuccess: (result) => {
        if (!result) return
        setTestResults((prev) => ({
          ...prev,
          [connection.connectionId]: { connected: result.connected, latencyMs: result.latencyMs },
        }))
        if (result.connected) {
          toast.success(
            t('connection.test.successToast', { name: connection.name, latency: result.latencyMs ?? 0 }),
          )
        } else {
          toast.warning(
            t('connection.test.failToast', { name: connection.name, message: result.message ?? '' }),
          )
        }
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const testingId = testMutation.isPending ? testMutation.variables : undefined

  /** 마지막 접속 테스트 결과 배지 — 성공(초록, latency 포함)·실패(빨강), 미테스트면 렌더하지 않는다 */
  const testResultBadge = (connection: DbConnection) => {
    const result = testResults[connection.connectionId]
    if (!result) return null
    if (result.connected) {
      return (
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-[10px] font-normal text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {result.latencyMs != null
            ? t('connection.test.connectedBadge', { latency: result.latencyMs })
            : t('connection.test.connectedBadgeNoLatency')}
        </Badge>
      )
    }
    return (
      <Badge
        variant="outline"
        className="border-red-300 bg-red-50 text-[10px] font-normal text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
      >
        {t('connection.test.failedBadge')}
      </Badge>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 서비스 제공 DB(매니지드) — 인스턴스가 없으면 섹션이 스스로 숨겨진다 */}
      <ManagedSection workspaceId={workspaceId} canEdit={canEdit} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('connection.list.description')}</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => openReverse()}>
            <Database aria-hidden />
            {t('reverse.openButton')}
          </Button>
          {canEdit ? (
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus aria-hidden />
              {t('connection.list.newConnection')}
            </Button>
          ) : null}
        </div>
      </div>

      {connections.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : connections.isError ? (
        <ErrorState onRetry={() => void connections.refetch()} />
      ) : (connections.data?.items.length ?? 0) > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('connection.list.columns.name')}</TableHead>
              <TableHead>{t('connection.list.columns.dbmsType')}</TableHead>
              <TableHead>{t('connection.list.columns.endpoint')}</TableHead>
              <TableHead>{t('connection.list.columns.database')}</TableHead>
              <TableHead>{t('connection.list.columns.username')}</TableHead>
              <TableHead>{t('connection.list.columns.createdBy')}</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(connections.data?.items ?? []).map((connection) => (
              <TableRow key={connection.connectionId}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {connection.name}
                    {testResultBadge(connection)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {connection.dbmsType}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {connection.host}:{connection.port}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {connection.databaseName}
                  {connection.dbmsType === 'postgresql' && connection.schemaName ? (
                    <span className="text-muted-foreground"> · {connection.schemaName}</span>
                  ) : null}
                </TableCell>
                <TableCell>{connection.username}</TableCell>
                <TableCell className="text-muted-foreground">
                  {connection.createdBy?.name ?? t('common.system')}
                  {' · '}
                  {formatDate(connection.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(connection)}
                      disabled={testingId === connection.connectionId}
                      aria-label={t('connection.test.button', { name: connection.name })}
                    >
                      {testingId === connection.connectionId ? (
                        <span className="text-xs">{t('connection.test.pending')}</span>
                      ) : (
                        <Database aria-hidden className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openReverse(connection.connectionId)}
                      aria-label={t('reverse.rowAction', { name: connection.name })}
                    >
                      <FileDown aria-hidden className="h-4 w-4" />
                    </Button>
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(connection)}
                        aria-label={t('connection.dialog.editTitle')}
                      >
                        <Pencil aria-hidden className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(connection)}
                        aria-label={t('connection.delete.title', { name: connection.name })}
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          illustration="workspace"
          title={t('connection.list.empty.title')}
          description={t('connection.list.empty.description')}
          action={
            canEdit ? (
              <Button type="button" size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                {t('connection.list.empty.cta')}
              </Button>
            ) : undefined
          }
        />
      )}

      <ConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        connection={editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('connection.delete.title', { name: deleting?.name ?? '' })}
        description={t('connection.delete.description', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
      <ReverseDialog
        open={reverseOpen}
        onOpenChange={setReverseOpen}
        workspaceId={workspaceId}
        presetConnectionId={reversePreset}
      />
    </div>
  )
}
