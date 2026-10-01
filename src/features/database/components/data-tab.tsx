/**
 * 데이터 탭 — 행 조회(필터·정렬·페이지 넘김) (09-database-manager/00-data-browser.md §5.2)
 *
 * 조건은 [적용]을 눌러야 서버로 간다 — 값을 치는 동안 대상 DB에 질의를 쏟지 않는다.
 * 전체 행 수는 세지 않는다. 다음 페이지 유무만 알고, 정확한 수는 사용자가 눌렀을 때만 센다.
 *
 * 편집(기본 키가 있는 테이블만): 고친 내용은 화면에 모아 두고 [적용]을 눌러야 한 번에 보낸다.
 * 적용은 한 트랜잭션이다 — 하나라도 실패하면 전부 되돌리고, 변경은 화면에 그대로 남는다.
 */
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Loader2, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { isApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import {
  type DatabaseObject,
  type FilterOp,
  type RowFilter,
  type RowSort,
  type RowsQuery,
} from '@/features/database/api'
import { EditableTable, type LongValueTarget } from '@/features/database/components/editable-table'
import { LongValueDialog } from '@/features/database/components/long-value-dialog'
import { ResultTable, toCsv } from '@/features/database/components/result-table'
import { databaseErrorMessage } from '@/features/database/errors'
import { useApplyRowChanges, useCountRows, useObjectRows } from '@/features/database/hooks'
import { EMPTY_EDITS, addInsert, buildChanges, countEdits, setCell, type RowEdits } from '@/features/database/row-edits'
import { downloadTextFile, safeFilename } from '@/lib/download'
import { formatNumber } from '@/lib/format'

const PAGE_SIZE = 100
/** 한 번에 걸 수 있는 조건 수 — 서버 한도와 같다(§2.3) */
const FILTERS_MAX = 10
const OPS: FilterOp[] = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS', 'STARTS_WITH', 'IN', 'IS_NULL', 'IS_NOT_NULL']
const VALUELESS: ReadonlySet<FilterOp> = new Set<FilterOp>(['IS_NULL', 'IS_NOT_NULL'])

/** 편집 중인 조건 한 줄 — 값은 입력 칸의 문자열 그대로 */
interface FilterDraft {
  id: number
  column: string
  op: FilterOp
  value: string
}

/** 입력 줄 → 서버 조건. 값이 비어 있는 줄(값이 필요한 연산자)은 보내지 않는다 */
function toFilters(drafts: FilterDraft[]): RowFilter[] {
  const filters: RowFilter[] = []
  for (const draft of drafts) {
    if (draft.column === '') continue
    if (VALUELESS.has(draft.op)) {
      filters.push({ column: draft.column, op: draft.op })
    } else if (draft.op === 'IN') {
      const values = draft.value.split(',').map((value) => value.trim()).filter((value) => value !== '')
      if (values.length > 0) filters.push({ column: draft.column, op: 'IN', value: values })
    } else if (draft.value !== '') {
      filters.push({ column: draft.column, op: draft.op, value: draft.value })
    }
  }
  return filters
}

export interface DataTabProps {
  workspaceId: string
  connectionId: string
  /** 확인 다이얼로그에 보여 줄 커넥션 이름 */
  connectionName: string
  object: DatabaseObject
  /** 컬럼 이름(소문자) → ERD 논리명 — 머리글에 함께 보여 준다 */
  columnLabels?: Record<string, string>
  /** 적용하지 않은 변경이 있는지 — 부모가 다른 객체로 옮기기 전에 확인을 받는 데 쓴다 */
  onDirtyChange?: (dirty: boolean) => void
}

export function DataTab({ workspaceId, connectionId, connectionName, object, columnLabels, onDirtyChange }: DataTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<RowSort[]>([])
  const [drafts, setDrafts] = useState<FilterDraft[]>([])
  const [applied, setApplied] = useState<RowFilter[]>([])
  const [nextDraftId, setNextDraftId] = useState(1)

  const query: RowsQuery = { page, size: PAGE_SIZE, filters: applied, sort }
  const rows = useObjectRows(workspaceId, connectionId, object.name, query)
  const count = useCountRows(workspaceId, connectionId, object.name)
  const columns = rows.data?.columns ?? []

  // 편집 — 모아 둔 변경, 실패 위치, 열어 둔 긴 값
  const apply = useApplyRowChanges(workspaceId, connectionId, object.name)
  const [edits, setEdits] = useState<RowEdits>(EMPTY_EDITS)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [applyError, setApplyError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [longValue, setLongValue] = useState<LongValueTarget | null>(null)
  const counts = countEdits(edits)
  const dirty = counts.total > 0

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  // 적용하지 않은 변경이 있으면 창을 닫기 전에 브라우저가 확인을 받는다
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const changeEdits = (next: RowEdits) => {
    setEdits(next)
    setRowErrors({})
    setApplyError(null)
  }

  const applyEdits = () => {
    const { changes, targets } = buildChanges(edits)
    apply.mutate(changes, {
      onSuccess: () => {
        toast.success(t('database.edit.success', { count: changes.length }))
        setConfirming(false)
        setEdits(EMPTY_EDITS)
        setRowErrors({})
        setApplyError(null)
        count.reset()
        void queryClient.invalidateQueries({ queryKey: ['database', workspaceId, connectionId, 'rows', object.name] })
      },
      onError: (error) => {
        setConfirming(false)
        setApplyError(databaseErrorMessage(error))
        // 서버가 몇 번째 변경에서 실패했는지 알려 준다(errors[0].field = "changes[n]") — 그 행에 문구를 붙인다
        const failed = isApiError(error) ? error.errors?.[0] : undefined
        const index = Number(/^changes\[(\d+)\]$/.exec(failed?.field ?? '')?.[1] ?? -1)
        const target = targets[index]
        if (target) {
          const where = target.kind === 'row' ? `row:${target.rowKey}` : `insert:${target.id}`
          setRowErrors({ [where]: failed?.message || databaseErrorMessage(error) })
        }
      },
    })
  }

  const applyFilters = () => {
    setApplied(toFilters(drafts))
    setPage(1)
    count.reset()
  }

  const resetFilters = () => {
    setDrafts([])
    setApplied([])
    setPage(1)
    count.reset()
  }

  /** 머리글을 누를 때마다 오름차순 → 내림차순 → 정렬 없음(기본 키 순) */
  const toggleSort = (column: string) => {
    const current = sort[0]?.column === column ? sort[0].direction : null
    setSort(current === null ? [{ column, direction: 'ASC' }] : current === 'ASC' ? [{ column, direction: 'DESC' }] : [])
    setPage(1)
  }

  const addDraft = () => {
    setDrafts([...drafts, { id: nextDraftId, column: columns[0]?.name ?? '', op: 'EQ', value: '' }])
    setNextDraftId(nextDraftId + 1)
  }

  const patchDraft = (id: number, patch: Partial<FilterDraft>) => {
    setDrafts(drafts.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)))
  }

  const selectClass =
    'h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 조건 줄 */}
      <form
        className="grid gap-2 border-b p-2"
        aria-label={t('database.data.filters')}
        onSubmit={(event) => {
          event.preventDefault()
          applyFilters()
        }}
      >
        {drafts.map((draft) => (
          <div key={draft.id} className="flex flex-wrap items-center gap-2">
            <select
              className={selectClass}
              value={draft.column}
              aria-label={t('database.data.column')}
              onChange={(event) => patchDraft(draft.id, { column: event.target.value })}
            >
              {columns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={draft.op}
              aria-label={t('database.data.operator')}
              onChange={(event) => patchDraft(draft.id, { op: event.target.value as FilterOp })}
            >
              {OPS.map((op) => (
                <option key={op} value={op}>
                  {t(`database.data.op.${op}`)}
                </option>
              ))}
            </select>
            {VALUELESS.has(draft.op) ? null : (
              <Input
                value={draft.value}
                onChange={(event) => patchDraft(draft.id, { value: event.target.value })}
                placeholder={draft.op === 'IN' ? t('database.data.inPlaceholder') : t('database.data.value')}
                aria-label={t('database.data.value')}
                className="h-8 w-56"
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setDrafts(drafts.filter((candidate) => candidate.id !== draft.id))}
              aria-label={t('database.data.removeFilter')}
              title={t('database.data.removeFilter')}
            >
              <X aria-hidden className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addDraft}
            disabled={columns.length === 0 || drafts.length >= FILTERS_MAX}
          >
            <Plus aria-hidden />
            {t('database.data.addFilter')}
          </Button>
          {object.editable ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => changeEdits(addInsert(edits))}
              disabled={columns.length === 0}
            >
              <Plus aria-hidden />
              {t('database.edit.addRow')}
            </Button>
          ) : null}
          {drafts.length > 0 || applied.length > 0 ? (
            <>
              <Button type="submit" size="sm">
                {t('database.data.apply')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                {t('database.data.reset')}
              </Button>
            </>
          ) : null}
          <div className="flex-1" />
          {!object.editable ? (
            <span className="text-xs text-muted-foreground">
              {object.kind === 'VIEW' ? t('database.data.readOnlyView') : t('database.data.readOnlyNoPk')}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!rows.data || rows.data.rows.length === 0}
            onClick={() => {
              if (!rows.data) return
              downloadTextFile(`${safeFilename(object.name)}.csv`, toCsv(rows.data.columns, rows.data.rows), 'text/csv')
            }}
          >
            <Download aria-hidden />
            {t('database.data.downloadCsv')}
          </Button>
        </div>
      </form>

      {/* 표 */}
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.isPending ? (
          <div className="grid gap-2 p-4" aria-busy>
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : rows.isError || !rows.data ? (
          <div className="p-6">
            <ErrorState message={databaseErrorMessage(rows.error)} onRetry={() => void rows.refetch()} />
          </div>
        ) : (
          object.editable ? (
            <EditableTable
              columns={rows.data.columns}
              rows={rows.data.rows}
              sort={sort[0] ?? null}
              onSort={toggleSort}
              dimmed={rows.isPlaceholderData}
              columnLabels={columnLabels}
              edits={edits}
              onEditsChange={changeEdits}
              onOpenLongValue={setLongValue}
              rowErrors={rowErrors}
            />
          ) : (
            <ResultTable
              columns={rows.data.columns}
              rows={rows.data.rows}
              sort={sort[0] ?? null}
              onSort={toggleSort}
              dimmed={rows.isPlaceholderData}
              columnLabels={columnLabels}
            />
          )
        )}
        {rows.data && rows.data.rows.length === 0 && edits.inserts.length === 0 && !rows.isError ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {applied.length > 0 ? t('database.data.emptyFiltered') : t('database.data.empty')}
          </p>
        ) : null}
      </div>

      {/* 모아 둔 변경 — 적용하기 전에는 서버에 가지 않는다 */}
      {dirty ? (
        <div className="flex flex-wrap items-center gap-3 border-t bg-amber-500/10 px-3 py-2 text-sm" role="status">
          <span className="font-medium">{t('database.edit.pending', { count: counts.total })}</span>
          <span className="text-xs text-muted-foreground">
            {t('database.edit.summary', { inserted: counts.inserted, updated: counts.updated, deleted: counts.deleted })}
          </span>
          {applyError ? (
            <span role="alert" className="text-xs text-destructive">
              {t('database.edit.failed')} {applyError}
            </span>
          ) : null}
          <div className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={() => changeEdits(EMPTY_EDITS)} disabled={apply.isPending}>
            {t('database.edit.discard')}
          </Button>
          <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={apply.isPending}>
            {t('database.edit.apply')}
          </Button>
        </div>
      ) : null}

      {/* 아래 줄 — 페이지 넘김·행 수 */}
      <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1 || rows.isFetching}
        >
          <ChevronLeft aria-hidden />
          {t('database.data.prev')}
        </Button>
        <span className="tabular-nums">{t('database.data.page', { page })}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPage(page + 1)}
          disabled={!rows.data?.hasNext || rows.isFetching}
        >
          {t('database.data.next')}
          <ChevronRight aria-hidden />
        </Button>
        {rows.isFetching ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        {rows.data ? (
          <>
            <span>{t('database.data.rowsShown', { count: rows.data.rows.length })}</span>
            <span>{t('database.data.elapsed', { ms: rows.data.elapsedMs })}</span>
            {rows.data.truncated ? (
              <span className="text-amber-600 dark:text-amber-500">{t('database.data.truncated')}</span>
            ) : null}
          </>
        ) : null}
        <div className="flex-1" />
        {count.data ? (
          <span className="font-medium text-foreground" data-testid="exact-count">
            {t('database.data.exactCount', { formatted: formatNumber(Number(count.data.count)) })}
          </span>
        ) : count.isError ? (
          <span className="text-destructive">{databaseErrorMessage(count.error)}</span>
        ) : applied.length === 0 && object.estimatedRows !== null ? (
          <span>{t('database.data.estimated', { formatted: formatNumber(object.estimatedRows) })}</span>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => count.mutate(applied)} disabled={count.isPending}>
          {count.isPending ? t('database.data.counting') : t('database.data.countExact')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(false)
        }}
        title={t('database.edit.confirm.title', { count: counts.total })}
        description={
          <span className="grid gap-1">
            <span>{t('database.edit.confirm.target', { name: connectionName, object: object.name })}</span>
            <span>
              {t('database.edit.summary', { inserted: counts.inserted, updated: counts.updated, deleted: counts.deleted })}
            </span>
            {counts.deleted > 0 ? (
              <span className="font-medium text-destructive">{t('database.edit.confirm.deleteWarning', { count: counts.deleted })}</span>
            ) : null}
          </span>
        }
        confirmLabel={t('database.edit.apply')}
        destructive={counts.deleted > 0}
        confirming={apply.isPending}
        onConfirm={applyEdits}
      />

      {longValue ? (
        <LongValueDialog
          workspaceId={workspaceId}
          connectionId={connectionId}
          objectName={object.name}
          target={{ key: longValue.key, column: longValue.column.name, nullable: longValue.column.nullable }}
          onClose={() => setLongValue(null)}
          onSave={(value, original) => {
            changeEdits(setCell(edits, longValue.rowKey, longValue.key, longValue.column.name, value, original))
            setLongValue(null)
          }}
        />
      ) : null}
    </div>
  )
}
