/**
 * 결과 표 — 데이터 탭과 SQL 탭이 함께 쓴다 (09-database-manager/00-data-browser.md §5.2·§5.3)
 *
 * 셀 값은 문자열·null·잘린 값·이진 값 넷 중 하나다(§2.2). NULL과 빈 문자열을 구분해 보여 준다.
 */
import { ArrowUpRight } from 'lucide-react'
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
import { formatNumber } from '@/lib/format'
import { cn } from 'cn'

export const NUMERIC: ReadonlySet<string> = new Set(['integer', 'decimal', 'float'])
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
  const escape = (value: string) =>
    /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
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
  /** 컬럼 이름(소문자) → ERD 논리명 — 있으면 머리글에 함께 보여 준다 */
  columnLabels?: Record<string, string>
  /** 열 너비를 기억할 키(커넥션·테이블) — 주면 열마다 기본 너비로 시작하고 끌어서 바꾼다. SQL 결과는 주지 않는다 */
  widthKey?: string
  /** 외래 키 셀의 따라가기 — 따라갈 수 없는 셀은 undefined(§5.9) */
  followOf?: (columnIndex: number, row: CellValue[]) => CellFollow | undefined
}

/** 셀 옆의 따라가기 단추 */
export interface CellFollow {
  label: string
  onFollow: () => void
}

/** 외래 키 값 옆의 작은 단추 — 두 번 눌러 편집하는 셀에서도 누르기만 하면 따라간다 */
export function FollowButton({ follow }: { follow: CellFollow }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        follow.onFollow()
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      aria-label={follow.label}
      title={follow.label}
      data-testid="follow-foreign-key"
      className="ml-1 inline-flex rounded align-middle text-primary/50 hover:bg-muted hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <ArrowUpRight aria-hidden className="size-3.5" />
    </button>
  )
}

export function ResultTable({
  columns,
  rows,
  sort = null,
  onSort,
  dimmed = false,
  columnLabels,
  widthKey,
  followOf,
}: ResultTableProps) {
  const widths = useColumnWidths(widthKey ?? '', columnLabels)
  const sized = widthKey !== undefined

  return (
    <table
      className={cn(
        'border-collapse text-sm',
        // 열 너비를 정하는 표는 늘려 채우지 않는다 — 남는 폭은 오른쪽에 빈 채로 둔다(§5.8)
        sized ? 'table-fixed' : 'w-max min-w-full',
        dimmed && 'opacity-60',
      )}
      style={
        sized
          ? { width: columns.reduce((sum, column) => sum + widths.widthOf(column), 0) }
          : undefined
      }
    >
      {sized ? (
        <colgroup>
          {columns.map((column, index) => (
            <col
              key={`${index}:${column.name}`}
              data-column={column.name}
              style={{ width: widths.widthOf(column) }}
            />
          ))}
        </colgroup>
      ) : null}
      <thead className="sticky top-0 z-10 bg-muted">
        <tr>
          {columns.map((column, index) => (
            <ColumnHeader
              // 콘솔 결과는 컬럼 이름이 겹칠 수 있다(SELECT a.id, b.id) — 위치로 구분한다
              key={`${index}:${column.name}`}
              column={column}
              logicalName={columnLabels?.[column.name.toLowerCase()]}
              direction={sort?.column === column.name ? sort.direction : null}
              onSort={onSort}
              widths={sized ? widths : undefined}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-b hover:bg-muted/40">
            {row.map((cell, cellIndex) => (
              <DataCell
                key={cellIndex}
                cell={cell}
                category={columns[cellIndex]?.category ?? 'other'}
                follow={followOf?.(cellIndex, row)}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 셀 하나 — NULL·빈 문자열·잘린 값·이진 값을 구분해 보여 준다(§5.2) */
export function DataCell({
  cell,
  category,
  follow,
}: {
  cell: CellValue
  category: string
  follow?: CellFollow
}) {
  const { t } = useTranslation()
  const base = 'max-w-96 truncate border-r px-2 py-1 align-top last:border-r-0'

  if (cell === null) {
    return (
      <td className={cn(base, 'text-muted-foreground/60 italic')}>{t('database.data.null')}</td>
    )
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
      <td
        className={base}
        title={t('database.data.truncatedCell', { formatted: formatNumber(cell.length) })}
      >
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
      className={cn(
        base,
        (NUMERIC.has(category) || category === 'datetime') && 'tabular-nums',
        NUMERIC.has(category) && 'text-right',
      )}
      title={cell.length > 40 ? cell : undefined}
    >
      {text}
      {follow ? <FollowButton follow={follow} /> : null}
    </td>
  )
}
