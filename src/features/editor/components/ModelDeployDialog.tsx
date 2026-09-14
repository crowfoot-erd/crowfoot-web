/**
 * 포워드 엔지니어링 배포 다이얼로그 — 생성된 DDL을 워크스페이스 커넥션 DB에 실행 (05-editor/04-dbms-engineering.md §3.1)
 *
 * 대상은 문서 DBMS와 같은 dbmsType의 커넥션만 노출한다(방언이 다르면 서버가 거부).
 * 실행은 문장별 — 한 문장이 실패해도 나머지를 실행하고 성공/실패를 문장 단위로
 * 보고한다(부분 실패 리포트). SQL 미리보기(§1.7) 푸터에서 열며, 편집 권한(Editor
 * 이상)이 있는 문서에서만 노출한다.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, Rocket, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchConnections } from '@/features/connections/api'
import { useDeployModel } from '@/features/editor/hooks'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { errorMessage } from '@/lib/result-code'

export interface ModelDeployDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** 문서명 — 안내 문구 */
  modelName: string
  /** 문서 생성 시점 DBMS 코드(postgresql 등) — 같은 dbmsType 커넥션만 노출 */
  databaseType: string
}

export function ModelDeployDialog({
  open,
  onOpenChange,
  workspaceId,
  modelName,
  databaseType,
}: ModelDeployDialogProps) {
  const { t } = useTranslation()
  const modelId = useEditorStore((s) => s.modelId)
  const [connectionId, setConnectionId] = useState('')
  const deploy = useDeployModel(workspaceId)
  const result = deploy.data

  const connections = useQuery({
    queryKey: ['workspaces', workspaceId, 'connections'],
    queryFn: ({ signal }) => fetchConnections(workspaceId, signal),
    enabled: open,
  })

  // 같은 DBMS 커넥션만 — 방언이 다르면 서버가 400으로 거부한다
  const matching = (connections.data?.items ?? []).filter(
    (connection) => connection.dbmsType === databaseType,
  )

  // 목록 도착 후 기본 선택 — 열 때마다 재판정한다(다이얼로그 폼 관례: 상태 초기화 시점과 무관하게)
  useEffect(() => {
    if (!open) return
    setConnectionId((current) => {
      if (matching.length === 0) return ''
      return matching.some((connection) => connection.connectionId === current)
        ? current
        : matching[0].connectionId
    })
  }, [open, matching])

  const run = () => {
    if (modelId === null || connectionId === '') return
    deploy.mutate({ modelId, connectionId })
  }

  const selected = matching.find((connection) => connection.connectionId === connectionId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('model.editor.deploy.title')}</DialogTitle>
          <DialogDescription>
            {t('model.editor.deploy.description', { model: modelName })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-xs text-foreground">
          <p className="flex items-start gap-1.5">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            {t('model.editor.deploy.warning')}
          </p>
        </div>

        {connections.isPending ? (
          <div className="flex h-16 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : matching.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('model.editor.deploy.noMatchingConnection', { dbms: databaseType })}
          </p>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="deploy-connection">{t('model.editor.deploy.connection')}</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger id="deploy-connection" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matching.map((connection) => (
                  <SelectItem key={connection.connectionId} value={connection.connectionId}>
                    {connection.name} ({connection.host}:{connection.port}/{connection.databaseName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                {selected.username}@{selected.host}:{selected.port}/{selected.databaseName}
              </p>
            ) : null}
          </div>
        )}

        {deploy.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/[0.07] px-3 py-2 text-xs text-foreground">
            {errorMessage(deploy.error)}
          </div>
        ) : null}

        {result ? (
          <div data-testid="deploy-result" className="grid gap-2">
            <p
              className={`flex items-center gap-1.5 text-sm font-medium ${
                result.failedCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
              }`}
            >
              {result.failedCount > 0 ? (
                <AlertTriangle aria-hidden className="size-4" />
              ) : (
                <CheckCircle2 aria-hidden className="size-4" />
              )}
              {t('model.editor.deploy.summary', {
                total: result.statements.length,
                executed: result.executedCount,
                failed: result.failedCount,
              })}
            </p>
            <ul className="max-h-56 overflow-auto rounded-md border">
              {result.statements.map((statement, index) => (
                <li
                  key={index}
                  className="grid gap-0.5 border-b px-3 py-1.5 last:border-b-0 text-xs"
                >
                  <span className="flex items-start gap-1.5 font-mono">
                    {statement.ok ? (
                      <CheckCircle2
                        aria-hidden
                        className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      />
                    ) : (
                      <XCircle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    )}
                    <span className="break-all">{firstLine(statement.sql)}</span>
                  </span>
                  {!statement.ok && statement.error ? (
                    <span className="pl-5 break-all text-destructive">{statement.error}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            onClick={run}
            disabled={deploy.isPending || connectionId === '' || modelId === null}
          >
            {deploy.isPending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Rocket aria-hidden className="size-4" />
            )}
            {deploy.isPending ? t('model.editor.deploy.running') : t('model.editor.deploy.run')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 문장의 첫 줄 — 나머지 줄은 접어 결과 목록을 한눈에 보이게 한다 */
function firstLine(sql: string): string {
  const newline = sql.indexOf('\n')
  return newline === -1 ? sql : `${sql.slice(0, newline)} …`
}
