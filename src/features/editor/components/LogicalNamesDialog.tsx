/**
 * 논리명 자동 추론 다이얼로그 (05-editor/04-dbms-engineering.md §3.2 — v1.13)
 *
 * 리버스·SQL Import는 DB 코멘트 없는 객체의 논리명을 물리명과 같게 복제해 둔다.
 * 여기서 시스템 사전(내장) + 워크스페이스 표준 사전으로 그런 논리명을 채운다(미리보기 → 적용).
 * 추론은 사전의 소비자다 — 사전 편집은 용어 사전 패널(v1.14)이 맡고, 여기서는
 * '사전 관리'가 그 패널을 여는 액션(onManageDictionary)일 뿐이다.
 *
 * - 후보는 "논리명이 비었거나 물리명과 같은" 객체뿐 — 이미 있는 논리명(DB 코멘트)은
 *   건드리지 않는다(보존 규칙 §3.3과 같은 신호 구조라 DB 동기화와 충돌하지 않는다).
 * - 사전 조회 실패 시 시스템 사전만으로 계산하고 안내문을 띄운다.
 * - 적용은 클릭 시점에 문서와 사전을 다시 읽어 재계산한다(SyncDialog 고정점 패턴) —
 *   미리보기를 띄운 뒤 편집·사전 등록이 끼어도 결과가 어긋나지 않는다.
 * - 적용은 commitAll 한 덩어리 — undo 한 번으로 전체를 되돌린다.
 */
import { useMemo, useState } from 'react'
import { BookOpenText, ChevronRight, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWorkspaceTerms } from '@/features/terms/hooks'
import {
  buildTermMap,
  inferenceChanges,
  planLogicalNameInference,
  type InferenceEntry,
} from '@/features/editor/model/logical-name-inference'
import { useEditorStore } from '@/features/editor/store/editor-store'

export interface LogicalNamesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** '사전 관리' 클릭 — 용어 사전 패널을 여는 액션(셸이 소유). 다이얼로그는 닫힌다 */
  onManageDictionary: () => void
}

export function LogicalNamesDialog({
  open,
  onOpenChange,
  workspaceId,
  onManageDictionary,
}: LogicalNamesDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('model.editor.logicalNames.title')}</DialogTitle>
          <DialogDescription>{t('model.editor.logicalNames.description')}</DialogDescription>
        </DialogHeader>
        {open ? (
          <LogicalNamesBody
            workspaceId={workspaceId}
            onDone={() => onOpenChange(false)}
            onManageDictionary={() => {
              onManageDictionary()
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** 후보 행 키 — 같은 객체의 테이블/컬럼 행을 구분한다 */
function entryKey(entry: InferenceEntry): string {
  return `${entry.tableId}:${entry.columnId ?? '*'}`
}

function LogicalNamesBody({
  workspaceId,
  onDone,
  onManageDictionary,
}: {
  workspaceId: string
  onDone: () => void
  onManageDictionary: () => void
}) {
  const { t } = useTranslation()
  const terms = useWorkspaceTerms(workspaceId)
  // 해제한 행만 기억 — 기본 전체 선택이고, 사전 도착으로 늘어난 행도 자동 선택이다
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set())

  const present = useEditorStore((s) => s.present)
  const commitAll = useEditorStore((s) => s.commitAll)

  // 미리보기 — 문서·사전 변화를 그대로 반영하는 살아있는 계산
  const plan = useMemo(
    () => planLogicalNameInference(present, buildTermMap(terms.data?.items)),
    [present, terms.data],
  )

  // 테이블별 그룹 — 테이블 행(있으면) 먼저, 컬럼 행을 따라 붙인다
  const groups = useMemo(() => {
    const byTable = new Map<string, { tableName: string; entries: InferenceEntry[] }>()
    for (const entry of plan) {
      const group = byTable.get(entry.tableId) ?? {
        tableName: entry.tablePhysicalName,
        entries: [],
      }
      group.entries.push(entry)
      byTable.set(entry.tableId, group)
    }
    return [...byTable.values()].map((group) => ({
      ...group,
      // 테이블 자체 행(columnId === null)을 머리로, 컬럼 행을 몸통으로
      tableEntry: group.entries.find((entry) => entry.columnId === null) ?? null,
      columnEntries: group.entries.filter((entry) => entry.columnId !== null),
    }))
  }, [plan])

  const checkedCount = plan.filter((entry) => !unchecked.has(entryKey(entry))).length
  const toggle = (key: string) => {
    setUnchecked((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const apply = () => {
    // 고정점 — 클릭 시점의 문서·사전으로 다시 계산한다(미리보기 후 편집이 끼어도 정합)
    const freshDoc = useEditorStore.getState().present
    const freshTerms = terms.data?.items
    const freshPlan = planLogicalNameInference(freshDoc, buildTermMap(freshTerms)).filter(
      (entry) => !unchecked.has(entryKey(entry)),
    )
    if (freshPlan.length === 0) {
      toast.info(t('model.editor.logicalNames.nothingToApply'))
      return
    }
    commitAll(inferenceChanges(freshPlan))
    toast.success(t('model.editor.logicalNames.applied', { count: freshPlan.length }))
    onDone()
  }

  return (
    <>
      <div className="grid max-h-[55vh] gap-3 overflow-y-auto py-2">
        {terms.isError ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            {t('model.editor.logicalNames.dictionaryFailed')}
          </p>
        ) : null}

        {plan.length === 0 ? (
          terms.isPending ? (
            <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('model.editor.logicalNames.empty')}
            </p>
          )
        ) : (
          groups.map((group) => {
            const tableEntry = group.tableEntry
            return (
            <section key={group.tableName + group.entries[0].tableId} className="grid gap-0.5">
              {/* 테이블 행 — 테이블 논리명 후보가 있으면 굵게, 없으면 그룹 머리만 */}
              {tableEntry ? (
                <PreviewRow
                  entry={tableEntry}
                  checked={!unchecked.has(entryKey(tableEntry))}
                  onToggle={() => toggle(entryKey(tableEntry))}
                  bold
                />
              ) : (
                <h4 className="flex items-center gap-1 px-1 pt-1 font-mono text-xs font-semibold text-muted-foreground">
                  <ChevronRight aria-hidden className="size-3" />
                  {group.tableName}
                </h4>
              )}
              {group.columnEntries.map((entry) => (
                <PreviewRow
                  key={entryKey(entry)}
                  entry={entry}
                  checked={!unchecked.has(entryKey(entry))}
                  onToggle={() => toggle(entryKey(entry))}
                  indented
                />
              ))}
            </section>
            )
          })
        )}

        <p className="text-xs text-muted-foreground">{t('model.editor.logicalNames.ruleNote')}</p>
        <p className="text-xs text-muted-foreground">{t('model.editor.logicalNames.ddlNote')}</p>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <span className="mr-auto text-xs text-muted-foreground">
          {t('model.editor.logicalNames.customCount', { count: terms.data?.totalCount ?? 0 })}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={onManageDictionary}
        >
          <BookOpenText aria-hidden className="size-3.5" />
          {t('model.editor.logicalNames.manageDictionary')}
        </Button>
        <Button type="button" onClick={apply} disabled={checkedCount === 0}>
          {t('model.editor.logicalNames.apply', { count: checkedCount })}
        </Button>
      </DialogFooter>
    </>
  )
}

function PreviewRow({
  entry,
  checked,
  onToggle,
  bold = false,
  indented = false,
}: {
  entry: InferenceEntry
  checked: boolean
  onToggle: () => void
  bold?: boolean
  indented?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50 ${indented ? 'pl-5' : ''}`}
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={entry.columnPhysicalName ?? entry.tablePhysicalName} />
      <span className={`min-w-0 truncate font-mono text-xs ${bold ? 'font-semibold' : 'text-muted-foreground'}`}>
        {entry.columnPhysicalName ?? entry.tablePhysicalName}
      </span>
      <span aria-hidden className="shrink-0 text-muted-foreground">
        →
      </span>
      <span className={`min-w-0 flex-1 truncate text-sm ${bold ? 'font-semibold' : ''}`}>{entry.inferred}</span>
    </label>
  )
}
