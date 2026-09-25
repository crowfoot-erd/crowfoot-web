/**
 * SQL 스크립트 미리보기 다이얼로그 — 문서를 대상 DBMS 방언의 DDL로 생성 (05-editor/04-dbms-engineering.md §3.1)
 *
 * 생성은 core-api DDL API(08-core/02-model.md §1.7)에 맡긴다 — 방언·타입 매핑의
 * 원천이 서버에 있고, 미리보기는 마지막 저장 본문 기준이다. 저장되지 않은 편집이
 * 있으면 안내해 차이를 명확히 한다(자동 저장 debounce 2s).
 * 읽기 전용 코드 뷰 + 클립보드 복사 + .sql 파일 다운로드. 경고(공용 방언 폴백·검증
 * 오류·빈 테이블)는 스크립트 앞에 먼저 표시한다(§3.1). 읽기 전용 문서에서도 생성할
 * 수 있다 — 내보내기는 편집이 아니다. 배포(§1.8)는 편집 권한이 있을 때만 노출한다.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Copy, Database, Download, Loader2, Lock, RefreshCw, Rocket } from 'lucide-react'
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
import { dbmsTemplate } from '@/features/editor/model/dbms'
import { useModelDdl } from '@/features/editor/hooks'
import { selectDirty, useEditorStore } from '@/features/editor/store/editor-store'
import { downloadTextFile, safeFilename } from '@/lib/download'
import { ModelDeployDialog } from './ModelDeployDialog'

export interface SqlPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** 문서명 — 다운로드 파일명 */
  modelName: string
  /** templateIdForDatabase 파생값 — 문서 생성 시점 DBMS */
  dbmsId: string
  /** 문서 생성 시점 DBMS 코드 — 배포 대상 커넥션 필터 */
  databaseType: string
  /** 편집 권한 — 배포는 Editor 이상 */
  canEdit: boolean
}

/** 클립보드 복사 — 비보환 컨텍스트(비HTTPS 등)는 임시 textarea 폴백 */
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

export function SqlPreviewDialog({
  open,
  onOpenChange,
  workspaceId,
  modelName,
  dbmsId,
  databaseType,
  canEdit,
}: SqlPreviewDialogProps) {
  const { t } = useTranslation()
  const modelId = useEditorStore((s) => s.modelId)
  const dirty = useEditorStore(selectDirty)
  const template = dbmsTemplate(dbmsId)
  const ddl = useModelDdl(workspaceId, modelId, open)
  const result = ddl.data
  const [deployOpen, setDeployOpen] = useState(false)

  const copy = async () => {
    if (result && (await copyText(result.sql))) {
      toast.success(t('model.editor.ddl.copied'))
    } else {
      toast.error(t('model.editor.ddl.copyFailed'))
    }
  }

  const download = () => {
    if (result) downloadTextFile(`${safeFilename(modelName)}.sql`, result.sql)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('model.editor.ddl.title')}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1">
            <span className="flex items-center gap-1">
              <Database aria-hidden className="size-3.5" />
              {modelName}
            </span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1">
              <Lock aria-hidden className="size-3" />
              {template.id === 'common' ? t('model.editor.dbms.common') : template.label}
            </span>
            {result ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  {t('model.editor.ddl.tableCount', {
                    tables: result.tableCount,
                    relationships: result.relationshipCount,
                  })}
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {ddl.isPending ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('model.editor.ddl.loading')}
          </div>
        ) : ddl.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/[0.07] px-3 py-2 text-xs text-foreground">
            <p>{t('model.editor.ddl.error')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-7 gap-1 px-2"
              onClick={() => void ddl.refetch()}
            >
              <RefreshCw aria-hidden className="size-3.5" />
              {t('common.retry')}
            </Button>
          </div>
        ) : result ? (
          <>
            {result.warnings.length > 0 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-xs text-foreground">
                <p className="font-medium">{t('model.editor.ddl.warningTitle')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {result.warnings.map((warning, index) => (
                    <li key={index}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {dirty ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle aria-hidden className="size-3.5" />
                {t('model.editor.ddl.unsavedNote')}
              </p>
            ) : null}

            <pre
              data-testid="ddl-script"
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
          {canEdit ? (
            <Button type="button" size="sm" onClick={() => setDeployOpen(true)} disabled={!result}>
              <Rocket aria-hidden className="size-3.5" />
              {t('model.editor.deploy.button')}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ModelDeployDialog
        open={deployOpen}
        onOpenChange={setDeployOpen}
        workspaceId={workspaceId}
        modelName={modelName}
        databaseType={databaseType}
      />
    </Dialog>
  )
}
