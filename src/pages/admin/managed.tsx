/**
 * 매니지드 DB 인스턴스 관리 (08-core/07 §3.2~3.4 — 관리자 화면)
 *
 * - 발급 한도(워크스페이스 내 사용자당) 인라인 지정 — 기본 5, 1~100
 * - 표시명은 readonly 표시(편집은 다이얼로그), 활성 토글 즉시 PATCH
 * - 행별 연결 테스트(저장된 자격으로 SELECT 1 — 결과는 토스트)
 * - 등록·자격 편집은 다이얼로그(등록·변경 시 서버가 접속 검증)
 * - 삭제 — 발급이 남아 있으면 409로 거부된다(안내 문구)
 */
import { useEffect, useState } from 'react'
import { Cable, Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import type { ManagedInstance } from '@/api/types'
import {
  useDeleteManagedInstance,
  useManagedInstances,
  useManagedIssueLimit,
  useTestManagedInstance,
  useUpdateManagedInstance,
  useUpdateManagedIssueLimit,
} from '@/features/managed/hooks'
import { InstanceDialog } from '@/features/managed/components/instance-dialog'
import { errorMessage } from '@/lib/result-code'

/** 발급 한도 인라인 편집 — 관리자 지정값(1~100, 설정 없으면 기본 5). dirty일 때만 저장 버튼 */
function IssueLimitEditor({
  limit,
  saving,
  onSave,
}: {
  limit: number | undefined
  saving: boolean
  onSave: (limit: number) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  // 조회 값이 늦게 오면 폼에 반영한다(저장 후에도 서버 값으로 동기화)
  useEffect(() => {
    if (typeof limit === 'number') setValue(String(limit))
  }, [limit])

  const parsed = Number(value)
  const dirty = value !== '' && Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 && parsed !== limit

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-muted-foreground">{t('admin.managed.issueLimitLabel')}</span>
      <Input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={t('admin.managed.issueLimitLabel')}
        className="h-8 w-16 text-right"
        disabled={saving}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t('common.save')}
        disabled={!dirty || saving}
        onClick={() => onSave(parsed)}
      >
        <Check aria-hidden />
      </Button>
    </div>
  )
}

export function AdminManagedPage() {
  const { t } = useTranslation()
  const instances = useManagedInstances()
  const issueLimit = useManagedIssueLimit()
  const updateMutation = useUpdateManagedInstance()
  const limitMutation = useUpdateManagedIssueLimit()
  const deleteMutation = useDeleteManagedInstance()
  const testMutation = useTestManagedInstance()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedInstance | null>(null)
  const [deleting, setDeleting] = useState<ManagedInstance | null>(null)

  const items = instances.data?.items ?? []

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (instance: ManagedInstance) => {
    setEditing(instance)
    setDialogOpen(true)
  }

  /** 토글 = 즉시 PATCH (되돌릴 수 있으므로 확인 없음) */
  const patch = (instanceId: string, body: Record<string, unknown>) => {
    updateMutation.mutate(
      { instanceId, body },
      {
        onSuccess: () => toast.success(t('admin.managed.savedToast')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  /** 발급 한도 지정 — 즉시 다음 발급부터 적용된다 */
  const saveLimit = (limit: number) => {
    limitMutation.mutate(limit, {
      onSuccess: (result) =>
        toast.success(t('admin.managed.limitSavedToast', { limit: result?.limit ?? limit })),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  /** 연결 테스트 — 실패도 계약 응답(200)이라 onSuccess에서 갈라 처리한다 */
  const runTest = (instance: ManagedInstance) => {
    testMutation.mutate(instance.instanceId, {
      onSuccess: (result) => {
        if (result?.connected) {
          toast.success(t('admin.managed.testSuccess', { ms: result.latencyMs }))
        } else {
          toast.error(result?.message ?? t('admin.managed.testFail'))
        }
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const handleDelete = () => {
    if (!deleting) return
    deleteMutation.mutate(deleting.instanceId, {
      onSuccess: () => {
        setDeleting(null)
        toast.success(t('admin.managed.delete.successToast'))
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('admin.managed.title')}</h1>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{t('admin.managed.cardTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('admin.managed.notice')}</p>
          </div>
          <div className="flex items-center gap-3">
            <IssueLimitEditor
              limit={issueLimit.data?.limit}
              saving={limitMutation.isPending}
              onSave={saveLimit}
            />
            <Button type="button" variant="outline" size="sm" onClick={openCreate}>
              <Plus aria-hidden />
              {t('admin.managed.newInstance')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {instances.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : instances.isError ? (
            <div className="p-4">
              <ErrorState onRetry={() => void instances.refetch()} />
            </div>
          ) : items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.managed.table.displayName')}</TableHead>
                  <TableHead>{t('admin.managed.table.endpoint')}</TableHead>
                  <TableHead className="text-right">{t('admin.managed.table.issuedCount')}</TableHead>
                  <TableHead className="w-24 text-right">{t('admin.managed.table.active')}</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((instance) => (
                  <TableRow key={instance.instanceId}>
                    <TableCell>
                      {/* 표시명 — readonly 표시(편집은 다이얼로그) */}
                      <span className="inline-block rounded-md bg-muted/60 px-2 py-1 text-sm">
                        {instance.displayName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {/* 1차 주소는 사용자에게 노출되는 값(publicHost 폴백 host) — 다를 때만 내부 주소 보조 표기 */}
                        <span className="font-mono text-xs">
                          {instance.publicHost ?? instance.host}:{instance.port}
                          <span className="text-muted-foreground">
                            {' / '}
                            {instance.databaseName ?? t('admin.managed.databaseAuto')}
                          </span>
                        </span>
                        {instance.publicHost && instance.publicHost !== instance.host ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {t('admin.managed.table.internal')} {instance.host}:{instance.port}
                          </span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {instance.username} · {instance.dbmsType}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className="font-mono">
                        {instance.issuedCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={instance.isActive}
                        onCheckedChange={(checked) => patch(instance.instanceId, { isActive: checked })}
                        disabled={updateMutation.isPending}
                        aria-label={`${instance.displayName} ${t('admin.managed.table.active')}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => runTest(instance)}
                          aria-label={`${instance.displayName} ${t('admin.managed.test')}`}
                          title={t('admin.managed.test')}
                          disabled={testMutation.isPending}
                        >
                          <Cable aria-hidden className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(instance)}
                          aria-label={t('admin.managed.dialog.editTitle')}
                        >
                          <Pencil aria-hidden className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(instance)}
                          aria-label={t('admin.managed.delete.title', { name: instance.displayName })}
                        >
                          <Trash2 aria-hidden className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4">
              <EmptyState
                illustration="workspace"
                title={t('admin.managed.empty.title')}
                description={t('admin.managed.empty.description')}
                action={
                  <Button type="button" size="sm" onClick={openCreate}>
                    <Plus aria-hidden />
                    {t('admin.managed.newInstance')}
                  </Button>
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      <InstanceDialog open={dialogOpen} onOpenChange={setDialogOpen} instance={editing} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('admin.managed.delete.title', { name: deleting?.displayName ?? '' })}
        description={t('admin.managed.delete.description', { name: deleting?.displayName ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
