/**
 * 버전 기록 다이얼로그 — 문서의 저장 이력(§1.11). 저장마다 남는 스냅샷을 최신순으로 보여준다.
 *
 * 행은 "v{n} · 일시 · 작성자"와 함께 메모(사용자 자유 메모, 있으면 우선) 또는 자동 변경
 * 요약(changeSummary — doc-diff 구조 diff·리버스·복원 특수형)을 렌더한다. 렌더 문구는
 * 클라이언트 i18n이 맡는다 — 요약 본문은 언어 중립 JSON으로 서버에 저장되기 때문.
 * 행별 동작: 조회(버전 뷰어 새 창)·메모 편집(Editor+ 인라인, 비우면 삭제).
 * 현재 버전(스토어 baseVersion)에는 배지를 붙인다 — 편집 중 저장이 반영된 값이다.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Loader2, PencilLine } from 'lucide-react'
import { toast } from 'sonner'

import type { ChangeSummary, ModelVersionEntry } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'
import { modelVersionPath, useModelVersions, usePatchModelVersionMemo } from '@/features/models'
import { useEditorStore } from '@/features/editor/store/editor-store'

export interface VersionHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  modelId: string
  /** 문서명 — 안내 문구 */
  modelName: string
  /** 메모 편집 권한 — Editor 이상 (조회는 Viewer도 가능) */
  canEdit: boolean
}

/** changeSummary 원문 → 파싱된 요약. 파싱에 실패하면 null(렌더 생략 — 미래 계약 대비) */
function parseSummary(raw: string | null): ChangeSummary | null {
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw) as ChangeSummary
    if (parsed && typeof parsed === 'object' && ('created' in parsed || 'restoredFrom' in parsed || 'items' in parsed)) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  workspaceId,
  modelId,
  modelName,
  canEdit,
}: VersionHistoryDialogProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  // 현재 문서 버전 — 편집기 기준(세션 중 저장이 반영된다). 모델 메타 version이 아니다
  const currentVersion = useEditorStore((s) => s.baseVersion)
  const versions = useModelVersions(workspaceId, modelId, page, open)
  const memoMutation = usePatchModelVersionMemo(workspaceId, modelId)

  // 인라인 메모 편집 상태 — 행 버전 번호로 편집 대상을 가린다
  const [editing, setEditing] = useState<number | null>(null)
  const [memoDraft, setMemoDraft] = useState('')

  // 닫을 때 상태 초기화 — 다시 열면 1페이지·새 목록부터
  useEffect(() => {
    if (open) return
    setPage(1)
    setEditing(null)
    setMemoDraft('')
  }, [open])

  const beginEdit = (entry: ModelVersionEntry) => {
    setEditing(entry.version)
    setMemoDraft(entry.memo ?? '')
  }

  const saveMemo = (version: number) => {
    // 빈 문자열은 서버 계약상 삭제(null) — 메모 없는 행은 요약만 남는다
    memoMutation.mutate(
      { version, memo: memoDraft.trim() === '' ? null : memoDraft },
      {
        onSuccess: () => {
          toast.success(t('model.editor.history.memoSaved'))
          setEditing(null)
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const data = versions.data

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('model.editor.history.title')}</DialogTitle>
          <DialogDescription>
            {t('model.editor.history.description', { model: modelName })}
          </DialogDescription>
        </DialogHeader>

        {versions.isPending ? (
          <div className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : versions.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/[0.07] px-3 py-2 text-xs text-foreground">
            <p>{t('model.editor.history.loadFailed')}</p>
            <p className="mt-1 break-all text-muted-foreground">{errorMessage(versions.error)}</p>
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('model.editor.history.empty')}
          </p>
        ) : (
          <ul data-testid="version-history-list" className="max-h-96 divide-y overflow-auto rounded-md border">
            {data.items.map((entry) => (
              <li key={entry.version} className="px-3 py-2" data-version={entry.version}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-semibold">v{entry.version}</span>
                  {entry.version === currentVersion ? (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {t('model.editor.history.current')}
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-muted-foreground">
                    {[
                      entry.createdBy?.name ?? t('common.system'),
                      formatDateTime(entry.createdAt),
                    ].join(' · ')}
                  </span>
                </div>

                {editing === entry.version ? (
                  <div className="mt-1.5 grid gap-1.5">
                    <Textarea
                      value={memoDraft}
                      onChange={(e) => setMemoDraft(e.target.value)}
                      maxLength={500}
                      aria-label={t('model.editor.history.editMemo')}
                      placeholder={t('model.editor.history.memoPlaceholder')}
                      className="min-h-16 text-xs"
                    />
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7"
                        onClick={() => saveMemo(entry.version)}
                        disabled={memoMutation.isPending}
                      >
                        {t('model.editor.history.saveMemo')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => setEditing(null)}
                        disabled={memoMutation.isPending}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {entry.memo ? (
                      <p className="mt-1 text-xs font-medium">{entry.memo}</p>
                    ) : null}
                    <ChangeSummaryView raw={entry.changeSummary} memoShown={entry.memo != null} />
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Button asChild type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
                        <a href={modelVersionPath(workspaceId, modelId, entry.version)} target="_blank" rel="noreferrer">
                          {t('model.editor.history.view')}
                          <ExternalLink aria-hidden className="size-3" />
                        </a>
                      </Button>
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => beginEdit(entry)}
                        >
                          <PencilLine aria-hidden className="size-3" />
                          {t('model.editor.history.editMemo')}
                        </Button>
                      ) : null}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {data && data.totalPages > 1 ? (
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || versions.isFetching}
            >
              {t('common.pagination.prev')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('common.pagination.page', { page: data.page, totalPages: data.totalPages })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages || versions.isFetching}
            >
              {t('common.pagination.next')}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** 자동 변경 요약 렌더 — null(직접 생성)·특수형(리버스·복원)은 한 줄, 구조 diff는 개수 요약 + 항목 목록 */
function ChangeSummaryView({ raw, memoShown }: { raw: string | null; memoShown: boolean }) {
  const { t } = useTranslation()
  const summary = parseSummary(raw)

  if (summary == null && !memoShown) {
    // 요약도 메모도 없는 저장 — 직접 생성 v0
    return <p className="mt-1 text-xs text-muted-foreground">{t('model.editor.history.render.created')}</p>
  }
  if (summary == null) return null // 메모가 이미 행을 설명한다 — 요약 없음(직접 생성)
  if ('created' in summary) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {t('model.editor.history.render.reverseCreated', {
          tables: summary.tables,
          relationships: summary.relationships,
        })}
      </p>
    )
  }
  if ('restoredFrom' in summary) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {t('model.editor.history.render.restoredFrom', { version: summary.restoredFrom })
        }
      </p>
    )
  }

  const counts: Record<string, number> = { add: 0, update: 0, remove: 0, move: 0 }
  for (const item of summary.items) counts[item.action] += 1

  return (
    <div className="mt-1">
      <p className="text-xs text-muted-foreground">
        {summary.layoutOnly
          ? t('model.editor.history.render.layoutOnly')
          : t('model.editor.history.render.counts', counts)}
        {summary.truncated ? ` · ${t('model.editor.history.render.truncated')}` : null}
      </p>
      <ul className="mt-1 grid gap-0.5">
        {summary.items.map((item, index) => (
          <li key={index} className="flex items-baseline gap-1.5 text-xs">
            <ActionMarker action={item.action} />
            <span className="shrink-0">
              {t(`model.editor.history.kind.${item.kind}`)}{' '}
              {t(`model.editor.history.action.${item.action}`)}
            </span>
            <span className="truncate font-mono">
              {item.table ? `${item.table}.` : ''}
              {item.name}
            </span>
            {item.detail ? (
              <span className="truncate text-muted-foreground">— {item.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 항목 행 마커 — [+]/[~]/[−]/[→] (SyncDialog 표기 관례) */
function ActionMarker({ action }: { action: string }) {
  const label = { add: '+', update: '~', remove: '−', move: '→' }[action] ?? '·'
  const tone =
    action === 'add'
      ? 'text-emerald-600 dark:text-emerald-400'
      : action === 'update'
        ? 'text-amber-600 dark:text-amber-400'
        : action === 'remove'
          ? 'text-destructive'
          : 'text-muted-foreground'
  return (
    <span aria-hidden className={`w-3 shrink-0 text-center font-mono font-semibold ${tone}`}>
      {label}
    </span>
  )
}
