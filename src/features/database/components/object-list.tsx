/**
 * 객체 목록 — 테이블과 뷰를 나눠 보여 주고 이름으로 찾는다 (09-database-manager/00-data-browser.md §5.1·§5.6)
 *
 * 문서와 함께 열면(에디터의 데이터 보기 탭, 주소의 `?model=`) 테이블을 문서의 그룹으로 나눈다.
 * - 그룹 순서는 문서 순서다. 그룹 이름과 색은 에디터 탐색기의 그룹 폴더와 같게 보여 준다
 * - 그룹에 없는 문서 테이블은 "그룹 없음", 문서에 없는 DB 테이블은 "문서에 없는 테이블"에 둔다
 * - 여러 그룹에 든 테이블은 그룹마다 나온다. 뷰는 지금처럼 따로 둔다
 * - 검색은 그룹을 가로질러 걸고, 걸러서 빈 묶음은 감춘다. 묶음은 접을 수 있다(화면 상태 — 문서는 그대로다)
 */
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, RefreshCw, Search, Table2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import type { DatabaseObject } from '@/features/database/api'
import type { DocumentOutline } from '@/features/database/logical-names'
import { TABLE_COLOR_HEX, type TableColorValue } from '@/features/editor/model/content-schema'
import { splitLogicalName } from '@/features/editor/model/logical-name'
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
  /** 함께 연 문서의 그룹 — 있으면 테이블을 그룹으로 나눈다 */
  outline?: DocumentOutline | null
}

/** 묶음 하나 — 그룹, 그룹 없음, 문서에 없는 테이블 */
interface Section {
  key: string
  label: string
  /** 그룹 색 — 그룹 아닌 묶음은 없음 */
  color?: TableColorValue
  items: DatabaseObject[]
}

const UNGROUPED_KEY = '__ungrouped'
const NOT_IN_DOCUMENT_KEY = '__not-in-document'

export function ObjectList({
  objects,
  loading,
  error,
  selected,
  onSelect,
  onRefresh,
  refreshing,
  outline = null,
}: ObjectListProps) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  /** 접은 묶음 — 그룹은 그룹 id */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())

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

  const sections = useMemo<Section[] | null>(() => {
    if (!outline) return null
    const nameOf = (object: DatabaseObject) => object.name.toLowerCase()
    const grouped = new Set(outline.groups.flatMap((group) => [...group.tableNames]))
    const result: Section[] = outline.groups.map((group) => ({
      key: group.id,
      label: group.name,
      color: group.color,
      items: tables.filter((object) => group.tableNames.has(nameOf(object))),
    }))
    result.push({
      key: UNGROUPED_KEY,
      label: t('database.objects.ungrouped'),
      items: tables.filter(
        (object) => outline.tableNames.has(nameOf(object)) && !grouped.has(nameOf(object)),
      ),
    })
    result.push({
      key: NOT_IN_DOCUMENT_KEY,
      label: t('database.objects.notInDocument'),
      items: tables.filter((object) => !outline.tableNames.has(nameOf(object))),
    })
    // 걸러서 빈 묶음은 감춘다
    return result.filter((section) => section.items.length > 0)
  }, [outline, tables, t])

  const toggle = (key: string) =>
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <aside
      className="flex w-72 shrink-0 flex-col border-r"
      aria-label={t('database.objects.label')}
    >
      <div className="flex items-center gap-1 border-b p-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
          />
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
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t('database.objects.empty')}
          </p>
        ) : tables.length + views.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t('database.objects.noMatch')}
          </p>
        ) : (
          <>
            {sections ? (
              sections.map((section) => (
                <GroupSection
                  key={section.key}
                  section={section}
                  folded={folded.has(section.key)}
                  onToggle={() => toggle(section.key)}
                  selected={selected}
                  onSelect={onSelect}
                />
              ))
            ) : (
              <ObjectGroup
                label={t('database.objects.tables')}
                items={tables}
                selected={selected}
                onSelect={onSelect}
              />
            )}
            <ObjectGroup
              label={t('database.objects.views')}
              items={views}
              selected={selected}
              onSelect={onSelect}
            />
          </>
        )}
      </div>
    </aside>
  )
}

/** 문서 그룹 묶음 — 머리를 누르면 접힌다. 색은 에디터 탐색기의 그룹 폴더처럼 점으로, 머리는 옅게 물들인다 */
function GroupSection({
  section,
  folded,
  onToggle,
  selected,
  onSelect,
}: {
  section: Section
  folded: boolean
  onToggle: () => void
  selected: string | null
  onSelect: (name: string) => void
}) {
  const hex = section.color && section.color !== 'default' ? TABLE_COLOR_HEX[section.color] : null
  return (
    <section
      className="mb-2"
      data-testid="object-group"
      data-group={section.key}
      data-color={section.color ?? undefined}
    >
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!folded}
          className="flex h-7 w-full items-center gap-1.5 rounded-sm border-l-[3px] border-transparent px-2 text-left text-xs font-medium text-foreground/80 hover:bg-accent/60"
          style={hex ? { borderLeftColor: hex, backgroundColor: `${hex}1f` } : undefined}
        >
          {folded ? (
            <ChevronRight aria-hidden className="size-3 shrink-0" />
          ) : (
            <ChevronDown aria-hidden className="size-3 shrink-0" />
          )}
          {section.color !== undefined ? (
            <span
              aria-hidden
              data-testid="object-group-color"
              className={cn(
                'size-2.5 shrink-0 rounded-full border border-foreground/20',
                !hex && 'bg-muted-foreground/25',
              )}
              style={hex ? { backgroundColor: hex } : undefined}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{section.label}</span>
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
            {formatNumber(section.items.length)}
          </span>
        </button>
      </h2>
      {folded ? null : (
        <ObjectItems items={section.items} selected={selected} onSelect={onSelect} />
      )}
    </section>
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
  if (items.length === 0) return null

  return (
    <section className="mb-3">
      <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
        {label} ({formatNumber(items.length)})
      </h2>
      <ObjectItems items={items} selected={selected} onSelect={onSelect} />
    </section>
  )
}

function ObjectItems({
  items,
  selected,
  onSelect,
}: {
  items: DatabaseObject[]
  selected: string | null
  onSelect: (name: string) => void
}) {
  const { t } = useTranslation()
  return (
    <ul>
      {items.map((object) => (
        <li key={object.name}>
          <button
            type="button"
            onClick={() => onSelect(object.name)}
            aria-current={selected === object.name ? 'true' : undefined}
            title={commentTitle(object.comment)}
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
                {t('database.objects.estimatedRows', {
                  count: object.estimatedRows,
                  formatted: formatNumber(object.estimatedRows),
                })}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** 코멘트 툴팁 — ERD 논리명 관례(`논리명-----설명`)면 두 줄로 나눠 보여 준다(05-editor/01-core.md §3.3) */
function commentTitle(comment: string | null): string | undefined {
  if (!comment) return undefined
  const { name, description } = splitLogicalName(comment)
  return description ? `${name}\n${description}` : name
}
