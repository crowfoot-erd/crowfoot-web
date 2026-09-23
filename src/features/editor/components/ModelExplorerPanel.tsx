/**
 * 모델 익스플로러 — 에디터 좌측 탐색 패널 (05-editor/02-ui.md §3·§11)
 *
 * 테이블/관계/메모 3그룹 트리 + 상단 객체 검색이 한 덩어리다. v1은 탐색·선택 전용 —
 * 생성·삭제·이름 변경은 캔버스의 기존 UX(컨텍스트 메뉴·다이얼로그)를 그대로 쓴다.
 *
 * - 테이블 목록은 그룹(주제 영역) 폴더로 묶는다(v1.13): 그룹 폴더 + 미분류. 폴더 헤더
 *   클릭·셰브론은 목록 접기(패널의 보기 상태 — 문서를 고치지 않는다), 눈 아이콘은 그룹
 *   보기 필터(activeAreaId — 캔버스·툴바와 같은 상태, 진입 시 멤버를 화면에 맞춘다).
 *   편집(✎)은 그룹 편집 다이얼로그(EditorShell 소유), 삭제(🗑)는 area/remove — 멤버
 *   테이블은 남는다.
 * - 선택 원천은 스토어 selectedIds — 캔버스 클릭과 이 패널 클릭이 같은 상태를 고쳐 쓴다
 *   (§3 양방향 동기화). 행 클릭은 선택 + 포커스 이동(객체를 화면 중심에 두고 줌 하한 보정).
 * - 검색은 문서 전체를 로컬 계산(object-search — 스토어 구독이라 캔버스 성능과 무관)하고
 *   Enter로 일치 항목을 순회하며 선택·포커스한다(§11 플로우: 검색→선택→포커스→하이라이트).
 * - ReactFlowProvider 안(EditorShellInner)에서 렌더된다 — 포커스 이동에 useReactFlow를 쓴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { ArrowLeftRight, ChevronDown, ChevronRight, Eye, Pencil, Search, StickyNote, Table2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from 'cn'
import { Input } from '@/components/ui/input'
import { TABLE_COLOR_HEX, type EditorDocument } from '@/features/editor/model/content-schema'
import {
  NOTE_ESTIMATED_HEIGHT,
  contentBounds,
  viewportCenteredOn,
  viewportFittedTo,
  type CanvasExtent,
} from '@/features/editor/model/canvas-bounds'
import { tablesOfArea } from '@/features/editor/model/areas'
import { searchObjects, type ObjectHit } from '@/features/editor/model/object-search'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { estimateTableHeight, tableRenderWidth } from './canvas/TableNode'
import type { NameDisplayMode } from './canvas/editor-context'

export interface ModelExplorerPanelProps {
  open: boolean
  /** 외부에서 검색으로 데려오는 신호(Ctrl+F) — 값이 바뀔 때마다 검색 입력에 포커스 */
  focusSearchSignal: number
  nameDisplay: NameDisplayMode
  /** 보기 필터로 선택된 주제 영역 — null이면 전체(캔버스·툴바 보기 메뉴와 같은 상태) */
  activeAreaId: string | null
  onActiveAreaChange: (areaId: string | null) => void
  /** 편집 권한 — 그룹 폴더의 편집·삭제 버튼만 게이트(탐색·필터는 읽기 전용도 가능) */
  canEdit: boolean
  /** 그룹 편집 다이얼로그 열기 — 다이얼로그는 EditorShell이 소유한다 */
  onOpenAreaEdit: (areaId: string) => void
}

/** 포커스 클램프용 extent — 대상은 문서 안 객체라 사실상 무제한(캔버스 한계보다 안쪽) */
const FOCUS_EXTENT: CanvasExtent = [
  [-1e9, -1e9],
  [1e9, 1e9],
]

/** 포커스 시 줌 하한 — 멀리서 보던 화면 배율로는 객체를 알아볼 수 없어 살짝 당긴다 */
const FOCUS_MIN_ZOOM = 0.6

/** 그룹 보기 진입 — 그룹 멤버를 화면에 맞춘다. focusPoint와 같은 방식으로 **스토어 좌표에서
 *  뷰포트를 계산해 setViewport**한다 — 렌더된 노드를 검색하는 fitView는 다른 그룹에서 곧바로
 *  전환할 때 호출 시점에 새 그룹 노드가 아직 렌더되지 않아 무시된다(실사용 회귀, 2026-09-23).
 *  익스플로러 눈 아이콘과 툴바 보기 메뉴 라디오가 같이 쓴다. */
export function useAreaViewFit() {
  const rf = useReactFlow()
  return useCallback(
    (areaId: string) => {
      const present = useEditorStore.getState().present
      const bounds = contentBounds(present, {}, tablesOfArea(present, areaId))
      if (!bounds) return
      const el = document.querySelector('.react-flow')
      const size = el
        ? { width: el.clientWidth, height: el.clientHeight }
        : { width: window.innerWidth || 1200, height: window.innerHeight || 800 }
      rf.setViewport(viewportFittedTo(bounds, size, FOCUS_EXTENT), { duration: 200 })
    },
    [rf],
  )
}

export function ModelExplorerPanel(props: ModelExplorerPanelProps) {
  if (!props.open) return null
  return (
    <ExplorerBody
      nameDisplay={props.nameDisplay}
      focusSearchSignal={props.focusSearchSignal}
      activeAreaId={props.activeAreaId}
      onActiveAreaChange={props.onActiveAreaChange}
      canEdit={props.canEdit}
      onOpenAreaEdit={props.onOpenAreaEdit}
    />
  )
}

type GroupKey = 'tables' | 'relationships' | 'notes'
/** 미분류 폴더의 접기 키 — 문서 객체가 없어 패널 로컬 키로 식별한다 */
const UNGROUPED_KEY = '__ungrouped__'

function ExplorerBody({
  nameDisplay,
  focusSearchSignal,
  activeAreaId,
  onActiveAreaChange,
  canEdit,
  onOpenAreaEdit,
}: {
  nameDisplay: NameDisplayMode
  focusSearchSignal: number
  activeAreaId: string | null
  onActiveAreaChange: (areaId: string | null) => void
  canEdit: boolean
  onOpenAreaEdit: (areaId: string) => void
}) {
  const { t } = useTranslation()
  const rf = useReactFlow()
  const doc = useEditorStore((s) => s.present)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const setSelection = useEditorStore((s) => s.setSelection)
  const commit = useEditorStore((s) => s.commit)

  const [query, setQuery] = useState('')
  /** 펼친 테이블 — 기본은 모두 접힌다(리버스 문서처럼 테이블이 수십 개면 펼침이 병목) */
  const [expandedTables, setExpandedTables] = useState<ReadonlySet<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<GroupKey>>(new Set())
  /** 폴더 접힘 — 목록 접기는 문서가 아니라 패널의 보기 상태다(문서 접기 폐지, v1.13 피드백) */
  const [foldedAreas, setFoldedAreas] = useState<ReadonlySet<string>>(new Set())
  const [activeHit, setActiveHit] = useState(-1)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const hits = useMemo(() => searchObjects(doc, query), [doc, query])
  /** 검색 중인 테이블 행·컬럼 행의 판정 집합 — 필터·자동 펼침·하이라이트가 공유 */
  const hitTableIds = useMemo(() => {
    const ids = new Set<string>()
    for (const hit of hits) {
      if (hit.kind === 'table' || hit.kind === 'column') ids.add(hit.targetId)
    }
    return ids
  }, [hits])
  const hitColumnIds = useMemo(() => {
    const ids = new Set<string>()
    for (const hit of hits) {
      if (hit.kind === 'column' && hit.columnId) ids.add(hit.columnId)
    }
    return ids
  }, [hits])
  const hitRelationshipIds = useMemo(
    () => new Set(hits.filter((hit) => hit.kind === 'relationship').map((hit) => hit.targetId)),
    [hits],
  )
  const hitNoteIds = useMemo(
    () => new Set(hits.filter((hit) => hit.kind === 'note').map((hit) => hit.targetId)),
    [hits],
  )

  // 쿼리가 바뀌면 순회 위치를 처음으로 되돌린다 — 결과 목록이 흔들렸는데 옛 인덱스를 유지하면 안 된다
  useEffect(() => {
    setActiveHit(-1)
  }, [query])

  useEffect(() => {
    if (focusSearchSignal > 0) searchRef.current?.focus()
  }, [focusSearchSignal])

  /* ---------- 포커스 — 대상을 화면 중심으로 (미니맵 클릭과 같은 식) ---------- */

  const focusPoint = useCallback(
    (cx: number, cy: number) => {
      const el = document.querySelector('.react-flow')
      const size = el
        ? { width: el.clientWidth, height: el.clientHeight }
        : { width: window.innerWidth || 1200, height: window.innerHeight || 800 }
      const zoom = Math.max(rf.getViewport().zoom, FOCUS_MIN_ZOOM)
      rf.setViewport(viewportCenteredOn({ x: cx, y: cy }, zoom, size, FOCUS_EXTENT), { duration: 200 })
    },
    [rf],
  )

  const tableCenter = useCallback(
    (tableId: string): { x: number; y: number } | null => {
      const state = useEditorStore.getState()
      const table = state.present.model.tables.find((tb) => tb.id === tableId)
      const layout = state.present.diagram.nodes[tableId]
      if (!table || !layout) return null
      const w = tableRenderWidth(layout.width ?? null, 0)
      const h = estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length)
      return { x: layout.x + w / 2, y: layout.y + h / 2 }
    },
    [],
  )

  const focusTable = useCallback(
    (tableId: string) => {
      const center = tableCenter(tableId)
      if (center) focusPoint(center.x, center.y)
    },
    [focusPoint, tableCenter],
  )

  const focusNote = useCallback(
    (noteId: string) => {
      const note = useEditorStore.getState().present.diagram.notes.find((n) => n.id === noteId)
      if (!note) return
      focusPoint(note.x + note.width / 2, note.y + NOTE_ESTIMATED_HEIGHT / 2)
    },
    [focusPoint],
  )

  const focusRelationship = useCallback(
    (relationshipId: string) => {
      const rel = useEditorStore
        .getState()
        .present.model.relationships.find((r) => r.id === relationshipId)
      if (!rel) return
      const child = tableCenter(rel.childTableId)
      const parent = tableCenter(rel.parentTableId)
      if (child && parent) focusPoint((child.x + parent.x) / 2, (child.y + parent.y) / 2)
      else if (child ?? parent) focusPoint((child ?? parent)!.x, (child ?? parent)!.y)
    },
    [focusPoint, tableCenter],
  )

  /** 그룹 보기 진입 맞춤 — 모듈의 useAreaViewFit(스토어 좌표 계산)을 그대로 쓴다 */
  const fitArea = useAreaViewFit()

  /** 행 클릭 — 선택 교체 + 포커스. 관계 행은 엣지 하이라이트만(RelationshipEdge selected) */
  const selectTarget = useCallback(
    (hit: { kind: ObjectHit['kind']; targetId: string }) => {
      setSelection([hit.targetId])
      if (hit.kind === 'relationship') focusRelationship(hit.targetId)
      else if (hit.kind === 'note') focusNote(hit.targetId)
      else focusTable(hit.targetId)
    },
    [focusNote, focusRelationship, focusTable, setSelection],
  )

  /* ---------- 검색 순회(Enter) ---------- */

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || hits.length === 0) return
    event.preventDefault()
    const next = (activeHit + (event.shiftKey ? -1 : 1) + hits.length) % hits.length
    setActiveHit(next)
    const hit = hits[next]
    selectTarget(hit)
    document.getElementById(hitDomId(hit))?.scrollIntoView({ block: 'nearest' })
  }

  /* ---------- 그룹 접기 ---------- */

  const toggleTable = (tableId: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(tableId)) next.delete(tableId)
      else next.add(tableId)
      return next
    })
  }
  const toggleGroup = (group: GroupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }
  /** 폴더 접기 토글 — 그룹은 area.id, 미분류는 UNGROUPED_KEY로 구분한다 */
  const toggleFold = (key: string) => {
    setFoldedAreas((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const searching = query.trim().length > 0
  /* 영역 필터 — 캔버스 표시 집합과 같은 식(members)을 목록에도 적용한다. 관계는 양끽 테이블이
     모두 영역 안일 때만, 메모는 영역 밖 객체라 항상 전체(폴더는 테이블·관계만 좁힌다) */
  const areaMembers = activeAreaId ? tablesOfArea(doc, activeAreaId) : null
  const tables = doc.model.tables
    .filter((table) => !searching || hitTableIds.has(table.id))
    .filter((table) => !areaMembers || areaMembers.has(table.id))
  /** 폴더 트리 재료 — 문서의 그룹 목록(살아 있는 멤버 id)과 미분류 테이블 */
  const folderAreas = doc.diagram.areas.map((area) => ({ area, memberIds: tablesOfArea(doc, area.id) }))
  const groupedIds = new Set(folderAreas.flatMap(({ memberIds }) => [...memberIds]))
  const hasGroups = doc.diagram.areas.length > 0
  const relationships = doc.model.relationships
    .filter((rel) => !searching || hitRelationshipIds.has(rel.id))
    .filter((rel) => !areaMembers || (areaMembers.has(rel.childTableId) && areaMembers.has(rel.parentTableId)))
  const notes = searching ? doc.diagram.notes.filter((note) => hitNoteIds.has(note.id)) : doc.diagram.notes
  const documentEmpty = doc.model.tables.length === 0 && doc.model.relationships.length === 0 && doc.diagram.notes.length === 0

  const physicalOf = (tableId: string) =>
    doc.model.tables.find((tb) => tb.id === tableId)?.physicalName ?? '?'

  /** 테이블 행 렌더 — 그룹 폴더 안(들여쓰기 래퍼가 밖에서 감싼다)·미분류·그룹 없음 평면 목록이 같은 행을 쓴다 */
  const renderTableRow = (table: EditorDocument['model']['tables'][number]) => (
    <TableRow
      key={table.id}
      table={table}
      doc={doc}
      nameDisplay={nameDisplay}
      query={query}
      searching={searching}
      expanded={searching || expandedTables.has(table.id)}
      hitColumnIds={hitColumnIds}
      selected={selectedIds.includes(table.id)}
      active={isActiveHit(hits, activeHit, table.id)}
      activeColumnId={
        hits[activeHit]?.targetId === table.id ? hits[activeHit].columnId : undefined
      }
      onSelect={() => selectTarget({ kind: 'table', targetId: table.id })}
      onToggle={() => toggleTable(table.id)}
    />
  )

  return (
    <aside
      data-testid="model-explorer"
      aria-label={t('model.editor.explorer.title')}
      className="flex h-full w-64 shrink-0 flex-col border-r bg-background"
    >
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t('model.editor.explorer.searchPlaceholder')}
            aria-label={t('model.editor.explorer.searchLabel')}
            className="h-8 pl-8 text-sm"
          />
        </div>
        {searching ? (
          <span data-testid="explorer-match-count" className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {t('model.editor.explorer.matchCount', { count: hits.length })}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 text-sm">
        {documentEmpty ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t('model.editor.explorer.emptyDocument')}
          </p>
        ) : searching && hits.length === 0 ? (
          <p data-testid="explorer-no-results" className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t('model.editor.explorer.noResults')}
          </p>
        ) : (
          <>
            <GroupHeader
              label={t('model.editor.explorer.groupTables')}
              count={tables.length}
              collapsed={collapsedGroups.has('tables')}
              onToggle={() => toggleGroup('tables')}
            />
            {!collapsedGroups.has('tables') && hasGroups ? (
              <>
                {folderAreas.map(({ area, memberIds }) => (
                  <GroupFolder
                    key={area.id}
                    testid={`explorer-group-${area.id}`}
                    name={area.name}
                    color={area.color}
                    count={memberIds.size}
                    folded={foldedAreas.has(area.id)}
                    onToggleFold={() => toggleFold(area.id)}
                    active={activeAreaId === area.id}
                    onView={() => {
                      // 보기 아이콘 — 그룹 내 테이블만 모아 본다. 진입·다른 그룹 직접 전환
                      // 모두 그 그룹에 화면을 맞추고, 나갈 때(재클릭)는 뷰포트를 그대로 둔다
                      if (activeAreaId === area.id) onActiveAreaChange(null)
                      else {
                        onActiveAreaChange(area.id)
                        fitArea(area.id)
                      }
                    }}
                    canEdit={canEdit}
                    onEdit={() => onOpenAreaEdit(area.id)}
                    onRemove={() => commit({ type: 'area/remove', areaId: area.id })}
                  >
                    <div className="ml-3">
                      {tables
                        .filter((table) => memberIds.has(table.id))
                        .map((table) => renderTableRow(table))}
                    </div>
                  </GroupFolder>
                ))}
                <GroupFolder
                  testid="explorer-group-ungrouped"
                  name={t('model.editor.explorer.groupUngrouped')}
                  count={doc.model.tables.filter((table) => !groupedIds.has(table.id)).length}
                  folded={foldedAreas.has(UNGROUPED_KEY)}
                  onToggleFold={() => toggleFold(UNGROUPED_KEY)}
                >
                  <div className="ml-3">
                    {tables
                      .filter((table) => !groupedIds.has(table.id))
                      .map((table) => renderTableRow(table))}
                  </div>
                </GroupFolder>
              </>
            ) : !collapsedGroups.has('tables') ? (
              tables.map((table) => renderTableRow(table))
            ) : null}

            <GroupHeader
              label={t('model.editor.explorer.groupRelationships')}
              count={relationships.length}
              collapsed={collapsedGroups.has('relationships')}
              onToggle={() => toggleGroup('relationships')}
            />
            {!collapsedGroups.has('relationships') &&
              relationships.map((rel) => (
                <div
                  key={rel.id}
                  id={`explorer-rel-${rel.id}`}
                  className={rowClass(selectedIds.includes(rel.id), isActiveHit(hits, activeHit, rel.id))}
                  onClick={() => selectTarget({ kind: 'relationship', targetId: rel.id })}
                  title={rel.name}
                >
                  <ArrowLeftRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    <Highlight text={physicalOf(rel.childTableId)} query={query} />
                    <span className="text-muted-foreground"> → </span>
                    <Highlight text={physicalOf(rel.parentTableId)} query={query} />
                  </span>
                </div>
              ))}

            <GroupHeader
              label={t('model.editor.explorer.groupNotes')}
              count={notes.length}
              collapsed={collapsedGroups.has('notes')}
              onToggle={() => toggleGroup('notes')}
            />
            {!collapsedGroups.has('notes') &&
              notes.map((note) => (
                <div
                  key={note.id}
                  id={`explorer-note-${note.id}`}
                  className={rowClass(selectedIds.includes(note.id), isActiveHit(hits, activeHit, note.id))}
                  onClick={() => selectTarget({ kind: 'note', targetId: note.id })}
                >
                  <StickyNote aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    <Highlight text={note.title || note.text || t('model.editor.explorer.untitledNote')} query={query} />
                  </span>
                </div>
              ))}
          </>
        )}
      </div>
    </aside>
  )
}

/* ---------- 아래는 패널 내부 조각 ---------- */

function rowClass(selected: boolean, active: boolean): string {
  return cn(
    'flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-sm px-2 text-left',
    selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
    active && 'ring-1 ring-primary',
  )
}

/** 활성 순회 히트(Enter로 도착한 항목)인지 — 히트 대상 id가 행 객체와 같으면 */
function isActiveHit(hits: ObjectHit[], activeHit: number, targetId: string): boolean {
  const hit = hits[activeHit]
  if (!hit) return false
  return hit.targetId === targetId || hit.columnId === targetId
}

function hitDomId(hit: ObjectHit): string {
  if (hit.kind === 'column') return `explorer-column-${hit.targetId}-${hit.columnId}`
  return `explorer-${hit.kind}-${hit.targetId}`
}

function GroupHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex h-7 w-full items-center gap-1 rounded-sm px-2 text-xs font-semibold text-muted-foreground hover:bg-accent/60"
    >
      {collapsed ? <ChevronRight aria-hidden className="size-3" /> : <ChevronDown aria-hidden className="size-3" />}
      <span>{label}</span>
      <span className="tabular-nums">({count})</span>
    </button>
  )
}

/** 그룹 폴더 헤더 — 헤더 클릭·셰브론은 목록 접기(패널 보기 상태, 문서 변경 아님), 눈 아이콘은
 *  그룹 보기 필터(그룹 내 테이블만 모아 본다). 편집·삭제만 편집 권한 전용(호버 시 노출).
 *  미분류 폴더는 문서 객체가 아니라 접기만 있고 눈·편집·삭제가 없다 */
function GroupFolder({
  testid,
  name,
  color,
  count,
  folded,
  onToggleFold,
  active = false,
  onView,
  canEdit,
  onEdit,
  onRemove,
  children,
}: {
  testid: string
  name: string
  /** 그룹 색('default' 포함) — 미분류 폴더는 undefined */
  color?: EditorDocument['diagram']['areas'][number]['color']
  count: number
  /** 목록 접힘 — 패널 로컬 상태(그룹은 area.id, 미분류는 UNGROUPED_KEY) */
  folded: boolean
  onToggleFold: () => void
  /** 그룹 보기 활성 여부 — 눈 아이콘 강조·헤더 하이라이트 */
  active?: boolean
  onView?: () => void
  canEdit?: boolean
  onEdit?: () => void
  onRemove?: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const hex = color && color !== 'default' ? TABLE_COLOR_HEX[color] : null
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        data-testid={testid}
        aria-expanded={!folded}
        aria-label={name}
        onClick={onToggleFold}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onToggleFold()
        }}
        className={cn(
          'group flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-sm px-2 text-left text-xs font-medium',
          active ? 'bg-accent text-accent-foreground' : 'text-foreground/80 hover:bg-accent/60',
        )}
      >
        {folded ? <ChevronRight aria-hidden className="size-3 shrink-0" /> : <ChevronDown aria-hidden className="size-3 shrink-0" />}
        <span
          aria-hidden
          className={cn('size-2.5 shrink-0 rounded-full border border-foreground/20', !hex && 'bg-muted-foreground/25')}
          style={hex ? { backgroundColor: hex } : undefined}
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{count}</span>
        {onView ? (
          <button
            type="button"
            data-testid={`${testid}-view`}
            onClick={(event) => {
              event.stopPropagation()
              onView()
            }}
            aria-pressed={active}
            aria-label={t('model.editor.area.view')}
            title={t('model.editor.area.view')}
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded-sm transition-colors hover:text-foreground',
              active ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <Eye aria-hidden className="size-3" />
          </button>
        ) : null}
        {canEdit && onEdit ? (
          <button
            type="button"
            data-testid={`${testid}-edit`}
            onClick={(event) => {
              event.stopPropagation()
              onEdit()
            }}
            aria-label={t('model.editor.area.edit')}
            title={t('model.editor.area.edit')}
            className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Pencil aria-hidden className="size-3" />
          </button>
        ) : null}
        {canEdit && onRemove ? (
          <button
            type="button"
            data-testid={`${testid}-remove`}
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
            aria-label={t('common.delete')}
            title={t('common.delete')}
            className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 aria-hidden className="size-3" />
          </button>
        ) : null}
      </div>
      {folded ? null : children}
    </div>
  )
}

function TableRow({
  table,
  doc,
  nameDisplay,
  query,
  searching,
  expanded,
  hitColumnIds,
  selected,
  active,
  activeColumnId,
  onSelect,
  onToggle,
}: {
  table: EditorDocument['model']['tables'][number]
  doc: EditorDocument
  nameDisplay: NameDisplayMode
  query: string
  searching: boolean
  expanded: boolean
  hitColumnIds: ReadonlySet<string>
  selected: boolean
  /** Enter 순환으로 도착한 히트인지 — 테이블 행과 컬럼 행 각각 판정 */
  active: boolean
  /** 활성 히트가 이 테이블의 컬럼이면 그 컬럼 id — 컬럼 행 링 표시용 */
  activeColumnId?: string
  onSelect: () => void
  onToggle: () => void
}) {
  const pkIds = new Set(table.primaryKey?.columnIds ?? [])
  const fkIds = new Set(
    doc.model.relationships
      .filter((rel) => rel.childTableId === table.id)
      .flatMap((rel) => rel.columnMappings.map((mapping) => mapping.childColumnId)),
  )
  const columns = searching ? table.columns.filter((column) => hitColumnIds.has(column.id)) : table.columns

  return (
    <>
      <div
        id={`explorer-table-${table.id}`}
        className={rowClass(selected, active)}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSelect()
        }}
        role="button"
        tabIndex={0}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          aria-expanded={expanded}
          aria-label={table.physicalName}
          className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown aria-hidden className="size-3" /> : <ChevronRight aria-hidden className="size-3" />}
        </button>
        <Table2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          <Names physical={table.physicalName} logical={table.logicalName} nameDisplay={nameDisplay} query={query} />
        </span>
      </div>
      {expanded &&
        columns.map((column) => (
          <div
            key={column.id}
            id={`explorer-column-${table.id}-${column.id}`}
            className={cn(rowClass(false, column.id === activeColumnId), 'ml-6 h-6 text-xs')}
            onClick={onSelect}
          >
            <span className="min-w-0 flex-1 truncate">
              <Names
                physical={column.physicalName}
                logical={column.logicalName}
                nameDisplay={nameDisplay === 'both' ? 'physical' : nameDisplay}
                query={query}
              />
            </span>
            {pkIds.has(column.id) ? <KeyBadge label="PK" tone="pk" /> : null}
            {fkIds.has(column.id) ? <KeyBadge label="FK" tone="fk" /> : null}
            {!column.nullable && !pkIds.has(column.id) ? <KeyBadge label="NN" tone="nn" /> : null}
          </div>
        ))}
    </>
  )
}

function KeyBadge({ label, tone }: { label: string; tone: 'pk' | 'fk' | 'nn' }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm px-0.5 text-[9px] font-semibold',
        tone === 'pk' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        tone === 'fk' && 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
        tone === 'nn' && 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

/** 이름 표시 — 툴바 nameMode(논리/물리/둘 다)와 같은 규칙. both는 물리 우선 + 논리를 옆에 묵게 */
function Names({
  physical,
  logical,
  nameDisplay,
  query,
}: {
  physical: string
  logical: string
  nameDisplay: NameDisplayMode
  query: string
}) {
  if (nameDisplay === 'logical') {
    return <Highlight text={logical || physical} query={query} />
  }
  if (nameDisplay === 'physical') {
    return <Highlight text={physical} query={query} />
  }
  return (
    <>
      <Highlight text={physical} query={query} />
      {logical && logical !== physical ? (
        <>
          {' '}
          <span className="text-[10px] text-muted-foreground">
            <Highlight text={logical} query={query} />
          </span>
        </>
      ) : null}
    </>
  )
}

/** 쿼리와 대소문자 무시 일치 구간을 하이라이트 — 빈 쿼리면 그대로 */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase()
  if (!q) return <>{text}</>

  const lower = text.toLowerCase()
  const segments: Array<{ text: string; match: boolean }> = []
  let from = 0
  for (;;) {
    const at = lower.indexOf(q, from)
    if (at < 0) break
    if (at > from) segments.push({ text: text.slice(from, at), match: false })
    segments.push({ text: text.slice(at, at + q.length), match: true })
    from = at + q.length
  }
  if (from < text.length) segments.push({ text: text.slice(from), match: false })

  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-sm bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-800/70 dark:text-yellow-100">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}
