/**
 * 결과 표 — 데이터 탭과 SQL 탭이 함께 쓴다 (09-database-manager/00-data-browser.md §5.2·§5.3)
 *
 * 셀 값은 문자열·null·잘린 값·이진 값 넷 중 하나다(§2.2). NULL과 빈 문자열을 구분해 보여 준다.
 */
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  isBinaryCell,
  isTruncatedCell,
  type CellValue,
  type ColumnMeta,
  type RowSort,
} from '@/features/database/api'
import { formatNumber } from '@/lib/format'
import { cn } from 'cn'

const NUMERIC: ReadonlySet<string> = new Set(['integer', 'decimal', 'float'])
/** 바이트 순서 표시 — 엑셀이 CSV의 한글을 깨뜨리지 않게 파일 맨 앞에 붙인다 */
const BOM = String.fromCharCode(0xfeff)

function cellText(cell: CellValue): string {
  if (cell === null) return ''
  if (isTruncatedCell(cell)) return cell.text
  if (isBinaryCell(cell)) return `0x${cell.previewHex}`
  return cell
}

/** 화면에 올라온 행을 CSV로 — 잘린 값은 잘린 채로, 이진 값은 16진 앞부분만 담긴다 */
export function toCsv(columns: ColumnMeta[], rows: CellValue[][]): string {
  const escape = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
  const lines = [columns.map((column) => escape(column.name)).join(',')]
  for (const row of rows) lines.push(row.map((cell) => escape(cellText(cell))).join(','))
  return `${BOM}${lines.join('\r\n')}\r\n`
}

export interface ResultTableProps {
  columns: ColumnMeta[]
  rows: CellValue[][]
  /** 지금 정렬 — onSort가 있을 때만 머리글이 버튼이 된다 */
  sort?: RowSort | null
  onSort?: (column: string) => void
  /** 다음 결과를 기다리는 동안 흐리게 */
  dimmed?: boolean
}

export function ResultTable({ columns, rows, sort = null, onSort, dimmed = false }: ResultTableProps) {
  const { t } = useTranslation()

  return (
    <table className={cn('w-max min-w-full border-collapse text-sm', dimmed && 'opacity-60')}>
      <thead className="sticky top-0 z-10 bg-muted">
        <tr>
          {columns.map((column, index) => {
            const direction = sort?.column === column.name ? sort.direction : null
            const label = (
              <>
                <span className={cn(column.primaryKey && 'underline decoration-dotted underline-offset-4')}>
                  {column.name}
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">{column.typeName}</span>
                {direction === 'ASC' ? <ArrowUp aria-hidden className="size-3" /> : null}
                {direction === 'DESC' ? <ArrowDown aria-hidden className="size-3" /> : null}
              </>
            )
            return (
              <th
                // 콘솔 결과는 컬럼 이름이 겹칠 수 있다(SELECT a.id, b.id) — 위치로 구분한다
                key={`${index}:${column.name}`}
                scope="col"
                aria-sort={
                  onSort ? (direction === 'ASC' ? 'ascending' : direction === 'DESC' ? 'descending' : 'none') : undefined
                }
                className="border-b border-r px-0 py-0 text-left font-medium last:border-r-0"
              >
                {onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(column.name)}
                    title={column.typeName}
                    aria-label={t('database.data.sortBy', { column: column.name })}
                    className="flex w-full items-center gap-1 px-2 py-1.5 hover:bg-muted-foreground/10"
                  >
                    {label}
                  </button>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-1.5">{label}</span>
                )}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-b hover:bg-muted/40">
            {row.map((cell, cellIndex) => (
              <DataCell key={cellIndex} cell={cell} category={columns[cellIndex]?.category ?? 'other'} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 셀 하나 — NULL·빈 문자열·잘린 값·이진 값을 구분해 보여 준다(§5.2) */
function DataCell({ cell, category }: { cell: CellValue; category: string }) {
  const { t } = useTranslation()
  const base = 'max-w-96 truncate border-r px-2 py-1 align-top last:border-r-0'

  if (cell === null) {
    return <td className={cn(base, 'text-muted-foreground/60 italic')}>{t('database.data.null')}</td>
  }
  if (isBinaryCell(cell)) {
    return (
      <td className={cn(base, 'text-muted-foreground')} title={`0x${cell.previewHex}`}>
        {t('database.data.binary', { formatted: formatNumber(cell.length) })}
      </td>
    )
  }
  if (isTruncatedCell(cell)) {
    return (
      <td className={base} title={t('database.data.truncatedCell', { formatted: formatNumber(cell.length) })}>
        {cell.text}
        <span className="ml-1 text-xs text-muted-foreground">
          … {t('database.data.truncatedCell', { formatted: formatNumber(cell.length) })}
        </span>
      </td>
    )
  }
  // 날짜·시각은 ISO 8601로 온다 — 화면에서는 날짜와 시각 사이의 'T'를 공백으로 보여 준다(값 자체는 그대로)
  const text = category === 'datetime' ? cell.replace(/^(\d{4}-\d{2}-\d{2})T/, '$1 ') : cell
  return (
    <td
      className={cn(base, (NUMERIC.has(category) || category === 'datetime') && 'tabular-nums', NUMERIC.has(category) && 'text-right')}
      title={cell.length > 40 ? cell : undefined}
    >
      {text}
    </td>
  )
}
