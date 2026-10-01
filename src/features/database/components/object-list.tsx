/**
 * 객체 목록 — 테이블과 뷰를 나눠 보여 주고 이름으로 찾는다 (09-database-manager/00-data-browser.md §5.1)
 */
import { useMemo, useState } from 'react'
import { Eye, RefreshCw, Search, Table2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import type { DatabaseObject } from '@/features/database/api'
import { formatNumber } from '@/lib/format'
import { cn } from 'cn'

export interface ObjectListProps {
  objects: DatabaseObject[] | undefined
  loading: boolean
  /** 오류 문구 — 있으면 목록 대신 보여 준다 */
  error: string | null
  selected: string | null
  onSelect: (name: string) => void
  onRefresh: () => void
  refreshing: boolean
}

export function ObjectList({ objects, loading, error, selected, onSelect, onRefresh, refreshing }: ObjectListProps) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')

  const { tables, views } = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    const matched = (objects ?? []).filter(
      (object) =>
        needle === '' ||
        object.name.toLowerCase().includes(needle) ||
        (object.comment ?? '').toLowerCase().includes(needle),
    )
    return {
      tables: matched.filter((object) => object.kind === 'TABLE'),
      views: matched.filter((object) => object.kind === 'VIEW'),
    }
  }, [objects, keyword])

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r" aria-label={t('database.objects.label')}>
      <div className="flex items-center gap-1 border-b p-2">
        <div className="relative flex-1">
          <Search aria-hidden className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('database.objects.search')}
            aria-label={t('database.objects.search')}
            className="h-8 pl-8"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={t('database.objects.refresh')}
          title={t('database.objects.refresh')}
        >
          <RefreshCw aria-hidden className={cn('size-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="grid gap-2" aria-busy>
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={onRefresh} />
        ) : (objects ?? []).length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('database.objects.empty')}</p>
        ) : tables.length + views.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('database.objects.noMatch')}</p>
        ) : (
          <>
            <ObjectGroup label={t('database.objects.tables')} items={tables} selected={selected} onSelect={onSelect} />
            <ObjectGroup label={t('database.objects.views')} items={views} selected={selected} onSelect={onSelect} />
          </>
        )}
      </div>
    </aside>
  )
}

function ObjectGroup({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string
  items: DatabaseObject[]
  selected: string | null
  onSelect: (name: string) => void
}) {
  const { t } = useTranslation()
  if (items.length === 0) return null

  return (
    <section className="mb-3">
      <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
        {label} ({formatNumber(items.length)})
      </h2>
      <ul>
        {items.map((object) => (
          <li key={object.name}>
            <button
              type="button"
              onClick={() => onSelect(object.name)}
              aria-current={selected === object.name ? 'true' : undefined}
              title={object.comment ?? undefined}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                selected === object.name && 'bg-muted font-medium',
              )}
            >
              {object.kind === 'VIEW' ? (
                <Eye aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Table2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{object.name}</span>
              {object.estimatedRows !== null ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t('database.objects.estimatedRows', { count: object.estimatedRows, formatted: formatNumber(object.estimatedRows) })}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
