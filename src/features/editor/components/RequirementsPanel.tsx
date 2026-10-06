/**
 * 요구사항 화면 — 문서 화면 맨 아래의 "요구사항" 탭 (v1.31, 05-editor/02-ui.md §17)
 *
 * 요구사항은 ERD 문서에 속한다(diagram.requirements). Claude가 MCP로 등록한 요구사항을 여기서 보고 고친다.
 * - 도메인(그룹)별로 정리한다(v1.32, §21). 왼쪽에 도메인 목록과 진행 상황, 오른쪽에 도메인마다 한 구역.
 *   순서는 그룹 → 미분류 → 공통. 행은 코드, 제목, 상태 판정 배지, 연결된 테이블 수.
 * - 위쪽 칩으로 판정을 걸러 보고, 찾기로 코드·제목·내용·테이블 이름에서 찾는다. 기본은 제외를 뺀 전체다.
 * - 행을 펼치면 내용과 연결된 테이블이 나온다. 테이블 이름을 누르면 캔버스가 그 테이블로 간다.
 *   "캔버스에서 보기"는 연결된 테이블(또는 도메인의 테이블)을 모두 골라 한 화면에 보여 준다.
 * - 도메인 구역 아래에 "근거 없는 테이블"(어떤 요구사항에도 연결되지 않은 테이블)을 보여 준다.
 * - 내보내기 — 요구사항 명세를 Markdown이나 CSV로 받는다.
 * - 편집(Editor 이상)은 다이얼로그에서 한다. 요구사항 변경은 문서 편집이라 되돌리기·자동 저장·협업이 같이 동작한다.
 * - 탭이 열릴 때만 마운트된다. 테이블 이름을 누르면 ERD 탭으로 돌아가 그 테이블로 간다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { ChevronDown, ChevronRight, ClipboardList, Download, LocateFixed, Pencil, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { viewportCenteredOn, type CanvasExtent } from '@/features/editor/model/canvas-bounds'
import { newId } from '@/features/editor/model/changes'
import { TABLE_COLOR_HEX, type ErdRequirement } from '@/features/editor/model/content-schema'
import {
  REQUIREMENT_LIMIT,
  REQUIREMENT_STATES,
  countRequirementStates,
  matchesRequirement,
  nextRequirementCode,
  requirementDomains,
  requirementState,
  requirementsToCsv,
  requirementsToMarkdown,
  type RequirementDomain,
  type RequirementExportLabels,
  type RequirementState,
} from '@/features/editor/model/requirements'
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/model/table-size'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { useRequirementsPanel } from '@/features/editor/store/requirements-panel-store'
import { downloadTextFile, safeFilename } from '@/lib/download'
import { RequirementDialog } from './RequirementDialog'

/** 포커스 클램프용 extent·줌 하한 — 익스플로러·검증 패널과 같은 값 */
const FOCUS_EXTENT: CanvasExtent = [
  [-1e9, -1e9],
  [1e9, 1e9],
]
const FOCUS_MIN_ZOOM = 0.6

/** 기본 필터 — 제외를 뺀 전체 */
const DEFAULT_STATES: readonly RequirementState[] = REQUIREMENT_STATES.filter((state) => state !== 'DROPPED')

const STATE_CLASS: Record<RequirementState, string> = {
  APPLIED: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
  PENDING: 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  UNLINKED: 'border-destructive/40 text-destructive',
  LEFTOVER: 'border-destructive/40 text-destructive',
  DRAFT: 'border-border text-muted-foreground',
  DROPPED: 'border-border text-muted-foreground line-through',
}

export interface RequirementsPanelProps {
  /** 편집 가능 여부 — Viewer, 공개 뷰어, 버전 뷰어는 읽기 전용으로 본다 */
  canEdit: boolean
  /** 문서 이름 — 내보내는 파일의 이름과 제목에 쓴다 */
  documentName?: string
}

export function RequirementsPanel({ canEdit, documentName }: RequirementsPanelProps) {
  const open = useRequirementsPanel((s) => s.open)
  if (!open) return null
  return <PanelBody canEdit={canEdit} documentName={documentName} />
}

/** 진행 막대 — 다루는 요구사항 가운데 반영된 비율 */
function ProgressBar({ applied, total, className }: { applied: number; total: number; className?: string }) {
  const percent = total > 0 ? Math.round((applied / total) * 100) : 0
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn('block h-1.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <span className="block h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${percent}%` }} />
    </span>
  )
}

/** 도메인 색 점 — 그룹의 색을 그대로 쓴다. 색이 없으면(기본·미분류·공통) 흐린 점 */
function DomainDot({ domain }: { domain: RequirementDomain }) {
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
      style={domain.color !== 'default' ? { backgroundColor: TABLE_COLOR_HEX[domain.color] } : undefined}
    />
  )
}

function PanelBody({ canEdit, documentName }: RequirementsPanelProps) {
  const { t } = useTranslation()
  const rf = useReactFlow()
  const present = useEditorStore((s) => s.present)
  const commit = useEditorStore((s) => s.commit)
  const setSelection = useEditorStore((s) => s.setSelection)
  const focusId = useRequirementsPanel((s) => s.focusId)
  const clearFocus = useRequirementsPanel((s) => s.clearFocus)

  const [states, setStates] = useState<ReadonlySet<RequirementState>>(() => new Set(DEFAULT_STATES))
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [dialog, setDialog] = useState<{ requirementId: string | null; areaId: string | null } | null>(null)
  /** 보고 있는 도메인 — 'all'이면 전부 */
  const [domainKey, setDomainKey] = useState('all')
  const [query, setQuery] = useState('')

  const requirements = present.diagram.requirements
  const counts = useMemo(() => countRequirementStates(requirements), [requirements])
  const tableName = useMemo(() => new Map(present.model.tables.map((table) => [table.id, table.physicalName])), [present.model.tables])
  /** 도메인 — 요구사항도 테이블도 없는 빈 그룹은 뺀다 */
  const domains = useMemo(
    () => requirementDomains(present).filter((domain) => domain.requirements.length > 0 || domain.tableIds.length > 0),
    [present],
  )
  /** 테이블의 첫 그룹 이름 — 도메인이 다른 테이블에 함께 보여 준다 */
  const areaOfTable = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const area of present.diagram.areas) {
      for (const tableId of area.tableIds) if (!map.has(tableId)) map.set(tableId, { id: area.id, name: area.name })
    }
    return map
  }, [present.diagram.areas])

  // 보던 도메인이 사라지면(그룹 삭제 등) 전체로 돌아간다
  const activeKey = domainKey === 'all' || domains.some((domain) => domain.key === domainKey) ? domainKey : 'all'
  const searching = query.trim().length > 0
  /** 그릴 구역 — 걸러진 행이 있거나, 찾는 중이 아니면서 알릴 것(요구사항 없음·근거 없는 테이블)이 있는 도메인 */
  const sections = useMemo(
    () =>
      domains
        .filter((domain) => activeKey === 'all' || domain.key === activeKey)
        .map((domain) => ({
          domain,
          rows: domain.requirements.filter(
            (requirement) => states.has(requirementState(requirement)) && matchesRequirement(requirement, query, tableName),
          ),
        }))
        .filter(
          ({ domain, rows }) =>
            rows.length > 0 ||
            (!searching && (activeKey !== 'all' || domain.untracedTableIds.length > 0 || domain.requirements.length === 0)),
        ),
    [domains, activeKey, states, query, tableName, searching],
  )
  const overall = useMemo(
    () => ({
      total: domains.reduce((sum, domain) => sum + domain.total, 0),
      applied: domains.reduce((sum, domain) => sum + domain.applied, 0),
    }),
    [domains],
  )

  /* ---------- 테이블 정보 창에서 넘어온 항목 — 필터를 풀고 펼쳐서 보이게 한다 ---------- */
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  useEffect(() => {
    if (!focusId) return
    const target = requirements.find((requirement) => requirement.id === focusId)
    if (target) {
      setStates((prev) => (prev.has(requirementState(target)) ? prev : new Set([...prev, requirementState(target)])))
      setExpanded((prev) => new Set([...prev, focusId]))
      setDomainKey('all')
      setQuery('')
      setCollapsed(new Set())
      // 필터가 풀려 행이 그려진 다음에 옮긴다
      setTimeout(() => rowRefs.current.get(focusId)?.scrollIntoView?.({ block: 'nearest' }), 0)
    }
    clearFocus()
  }, [focusId, requirements, clearFocus])

  /* ---------- 캔버스에서 보기 — 테이블을 골라 ERD 탭으로 돌아간다. 하나면 화면 중심으로, 여럿이면 한 화면에 들어오게 ---------- */
  const focusTables = useCallback(
    (tableIds: readonly string[]) => {
      const state = useEditorStore.getState()
      const boxes = tableIds.flatMap((tableId) => {
        const table = state.present.model.tables.find((tb) => tb.id === tableId)
        const layout = state.present.diagram.nodes[tableId]
        if (!table || !layout) return []
        const w = tableRenderWidth(layout.width ?? null, 0)
        const h = estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length + (table.checks?.length ?? 0))
        return [{ id: tableId, x: layout.x, y: layout.y, w, h }]
      })
      if (boxes.length === 0) return
      setSelection(boxes.map((box) => box.id))
      // ERD 탭으로 돌아간 뒤에 옮긴다 — 감춰져 있는 동안에는 캔버스의 크기를 잴 수 없다
      useRequirementsPanel.getState().hide()
      const minX = Math.min(...boxes.map((box) => box.x))
      const minY = Math.min(...boxes.map((box) => box.y))
      const maxX = Math.max(...boxes.map((box) => box.x + box.w))
      const maxY = Math.max(...boxes.map((box) => box.y + box.h))
      setTimeout(() => {
        if (boxes.length > 1) {
          rf.fitBounds({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, { padding: 0.2, duration: 200 })
          return
        }
        const el = document.querySelector('.react-flow')
        const size =
          el && el.clientWidth > 0
            ? { width: el.clientWidth, height: el.clientHeight }
            : { width: window.innerWidth || 1200, height: window.innerHeight || 800 }
        const zoom = Math.max(rf.getViewport().zoom, FOCUS_MIN_ZOOM)
        rf.setViewport(viewportCenteredOn({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, zoom, size, FOCUS_EXTENT), {
          duration: 200,
        })
      }, 60)
    },
    [rf, setSelection],
  )

  const toggleIn = <T extends string>(setter: (update: (prev: ReadonlySet<T>) => ReadonlySet<T>) => void, key: T) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const openCreate = (areaId: string | null = null) => {
    if (requirements.length >= REQUIREMENT_LIMIT) {
      toast.error(t('model.requirements.limit', { max: REQUIREMENT_LIMIT }))
      return
    }
    setDialog({ requirementId: null, areaId })
  }

  const domainName = (domain: RequirementDomain) =>
    domain.kind === 'area' ? domain.name : t(`model.requirements.group.${domain.kind}`)

  /* ---------- 내보내기 — 화면의 문구로 명세를 만든다 ---------- */
  const exportAs = (format: 'markdown' | 'csv') => {
    const labels: RequirementExportLabels = {
      heading: t('model.requirements.export.heading'),
      unassigned: t('model.requirements.group.unassigned'),
      document: t('model.requirements.group.document'),
      state: Object.fromEntries(REQUIREMENT_STATES.map((state) => [state, t(`model.requirements.state.${state}`)])) as Record<
        RequirementState,
        string
      >,
      progress: (applied, total) => t('model.requirements.progress', { applied, total }),
      tables: t('model.requirements.export.columns.tables'),
      untraced: t('model.requirements.untraced.title'),
      columns: {
        code: t('model.requirements.export.columns.code'),
        domain: t('model.requirements.export.columns.domain'),
        state: t('model.requirements.export.columns.state'),
        title: t('model.requirements.export.columns.title'),
        description: t('model.requirements.export.columns.description'),
        tables: t('model.requirements.export.columns.tables'),
        criteria: t('model.requirements.criteria.title'),
      },
    }
    const name = documentName ?? t('model.requirements.title')
    const base = `${safeFilename(name, 'requirements')}-requirements`
    if (format === 'markdown') downloadTextFile(`${base}.md`, requirementsToMarkdown(present, name, labels), 'text/markdown')
    else downloadTextFile(`${base}.csv`, requirementsToCsv(present, labels), 'text/csv')
  }

  const editing = dialog?.requirementId ? (requirements.find((r) => r.id === dialog.requirementId) ?? null) : null

  return (
    <section
      data-testid="requirements-panel"
      aria-label={t('model.requirements.title')}
      className="min-h-0 flex-1 overflow-y-auto bg-background"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-1 pb-3">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <ClipboardList aria-hidden className="size-4" />
            {t('model.requirements.title')}
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{requirements.length}</span>
          </h2>
          {/* 전체 진행 — 다루는 요구사항 가운데 반영된 수 */}
          {overall.total > 0 ? (
            <div className="flex min-w-40 flex-1 items-center gap-2 sm:max-w-xs" data-testid="requirement-progress">
              <ProgressBar applied={overall.applied} total={overall.total} className="flex-1" />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {t('model.requirements.progress', overall)}
              </span>
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            {requirements.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" data-testid="requirement-export">
                    <Download aria-hidden className="size-3.5" />
                    {t('model.requirements.export.button')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem data-testid="requirement-export-markdown" onSelect={() => exportAs('markdown')}>
                    {t('model.requirements.export.markdown')}
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="requirement-export-csv" onSelect={() => exportAs('csv')}>
                    {t('model.requirements.export.csv')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                data-testid="requirement-add"
                onClick={() => openCreate(domains.find((domain) => domain.key === activeKey && domain.kind === 'area')?.key ?? null)}
              >
                <Plus aria-hidden className="size-3.5" />
                {t('model.requirements.add')}
              </Button>
            ) : null}
          </div>
        </div>

        {/* 찾기와 판정 필터 — 칩이 요약이자 토글이다(활성=보임) */}
        <div className="flex flex-wrap items-center gap-2 border-b px-1 py-2">
          <div className="relative w-full sm:w-64">
            <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('model.requirements.search')}
              aria-label={t('model.requirements.search')}
              data-testid="requirement-search"
              className="h-7 pl-7 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('model.requirements.filterLabel')}>
            {REQUIREMENT_STATES.map((state) => {
              const active = states.has(state)
              return (
                <button
                  key={state}
                  type="button"
                  data-testid={`requirement-filter-${state}`}
                  aria-pressed={active}
                  title={t(`model.requirements.stateHint.${state}`)}
                  onClick={() => toggleIn(setStates, state)}
                  className={cn(
                    'flex h-7 items-center gap-1 rounded-md border px-2 text-sm font-medium tabular-nums',
                    STATE_CLASS[state],
                    state === 'DROPPED' && 'no-underline',
                    !active && 'opacity-40',
                  )}
                >
                  {t(`model.requirements.state.${state}`)} {counts[state]}
                </button>
              )
            })}
          </div>
        </div>

        {requirements.length === 0 ? (
          <div data-testid="requirements-empty" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <ClipboardList aria-hidden className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">{t('model.requirements.empty')}</p>
            <p className="text-xs text-muted-foreground">{t('model.requirements.emptyDetail')}</p>
          </div>
        ) : (
          <div className="grid gap-4 py-3 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6">
            {/* 도메인 목록 — 넓은 화면에서는 왼쪽에 붙어 따라오고, 좁은 화면에서는 위에 가로로 놓인다 */}
            <nav
              aria-label={t('model.requirements.domains.label')}
              data-testid="requirement-domain-nav"
              className="flex gap-1 overflow-x-auto lg:sticky lg:top-0 lg:max-h-[calc(100svh-12rem)] lg:flex-col lg:self-start lg:overflow-y-auto lg:overflow-x-visible"
            >
              <DomainNavItem
                active={activeKey === 'all'}
                label={t('model.requirements.domains.all')}
                applied={overall.applied}
                total={overall.total}
                pending={counts.PENDING}
                onClick={() => setDomainKey('all')}
                testKey="all"
              />
              {domains.map((domain) => (
                <DomainNavItem
                  key={domain.key}
                  active={activeKey === domain.key}
                  label={domainName(domain)}
                  dot={<DomainDot domain={domain} />}
                  applied={domain.applied}
                  total={domain.total}
                  pending={domain.counts.PENDING}
                  gap={domain.requirements.length === 0 || domain.untracedTableIds.length > 0}
                  onClick={() => setDomainKey(domain.key)}
                  testKey={domain.key}
                />
              ))}
            </nav>

            <div className="min-w-0">
              {sections.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground" data-testid="requirements-empty-filtered">
                  {t('model.requirements.emptyFiltered')}
                </p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {sections.map(({ domain, rows }) => {
                    const folded = collapsed.has(domain.key)
                    return (
                      <li key={domain.key} data-testid="requirement-group" data-key={domain.key} className="rounded-lg border">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-3 py-2">
                          <button
                            type="button"
                            aria-expanded={!folded}
                            onClick={() => toggleIn(setCollapsed, domain.key)}
                            className="flex min-w-0 items-center gap-2 rounded text-left"
                          >
                            {folded ? (
                              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <DomainDot domain={domain} />
                            <h3 className="truncate text-sm font-semibold" data-testid="requirement-group-name">
                              {domainName(domain)}
                            </h3>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="requirement-group-count">
                              {rows.length}
                            </span>
                          </button>
                          {domain.total > 0 ? (
                            <span className="flex items-center gap-2">
                              <ProgressBar applied={domain.applied} total={domain.total} className="w-20" />
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {t('model.requirements.progress', { applied: domain.applied, total: domain.total })}
                              </span>
                            </span>
                          ) : null}
                          {domain.counts.PENDING > 0 ? (
                            <span className={cn('rounded border px-1.5 text-xs font-medium leading-5', STATE_CLASS.PENDING)}>
                              {t('model.requirements.state.PENDING')} {domain.counts.PENDING}
                            </span>
                          ) : null}
                          <span className="ml-auto flex items-center gap-1">
                            {domain.kind === 'area' && domain.tableIds.length > 0 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 gap-1 px-2 text-xs"
                                data-testid="requirement-domain-canvas"
                                onClick={() => focusTables(domain.tableIds)}
                              >
                                <LocateFixed aria-hidden className="size-3" />
                                {t('model.requirements.domains.showOnCanvas')}
                              </Button>
                            ) : null}
                            {canEdit && domain.kind !== 'document' ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 gap-1 px-2 text-xs"
                                data-testid="requirement-domain-add"
                                onClick={() => openCreate(domain.kind === 'area' ? domain.key : null)}
                              >
                                <Plus aria-hidden className="size-3" />
                                {t('model.requirements.add')}
                              </Button>
                            ) : null}
                          </span>
                        </div>
                        {folded ? null : (
                          <div className="px-2 py-2">
                            {rows.length > 0 ? (
                              <ul className="flex flex-col">
                                {rows.map((requirement) => (
                                  <RequirementRow
                                    key={requirement.id}
                                    requirement={requirement}
                                    expanded={expanded.has(requirement.id)}
                                    canEdit={canEdit}
                                    tableName={tableName}
                                    areaOfTable={areaOfTable}
                                    onToggle={() => toggleIn(setExpanded, requirement.id)}
                                    onFocusTable={(tableId) => focusTables([tableId])}
                                    onFocusTables={() => focusTables(requirement.tableIds)}
                                    onEdit={() => setDialog({ requirementId: requirement.id, areaId: null })}
                                    onToggleCriterion={(criterionId, done) =>
                                      commit({
                                        type: 'requirement/patch',
                                        requirementId: requirement.id,
                                        patch: {
                                          criteria: (requirement.criteria ?? []).map((criterion) =>
                                            criterion.id === criterionId ? { ...criterion, done } : criterion,
                                          ),
                                        },
                                      })
                                    }
                                    onMarkApplied={() =>
                                      commit({
                                        type: 'requirement/patch',
                                        requirementId: requirement.id,
                                        patch: { appliedRevision: requirement.revision },
                                      })
                                    }
                                    rowRef={(element) => {
                                      if (element) rowRefs.current.set(requirement.id, element)
                                      else rowRefs.current.delete(requirement.id)
                                    }}
                                  />
                                ))}
                              </ul>
                            ) : (
                              <p className="px-2 py-3 text-sm text-muted-foreground" data-testid="requirement-domain-empty">
                                {domain.requirements.length === 0
                                  ? t('model.requirements.domains.noRequirements')
                                  : t('model.requirements.emptyFiltered')}
                              </p>
                            )}
                            {/* 근거 없는 테이블 — 이 도메인의 테이블인데 어떤 요구사항에도 연결되지 않았다. 찾는 중에는 감춘다 */}
                            {!searching && domain.untracedTableIds.length > 0 ? (
                              <div data-testid="requirement-domain-untraced" className="mt-2 border-t px-2 pt-2">
                                <p className="text-xs font-semibold text-muted-foreground" title={t('model.requirements.untraced.hint')}>
                                  {t('model.requirements.untraced.title')}
                                  <span className="ml-1 font-normal tabular-nums">{domain.untracedTableIds.length}</span>
                                </p>
                                <ul className="mt-1 flex flex-wrap gap-1">
                                  {domain.untracedTableIds.map((tableId) => (
                                    <li key={tableId}>
                                      <button
                                        type="button"
                                        onClick={() => focusTables([tableId])}
                                        className="rounded-md border border-dashed px-2 py-0.5 font-mono text-xs hover:bg-accent/60"
                                      >
                                        {tableName.get(tableId) ?? tableId}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        <RequirementDialog
          open={dialog !== null}
          onOpenChange={(next) => {
            if (!next) setDialog(null)
          }}
          requirement={editing}
          defaultAreaId={dialog?.areaId ?? null}
          nextCode={nextRequirementCode(requirements)}
          areas={present.diagram.areas}
          tables={present.model.tables.map((table) => ({ id: table.id, physical: table.physicalName }))}
          onCreate={(draft) =>
            commit({
              type: 'requirement/create',
              requirement: {
                id: newId(),
                code: nextRequirementCode(useEditorStore.getState().present.diagram.requirements),
                revision: 1,
                appliedRevision: 0,
                ...draft,
              },
            })
          }
          onPatch={(requirementId, patch) => commit({ type: 'requirement/patch', requirementId, patch })}
          onRemove={(requirementId) => commit({ type: 'requirement/remove', requirementId })}
        />
      </div>
    </section>
  )
}

/** 도메인 목록의 한 줄 — 이름, 반영 수, 진행 막대. 반영 대기가 있거나 빠진 곳이 있으면 점으로 알린다 */
function DomainNavItem({
  active,
  label,
  dot,
  applied,
  total,
  pending,
  gap = false,
  onClick,
  testKey,
}: {
  active: boolean
  label: string
  dot?: React.ReactNode
  applied: number
  total: number
  pending: number
  gap?: boolean
  onClick: () => void
  testKey: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid="requirement-domain-item"
      data-key={testKey}
      className={cn(
        'flex min-w-36 shrink-0 flex-col gap-1 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors lg:min-w-0 lg:border-transparent',
        active ? 'border-border bg-muted font-medium lg:border-transparent' : 'text-muted-foreground hover:bg-muted/60',
      )}
    >
      <span className="flex items-center gap-2">
        {dot}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {pending > 0 || gap ? <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', pending > 0 ? 'bg-amber-500' : 'bg-destructive/70')} /> : null}
        <span className="shrink-0 text-xs font-normal tabular-nums">
          {applied}/{total}
        </span>
      </span>
      <ProgressBar applied={applied} total={total} />
    </button>
  )
}

function RequirementRow({
  requirement,
  expanded,
  canEdit,
  tableName,
  areaOfTable,
  onToggle,
  onFocusTable,
  onFocusTables,
  onEdit,
  onToggleCriterion,
  onMarkApplied,
  rowRef,
}: {
  requirement: ErdRequirement
  expanded: boolean
  canEdit: boolean
  tableName: ReadonlyMap<string, string>
  areaOfTable: ReadonlyMap<string, { id: string; name: string }>
  onToggle: () => void
  onFocusTable: (tableId: string) => void
  /** 연결된 테이블을 모두 골라 캔버스에서 본다 */
  onFocusTables: () => void
  onToggleCriterion: (criterionId: string, done: boolean) => void
  onEdit: () => void
  onMarkApplied: () => void
  rowRef: (element: HTMLLIElement | null) => void
}) {
  const { t } = useTranslation()
  const state = requirementState(requirement)
  const criteria = requirement.criteria ?? []
  const criteriaDone = criteria.filter((criterion) => criterion.done).length
  return (
    <li ref={rowRef} data-testid="requirement-row" data-state={state}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-accent/60"
      >
        {expanded ? (
          <ChevronDown aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{requirement.code}</span>
            <span
              data-testid="requirement-state"
              className={cn('shrink-0 rounded border px-1.5 text-xs font-medium leading-5', STATE_CLASS[state], 'no-underline')}
            >
              {t(`model.requirements.state.${state}`)}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
              {criteria.length > 0 ? (
                <span
                  data-testid="requirement-criteria-count"
                  className={cn(criteriaDone === criteria.length && 'text-emerald-700 dark:text-emerald-400')}
                >
                  {t('model.requirements.criteria.count', { done: criteriaDone, total: criteria.length })}
                </span>
              ) : null}
              {requirement.scope === 'tables' ? (
                <span>{t('model.requirements.tableCount', { count: requirement.tableIds.length })}</span>
              ) : null}
            </span>
          </span>
          {/* 제목은 자르지 않고 줄을 바꾼다. 접혀 있을 때는 내용의 앞 두 줄을 미리 보여 준다 */}
          <span className={cn('block break-words font-medium', state === 'DROPPED' && 'text-muted-foreground line-through')}>
            {requirement.title}
          </span>
          {!expanded && requirement.description ? (
            <span data-testid="requirement-preview" className="mt-0.5 line-clamp-2 block whitespace-pre-line break-words text-xs text-muted-foreground">
              {requirement.description}
            </span>
          ) : null}
        </span>
      </button>
      {expanded ? (
        <div className="mb-2 ml-6 flex flex-col gap-2 border-l pl-3 text-sm" data-testid="requirement-detail">
          <RequirementDescription text={requirement.description} emptyLabel={t('model.requirements.noDescription')} />
          {/* 수용 기준 — 체크는 바로 저장된다(문서 편집). 읽기 전용이면 보기만 한다 */}
          {criteria.length > 0 ? (
            <ul className="flex flex-col gap-1" aria-label={t('model.requirements.criteria.title')} data-testid="requirement-criteria">
              {criteria.map((criterion) => (
                <li key={criterion.id}>
                  <label className="flex items-start gap-2">
                    <Checkbox
                      className="mt-0.5"
                      checked={criterion.done}
                      disabled={!canEdit}
                      onCheckedChange={(checked) => onToggleCriterion(criterion.id, checked === true)}
                    />
                    <span className={cn('break-words', criterion.done && 'text-muted-foreground line-through')}>{criterion.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {requirement.scope === 'tables' ? (
            requirement.tableIds.length > 0 ? (
              <ul className="flex flex-col" aria-label={t('model.requirements.linkedTables')}>
                {requirement.tableIds.map((tableId) => {
                  const area = areaOfTable.get(tableId)
                  const foreign = area && area.id !== requirement.areaId
                  return (
                    <li key={tableId}>
                      <button
                        type="button"
                        data-testid="requirement-table"
                        onClick={() => onFocusTable(tableId)}
                        className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-accent/60"
                      >
                        <span className="min-w-0 truncate font-mono">{tableName.get(tableId) ?? tableId}</span>
                        {foreign ? <span className="shrink-0 text-[10px] text-muted-foreground">{area.name}</span> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t('model.requirements.noTables')}</p>
            )
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
            {requirement.scope === 'tables' && requirement.tableIds.length > 0 ? (
              <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs" data-testid="requirement-show-on-canvas" onClick={onFocusTables}>
                <LocateFixed aria-hidden className="size-3" />
                {t('model.requirements.domains.showOnCanvas')}
              </Button>
            ) : null}
            {canEdit && state === 'PENDING' ? (
              <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" data-testid="requirement-mark-applied" onClick={onMarkApplied}>
                {t('model.requirements.markApplied')}
              </Button>
            ) : null}
            {canEdit ? (
              <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" data-testid="requirement-edit" onClick={onEdit}>
                <Pencil aria-hidden className="size-3" />
                {t('common.edit')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  )
}

/**
 * 요구사항의 내용 — 줄을 나눠 보여 준다.
 * 줄바꿈이 있으면 그대로 따르고, "- "나 "• "로 시작하는 줄은 목록으로 그린다.
 * 줄바꿈 없이 문장이 이어진 글(MCP가 한 줄로 등록한 경우)은 문장마다 줄을 나눈다.
 */
function RequirementDescription({ text, emptyLabel }: { text: string; emptyLabel: string }) {
  const lines = descriptionLines(text)
  if (lines.length === 0) return <p className="text-muted-foreground">{emptyLabel}</p>
  if (lines.length === 1) return <p className="whitespace-pre-wrap break-words text-muted-foreground">{lines[0]}</p>
  return (
    <ul className="grid list-disc gap-1 pl-5 text-muted-foreground" data-testid="requirement-description-lines">
      {lines.map((line, index) => (
        <li key={index} className="break-words">
          {line}
        </li>
      ))}
    </ul>
  )
}

/** 내용을 보여 줄 줄로 나눈다 — 목록 표시를 떼고 빈 줄을 버린다 */
export function descriptionLines(text: string): string[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return []
  const byNewline = trimmed.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
  // 문장 끝(마침표·물음표·느낌표) 뒤의 공백에서 나눈다 — 0.5 같은 소수점은 뒤에 공백이 없어 나뉘지 않는다
  const source = byNewline.length > 1 ? byNewline : trimmed.split(/(?<=[.!?。])\s+/)
  return source.map((line) => line.trim().replace(/^[-•*·]\s+/, '')).filter((line) => line.length > 0)
}
