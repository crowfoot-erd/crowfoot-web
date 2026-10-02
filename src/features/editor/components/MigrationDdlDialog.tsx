/**
 * 마이그레이션 DDL 다이얼로그 (08-core/02-model.md §1.7.1·§1.15 — 05-editor/04-dbms-engineering.md §3.3)
 *
 * 두 스냅샷의 차이를 ALTER 문으로 생성해 보여준다 — 복사·다운로드로 검토한다.
 * mode로 두 경로를 공용화한다: version(버전 A→B — 비교 뷰 헤더, 생성 전용)·
 * connection(문서↔실제 DB — SyncDialog 푸터, Editor+). connection 모드는 푸터의
 * 반영 버튼으로 차분을 연결된 DB에 실행한다(§1.15): 경고 확인 다이얼로그를 거쳐
 * 서버가 실행 시점에 재계산한 문장을 문장별 결과로 보여준다. 경고는 서버 코드
 * (DESTRUCTIVE·NOT_INTROSPECTED·…)를 그대로 내려오니 파괴 여부에 따라 톤을 갈라 꾸민다.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Copy, Download, Loader2, RefreshCw, Rocket, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useApplyConnectionMigration,
  useConnectionMigrationDdl,
  useVersionMigrationDdl,
} from '@/features/editor/hooks'
import { downloadTextFile, safeFilename } from '@/lib/download'
import { errorMessage } from '@/lib/result-code'

/** 파괴적 연산 경고 코드 — destructive 톤으로 꾸민다 (서버 Warning.DESTRUCTIVE) */
const DESTRUCTIVE_CODE = 'DESTRUCTIVE'

export type MigrationDdlMode =
  | { kind: 'version'; workspaceId: string; modelId: string; from: number; to: number }
  | { kind: 'connection'; workspaceId: string; modelId: string; connectionId: string }

export interface MigrationDdlDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 문서명 — 다운로드 파일명 */
  modelName: string
  mode: MigrationDdlMode
  /** 커넥션명(connection 모드) — 반영 확인 문구의 대상 표기. 없으면 ID로 폴백 */
  connectionName?: string
}

/** 클립보드 복사 — 비보환 컨텍스트는 임시 textarea 폴백 (SqlPreviewDialog 관례) */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

export function MigrationDdlDialog({
  open,
  onOpenChange,
  modelName,
  mode,
  connectionName,
}: MigrationDdlDialogProps) {
  const { t } = useTranslation()
  // 반영 확인 다이얼로그 — 파괴적 문장 포함 시 destructive 강조(사용자 요청: 실행 전 경고)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // 삭제 문장(테이블·컬럼 삭제 등)은 따로 켰을 때만 실행한다 — 기본은 추가와 변경만(§1.15)
  const [includeDestructive, setIncludeDestructive] = useState(false)
  const versionQuery = useVersionMigrationDdl(
    mode.kind === 'version' ? mode.workspaceId : '',
    mode.kind === 'version' ? mode.modelId : '',
    mode.kind === 'version' ? mode.from : -1,
    mode.kind === 'version' ? mode.to : -1,
    open && mode.kind === 'version',
  )
  const connectionQuery = useConnectionMigrationDdl(
    mode.kind === 'connection' ? mode.workspaceId : '',
    mode.kind === 'connection' ? mode.modelId : '',
    mode.kind === 'connection' ? mode.connectionId : '',
    open && mode.kind === 'connection',
  )
  const query = mode.kind === 'version' ? versionQuery : connectionQuery
  const result = query.data
  const apply = useApplyConnectionMigration(mode.kind === 'connection' ? mode.workspaceId : '')
  const applyResult = mode.kind === 'connection' ? apply.data : undefined

  const copy = async () => {
    if (result && (await copyText(result.sql))) {
      toast.success(t('model.editor.ddl.copied'))
    } else {
      toast.error(t('model.editor.ddl.copyFailed'))
    }
  }

  const download = () => {
    if (result) downloadTextFile(`${safeFilename(modelName)}-migration.sql`, result.sql)
  }

  /** 반영 실행 — 확인 다이얼로그의 확인 버튼. 성공하면 확인창을 닫고 결과 블록으로 전환한다 */
  const runApply = () => {
    if (mode.kind !== 'connection') return
    apply.mutate(
      { modelId: mode.modelId, connectionId: mode.connectionId, includeDestructive },
      {
        onSuccess: () => {
          setConfirmOpen(false)
          toast.success(t('model.editor.migration.applySuccess'))
        },
        onError: () => {
          setConfirmOpen(false) // 오류는 본문 안내로 — 확인창을 겹치지 않게 한다
        },
      },
    )
  }

  const title =
    mode.kind === 'version'
      ? t('model.editor.migration.titleVersion', { from: mode.from, to: mode.to })
      : t('model.editor.migration.titleConnection')
  const hasDestructive = result?.warnings.some((warning) => warning.code === DESTRUCTIVE_CODE) ?? false
  const destructiveStatements = result?.destructiveStatements ?? []
  /** 실행할 문장 수 — 삭제 문장을 켜지 않았으면 뺀다 */
  const runCount = (result?.statementCount ?? 0) - (includeDestructive ? 0 : destructiveStatements.length)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" data-testid="migration-ddl-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t('model.editor.migration.subtitle')}
            {result ? ` · ${t('model.editor.migration.statementCount', { count: result.statementCount })}` : ''}
          </DialogDescription>
        </DialogHeader>

        {query.isPending ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('model.editor.migration.loading')}
          </div>
        ) : query.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/[0.07] px-3 py-2 text-xs text-foreground">
            <p data-testid="migration-ddl-error">{t('model.editor.migration.error')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-7 gap-1 px-2"
              onClick={() => void query.refetch()}
            >
              <RefreshCw aria-hidden className="size-3.5" />
              {t('common.retry')}
            </Button>
          </div>
        ) : result ? (
          <>
            {result.warnings.length > 0 ? (
              <div
                data-testid="migration-ddl-warnings"
                data-destructive={hasDestructive ? 'true' : 'false'}
                className={
                  hasDestructive
                    ? 'rounded-md border border-destructive/50 bg-destructive/[0.08] px-3 py-2 text-xs text-foreground'
                    : 'rounded-md border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-xs text-foreground'
                }
              >
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle aria-hidden className="size-3.5" />
                  {t('model.editor.migration.warningTitle')}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {result.warnings.map((warning, index) => (
                    <li
                      key={index}
                      data-warning={warning.code}
                      className={warning.code === DESTRUCTIVE_CODE ? 'font-medium text-destructive' : undefined}
                    >
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {mode.kind === 'connection' && destructiveStatements.length > 0 ? (
              <div
                data-testid="migration-destructive"
                className="rounded-md border border-destructive/40 bg-destructive/[0.05] px-3 py-2 text-xs text-foreground"
              >
                <label className="flex cursor-pointer items-center gap-2 font-medium">
                  <Checkbox
                    data-testid="migration-include-destructive"
                    checked={includeDestructive}
                    onCheckedChange={(value) => setIncludeDestructive(value === true)}
                  />
                  {t('model.editor.migration.includeDestructive', { count: destructiveStatements.length })}
                </label>
                <p className="mt-1 text-muted-foreground">{t('model.editor.migration.destructiveHint')}</p>
                <ul className="mt-1.5 max-h-28 overflow-auto font-mono">
                  {destructiveStatements.map((statement, index) => (
                    <li key={index} className="break-all text-destructive">
                      {firstLine(statement)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <pre
              data-testid="migration-ddl-script"
              className="max-h-[60vh] overflow-auto whitespace-pre rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed"
            >
              {result.sql}
            </pre>
          </>
        ) : null}

        {apply.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/[0.07] px-3 py-2 text-xs text-foreground">
            {errorMessage(apply.error)}
          </div>
        ) : null}

        {applyResult ? (
          <div data-testid="migration-apply-result" className="grid gap-2">
            <p
              className={`flex items-center gap-1.5 text-sm font-medium ${
                applyResult.failedCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
              }`}
            >
              {applyResult.failedCount > 0 ? (
                <AlertTriangle aria-hidden className="size-4" />
              ) : (
                <CheckCircle2 aria-hidden className="size-4" />
              )}
              {t('model.editor.deploy.summary', {
                total: applyResult.statements.length,
                executed: applyResult.executedCount,
                failed: applyResult.failedCount,
              })}
            </p>
            {(applyResult.skippedDestructive ?? 0) > 0 ? (
              <p data-testid="migration-skipped" className="text-xs text-muted-foreground">
                {t('model.editor.migration.skipped', { count: applyResult.skippedDestructive })}
              </p>
            ) : null}
            <ul className="max-h-56 overflow-auto rounded-md border">
              {applyResult.statements.map((statement, index) => (
                <li key={index} className="grid gap-0.5 border-b px-3 py-1.5 text-xs last:border-b-0">
                  <span className="flex items-start gap-1.5 font-mono">
                    {statement.ok ? (
                      <CheckCircle2 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
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
          {mode.kind === 'connection' ? (
            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!result || apply.isPending || runCount <= 0}
              data-testid="migration-apply"
            >
              <Rocket aria-hidden className="size-3.5" />
              {t('model.editor.migration.apply')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()} disabled={!result}>
            <Copy aria-hidden className="size-3.5" />
            {t('model.editor.ddl.copy')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={download} disabled={!result}>
            <Download aria-hidden className="size-3.5" />
            {t('model.editor.ddl.download')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* 반영 확인(§1.15) — autocommit이라 되돌릴 수 없다. 파괴적 문장 포함 시 destructive 톤 */}
      {mode.kind === 'connection' ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('model.editor.migration.applyConfirmTitle')}
          description={
            t('model.editor.migration.applyConfirmDescription', {
              count: runCount,
              connection: connectionName ?? mode.connectionId,
            }) +
            (includeDestructive && destructiveStatements.length > 0
              ? ` ${t('model.editor.migration.applyConfirmDestructive', { count: destructiveStatements.length })}`
              : '')
          }
          confirmLabel={t('model.editor.migration.applyConfirm')}
          destructive={includeDestructive && destructiveStatements.length > 0}
          confirming={apply.isPending}
          onConfirm={runApply}
        />
      ) : null}
    </Dialog>
  )
}

/** 문장의 첫 줄 — ModelDeployDialog와 같은 규칙(비공개 함수라 여기 복제 — copyText 중복 선례) */
function firstLine(sql: string): string {
  const newline = sql.indexOf('\n')
  return newline === -1 ? sql : `${sql.slice(0, newline)} …`
}
