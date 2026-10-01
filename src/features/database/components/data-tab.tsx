/**
 * 데이터 탭 — 행 조회(필터·정렬·페이지 넘김) (09-database-manager/00-data-browser.md §5.2)
 *
 * 조건은 [적용]을 눌러야 서버로 간다 — 값을 치는 동안 대상 DB에 질의를 쏟지 않는다.
 * 전체 행 수는 세지 않는다. 다음 페이지 유무만 알고, 정확한 수는 사용자가 눌렀을 때만 센다.
 */
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Loader2, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
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
import { ResultTable, toCsv } from '@/features/database/components/result-table'
import { databaseErrorMessage } from '@/features/database/errors'
import { useCountRows, useObjectRows } from '@/features/database/hooks'
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
  object: DatabaseObject
}

export function DataTab({ workspaceId, connectionId, object }: DataTabProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<RowSort[]>([])
  const [drafts, setDrafts] = useState<FilterDraft[]>([])
  const [applied, setApplied] = useState<RowFilter[]>([])
  const [nextDraftId, setNextDraftId] = useState(1)

  const query: RowsQuery = { page, size: PAGE_SIZE, filters: applied, sort }
  const rows = useObjectRows(workspaceId, connectionId, object.name, query)
  const count = useCountRows(workspaceId, connectionId, object.name)
  const columns = rows.data?.columns ?? []

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
          <ResultTable
            columns={rows.data.columns}
            rows={rows.data.rows}
            sort={sort[0] ?? null}
            onSort={toggleSort}
            dimmed={rows.isPlaceholderData}
          />
        )}
        {rows.data && rows.data.rows.length === 0 && !rows.isError ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {applied.length > 0 ? t('database.data.emptyFiltered') : t('database.data.empty')}
          </p>
        ) : null}
      </div>

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
    </div>
  )
}
