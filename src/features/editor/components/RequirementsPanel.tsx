/**
 * 요구사항 화면 — 문서 화면 맨 아래의 "요구사항" 탭 (v1.31, 05-editor/02-ui.md §17)
 *
 * 요구사항은 ERD 문서에 속한다(diagram.requirements). Claude가 MCP로 등록한 요구사항을 여기서 보고 고친다.
 * - 도메인(그룹)별 묶음 → 미분류 → 공통 순서. 행은 코드, 제목, 상태 판정 배지, 연결된 테이블 수.
 * - 위쪽 칩으로 판정을 걸러 본다. 기본은 제외를 뺀 전체다.
 * - 행을 펼치면 내용과 연결된 테이블이 나온다. 테이블 이름을 누르면 캔버스가 그 테이블로 간다.
 * - 아래에 "근거 없는 테이블"(어떤 요구사항에도 연결되지 않은 테이블)을 따로 보여 준다.
 * - 편집(Editor 이상)은 다이얼로그에서 한다. 요구사항 변경은 문서 편집이라 되돌리기·자동 저장·협업이 같이 동작한다.
 * - 탭이 열릴 때만 마운트된다. 테이블 이름을 누르면 ERD 탭으로 돌아가 그 테이블로 간다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { ChevronDown, ChevronRight, ClipboardList, Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { viewportCenteredOn, type CanvasExtent } from '@/features/editor/model/canvas-bounds'
import { newId } from '@/features/editor/model/changes'
import type { ErdRequirement } from '@/features/editor/model/content-schema'
import {
  REQUIREMENT_LIMIT,
  REQUIREMENT_STATES,
  countRequirementStates,
  groupRequirements,
  nextRequirementCode,
  requirementState,
  untracedTableIds,
  type RequirementState,
} from '@/features/editor/model/requirements'
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/model/table-size'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { useRequirementsPanel } from '@/features/editor/store/requirements-panel-store'
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
}

export function RequirementsPanel({ canEdit }: RequirementsPanelProps) {
  const open = useRequirementsPanel((s) => s.open)
  if (!open) return null
  return <PanelBody canEdit={canEdit} />
}

function PanelBody({ canEdit }: RequirementsPanelProps) {
  const { t } = useTranslation()
  const rf = useReactFlow()
  const present = useEditorStore((s) => s.present)
  const commit = useEditorStore((s) => s.commit)
  const setSelection = useEditorStore((s) => s.setSelection)
  const focusId = useRequirementsPanel((s) => s.focusId)
  const clearFocus = useRequirementsPanel((s) => s.clearFocus)

  const [states, setStates] = useState<ReadonlySet<RequirementState>>(() => new Set(DEFAULT_STATES))
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [dialog, setDialog] = useState<{ requirementId: string | null } | null>(null)

  const requirements = present.diagram.requirements
  const counts = useMemo(() => countRequirementStates(requirements), [requirements])
  const groups = useMemo(
    () => groupRequirements(present, (requirement) => states.has(requirementState(requirement))),
    [present, states],
  )
  const tableName = useMemo(() => new Map(present.model.tables.map((table) => [table.id, table.physicalName])), [present.model.tables])
  /** 테이블의 첫 그룹 이름 — 도메인이 다른 테이블에 함께 보여 준다 */
  const areaOfTable = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const area of present.diagram.areas) {
      for (const tableId of area.tableIds) if (!map.has(tableId)) map.set(tableId, { id: area.id, name: area.name })
    }
    return map
  }, [present.diagram.areas])
  const untraced = useMemo(() => untracedTableIds(present), [present])

  /* ---------- 테이블 정보 창에서 넘어온 항목 — 필터를 풀고 펼쳐서 보이게 한다 ---------- */
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  useEffect(() => {
    if (!focusId) return
    const target = requirements.find((requirement) => requirement.id === focusId)
    if (target) {
      setStates((prev) => (prev.has(requirementState(target)) ? prev : new Set([...prev, requirementState(target)])))
      setExpanded((prev) => new Set([...prev, focusId]))
      // 필터가 풀려 행이 그려진 다음에 옮긴다
      setTimeout(() => rowRefs.current.get(focusId)?.scrollIntoView?.({ block: 'nearest' }), 0)
    }
    clearFocus()
  }, [focusId, requirements, clearFocus])

  /* ---------- 포커스 — 대상 테이블을 화면 중심으로 (익스플로러·검증 패널과 같은 식) ---------- */
  const focusTable = useCallback(
    (tableId: string) => {
      const state = useEditorStore.getState()
      const table = state.present.model.tables.find((tb) => tb.id === tableId)
      const layout = state.present.diagram.nodes[tableId]
      if (!table || !layout) return
      setSelection([tableId])
      // ERD 탭으로 돌아간 뒤에 옮긴다 — 감춰져 있는 동안에는 캔버스의 크기를 잴 수 없다
      useRequirementsPanel.getState().hide()
      const w = tableRenderWidth(layout.width ?? null, 0)
      const h = estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length)
      setTimeout(() => {
        const el = document.querySelector('.react-flow')
        const size =
          el && el.clientWidth > 0
            ? { width: el.clientWidth, height: el.clientHeight }
            : { width: window.innerWidth || 1200, height: window.innerHeight || 800 }
        const zoom = Math.max(rf.getViewport().zoom, FOCUS_MIN_ZOOM)
        rf.setViewport(viewportCenteredOn({ x: layout.x + w / 2, y: layout.y + h / 2 }, zoom, size, FOCUS_EXTENT), {
          duration: 200,
        })
      }, 60)
    },
    [rf, setSelection],
  )

  const toggleExpanded = (requirementId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(requirementId)) next.delete(requirementId)
      else next.add(requirementId)
      return next
    })

  const openCreate = () => {
    if (requirements.length >= REQUIREMENT_LIMIT) {
      toast.error(t('model.requirements.limit', { max: REQUIREMENT_LIMIT }))
      return
    }
    setDialog({ requirementId: null })
  }

  const editing = dialog?.requirementId ? (requirements.find((r) => r.id === dialog.requirementId) ?? null) : null

  return (
    <section
      data-testid="requirements-panel"
      aria-label={t('model.requirements.title')}
      className="min-h-0 flex-1 overflow-y-auto bg-background"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col px-4 py-4">
      <div className="flex items-center justify-between border-b px-1 pb-2">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          <ClipboardList aria-hidden className="size-4" />
          {t('model.requirements.title')}
          <span className="text-xs font-normal tabular-nums text-muted-foreground">{requirements.length}</span>
        </h2>
        {canEdit ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" data-testid="requirement-add" onClick={openCreate}>
            <Plus aria-hidden className="size-3.5" />
            {t('model.requirements.add')}
          </Button>
        ) : null}
      </div>

      {/* 판정 필터 — 칩이 요약이자 토글이다(활성=보임) */}
      <div className="flex flex-wrap gap-1 border-b px-1 py-2" role="group" aria-label={t('model.requirements.filterLabel')}>
        {REQUIREMENT_STATES.map((state) => {
          const active = states.has(state)
          return (
            <button
              key={state}
              type="button"
              data-testid={`requirement-filter-${state}`}
              aria-pressed={active}
              title={t(`model.requirements.stateHint.${state}`)}
              onClick={() =>
                setStates((prev) => {
                  const next = new Set(prev)
                  if (next.has(state)) next.delete(state)
                  else next.add(state)
                  return next
                })
              }
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

      <div className="px-1 py-3">
        {requirements.length === 0 ? (
          <div data-testid="requirements-empty" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <ClipboardList aria-hidden className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">{t('model.requirements.empty')}</p>
            <p className="text-xs text-muted-foreground">{t('model.requirements.emptyDetail')}</p>
          </div>
        ) : groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('model.requirements.emptyFiltered')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {groups.map((group) => (
              <li key={group.key} data-testid="requirement-group">
                <p className="truncate px-1.5 py-1 text-sm font-semibold text-muted-foreground">
                  {group.kind === 'area' ? group.name : t(`model.requirements.group.${group.kind}`)}
                  <span className="ml-1 font-normal tabular-nums">{group.requirements.length}</span>
                </p>
                <ul className="flex flex-col">
                  {group.requirements.map((requirement) => (
                    <RequirementRow
                      key={requirement.id}
                      requirement={requirement}
                      expanded={expanded.has(requirement.id)}
                      canEdit={canEdit}
                      tableName={tableName}
                      areaOfTable={areaOfTable}
                      onToggle={() => toggleExpanded(requirement.id)}
                      onFocusTable={focusTable}
                      onEdit={() => setDialog({ requirementId: requirement.id })}
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
              </li>
            ))}
          </ul>
        )}

        {/* 근거 없는 테이블 — 어떤 요구사항에도 연결되지 않았다. 요구사항이 하나도 없으면 뜻이 없어 숨긴다 */}
        {requirements.length > 0 && untraced.length > 0 ? (
          <section data-testid="requirements-untraced" className="mt-3 border-t pt-2">
            <p className="px-1.5 text-xs font-semibold text-muted-foreground" title={t('model.requirements.untraced.hint')}>
              {t('model.requirements.untraced.title')}
              <span className="ml-1 font-normal tabular-nums">{untraced.length}</span>
            </p>
            <ul className="mt-0.5 flex flex-col">
              {untraced.map((tableId) => (
                <li key={tableId}>
                  <button
                    type="button"
                    onClick={() => focusTable(tableId)}
                    className="w-full truncate rounded-md px-1.5 py-1 text-left font-mono text-sm hover:bg-accent/60"
                  >
                    {tableName.get(tableId) ?? tableId}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <RequirementDialog
        open={dialog !== null}
        onOpenChange={(next) => {
          if (!next) setDialog(null)
        }}
        requirement={editing}
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

function RequirementRow({
  requirement,
  expanded,
  canEdit,
  tableName,
  areaOfTable,
  onToggle,
  onFocusTable,
  onEdit,
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
  onEdit: () => void
  onMarkApplied: () => void
  rowRef: (element: HTMLLIElement | null) => void
}) {
  const { t } = useTranslation()
  const state = requirementState(requirement)
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
            {requirement.scope === 'tables' ? (
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {t('model.requirements.tableCount', { count: requirement.tableIds.length })}
              </span>
            ) : null}
          </span>
          <span className={cn('block truncate font-medium', state === 'DROPPED' && 'text-muted-foreground line-through')}>
            {requirement.title}
          </span>
        </span>
      </button>
      {expanded ? (
        <div className="mb-2 ml-6 flex flex-col gap-2 border-l pl-3 text-sm" data-testid="requirement-detail">
          <p className="whitespace-pre-wrap break-words text-muted-foreground">
            {requirement.description || t('model.requirements.noDescription')}
          </p>
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
          {canEdit ? (
            <div className="flex items-center gap-1">
              {state === 'PENDING' ? (
                <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" data-testid="requirement-mark-applied" onClick={onMarkApplied}>
                  {t('model.requirements.markApplied')}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" data-testid="requirement-edit" onClick={onEdit}>
                <Pencil aria-hidden className="size-3" />
                {t('common.edit')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
