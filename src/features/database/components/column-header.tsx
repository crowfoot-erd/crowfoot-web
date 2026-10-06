/**
 * 데이터 표의 머리글 칸 — 정렬 버튼·논리명·열 너비 조절 (09-database-manager/00-data-browser.md §5.2·§5.7·§5.8)
 *
 * - 논리명은 `-----` 앞부분만 보여 주고, 뒷부분(설명)은 마우스를 올리면 보여 준다(05-editor/01-core.md §3.3).
 *   화면 읽기 프로그램에는 설명을 정렬 버튼의 설명(aria-describedby)으로 읽어 준다
 * - 너비 조절 손잡이(머리글 오른쪽 끝): 끌어서 바꾸고, 두 번 누르면 기본 너비로 돌아간다.
 *   키보드는 손잡이에 초점을 두고 ←·→(Shift는 크게)
 */
import { useId, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ColumnMeta } from '@/features/database/api'
import {
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  type ColumnWidths,
} from '@/features/database/column-widths'
import { splitLogicalName } from '@/features/editor/model/logical-name'
import { cn } from 'cn'

/** 키보드 한 번에 바꾸는 너비 */
const KEY_STEP = 16
const KEY_STEP_LARGE = 64

/** 논리명 표기 — 앞부분만 보여 주고 설명은 툴팁(title)으로. 설명 id를 주면 화면 밖 글로도 둔다 */
export function LogicalNameText({
  value,
  className,
  descriptionId,
}: {
  value: string
  className?: string
  descriptionId?: string
}) {
  const { name, description } = splitLogicalName(value)
  return (
    <>
      <span
        className={className}
        title={description ?? undefined}
        data-logical-description={description ?? undefined}
      >
        {name}
      </span>
      {description && descriptionId ? (
        <span id={descriptionId} className="sr-only">
          {description}
        </span>
      ) : null}
    </>
  )
}

export function ColumnHeader({
  column,
  logicalName,
  direction,
  onSort,
  widths,
}: {
  column: ColumnMeta
  logicalName?: string
  direction: 'ASC' | 'DESC' | null
  /** 없으면 정렬할 수 없는 머리글(SQL 결과) */
  onSort?: (column: string) => void
  /** 없으면 너비를 조절하지 않는다(SQL 결과) */
  widths?: ColumnWidths
}) {
  const { t } = useTranslation()
  const descriptionId = useId()
  const hasDescription = logicalName ? splitLogicalName(logicalName).description !== null : false

  const label: ReactNode = (
    <>
      <span
        className={cn(
          'shrink-0',
          column.primaryKey && 'underline decoration-dotted underline-offset-4',
        )}
      >
        {column.name}
      </span>
      {logicalName ? (
        <LogicalNameText
          value={logicalName}
          descriptionId={descriptionId}
          className="min-w-0 truncate text-xs font-normal text-muted-foreground"
        />
      ) : null}
      <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
        {column.typeName}
      </span>
      {direction === 'ASC' ? <ArrowUp aria-hidden className="size-3 shrink-0" /> : null}
      {direction === 'DESC' ? <ArrowDown aria-hidden className="size-3 shrink-0" /> : null}
    </>
  )

  return (
    <th
      scope="col"
      aria-sort={
        onSort
          ? direction === 'ASC'
            ? 'ascending'
            : direction === 'DESC'
              ? 'descending'
              : 'none'
          : undefined
      }
      className={cn(
        'border-b border-r px-0 py-0 text-left font-medium last:border-r-0',
        widths && 'relative overflow-hidden',
      )}
    >
      {onSort ? (
        <button
          type="button"
          onClick={() => onSort(column.name)}
          title={column.typeName}
          aria-label={t('database.data.sortBy', { column: column.name })}
          aria-describedby={hasDescription ? descriptionId : undefined}
          className="flex w-full items-center gap-1 px-2 py-1.5 hover:bg-muted-foreground/10"
        >
          {label}
        </button>
      ) : (
        <span className="flex items-center gap-1 px-2 py-1.5">{label}</span>
      )}
      {widths ? <ResizeHandle column={column} widths={widths} /> : null}
    </th>
  )
}

function ResizeHandle({ column, widths }: { column: ColumnMeta; widths: ColumnWidths }) {
  const { t } = useTranslation()
  const width = widths.widthOf(column)

  const startDrag = (event: MouseEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    let last = width
    const onMove = (move: globalThis.MouseEvent) => {
      last = width + move.clientX - startX
      widths.preview(column.name, last)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.removeProperty('cursor')
      widths.commit(column.name, last)
    }
    // 끄는 동안 표 밖으로 나가도 커서 모양을 유지한다
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      widths.commit(column.name, width + (event.key === 'ArrowRight' ? step : -step))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      widths.reset(column.name)
    }
  }

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={t('database.data.resizeColumn', { column: column.name })}
      aria-valuenow={width}
      aria-valuemin={COLUMN_WIDTH_MIN}
      aria-valuemax={COLUMN_WIDTH_MAX}
      tabIndex={0}
      title={t('database.data.resizeHint')}
      data-testid={`resize-${column.name}`}
      onMouseDown={startDrag}
      onDoubleClick={(event) => {
        event.stopPropagation()
        widths.reset(column.name)
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}
      className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none"
    />
  )
}
