/**
 * ERD 캔버스 — React Flow 12 래퍼 (05-editor/02-ui.md §8, storyboard 02-user §5A)
 *
 * 제어 노드 패턴: 노드/엣지는 로컬 state(표시 레이어)로 두고 스토어 present가 바뀔 때
 * (커밋·undo/redo/수화) 다시 빌드한다. 드래그 중엔 스토어 쓰기 0 — RF 내부 좌표만 이동하고
 * mouseup에 node/move 1커밋(undo 1스택). 빌드 시 안 바뀐 노드의 data 참조를 유지해
 * 노드 단위 memo가 살아있는다(전 노드 리렌더 방지 — 성능 전략).
 *
 * 관계선 source=자식(FK 소유)·target=부모(1). 핸들은 양 노드 위치로 마주 보는 방향에 놓는다.
 * 뷰포트 컬링(onlyRenderVisibleElements)은 의도적으로 쓰지 않는다 — 팬할 때마다 화면에
 * 들어오는 테이블이 그때그때 마운트되며 끊기고(100테이블 문서에서 롱태스크 1초+ 실측),
 * 전부 렌더해 두면 팬·줌·드래그 전부 60fps가 나온다(마운트 체인이 없으니 이동은 GPU 합성뿐).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type EdgeTypes,
  type NodeTypes,
  type OnEdgesChange,
  type OnMoveEnd,
  type OnNodeDrag,
  type OnNodesChange,
  type ReactFlowInstance,
  type Viewport,
  type XYPosition,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from 'cn'

import {
  canvasExtent,
  contentBounds,
  growExtent,
  NOTE_ESTIMATED_HEIGHT,
  viewportCenteredOn,
  type CanvasExtent,
} from '@/features/editor/model/canvas-bounds'
import { arrangeAreaMembers, relocateNonMembers, uniqueAreaName, visibleTableIds } from '@/features/editor/model/areas'
import { createArea, createTable, newId, pkToggleChanges, type ErdChange } from '@/features/editor/model/changes'
import { buildRelationship, primaryKeyColumns } from '@/features/editor/model/relationship'
import { defaultKeyName, documentKeyNames, type KeyKind } from '@/features/editor/model/keys'
import { DEFAULT_CHILD_MULTIPLICITY, type ErdColumn } from '@/features/editor/model/content-schema'
import { isDuplicateRelationship, isDuplicateTableName } from '@/features/editor/model/validation'
import { findNoteDropTarget } from '@/features/editor/model/note-link'
import { objectRects, placeNoteFree, rectsOverlap, type ObjectRect } from '@/features/editor/model/note-overlap'
import { readStoredViewport, storeViewport } from '@/features/editor/model/viewport-memory'
import { useEditorStore } from '@/features/editor/store/editor-store'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { CanvasContextMenu, type ContextMenuAction } from './canvas/CanvasContextMenu'
import {
  EditorCanvasContext,
  type ColumnDisplayMode,
  type EditorCanvasContextValue,
  type NameDisplayMode,
  type PendingRelation,
  type RelationHandleId,
} from './canvas/editor-context'
import { AreaDialog } from './AreaDialog'
import { AreaNode, type AreaNodeType } from './canvas/AreaNode'
import { ColumnInfoDialog } from './ColumnInfoDialog'
import { KeyInfoDialog, type KeyInfoSubmit } from './KeyInfoDialog'
import { NoteNode, type NoteNodeType } from './canvas/NoteNode'
import { RelationPickerOverlay, type RelationPick } from './canvas/RelationPickerOverlay'
import { handleAnchors, shortestHandlePair } from './canvas/edge-router'
import { RelationshipEdge, type RelationshipEdgeType } from './canvas/RelationshipEdge'
import { TableNode, estimateTableHeight, tableRenderWidth, type TableNodeType } from './canvas/TableNode'
import { tableColorHex } from './canvas/table-skin'
import { RelationshipDialog } from './RelationshipDialog'
import { TableInfoDialog } from './TableInfoDialog'

type AppNode = TableNodeType | NoteNodeType | AreaNodeType
type AppEdge = RelationshipEdgeType

/** 노드 data는 비우고 공유 상수로 — 참조 안정이 노드 memo의 핵심 (editor-context 참조) */
const EMPTY_NODE_DATA = {} as Record<string, never>

const nodeTypes: NodeTypes = { table: TableNode, note: NoteNode, area: AreaNode }
const edgeTypes: EdgeTypes = { relationship: RelationshipEdge }

/** 신규 테이블 기본 물리명 — 문서 내 고유 (physicalName min(1) 계약) */
function uniqueTableName(existingPhysicalNames: string[]): string {
  const existing = new Set(existingPhysicalNames.map((name) => name.toLowerCase()))
  for (let i = 1; ; i += 1) {
    const candidate = `table_${i}`
    if (!existing.has(candidate)) return candidate
  }
}

/* ---------- 미니맵 — 테이블 강조색 반영 ---------- */

type MiniMapProps = ComponentProps<typeof MiniMap>

/** nodeColor 프롭의 함수형만 뽑는다 — 원 타입은 string | 함수 유니언이라 useCallback 제약(Function)에 못 쓴다 */
type MiniMapNodeColorFn = Extract<NonNullable<MiniMapProps['nodeColor']>, (node: never) => string>

/** 색 시그니처(id:color 조인)를 구독해 색이 바뀔 때만 이 래퍼가 리렌더된다(캔버스 본체와 분리).
 *  노드 색은 콜백 시점 스토어에서 읽는다 — 표시 레이어 노드 배열에는 색이 실리지 않는다 */
function TableColorMiniMap(props: MiniMapProps) {
  const colorSignature = useEditorStore((s) =>
    Object.entries(s.present.diagram.nodes)
      .map(([id, layout]) => `${id}:${layout.color}`)
      .concat(s.present.diagram.areas.map((a) => `${a.id}:${a.color}`))
      .join(';'),
  )
  const nodeColor = useCallback<MiniMapNodeColorFn>(
    (node) => {
      const state = useEditorStore.getState().present
      // 주제 영역 박스도 같은 프리셋 색으로 — 미니맵에서 묶음이 색으로 읽힌다
      const area = state.diagram.areas.find((a) => a.id === node.id)
      if (area) return tableColorHex(area.color) ?? ''
      const layout = state.diagram.nodes[node.id]
      // 기본(무색)은 빈 문자열 — RF가 클래스 기본색으로 폴백한다
      return tableColorHex(layout?.color ?? 'default') ?? ''
    },
    [colorSignature],
  )
  return <MiniMap nodeColor={nodeColor} {...props} />
}

/* ---------- 스토어 문서 → 표시 레이어 (마운트 초기 상태·빌드 이펙트 공용) ---------- */

/** 노드 data는 비우고 공유 상수로 — 참조 안정이 노드 memo의 핵심 (editor-context 참조).
 *  주제 영역은 배열 선두(zIndex 0) — 같은 z면 DOM 순서가 우선하므로 배경이 되고,
 *  테이블·메모가 그 위에 뜬다. 영역 필터(activeAreaId)가 켜지면 다른 영역 박스도 접는다 —
 *  멤버만 빠진 빈 박스가 화면에 떠 있는 것보다 집중 뷰가 깨끗하다.
 *  접힌 영역의 멤버는 hiddenTableIds로 숨긴다(표시 집합 = 영역 필터 ∩ 접힘 제외 — 식 하나). */
function buildNodes(doc: EditorDocument, selectedIds: Set<string>, activeAreaId: string | null): AppNode[] {
  const visible = visibleTableIds(doc, activeAreaId)
  const areaNodes: AppNode[] = (activeAreaId ? doc.diagram.areas.filter((a) => a.id === activeAreaId) : doc.diagram.areas).map(
    (area) => ({
      id: area.id,
      type: 'area',
      position: { x: area.x, y: area.y },
      data: EMPTY_NODE_DATA,
      selected: selectedIds.has(area.id),
      zIndex: 0,
    }),
  )
  const tableNodes: AppNode[] = doc.model.tables
    .filter((table) => visible.has(table.id))
    .map((table) => ({
      id: table.id,
      type: 'table',
      position: {
        x: doc.diagram.nodes[table.id]?.x ?? 0,
        y: doc.diagram.nodes[table.id]?.y ?? 0,
      },
      data: EMPTY_NODE_DATA,
      selected: selectedIds.has(table.id),
    }))
  const noteNodes: AppNode[] = doc.diagram.notes.map((note) => ({
    id: note.id,
    type: 'note',
    position: { x: note.x, y: note.y },
    data: EMPTY_NODE_DATA,
    selected: selectedIds.has(note.id),
  }))
  return areaNodes.concat(tableNodes, noteNodes)
}

function buildEdges(
  doc: EditorDocument,
  sizeReports: Record<string, { w: number; h: number }>,
  selectedIds: Set<string>,
  visible: Set<string>,
): AppEdge[] {
  // 양 끝 테이블이 모두 보일 때만 선을 그린다 — 한쪽이 숨겨진(접힘·영역 밖) 관계는 끊어진 것처럼 보이면 안 된다
  const shown = doc.model.relationships.filter(
    (rel) => visible.has(rel.childTableId) && visible.has(rel.parentTableId),
  )
  return shown.map((rel) => {
    const childTable = doc.model.tables.find((t) => t.id === rel.childTableId)
    const parentTable = doc.model.tables.find((t) => t.id === rel.parentTableId)
    const childPos = doc.diagram.nodes[rel.childTableId] ?? { x: 0, y: 0, width: null }
    const parentPos = doc.diagram.nodes[rel.parentTableId] ?? { x: 0, y: 0, width: null }
    const childSize = sizeReports[rel.childTableId] ?? {
      w: tableRenderWidth(childPos.width ?? null, 0),
      h: estimateTableHeight(
        childTable?.columns.length ?? 0,
        childTable ? childTable.uniques.length + childTable.indexes.length : 0,
      ),
    }
    const parentSize = sizeReports[rel.parentTableId] ?? {
      w: tableRenderWidth(parentPos.width ?? null, 0),
      h: estimateTableHeight(
        parentTable?.columns.length ?? 0,
        parentTable ? parentTable.uniques.length + parentTable.indexes.length : 0,
      ),
    }
    // 연결면은 항상 현재 배치에서 다시 계산한다 — 테이블을 옮기면 선이 가장 가까운 면으로 따라간다.
    // 자기 참조는 양 끝이 같은 노드라 최단 면 계산이 퇴화하므로 오른쪽 면으로 고정한다
    const sides =
      rel.childTableId === rel.parentTableId
        ? { child: 'right', parent: 'right' }
        : shortestHandlePair(childPos, parentPos, childSize, parentSize)
    return {
      id: rel.id,
      type: 'relationship' as const,
      source: rel.childTableId,
      target: rel.parentTableId,
      sourceHandle: sides.child,
      targetHandle: sides.parent,
      data: EMPTY_NODE_DATA,
      selected: selectedIds.has(rel.id),
    }
  })
}

/** RF 노드 memo는 객체 identity로 동작한다 — 값이 같으면 새 배열을 만들지 않고 기존 배열을 돌려
 *  전 노드 리렌더(로드 직후 깜빡임)를 막는다. 비교는 memo에 영향 주는 필드만. */
function nodesEqual(a: AppNode[], b: AppNode[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.type !== y.type ||
      x.selected !== y.selected ||
      x.position.x !== y.position.x ||
      x.position.y !== y.position.y
    ) {
      return false
    }
  }
  return true
}

/** select 변경을 스토어 선택에 반영하는 공용 write-through — 노드·엣지가 같은 구조라 하나로 쓴다 */
function applySelectChanges(
  changes: ReadonlyArray<{ type: string; id?: string; selected?: boolean }>,
  state: { selectedIds: string[]; setSelection: (ids: string[]) => void },
): void {
  const next = new Set(state.selectedIds)
  let touched = false
  for (const change of changes) {
    if (change.type !== 'select' || typeof change.id !== 'string') continue
    if (change.selected) {
      if (!next.has(change.id)) {
        next.add(change.id)
        touched = true
      }
    } else if (next.delete(change.id)) {
      touched = true
    }
  }
  if (touched) state.setSelection([...next])
}

function edgesEqual(a: AppEdge[], b: AppEdge[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.source !== y.source ||
      x.target !== y.target ||
      x.sourceHandle !== y.sourceHandle ||
      x.targetHandle !== y.targetHandle ||
      x.selected !== y.selected
    ) {
      return false
    }
  }
  return true
}

/** 문서만으로 전체 맞춤 뷰포트를 추정 — 노드가 그려지기 전 첫 프레임에 줄 화면이다.
 *  실제 노드 크기와 어긋나면 마운트 후 fit 이펙트가 정확한 화면으로 보정한다. */
function estimatedFitViewport(doc: EditorDocument): Viewport {
  const bounds = contentBounds(doc)
  if (!bounds) return { x: 0, y: 0, zoom: 1 }
  const width = window.innerWidth || 1200
  const height = window.innerHeight || 800
  const padding = 0.25
  const boxWidth = Math.max(bounds.maxX - bounds.minX, 1)
  const boxHeight = Math.max(bounds.maxY - bounds.minY, 1)
  const zoom = Math.max(
    0.1,
    Math.min((width * (1 - padding)) / boxWidth, (height * (1 - padding)) / boxHeight, 1),
  )
  // 콘텐츠 중심을 화면 중심으로 이동
  return {
    x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * zoom,
    y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * zoom,
    zoom,
  }
}

export interface ErdCanvasProps {
  canEdit: boolean
  /** 문서 대상 DBMS 템플릿 id — 모델 메타에서 파생된 고정값(문서 수명 동안 불변) */
  dbmsId: string
  nameDisplay: NameDisplayMode
  columnDisplay: ColumnDisplayMode
  /** 문서 식별자 — 마지막 화면(줌·팬)을 브라우저에 기억하는 키 */
  modelId: string | null
  /** 보기 필터로 선택된 주제 영역 — null이면 전체. 뷰 상태라 undo 대상이 아니다(EditorShell 소유) */
  activeAreaId: string | null
}

export function ErdCanvas({ canEdit, nameDisplay, columnDisplay, dbmsId, modelId, activeAreaId }: ErdCanvasProps) {
  const { t } = useTranslation()
  const present = useEditorStore((s) => s.present)
  const commit = useEditorStore((s) => s.commit)
  const commitAll = useEditorStore((s) => s.commitAll)

  /* 마운트 시점(EditorShell이 수화 뒤 마운트시킨다) 스토어 문서로 첫 렌더부터 노드를 그린다 —
     빈 캔버스가 먼저 페인트되고 노드가 투척되는 깜빡임이 없다. StrictMode 이중 마운트에도 1회만 계산 */
  const initialRef = useRef<{ nodes: AppNode[]; edges: AppEdge[] } | null>(null)
  if (initialRef.current === null) {
    const doc = useEditorStore.getState().present
    const selected = new Set(useEditorStore.getState().selectedIds)
    initialRef.current = { nodes: buildNodes(doc, selected, null), edges: buildEdges(doc, {}, selected, visibleTableIds(doc, null)) }
  }
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initialRef.current.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>(initialRef.current.edges)
  const draggingRef = useRef(false)
  const rfRef = useRef<ReactFlowInstance<AppNode, AppEdge> | null>(null)
  const didInitialFit = useRef(false)

  /* 초기 화면 — 브라우저 기억 > 저장된 뷰포인트 > 전체 맞춤(추정). defaultViewport으로
     첫 프레임부터 적용해 zoom 1 → fit 점프가 보이지 않는다 */
  const initialViewportRef = useRef<Viewport | null>(null)
  if (initialViewportRef.current === null) {
    initialViewportRef.current =
      readStoredViewport(modelId) ??
      useEditorStore.getState().present.diagram.viewport ??
      estimatedFitViewport(useEditorStore.getState().present)
  }

  const [infoTableId, setInfoTableId] = useState<string | null>(null)
  const [infoColumnRef, setInfoColumnRef] = useState<{ tableId: string; columnId: string } | null>(null)
  const [keyDialogRef, setKeyDialogRef] = useState<{ tableId: string; keyId: string | null; kind: KeyKind } | null>(null)
  const [relDialog, setRelDialog] = useState<
    | { mode: 'create'; parentId: string; childId: string }
    | { mode: 'edit'; relationshipId: string }
    | null
  >(null)
  /** 주제 영역 편집 다이얼로그 대상 — 헤더 설정 버튼·컨텍스트 메뉴로 연다 */
  const [areaEditId, setAreaEditId] = useState<string | null>(null)

  /* ---------- 노드 크기 보고 — 콘텐츠 자동 폭·높이가 커지면 이웃 겹침을 해소한다 ---------- */

  const sizeReportsRef = useRef<Record<string, { w: number; h: number }>>({})
  const [sizeReports, setSizeReports] = useState<Record<string, { w: number; h: number }>>({})
  const reportSize = useCallback((tableId: string, w: number, h: number) => {
    const prev = sizeReportsRef.current[tableId]
    if (prev && prev.w === w && prev.h === h) return
    sizeReportsRef.current = { ...sizeReportsRef.current, [tableId]: { w, h } }
    setSizeReports(sizeReportsRef.current)
  }, [])

  /* 팬·드래그 한계 — 최외곽 객체(테이블·메모)의 사방 좌표에서 CANVAS_MARGIN까지만 캔버스가
     늘어난다(canvas-bounds 참조). 문서·측정 크기가 바뀔 때마다 다시 계산하므로 객체를 경계
     밖으로 옮기면 한계도 그 객체를 감싸도록 따라 자란다. 빈 문서는 첫 화면(zoom 1 · 원점)
     영역만 팬할 수 있다 — 콘텐츠가 생기면 곧 한계도 생긴다.
     한계는 세션 동안 줄지 않는다(high-water mark) — 객체를 안쪽으로 옮겨 AABB가 줄어들 때
     한계가 따라 줄면 현재 뷰가 클램프되며 화면이 뚝 끌려온다. 늘어난 방향(좌우상하 모두)은
     유지하고 넓어지는 쪽으로만 갱신한다. 문서를 바꾸면 처음부터 다시 잡는다. */
  const sessionExtentRef = useRef<{ modelId: string | null; extent: CanvasExtent } | null>(null)
  const extent = useMemo<CanvasExtent>(() => {
    const next: CanvasExtent = canvasExtent(present, sizeReports) ?? [
      [0, 0],
      [window.innerWidth || 1200, window.innerHeight || 800],
    ]
    const prev = sessionExtentRef.current
    const merged = prev && prev.modelId === modelId ? growExtent(prev.extent, next) : next
    sessionExtentRef.current = { modelId, extent: merged }
    return merged
  }, [present, sizeReports, modelId])

  /**
   * 겹침 해소 — 크기 보고가 바뀔 때만 실행(드래그로 사용자가 놓은 위치는 존중).
   * 두 테이블이 x·y 모두 겹치면 **이동량이 작은 축**으로 분리: 가로면 오른쪽 것을, 세로면 아래 것을 민다.
   * (보기 모드 전환으로 높이가 늘면 아래 테이블이 내려가고, 이름이 길어지면 옆 테이블이 밀린다)
   * 메모가 겹침에 끼어 있으면 **메모가 물러난다** — 주석은 테이블을 비켜주고, 메모끼리면
   * 문서 순서에서 나중 메모가 비켜난다(새로 만든 메모가 밀려난다).
   * 반복 패스로 연쇄 겹침을 수렴시킨다.
   */
  useEffect(() => {
    if (!canEdit) return
    const { present: doc } = useEditorStore.getState()

    const rects = objectRects(doc, sizeReports)
    if (rects.length < 2) return
    const order = new Map(rects.map((rect, index) => [rect.id, index]))

    const GAP = 32
    const maxPasses = Math.min(rects.length * rects.length + 1, 200)
    for (let pass = 0; pass < maxPasses; pass += 1) {
      let changed = false
      for (const a of rects) {
        for (const b of rects) {
          if (a === b) continue
          if (!rectsOverlap(a, b)) continue
          if (a.kind === 'note' || b.kind === 'note') {
            // 메모가 끼어 있으면 메모가 물러난다 — 오른쪽/아래 중 이동량이 작은 쪽으로
            const victim =
              a.kind === 'note' && b.kind === 'note'
                ? (order.get(a.id)! > order.get(b.id)! ? a : b)
                : a.kind === 'note'
                  ? a
                  : b
            const other = victim === a ? b : a
            const pushX = other.x + other.w + GAP - victim.x
            const pushY = other.y + other.h + GAP - victim.y
            if (pushX <= pushY) victim.x += pushX
            else victim.y += pushY
            changed = true
            continue
          }
          // 가로 분리: 오른쪽 것을 밀 양 / 세로 분리: 아래 것을 밀 양 — 작은 쪽을 택한다
          const [lx, rx] = a.x <= b.x ? [a, b] : [b, a]
          const [ty, by] = a.y <= b.y ? [a, b] : [b, a]
          const pushX = lx.x + lx.w + GAP - rx.x
          const pushY = ty.y + ty.h + GAP - by.y
          if (pushX <= pushY) rx.x += pushX
          else by.y += pushY
          changed = true
        }
      }
      if (!changed) break
    }

    const positions: Record<string, { x: number; y: number }> = {}
    const notePatches: ErdChange[] = []
    for (const rect of rects) {
      if (rect.kind === 'table') {
        const node = doc.diagram.nodes[rect.id]
        if (node && (Math.round(rect.x) !== Math.round(node.x) || Math.round(rect.y) !== Math.round(node.y))) {
          positions[rect.id] = { x: rect.x, y: rect.y }
        }
      } else {
        const note = doc.diagram.notes.find((n) => n.id === rect.id)
        if (note && (Math.round(rect.x) !== Math.round(note.x) || Math.round(rect.y) !== Math.round(note.y))) {
          notePatches.push({ type: 'note/patch', noteId: rect.id, patch: { x: rect.x, y: rect.y } })
        }
      }
    }
    const changes: ErdChange[] = []
    if (Object.keys(positions).length > 0) changes.push({ type: 'node/move', positions })
    changes.push(...notePatches)
    if (changes.length > 0) commitAll(changes)
  }, [sizeReports, canEdit, commitAll])

  /* ---------- 스토어 → 표시 레이어 동기화 (커밋·undo·수화·선택 변경 시) ---------- */

  // 선택 원천은 스토어 selectedIds다 — 캔버스 클릭(select 변경 write-through)과 모델
  // 익스플로러 클릭(setSelection)이 같은 상태를 고쳐 쓴다(§3 양방향 동기화).
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    if (draggingRef.current) return
    setNodes((current) => {
      const next = buildNodes(present, selectedSet, activeAreaId)
      // 값이 같으면 기존 배열 반환 — RF 노드 memo(객체 identity)가 살아있게
      return nodesEqual(current, next) ? current : next
    })
    setEdges((current) => {
      const next = buildEdges(present, sizeReports, selectedSet, visibleTableIds(present, activeAreaId))
      return edgesEqual(current, next) ? current : next
    })
  }, [present, sizeReports, selectedSet, activeAreaId, setNodes, setEdges])

  /* ---------- 초기 뷰: 브라우저에 기억한 마지막 화면 > 저장된 뷰포인트 > 전체 맞춤 ---------- */

  useEffect(() => {
    if (didInitialFit.current) return
    // 기억·저장 어느 쪽이든 화면이 있으면 fit하지 않는다(복원은 onInit에서)
    if (readStoredViewport(modelId) ?? present.diagram.viewport) {
      didInitialFit.current = true
      return
    }
    if (nodes.length > 0) {
      didInitialFit.current = true
      void rfRef.current?.fitView({ padding: 0.25, maxZoom: 1 })
    }
  }, [nodes.length, present.diagram.viewport, modelId])

  /** 줌·팬이 끝날 때마다 마지막 화면을 브라우저에 기록 — 편집 없이 줌만 바꿔도 다음 열기에서 유지된다 */
  const handleMoveEnd = useCallback<OnMoveEnd>(
    (_event, viewport) => storeViewport(modelId, viewport),
    [modelId],
  )

  /* ---------- 노드/엣지 변경 라우팅 — remove는 스토어 커밋으로 처리 ---------- */

  /** 선택 write-through — RF select 변화를 스토어 선택(익스플로러와 공유 원천)에 반영.
   *  Shift+클릭으로 여러 객체를 선택할 수 있다(박스 선택은 스크린 팬과 겹쳐 쓰지 않는다).
   *  remove는 스토어 커밋(deleteKeyCode → onNodesDelete)으로 처리한다 */
  const handleNodesChange: OnNodesChange<AppNode> = useCallback(
    (changes) => {
      applySelectChanges(changes, useEditorStore.getState())
      onNodesChange(changes.filter((change) => change.type !== 'remove'))
    },
    [onNodesChange],
  )

  const handleEdgesChange: OnEdgesChange<AppEdge> = useCallback(
    (changes) => {
      applySelectChanges(changes, useEditorStore.getState())
      onEdgesChange(changes.filter((change) => change.type !== 'remove'))
    },
    [onEdgesChange],
  )

  /** 삭제 키 — 테이블은 관계·FK cascade가 applyChange에서, 메모/영역/관계는 자기 삭제.
   *  영역 삭제는 묶음 표시만 사라진다(area/remove는 멤버 테이블을 건드리지 않는다) */
  const handleNodesDelete = useCallback(
    (deleted: AppNode[]) => {
      const changes: ErdChange[] = deleted.map((node) =>
        node.type === 'note'
          ? { type: 'note/remove', noteId: node.id }
          : node.type === 'area'
            ? { type: 'area/remove', areaId: node.id }
            : { type: 'table/remove', tableId: node.id },
      )
      commitAll(changes)
    },
    [commitAll],
  )

  const handleEdgesDelete = useCallback(
    (deleted: AppEdge[]) => {
      commitAll(
        deleted.map(
          (edge) => ({ type: 'relationship/remove', relationshipId: edge.id }) as ErdChange,
        ),
      )
    },
    [commitAll],
  )

  /* ---------- 드래그 — mouseup 1커밋 ---------- */

  const handleNodeDragStop: OnNodeDrag<AppNode> = useCallback(
    (_event, _node, draggedNodes) => {
      draggingRef.current = false
      const state = useEditorStore.getState()
      const positions: Record<string, { x: number; y: number }> = {}
      const noteChanges: ErdChange[] = []
      const areaChanges: ErdChange[] = []
      /** 연관 지정 드롭 판정용 테이블 박스 — 드래그가 끝난 시점이라 스토어 좌표가 곧 화면 좌표다 */
      const dropBoxes =
        draggedNodes.some((n) => n.type === 'note') && draggedNodes.length === 1
          ? state.present.model.tables.flatMap((table) => {
              const layout = state.present.diagram.nodes[table.id]
              if (!layout) return []
              return [
                {
                  id: table.id,
                  box: {
                    x: layout.x,
                    y: layout.y,
                    w: tableRenderWidth(layout.width ?? null, 0),
                    h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length),
                  },
                },
              ]
            })
          : []
      const draggedNote = draggedNodes.length === 1 && draggedNodes[0].type === 'note' ? draggedNodes[0] : null
      const dropTableId = draggedNote
        ? findNoteDropTarget(
            {
              x: draggedNote.position.x,
              y: draggedNote.position.y,
              width: state.present.diagram.notes.find((n) => n.id === draggedNote.id)?.width ?? 360,
            },
            dropBoxes,
          )
        : null
      for (const node of draggedNodes) {
        if (node.type === 'note') {
          const note = state.present.diagram.notes.find((n) => n.id === node.id)
          if (!note) continue
          if (node.id === draggedNote?.id && dropTableId) {
            // 테이블 위 드롭 — 연관을 지정하고 위치는 드래그 전으로 되돌린다(커밋하지 않는다).
            // 테이블 위에 올려 두면 테이블을 가려서, 원위치 복귀가 연관 지정 제스처의 피드백이 된다.
            if (note.linkedTableId !== dropTableId) {
              noteChanges.push({ type: 'note/patch', noteId: node.id, patch: { linkedTableId: dropTableId } })
            }
            continue
          }
          if (note.x !== node.position.x || note.y !== node.position.y) {
            noteChanges.push({
              type: 'note/patch',
              noteId: node.id,
              patch: { x: node.position.x, y: node.position.y },
            })
          }
        } else if (node.type === 'area') {
          // 영역 이동 — 멤버 테이블을 델타만큼 동반 이동해 같은 커밋(undo 1스택)에 묶는다.
          // 함께 선택돼 직접 드래그된 멤버는 자기 좌표가 우선(아래 table 분기가 덮어쓴다).
          const area = state.present.diagram.areas.find((a) => a.id === node.id)
          if (!area) continue
          if (area.x !== node.position.x || area.y !== node.position.y) {
            areaChanges.push({ type: 'area/patch', areaId: node.id, patch: { x: node.position.x, y: node.position.y } })
          }
          const dx = node.position.x - area.x
          const dy = node.position.y - area.y
          for (const memberId of area.tableIds) {
            if (positions[memberId]) continue
            const layout = state.present.diagram.nodes[memberId]
            if (!layout) continue
            positions[memberId] = { x: layout.x + dx, y: layout.y + dy }
          }
        } else {
          const layout = state.present.diagram.nodes[node.id]
          if (layout && (layout.x !== node.position.x || layout.y !== node.position.y)) {
            positions[node.id] = { x: node.position.x, y: node.position.y }
          }
        }
      }
      const changes = [...noteChanges, ...areaChanges]
      if (Object.keys(positions).length > 0) changes.push({ type: 'node/move', positions })

      /* 메모 겹침 해소 — 드래그한 메모는 놓인 자리에서, 드래그한 테이블이 덮친 메모는 밀려난다.
         연관 지정(원위치 복귀) 메모는 건드리지 않고, 문서 순서대로 굴려 연쇄를 잡는다.
         같은 커밋에 묶여 Undo 1스택. */
      const tableMoved = Object.keys(positions).length > 0
      const draggedNoteIds = new Set(draggedNodes.filter((n) => n.type === 'note').map((n) => n.id))
      if (draggedNoteIds.size > 0 || tableMoved) {
        // 장애물 사각형 — 테이블은 이동 후 최종 좌표, 드래그한 메모는 목표 좌표로
        const obstacles: ObjectRect[] = objectRects(state.present, sizeReportsRef.current)
        for (const o of obstacles) {
          if (o.kind === 'table' && positions[o.id]) {
            o.x = positions[o.id].x
            o.y = positions[o.id].y
          }
        }
        for (const change of noteChanges) {
          if (change.type !== 'note/patch') continue
          const self = obstacles.find((o) => o.id === change.noteId)
          if (self && change.patch.x !== undefined) {
            self.x = change.patch.x
            self.y = change.patch.y ?? self.y
          }
        }
        for (const note of state.present.diagram.notes) {
          // 드래그 안 한 메모는 테이블이 움직였을 때만 검사한다
          if (!draggedNoteIds.has(note.id) && !tableMoved) continue
          // 연관 지정 드롭(원위치 복귀) 메모는 그대로 둔다
          if (note.id === draggedNote?.id && dropTableId) continue
          const self = obstacles.find((o) => o.id === note.id)
          if (!self) continue
          const free = placeNoteFree(
            { x: self.x, y: self.y, w: self.w, h: self.h },
            obstacles.filter((o) => o.id !== note.id),
          )
          if (free.x === Math.round(self.x) && free.y === Math.round(self.y)) continue
          self.x = free.x
          self.y = free.y
          const existing = noteChanges.find(
            (c): c is Extract<ErdChange, { type: 'note/patch' }> => c.type === 'note/patch' && c.noteId === note.id,
          )
          if (existing) existing.patch = { ...existing.patch, x: free.x, y: free.y }
          else noteChanges.push({ type: 'note/patch', noteId: note.id, patch: { x: free.x, y: free.y } })
        }
        changes.length = 0
        changes.push(...noteChanges, ...areaChanges)
        if (Object.keys(positions).length > 0) changes.push({ type: 'node/move', positions })
      }

      if (changes.length > 0) commitAll(changes)
    },
    [commitAll],
  )

  /* ---------- 관계 생성 — 점 클릭 → 오버레이 선택(유형·종류) → 마우스 따라 선 → 대상 클릭으로 즉시 확정 ----------
     점 근처 클릭으로 캔버스 오버레이 선택기를 열고, 종류까지 고르면 소스(부모) 테이블이 강조되며
     임시 선이 포인터를 따라다닌다. 대상 테이블 클릭·(소스)핸들 드래그 둘 다 확정으로 받는다.
     방향은 고정 — 시작 테이블 = 부모(1, PK 제공), 대상 테이블 = 자식(N, FK 생성). */

  const [pendingRelation, setPendingRelation] = useState<PendingRelation | null>(null)
  const [pointerScreen, setPointerScreen] = useState<{ x: number; y: number } | null>(null)
  /** 점 클릭으로 열린 선택기 상태 — 캔버스 오버레이가 떠 있는 동안 다른 조작을 차단한다 */
  const [relationPicker, setRelationPicker] = useState<{ parentId: string; side: RelationHandleId } | null>(null)

  const startPendingRelation = useCallback((relation: PendingRelation) => {
    setPendingRelation(relation)
  }, [])

  const openRelationPicker = useCallback((parentId: string, side: RelationHandleId) => {
    setRelationPicker({ parentId, side })
  }, [])

  /** 선택기 확정 — 오버레이를 닫고 곧바로 관계 대기로. 클릭 좌표로 임시 선을 즉시 그린다 */
  const handlePickerPick = useCallback(
    (pick: RelationPick) => {
      const picker = relationPicker
      if (!picker) return
      setRelationPicker(null)
      setPointerScreen(pick.point)
      startPendingRelation({
        parentId: picker.parentId,
        parentHandle: picker.side,
        type: pick.type,
        identifying: pick.identifying,
        parentMultiplicity: pick.parentMultiplicity,
        childMultiplicity: pick.childMultiplicity,
      })
    },
    [relationPicker, startPendingRelation],
  )

  /** 확정 — 시작=부모(1)·대상=자식(N) 고정. FK 컬럼은 대상(자식) 테이블에 생성되고,
   *  연결면은 렌더 시점에 배치 기준으로 계산되므로 저장하지 않는다.
   *  대상으로 시작 테이블 자신을 고르면 자기 참조 관계(같은 테이블 FK)가 된다 */
  const finishRelation = useCallback(
    (targetTableId: string) => {
      const pending = pendingRelation
      if (!pending) return
      const { present: doc } = useEditorStore.getState()
      const parent = doc.model.tables.find((tb) => tb.id === pending.parentId)
      const child = doc.model.tables.find((tb) => tb.id === targetTableId)
      if (!parent || !child) return
      // 같은 부모→자식 관계는 하나만 — 중복이면 알리고 대상을 다시 고르게 한다(대기 상태 유지)
      if (isDuplicateRelationship(doc.model, parent.id, child.id)) {
        toast.error(
          t('model.editor.relationship.duplicate', { parent: parent.physicalName, child: child.physicalName }),
        )
        return
      }
      if (primaryKeyColumns(parent).length === 0) {
        toast.error(t('model.editor.parentNoPk', { name: parent.physicalName }))
        return
      }

      const result = buildRelationship({
        parentTable: parent,
        childTable: child,
        type: pending.type,
        identifying: pending.identifying,
        parentMultiplicity: pending.parentMultiplicity,
        childMultiplicity: pending.childMultiplicity,
      })
      if (!result.ok) {
        toast.error(t('model.editor.parentNoPk', { name: parent.physicalName }))
        return
      }
      commit({ type: 'relationship/create', relationship: result.relationship, fkColumns: result.fkColumns })
      setPendingRelation(null)
    },
    [pendingRelation, t, commit],
  )

  const completeRelation = useCallback(
    (targetTableId: string) => finishRelation(targetTableId),
    [finishRelation],
  )

  // 진행 중 — 포인터를 따라다니는 임시 선. Esc·빈 캔버스 클릭으로 취소
  useEffect(() => {
    if (!pendingRelation) {
      setPointerScreen(null)
      return
    }
    const onMove = (event: PointerEvent) => setPointerScreen({ x: event.clientX, y: event.clientY })
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [pendingRelation])

  useEffect(() => {
    if (!pendingRelation && !relationPicker) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (relationPicker) setRelationPicker(null)
      else setPendingRelation(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingRelation, relationPicker])

  /** 임시 선 시작점 — 소스(부모) 핸들 앵커의 화면 좌표 (캔버스 래퍼 기준으로는 렌더에서 보정) */
  const pendingAnchorScreen = useMemo(() => {
    if (!pendingRelation) return null
    const pos = present.diagram.nodes[pendingRelation.parentId]
    if (!pos) return null
    const table = present.model.tables.find((tb) => tb.id === pendingRelation.parentId)
    const size = sizeReports[pendingRelation.parentId] ?? {
      w: tableRenderWidth(null, 0),
      h: estimateTableHeight(table?.columns.length ?? 0, table ? table.uniques.length + table.indexes.length : 0),
    }
    const anchor = handleAnchors(pos, size)[pendingRelation.parentHandle]
    const rf = rfRef.current
    return rf ? rf.flowToScreenPosition(anchor) : anchor
  }, [pendingRelation, present.diagram.nodes, present.model.tables, sizeReports])

  /* ---------- 연결 → 관계 다이얼로그 (source=드래그 시작=자식 가정, 필요시 스왑) ---------- */

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit) return
      // 진행 중 관계의 소스(부모)에서 드래그로 연결 — 유형·종류·기수는 이미 골랐으니 즉시 확정한다
      if (pendingRelation && connection.source === pendingRelation.parentId) {
        finishRelation(connection.target)
        return
      }
      const { present: doc } = useEditorStore.getState()
      const source = doc.model.tables.find((tb) => tb.id === connection.source)
      const target = doc.model.tables.find((tb) => tb.id === connection.target)
      // 자기 연결도 허용(자기 참조 관계) — 시작 쪽에 PK가 있어야 부모가 된다
      if (!source || !target) return

      // 드래그 시작 = 부모 가정(오버레이 관례와 동일), 시작 쪽에 PK가 없고 반대쪽에 있으면 뒤집는다
      let parent = source
      let child = target
      if (primaryKeyColumns(parent).length === 0 && primaryKeyColumns(child).length > 0) {
        ;[parent, child] = [child, parent]
      }
      if (primaryKeyColumns(parent).length === 0) {
        toast.error(t('model.editor.parentNoPk', { name: parent.physicalName }))
        return
      }
      if (isDuplicateRelationship(doc.model, parent.id, child.id)) {
        toast.error(
          t('model.editor.relationship.duplicate', { parent: parent.physicalName, child: child.physicalName }),
        )
        return
      }
      setRelDialog({ mode: 'create', parentId: parent.id, childId: child.id })
    },
    [canEdit, pendingRelation, finishRelation, t],
  )

  /* ---------- 컨텍스트 메뉴 액션 ---------- */

  const toFlow = useCallback((point: { x: number; y: number }) => {
    const rf = rfRef.current
    return rf ? rf.screenToFlowPosition(point) : point
  }, [])

  const handleContextMenuAction = useCallback(
    (action: ContextMenuAction) => {
      switch (action.type) {
        case 'createTable': {
          const table = createTable(
            uniqueTableName(
              useEditorStore.getState().present.model.tables.map((tb) => tb.physicalName),
            ),
          )
          commit({ type: 'table/create', table, position: action.position })
          return
        }
        case 'createNote': {
          // 클릭 지점이 테이블·다른 메모와 겹치면 비어 있는 곳으로 밀어 만든다
          const doc = useEditorStore.getState().present
          const free = placeNoteFree(
            { x: action.position.x, y: action.position.y, w: 360, h: NOTE_ESTIMATED_HEIGHT },
            objectRects(doc, sizeReportsRef.current),
          )
          commit({
            type: 'note/create',
            note: { id: newId(), x: free.x, y: free.y, width: 360, text: '', title: '', color: 'yellow', linkedTableId: null },
          })
          return
        }
        case 'createArea': {
          // 클릭 지점 좌상단에 기본 크기 박스로 생성 — 멤버는 편집 다이얼로그·영역 필터로 붙인다
          const doc = useEditorStore.getState().present
          const name = uniqueAreaName(doc, t('model.editor.area.defaultName'))
          commit({ type: 'area/create', area: createArea(name, { x: action.position.x, y: action.position.y }) })
          return
        }
        case 'areaInfo':
          setAreaEditId(action.areaId)
          return
        case 'removeArea':
          commit({ type: 'area/remove', areaId: action.areaId })
          return
        case 'tableInfo':
          setInfoTableId(action.tableId)
          return
        case 'removeTable':
          commit({ type: 'table/remove', tableId: action.tableId })
          return
        case 'removeNote':
          commit({ type: 'note/remove', noteId: action.noteId })
          return
        case 'editRelationship':
          setRelDialog({ mode: 'edit', relationshipId: action.relationshipId })
          return
        case 'removeRelationship':
          commit({ type: 'relationship/remove', relationshipId: action.relationshipId })
      }
    },
    [commit, t],
  )

  /* ---------- 다이얼로그 재료 ---------- */

  const infoTable = useMemo(
    () => (infoTableId ? (present.model.tables.find((tb) => tb.id === infoTableId) ?? null) : null),
    [infoTableId, present.model.tables],
  )

  /** 정보 다이얼로그 대상 테이블 강조색 — 즉시 커밋이라 present에서 실시간으로 읽는다 */
  const infoTableColor = useMemo(
    () => (infoTableId ? (present.diagram.nodes[infoTableId]?.color ?? 'default') : 'default'),
    [infoTableId, present.diagram.nodes],
  )

  const infoColumn = useMemo(
    () =>
      infoColumnRef
        ? (present.model.tables
            .find((tb) => tb.id === infoColumnRef.tableId)
            ?.columns.find((c) => c.id === infoColumnRef.columnId) ?? null)
        : null,
    [infoColumnRef, present.model.tables],
  )

  const infoColumnIsPk = useMemo(
    () =>
      infoColumnRef
        ? (present.model.tables
            .find((tb) => tb.id === infoColumnRef.tableId)
            ?.primaryKey?.columnIds.includes(infoColumnRef.columnId) ?? false)
        : false,
    [infoColumnRef, present.model.tables],
  )

  /** 대상 컬럼 소속 테이블의 PK 컬럼 수 — 복합 PK에서는 AI를 제공하지 않는다 */
  const infoColumnPkCount = useMemo(
    () => (infoColumnRef ? (present.model.tables.find((tb) => tb.id === infoColumnRef.tableId)?.primaryKey?.columnIds.length ?? 0) : 0),
    [infoColumnRef, present.model.tables],
  )

  const keyDialogTable = useMemo(
    () => (keyDialogRef ? (present.model.tables.find((tb) => tb.id === keyDialogRef.tableId) ?? null) : null),
    [keyDialogRef, present.model.tables],
  )

  const keyDialogTarget = useMemo(() => {
    if (!keyDialogRef?.keyId || !keyDialogTable) return null
    if (keyDialogRef.kind === 'unique') {
      const found = keyDialogTable.uniques.find((u) => u.id === keyDialogRef.keyId) ?? null
      return found ? { name: found.name, columnIds: found.columnIds } : null
    }
    const found = keyDialogTable.indexes.find((ix) => ix.id === keyDialogRef.keyId) ?? null
    return found
      ? {
          name: found.name,
          columnIds: found.columns.map((entry) => entry.columnId),
          orders: Object.fromEntries(found.columns.map((entry) => [entry.columnId, entry.order])),
        }
      : null
  }, [keyDialogRef, keyDialogTable])

  /** 문서 전체 키 이름에서 편집 대상 자기 이름만 뺀다 — 중복 검증에 쓴다 */
  const keyExistingNames = useMemo(() => {
    const names = documentKeyNames(present.model)
    if (keyDialogTarget) names.delete(keyDialogTarget.name.toLowerCase())
    return names
  }, [present.model, keyDialogTarget])

  /** 기본 이름 제안 — 문서(모델)를 읽는 쪽에서 계산한다. 다이얼로그는 문서를 모른다 */
  const suggestKeyName = useCallback(
    (columns: ErdColumn[]) => {
      const ref = keyDialogRef
      if (!ref) return ''
      const { present: doc } = useEditorStore.getState()
      const table = doc.model.tables.find((tb) => tb.id === ref.tableId)
      return table ? defaultKeyName(doc.model, table, ref.kind, columns) : ''
    },
    [keyDialogRef],
  )

  const handleKeyConfirm = ({ name, columnIds, orders }: KeyInfoSubmit) => {
    const ref = keyDialogRef
    if (!ref) return
    const table = useEditorStore.getState().present.model.tables.find((tb) => tb.id === ref.tableId)
    if (!table) return
    if (ref.kind === 'unique') {
      const uniques = ref.keyId
        ? table.uniques.map((u) => (u.id === ref.keyId ? { ...u, name, columnIds } : u))
        : [...table.uniques, { id: newId(), name, columnIds }]
      commit({ type: 'uniqueKey/set', tableId: ref.tableId, uniques })
    } else {
      const columns = columnIds.map((columnId) => ({ columnId, order: orders[columnId] ?? 'ASC' }))
      const indexes = ref.keyId
        ? table.indexes.map((ix) => (ix.id === ref.keyId ? { ...ix, name, columns } : ix))
        : [...table.indexes, { id: newId(), name, columns }]
      commit({ type: 'index/set', tableId: ref.tableId, indexes })
    }
  }

  const relDialogData = useMemo(() => {
    if (!relDialog) return { open: false, parent: null, child: null, relationship: null }
    if (relDialog.mode === 'edit') {
      const relationship =
        present.model.relationships.find((r) => r.id === relDialog.relationshipId) ?? null
      // 편집 모드에서도 양 끝 테이블을 내려준다 — 다이얼로그가 "어떤 테이블 ↔ 어떤 테이블"인지 보여준다
      return {
        open: true,
        parent: relationship
          ? (present.model.tables.find((tb) => tb.id === relationship.parentTableId) ?? null)
          : null,
        child: relationship
          ? (present.model.tables.find((tb) => tb.id === relationship.childTableId) ?? null)
          : null,
        relationship,
      }
    }
    return {
      open: true,
      parent: present.model.tables.find((tb) => tb.id === relDialog.parentId) ?? null,
      child: present.model.tables.find((tb) => tb.id === relDialog.childId) ?? null,
      relationship: null,
    }
  }, [relDialog, present.model.tables, present.model.relationships])

  const openColumnInfo = useCallback(
    (tableId: string, columnId: string) => {
      if (canEdit) setInfoColumnRef({ tableId, columnId })
    },
    [canEdit],
  )

  /** 영역 편집 다이얼로그 대상 — 색·멤버 체크가 즉시 커밋이라 present에서 실시간으로 읽는다 */
  const areaEdit = useMemo(
    () => (areaEditId ? (present.diagram.areas.find((a) => a.id === areaEditId) ?? null) : null),
    [areaEditId, present.diagram.areas],
  )

  /** 멤버 체크 목록 재료 — 표시 이름은 익스플로러 Names와 같은 규칙(물리 우선 + 논리 묵게) */
  const areaEditTables = useMemo(
    () =>
      present.model.tables.map((table) => ({
        id: table.id,
        physical: table.physicalName,
        logical: table.logicalName,
      })),
    [present.model.tables],
  )

  const openKeyInfo = useCallback(
    (tableId: string, keyId: string | null, kind: KeyKind) => {
      if (canEdit) setKeyDialogRef({ tableId, keyId, kind })
    },
    [canEdit],
  )

  const openAreaEdit = useCallback(
    (areaId: string) => {
      if (canEdit) setAreaEditId(areaId)
    },
    [canEdit],
  )

  const canvasContext = useMemo<EditorCanvasContextValue>(
    () => ({
      canEdit,
      dbmsId,
      openTableInfo: canEdit ? setInfoTableId : () => {},
      openColumnInfo,
      openKeyInfo,
      openAreaEdit,
      pendingRelation,
      startPendingRelation,
      completeRelation,
      openRelationPicker,
      nameDisplay,
      columnDisplay,
      reportSize,
    }),
    [
      canEdit,
      dbmsId,
      nameDisplay,
      columnDisplay,
      reportSize,
      openColumnInfo,
      openKeyInfo,
      openAreaEdit,
      pendingRelation,
      startPendingRelation,
      completeRelation,
      openRelationPicker,
    ],
  )

  const wrapperRef = useRef<HTMLDivElement | null>(null)

  /* 미니맵 클릭 — 클릭한 지점을 화면 중심으로 이동. 드래그 팬(pannable)과 겹치지 않는다:
     d3-zoom이 이동이 있던 누름의 click 이벤트를 억제하므로 이 콜백은 순수 클릭에만 발생한다.
     프로그램 setViewport는 translateExtent 적용(제스처 전용)을 우회하므로 클램프를 직접 한다 */
  const handleMinimapClick = useCallback(
    (_event: ReactMouseEvent, position: XYPosition) => {
      const rf = rfRef.current
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (!rf || !rect) return
      const { zoom } = rf.getViewport()
      rf.setViewport(
        viewportCenteredOn(position, zoom, { width: rect.width, height: rect.height }, extent),
        { duration: 200 },
      )
    },
    [extent],
  )

  const flow = (
    <div
      ref={wrapperRef}
      className={cn('relative h-full w-full', pendingRelation && 'cursor-crosshair')}
    >
      <ReactFlow<AppNode, AppEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodesDelete={canEdit ? handleNodesDelete : undefined}
        onEdgesDelete={canEdit ? handleEdgesDelete : undefined}
        onConnect={canEdit ? handleConnect : undefined}
        onPaneClick={pendingRelation ? () => setPendingRelation(null) : undefined}
        onNodeClick={
          // 관계 대기 중 영역 박스를 클릭하면 취소로 간주한다 — 박스는 대상 테이블이 아니므로
          pendingRelation
            ? (_event, node) => {
                if (node.type === 'area') setPendingRelation(null)
              }
            : undefined
        }
        onNodeDragStart={
          canEdit
            ? () => {
                draggingRef.current = true
              }
            : undefined
        }
        onNodeDragStop={canEdit ? handleNodeDragStop : undefined}
        onNodeDoubleClick={
          canEdit
            ? (_event, node) => {
                if (node.type === 'table') setInfoTableId(node.id)
              }
            : undefined
        }
        onEdgeDoubleClick={
          canEdit
            ? (_event, edge) => setRelDialog({ mode: 'edit', relationshipId: edge.id })
            : undefined
        }
        defaultViewport={initialViewportRef.current}
        onInit={(instance) => {
          rfRef.current = instance
        }}
        onMoveEnd={handleMoveEnd}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        // 빈 캔버스 더블클릭 확대 방지 — 더블클릭은 편집기에서 다른 의미로 쓸 일이 없게 한다
        zoomOnDoubleClick={false}
        elementsSelectable
        // 박스 선택(selectionKeyCode)은 팬·관계 클릭과 제스처가 겹쳐 쓰지 않는다 —
        // 다중 선택은 Shift+클릭으로만(§9)
        selectionKeyCode={null}
        multiSelectionKeyCode={['Shift', 'Meta']}
        deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
        minZoom={0.1}
        maxZoom={2.5}
        translateExtent={extent}
        nodeExtent={extent}
        connectionRadius={24}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
        <TableColorMiniMap pannable zoomable onClick={handleMinimapClick} className="!bottom-2 !right-2" />
      </ReactFlow>

      {/* 진행 중 관계 — 소스 핸들에서 포인터를 따라다니는 임시 선 (시작점=화면좌표 → 래퍼 기준 보정) */}
      {pendingRelation && pendingAnchorScreen && pointerScreen && wrapperRef.current ? (
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
          <line
            x1={pendingAnchorScreen.x - wrapperRef.current.getBoundingClientRect().left}
            y1={pendingAnchorScreen.y - wrapperRef.current.getBoundingClientRect().top}
            x2={pointerScreen.x - wrapperRef.current.getBoundingClientRect().left}
            y2={pointerScreen.y - wrapperRef.current.getBoundingClientRect().top}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            className="text-sky-500"
          />
          <circle cx={pointerScreen.x - wrapperRef.current.getBoundingClientRect().left} cy={pointerScreen.y - wrapperRef.current.getBoundingClientRect().top} r={3} className="fill-sky-500" />
        </svg>
      ) : null}

      {/* 진행 중 안내 — 선택한 유형·종류와 다음 동작 */}
      {pendingRelation ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border bg-popover px-3 py-1 text-xs font-medium text-popover-foreground shadow-md">
          {pendingRelation.identifying
            ? t('model.editor.relation.identifying')
            : t('model.editor.relation.nonIdentifying')}
          {' · '}
          {pendingRelation.type === 'ONE_TO_MANY'
            ? t('model.editor.relation.oneToMany')
            : t('model.editor.relation.oneToOne')}
          {/* 기수 — 고른 값이 기본(부모 필수 · 자식은 유형별 기본)과 다를 때만 표기 */}
          {pendingRelation.childMultiplicity !== DEFAULT_CHILD_MULTIPLICITY[pendingRelation.type]
            ? ` · ${t('model.editor.relation.childSide')} ${t(`model.editor.relationship.multiplicity_${pendingRelation.childMultiplicity}`)}`
            : ''}
          {pendingRelation.parentMultiplicity === 'ZERO_OR_ONE'
            ? ` · ${t('model.editor.relation.parentSide')} ${t('model.editor.relationship.multiplicity.ZERO_OR_ONE')}`
            : ''}
          {' — '}
          {t('model.editor.relation.pickTarget')}
        </div>
      ) : null}

      {/* 관계 시작 선택기 — 점 클릭 시 캔버스를 덮는 반투명 오버레이 (유형·종류 선택) */}
      {relationPicker ? (
        <RelationPickerOverlay onPick={handlePickerPick} onCancel={() => setRelationPicker(null)} />
      ) : null}
    </div>
  )

  return (
    <EditorCanvasContext.Provider value={canvasContext}>
      {/* 읽기 전용은 컨텍스트 메뉴를 제공하지 않는다 — 스토어를 흔들 편집 경로 차단 */}
      {canEdit ? (
        <CanvasContextMenu toFlow={toFlow} onAction={handleContextMenuAction}>
          {flow}
        </CanvasContextMenu>
      ) : (
        flow
      )}

      <TableInfoDialog
        open={infoTable !== null}
        onOpenChange={(open) => {
          if (!open) setInfoTableId(null)
        }}
        table={infoTable}
        color={infoTableColor}
        onColorChange={(tableId, color) => commit({ type: 'node/color', tableId, color })}
        onCommit={(tableId, patch) => commit({ type: 'table/patch', tableId, patch })}
        isDuplicateName={(tableId, physicalName) =>
          isDuplicateTableName(useEditorStore.getState().present.model, tableId, physicalName)}
      />

      <ColumnInfoDialog
        open={infoColumn !== null}
        onOpenChange={(open) => {
          if (!open) setInfoColumnRef(null)
        }}
        column={infoColumn}
        isPk={infoColumnIsPk}
        pkCount={infoColumnPkCount}
        dbmsId={dbmsId}
        onConfirm={({ pk, patch }) => {
          if (!infoColumnRef) return
          const { tableId, columnId } = infoColumnRef
          const { present } = useEditorStore.getState()
          const table = present.model.tables.find((tb) => tb.id === tableId)
          // PK 토글 묶음(이동·NN/AI 정리 — 해제 시 FK면 FK 영역으로) + 속성 patch를 한 undo 스택에
          const fkIds = new Set(
            present.model.relationships.flatMap((r) =>
              r.childTableId === tableId ? r.columnMappings.map((m) => m.childColumnId) : [],
            ),
          )
          const changes = table ? pkToggleChanges(table, columnId, pk, fkIds) : []
          changes.push({ type: 'column/patch', tableId, columnId, patch })
          commitAll(changes)
        }}
      />

      <KeyInfoDialog
        open={keyDialogRef !== null && keyDialogTable !== null}
        onOpenChange={(open) => {
          if (!open) setKeyDialogRef(null)
        }}
        kind={keyDialogRef?.kind ?? 'unique'}
        target={keyDialogTarget}
        table={keyDialogTable}
        existingNames={keyExistingNames}
        suggestName={suggestKeyName}
        onConfirm={handleKeyConfirm}
      />

      <RelationshipDialog
        open={relDialogData.open}
        onOpenChange={(open) => {
          if (!open) setRelDialog(null)
        }}
        parent={relDialogData.parent}
        child={relDialogData.child}
        relationship={relDialogData.relationship}
        onConfirmCreate={({ relationship, fkColumns }) =>
          commit({ type: 'relationship/create', relationship, fkColumns })
        }
        onConfirmPatch={(relationshipId, patch) =>
          commit({ type: 'relationship/patch', relationshipId, patch })
        }
        onRemove={(relationshipId) => commit({ type: 'relationship/remove', relationshipId })}
        isDuplicate={(parentId, childId) =>
          isDuplicateRelationship(useEditorStore.getState().present.model, parentId, childId)
        }
      />

      <AreaDialog
        open={areaEdit !== null}
        onOpenChange={(open) => {
          if (!open) setAreaEditId(null)
        }}
        area={areaEdit}
        tables={areaEditTables}
        onColorChange={(areaId, color) => commit({ type: 'area/patch', areaId, patch: { color } })}
        onCommit={(areaId, patch) => {
          // 멤버십이 바뀌면 멤버를 영역(그룹 박스) 안 그리드로 재배치하고(02-ui.md §6),
          // 박스와 교차하는 비멤버는 박스 아래로 밀어낸다 — 배치+밀어내기를 undo 1스택으로
          const present = useEditorStore.getState().present
          const tableIds = patch.tableIds
          const area = present.diagram.areas.find((a) => a.id === areaId)
          const arranged = tableIds && area ? arrangeAreaMembers(present, area, tableIds) : null
          if (!arranged || !tableIds) {
            commit({ type: 'area/patch', areaId, patch })
            return
          }
          const pushed = relocateNonMembers(present, arranged.bounds, tableIds)
          commitAll([
            { type: 'area/patch', areaId, patch: { ...patch, ...arranged.bounds } },
            { type: 'node/move' as const, positions: { ...arranged.positions, ...pushed } },
          ])
        }}
      />
    </EditorCanvasContext.Provider>
  )
}
