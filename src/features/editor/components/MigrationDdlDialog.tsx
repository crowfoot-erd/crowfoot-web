/**
 * 마이그레이션 DDL 다이얼로그 (08-core/02-model.md §1.7.1 — 05-editor/04-dbms-engineering.md §3.3)
 *
 * 두 스냅샷의 차이를 ALTER 문으로 생성해 보여준다 — 복사·다운로드만 제공하고 실행은
 * 범위 밖(생성 전용 계약). 배포 버튼이 없는 것이 SqlPreviewDialog(§1.7)와 다른 점이다.
 * mode로 두 경로를 공용화한다: version(버전 A→B — 비교 뷰 헤더)·connection(문서↔실제
 * DB — SyncDialog 푸터, Editor+). 경고는 서버 코드(DESTRUCTIVE·NOT_INTROSPECTED·…)를
 * 그대로 내려오니 파괴 여부에 따라 톤을 갈라 꾸민다.
 */
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Copy, Download, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useConnectionMigrationDdl,
  useVersionMigrationDdl,
} from '@/features/editor/hooks'
import { downloadTextFile, safeFilename } from '@/lib/download'

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

export function MigrationDdlDialog({ open, onOpenChange, modelName, mode }: MigrationDdlDialogProps) {
  const { t } = useTranslation()
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

  const title =
    mode.kind === 'version'
      ? t('model.editor.migration.titleVersion', { from: mode.from, to: mode.to })
      : t('model.editor.migration.titleConnection')
  const hasDestructive = result?.warnings.some((warning) => warning.code === DESTRUCTIVE_CODE) ?? false

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

            <pre
              data-testid="migration-ddl-script"
              className="max-h-[60vh] overflow-auto whitespace-pre rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed"
            >
              {result.sql}
            </pre>
          </>
        ) : null}

        <DialogFooter>
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
    </Dialog>
  )
}
