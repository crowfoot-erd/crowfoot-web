/**
 * DB 스키마 동기화 다이얼로그 — 원천 커넥션의 현재 스키마를 문서에 부분 반영 (05-editor/04-dbms-engineering.md §3.3)
 *
 * 서버는 스키마를 조회해 리버스와 같은 규칙의 content로 내릴 뿐(문서 생성 없음),
 * 비교·병합은 에디터가 한다 — "비교"는 현재 화면 문서와 diffSync로 차분 목록을 보여주고
 * "적용"은 적용 시점 문서로 다시 diff해 commitAll(되돌리기 1회)로 반영한다. 이후 저장은
 * 기존 자동저장 파이프라인(낙관적 잠금·협업 전파)이 그대로 담당한다.
 * 색상·위치·메모 등 문서 전용 속성은 유지된다(sync-merge 보존 규칙).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
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
import { useConnectionSchema, useConnections } from '@/features/connections/hooks'
import { parseContent } from '@/features/editor/model/content-io'
import { diffSync, type SyncDiff, type SyncDiffItem } from '@/features/editor/model/sync-merge'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { errorMessage } from '@/lib/result-code'
import type { EditorDocument } from '@/features/editor/model/content-schema'

export interface SyncDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** 문서명 — 안내 문구 */
  modelName: string
  /** 리버스 생성 시점 원천 커넥션 — 이 커넥션의 스키마와 비교한다 */
  sourceConnectionId: string
}

export function SyncDialog({
  open,
  onOpenChange,
  workspaceId,
  modelName,
  sourceConnectionId,
}: SyncDialogProps) {
  const { t } = useTranslation()
  const connections = useConnections(workspaceId)
  const connection = (connections.data?.items ?? []).find(
    (item) => item.connectionId === sourceConnectionId,
  )
  const dirty = useEditorStore((s) => s.past.length !== s.savedDepth)
  const commitAll = useEditorStore((s) => s.commitAll)
  const schema = useConnectionSchema(workspaceId)

  const [diff, setDiff] = useState<SyncDiff | null>(null)
  // 비교 결과의 원천 — 적용은 재조회 없이 이 문서 기준으로 재 diff한다(고정점)
  const dbRef = useRef<EditorDocument | null>(null)

  // 닫을 때 결과를 비운다 — 다시 열면 항상 새 비교부터
  const resetSchema = schema.reset
  useEffect(() => {
    if (open) return
    setDiff(null)
    dbRef.current = null
    resetSchema()
  }, [open, resetSchema])

  const compare = async () => {
    try {
      const result = await schema.mutateAsync(sourceConnectionId)
      if (!result) return // 실패는 예외로 오른다 — 정상 응답은 항상 response를 싣는다
      const parsed = parseContent(result.content)
      const db: EditorDocument = { model: parsed.model, diagram: parsed.diagram }
      dbRef.current = db
      // 비교 기준은 화면의 현재 문서 — 저장되지 않은 편집도 포함된다
      setDiff(diffSync(useEditorStore.getState().present, db))
      if (result.skipped.length > 0) {
        toast.warning(t('model.editor.sync.skippedWarning', { items: result.skipped.join(', ') }))
      }
    } catch {
      // 오류 표시는 mutation 상태(isError)로 한다
    }
  }

  const apply = () => {
    const db = dbRef.current
    if (!db) return
    // 적용 시점 문서로 다시 diff — 미리보기 후 편집이 끼어도 정확하게 반영된다
    const fresh = diffSync(useEditorStore.getState().present, db)
    if (fresh.changes.length === 0) {
      setDiff(fresh) // 이미 동기화된 상태 — 빈 결과로 갱신해 안내
      return
    }
    commitAll(fresh.changes) // 묶음 커밋 — 되돌리기 1회로 전체 복구
    toast.success(t('model.editor.sync.applied'))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('model.editor.sync.title')}</DialogTitle>
          <DialogDescription>
            {t('model.editor.sync.description', {
              model: modelName,
              connection: connection?.name ?? sourceConnectionId,
            })}
          </DialogDescription>
        </DialogHeader>

        {connection ? (
          <p className="font-mono text-xs text-muted-foreground">
            {connection.username}@{connection.host}:{connection.port}/{connection.databaseName}
          </p>
        ) : null}

        <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-xs text-foreground">
          <p className="flex items-start gap-1.5">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            {t('model.editor.sync.preserveNote')}
          </p>
        </div>

        {dirty ? (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle aria-hidden className="size-3.5" />
            {t('model.editor.sync.dirtyNote')}
          </p>
        ) : null}

        {schema.isPending ? (
          <div className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('model.editor.sync.comparing')}
          </div>
        ) : schema.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/[0.07] px-3 py-2 text-xs text-foreground">
            <p>{t('model.editor.sync.compareFailed')}</p>
            <p className="mt-1 break-all text-muted-foreground">{errorMessage(schema.error)}</p>
          </div>
        ) : diff === null ? null : diff.changes.length === 0 ? (
          <p
            data-testid="sync-no-changes"
            className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"
          >
            <CheckCircle2 aria-hidden className="size-4" />
            {t('model.editor.sync.noChanges')}
          </p>
        ) : (
          <DiffPreview diff={diff} />
        )}

        <DialogFooter>
          {diff && diff.changes.length > 0 ? (
            <Button type="button" onClick={apply} disabled={schema.isPending} data-testid="sync-apply">
              <RefreshCw aria-hidden className="size-4" />
              {t('model.editor.sync.apply')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => void compare()}
            disabled={schema.isPending || connection === undefined}
            data-testid="sync-compare"
          >
            {schema.isPending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden className="size-4" />
            )}
            {schema.isPending ? t('model.editor.sync.comparing') : t('model.editor.sync.compare')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 차분 미리보기 — 개수 요약 + 테이블별 그룹 목록(그룹 내 순서는 diff 생성 순서 = 적용 순서) */
function DiffPreview({ diff }: { diff: SyncDiff }) {
  const { t } = useTranslation()

  const counts = useMemo(() => {
    let add = 0
    let update = 0
    let remove = 0
    for (const item of diff.summary.items) {
      if (item.action === 'add') add += 1
      else if (item.action === 'update') update += 1
      else remove += 1
    }
    return { add, update, remove }
  }, [diff])

  const groups = useMemo(() => {
    const map = new Map<string, SyncDiffItem[]>()
    for (const item of diff.summary.items) {
      const list = map.get(item.table)
      if (list) list.push(item)
      else map.set(item.table, [item])
    }
    return [...map.entries()]
  }, [diff])

  return (
    <div className="grid gap-2">
      <p data-testid="sync-counts" className="text-xs text-muted-foreground">
        {t('model.editor.sync.counts', counts)}
      </p>
      <ul data-testid="sync-diff-list" className="max-h-72 overflow-auto rounded-md border">
        {groups.map(([table, items]) => (
          <li key={table} className="border-b last:border-b-0">
            <p className="border-b bg-muted/40 px-3 py-1 font-mono text-xs font-medium">{table}</p>
            <ul>
              {items.map((item, index) => (
                <li key={index} className="flex items-baseline gap-1.5 px-3 py-1 text-xs">
                  <ActionMarker action={item.action} />
                  <span className="shrink-0">
                    {t(`model.editor.sync.kind.${item.kind}`)} {t(`model.editor.sync.action.${item.action}`)}
                  </span>
                  <span className="truncate font-mono">{item.name}</span>
                  {item.action === 'update' && item.detail ? (
                    <span className="truncate text-muted-foreground">— {item.detail}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 항목 행 마커 — [+]/[~]/[-] */
function ActionMarker({ action }: { action: SyncDiffItem['action'] }) {
  const label = { add: '+', update: '~', remove: '−' }[action]
  const tone =
    action === 'add'
      ? 'text-emerald-600 dark:text-emerald-400'
      : action === 'update'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-destructive'
  return (
    <span aria-hidden className={`w-3 shrink-0 text-center font-mono font-semibold ${tone}`}>
      {label}
    </span>
  )
}
