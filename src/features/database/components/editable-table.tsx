/**
 * 편집할 수 있는 표 — 기본 키가 있는 테이블의 데이터 탭이 쓴다 (09-database-manager/00-data-browser.md §5.2)
 *
 * - 셀을 두 번 누르면 편집 상태가 된다. Enter·포커스 이동으로 담고 Esc로 취소한다
 * - 바꾼 셀·추가한 행·삭제할 행은 색으로 표시한다. 이 단계에서는 서버에 아무것도 보내지 않는다
 * - 잘린 셀은 눌러서 전체 값을 연다(§3.7). 이진 셀은 편집할 수 없다
 */
import { useState } from 'react'
import { CornerDownRight, Trash2, Undo2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  isBinaryCell,
  isTruncatedCell,
  type CellValue,
  type ColumnMeta,
  type RowSort,
} from '@/features/database/api'
import { useColumnWidths } from '@/features/database/column-widths'
import { ColumnHeader } from '@/features/database/components/column-header'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  DataCell,
  FollowButton,
  NUMERIC,
  type CellFollow,
} from '@/features/database/components/result-table'
import {
  primaryKeyOf,
  removeInsert,
  rowKeyOf,
  setCell,
  setInsertCell,
  toggleDelete,
  type EditValue,
  type RowEdits,
} from '@/features/database/row-edits'
import { cn } from 'cn'

export interface LongValueTarget {
  rowKey: string
  key: Record<string, string>
  column: ColumnMeta
}

export interface EditableTableProps {
  columns: ColumnMeta[]
  rows: CellValue[][]
  sort: RowSort | null
  onSort: (column: string) => void
  dimmed: boolean
  edits: RowEdits
  onEditsChange: (edits: RowEdits) => void
  /** 잘린 셀을 눌렀다 — 전체 값을 여는 일은 부모가 한다 */
  onOpenLongValue: (target: LongValueTarget) => void
  /** 서버가 알려 준 실패 위치 — `row:{행 키}` 또는 `insert:{번호}` → 문구 */
  rowErrors: Record<string, string>
  /** 컬럼 이름(소문자) → ERD 논리명 — 있으면 머리글에 함께 보여 준다 */
  columnLabels?: Record<string, string>
  /** 열 너비를 기억할 키(커넥션·테이블) */
  widthKey: string
  /** 외래 키 셀의 따라가기 — 따라갈 수 없는 셀은 undefined(§5.9) */
  followOf?: (columnIndex: number, row: CellValue[]) => CellFollow | undefined
  /** 이 행을 참조하는 행 보기 — 항목이 없으면 단추를 두지 않는다(§5.9) */
  referencesOf?: (row: CellValue[]) => CellFollow[]
}

/** 맨 앞 행 작업 칸의 너비 — 참조하는 행 보기 단추가 있으면 넓힌다 */
const ROW_ACTIONS_WIDTH = 36
const ROW_ACTIONS_WITH_REFERENCES_WIDTH = 60

interface EditingCell {
  rowKey: string
  column: string
  draft: string
}

export function EditableTable({
  columns,
  rows,
  sort,
  onSort,
  dimmed,
  edits,
  onEditsChange,
  onOpenLongValue,
  rowErrors,
  columnLabels,
  widthKey,
  followOf,
  referencesOf,
}: EditableTableProps) {
  const { t } = useTranslation()
  const widths = useColumnWidths(widthKey, columnLabels)
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const actionsWidth = referencesOf ? ROW_ACTIONS_WITH_REFERENCES_WIDTH : ROW_ACTIONS_WIDTH

  const commit = (
    rowKey: string,
    key: Record<string, string>,
    column: string,
    value: EditValue,
    original: EditValue,
  ) => {
    onEditsChange(setCell(edits, rowKey, key, column, value, original))
    setEditing(null)
  }

  return (
    <table
      // 열을 늘려 채우지 않는다 — 열마다 기본 너비로 시작하고 남는 폭은 오른쪽에 빈 채로 둔다(§5.8)
      className={cn('table-fixed border-collapse text-sm', dimmed && 'opacity-60')}
      style={{
        width: actionsWidth + columns.reduce((sum, column) => sum + widths.widthOf(column), 0),
      }}
    >
      <colgroup>
        <col style={{ width: actionsWidth }} />
        {columns.map((column) => (
          <col
            key={column.name}
            data-column={column.name}
            style={{ width: widths.widthOf(column) }}
          />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-10 bg-muted">
        <tr>
          <th scope="col" className="border-b border-r px-1">
            <span className="sr-only">{t('database.edit.rowActions')}</span>
          </th>
          {columns.map((column) => (
            <ColumnHeader
              key={column.name}
              column={column}
              logicalName={columnLabels?.[column.name.toLowerCase()]}
              direction={sort?.column === column.name ? sort.direction : null}
              onSort={onSort}
              widths={widths}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {/* 추가할 행 — 맨 위에 쌓인다. 비워 둔 칸은 데이터베이스 기본값이 들어간다 */}
        {edits.inserts.map((insert) => (
          <tr
            key={`insert:${insert.id}`}
            data-testid="insert-row"
            className={cn(
              'border-b bg-emerald-500/10',
              rowErrors[`insert:${insert.id}`] && 'outline outline-1 outline-destructive',
            )}
            title={rowErrors[`insert:${insert.id}`]}
          >
            <td className="border-r px-1 text-center">
              <button
                type="button"
                onClick={() => onEditsChange(removeInsert(edits, insert.id))}
                aria-label={t('database.edit.removeInsert')}
                title={t('database.edit.removeInsert')}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </td>
            {columns.map((column) =>
              column.generated ? (
                // 생성 컬럼은 데이터베이스가 계산한다 — 값을 넣을 수 없다(§5.9)
                <td
                  key={column.name}
                  className="truncate border-r px-2 py-1 text-xs italic text-muted-foreground/60 last:border-r-0"
                  title={t('database.edit.generatedCell')}
                >
                  {t('database.edit.generatedPlaceholder')}
                </td>
              ) : column.category === 'binary' ? (
                <td
                  key={column.name}
                  className="border-r px-2 py-1 text-muted-foreground/60 last:border-r-0"
                />
              ) : (
                <td key={column.name} className="border-r p-0 last:border-r-0">
                  <input
                    value={insert.values[column.name] ?? ''}
                    onChange={(event) =>
                      onEditsChange(
                        setInsertCell(
                          edits,
                          insert.id,
                          column.name,
                          event.target.value === '' ? undefined : event.target.value,
                        ),
                      )
                    }
                    placeholder={t('database.edit.defaultPlaceholder')}
                    aria-label={t('database.edit.newCell', { column: column.name })}
                    className="h-7 w-full min-w-0 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:bg-background focus:ring-1 focus:ring-ring"
                  />
                </td>
              ),
            )}
          </tr>
        ))}

        {rows.map((row, rowIndex) => {
          const key = primaryKeyOf(columns, row)
          const rowKey = rowKeyOf(columns, row)
          if (!key || !rowKey) {
            // 기본 키 값을 알 수 없는 행(키가 NULL이거나 잘림) — 편집 대상이 아니다
            return (
              <tr key={rowIndex} className="border-b">
                <td className="border-r" />
                {row.map((cell, cellIndex) => (
                  <DataCell
                    key={cellIndex}
                    cell={cell}
                    category={columns[cellIndex]?.category ?? 'other'}
                    follow={followOf?.(cellIndex, row)}
                  />
                ))}
              </tr>
            )
          }
          const deleted = rowKey in edits.deletes
          const update = edits.updates[rowKey]
          const error = rowErrors[`row:${rowKey}`]
          return (
            <tr
              key={rowKey}
              className={cn(
                'border-b hover:bg-muted/40',
                deleted && 'bg-destructive/10',
                error && 'outline outline-1 outline-destructive',
              )}
              title={error}
            >
              <td className="border-r px-1 text-center">
                <button
                  type="button"
                  onClick={() => onEditsChange(toggleDelete(edits, rowKey, key))}
                  aria-label={
                    deleted ? t('database.edit.restoreRow') : t('database.edit.deleteRow')
                  }
                  title={deleted ? t('database.edit.restoreRow') : t('database.edit.deleteRow')}
                  aria-pressed={deleted}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  {deleted ? (
                    <Undo2 aria-hidden className="size-3.5" />
                  ) : (
                    <Trash2 aria-hidden className="size-3.5" />
                  )}
                </button>
                {referencesOf ? <ReferencesMenu items={referencesOf(row)} /> : null}
              </td>
              {row.map((cell, cellIndex) => {
                const column = columns[cellIndex]
                const changed = update !== undefined && column.name in update.values
                const shown: CellValue = changed ? update.values[column.name] : cell
                const isEditing = editing?.rowKey === rowKey && editing.column === column.name

                // 이진 셀은 편집할 수 없다
                if (isBinaryCell(cell) && !changed) {
                  return <DataCell key={cellIndex} cell={cell} category={column.category} />
                }
                const follow = changed ? undefined : followOf?.(cellIndex, row)
                // 잘린 셀은 전체 값을 열어서 본다 — 통째로 읽은 뒤에만 고칠 수 있다(§3.7)
                if (isTruncatedCell(cell) && !changed) {
                  return (
                    <td key={cellIndex} className="max-w-96 border-r p-0 align-top last:border-r-0">
                      <button
                        type="button"
                        disabled={deleted}
                        onClick={() => onOpenLongValue({ rowKey, key, column })}
                        aria-label={t('database.edit.openLongValue', { column: column.name })}
                        className="block w-full truncate px-2 py-1 text-left hover:bg-muted"
                      >
                        {cell.text}
                        <span className="ml-1 text-xs text-muted-foreground">…</span>
                      </button>
                    </td>
                  )
                }
                if (isEditing) {
                  const original =
                    typeof cell === 'string' || cell === null
                      ? cell
                      : (update?.original[column.name] ?? null)
                  return (
                    <td key={cellIndex} className="border-r p-0 last:border-r-0">
                      <span className="flex items-center">
                        <input
                          autoFocus
                          value={editing.draft}
                          onChange={(event) =>
                            setEditing({ ...editing, draft: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter')
                              commit(rowKey, key, column.name, editing.draft, original)
                            if (event.key === 'Escape') setEditing(null)
                          }}
                          onBlur={(event) => {
                            // NULL 버튼으로 옮겨 간 포커스는 담지 않는다 — 그 버튼이 NULL로 담는다
                            if (
                              event.relatedTarget instanceof HTMLElement &&
                              event.relatedTarget.dataset.nullButton
                            )
                              return
                            commit(rowKey, key, column.name, editing.draft, original)
                          }}
                          aria-label={t('database.edit.editCell', { column: column.name })}
                          className="h-7 w-full min-w-0 bg-background px-2 text-sm outline-none ring-1 ring-ring"
                        />
                        {column.nullable ? (
                          <button
                            type="button"
                            data-null-button="true"
                            onClick={() => commit(rowKey, key, column.name, null, original)}
                            className="h-7 shrink-0 border-l px-1.5 text-[10px] text-muted-foreground hover:bg-muted"
                          >
                            {t('database.edit.setNull')}
                          </button>
                        ) : null}
                      </span>
                    </td>
                  )
                }
                const text =
                  typeof shown === 'string' && column.category === 'datetime'
                    ? shown.replace(/^(\d{4}-\d{2}-\d{2})T/, '$1 ')
                    : shown
                return (
                  <td
                    key={cellIndex}
                    onDoubleClick={() => {
                      // 생성 컬럼은 데이터베이스가 계산한다 — 고칠 수 없다(§5.9)
                      if (deleted || column.generated) return
                      setEditing({
                        rowKey,
                        column: column.name,
                        draft: typeof shown === 'string' ? shown : '',
                      })
                    }}
                    className={cn(
                      'max-w-96 truncate border-r px-2 py-1 align-top last:border-r-0',
                      column.generated ? 'cursor-default' : 'cursor-text',
                      NUMERIC.has(column.category) && 'text-right tabular-nums',
                      changed && 'bg-amber-500/20',
                      deleted && 'line-through opacity-60',
                      shown === null && 'text-muted-foreground/60 italic',
                    )}
                    data-changed={changed ? 'true' : undefined}
                    title={column.generated ? t('database.edit.generatedCell') : undefined}
                  >
                    {shown === null ? t('database.data.null') : (text as string)}
                    {follow ? <FollowButton follow={follow} /> : null}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** 이 행을 참조하는 행 보기 — 참조하는 테이블마다 한 항목. 값을 알 수 없는 행은 단추를 흐리게 둔다 */
function ReferencesMenu({ items }: { items: CellFollow[] }) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={items.length === 0}
          aria-label={t('database.follow.references')}
          title={t('database.follow.references')}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-30"
        >
          <CornerDownRight aria-hidden className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t('database.follow.references')}
        </DropdownMenuLabel>
        {items.map((item) => (
          <DropdownMenuItem key={item.label} onSelect={item.onFollow} className="font-mono text-xs">
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
