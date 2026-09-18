/**
 * 자동 배치(Auto Layout) — elkjs 계층형(Layered) 알고리즘 (05-editor/02-ui.md §5.1)
 *
 * 하이브리드: elkjs는 **테이블 노드 좌표만** 계산한다(elk.direction DOWN — FK 참조 방향 기준
 * 부모가 위 레벨). 관계선 경로는 소비하지 않고 좌표가 바뀌면 자체 라우터(edge-router)가
 * 다시 계산한다 — 장애물 회피·까마귀발 글리프 끝점 연결은 그대로 유지된다.
 * 노트는 ELK 그래프에서 제외되지만 배치 후 테이블과 포개지지 않게 위치를 잡는다
 * (positionNotes — 연관 노트는 테이블 우측, 자유 노트는 겹칠 때만 우측 여백 열).
 * 자기 참조 관계는 레벨 제약이 없어 엣지에서 제외한다.
 * 결과는 호출부가 node/move + 노트 note/patch 묶음 커밋으로 반영해 Undo 1스택으로 되돌린다.
 * elkjs는 동적 import로 첫 실행 시에만 로드된다(번들 격리 — elk.bundled.js는 gzip 수백 KB).
 */
import type { ELK, ElkNode } from 'elkjs/lib/elk.bundled.js'

import type { EditorDocument, ErdTable } from './content-schema'
import type { ErdChange } from './changes'
import { estimateTableHeight, tableRenderWidth } from '../components/canvas/TableNode'

/** 테이블 렌더 크기 추정치 — ELK 노드 크기와 노트 오프셋이 같은 식을 쓴다 */
function estimateTableSize(table: ErdTable, width: number | null) {
  return {
    w: tableRenderWidth(width, 0),
    h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length),
  }
}

/** 측정된 렌더 크기 — 추정식은 콘텐츠 폭(배지·컬럼명 길이)을 못 재기 때문에 RF 실측이 있으면 우선한다 */
export type TableSizes = Record<string, { w: number; h: number }>

function sizeOf(table: ErdTable, storedWidth: number | null, sizes?: TableSizes) {
  const measured = sizes?.[table.id]
  if (measured) return measured
  return estimateTableSize(table, storedWidth)
}

/** 배치 여백 — 레이어 간은 까마귀발 글리프(최대 32px)가 들어갈 여유를 포함한다.
 *  엣지 간격을 넉넉히 둔다 — 인접 테이블의 관계선이 포개지면 어느 관계인지 읽기 어렵다.
 *  관계선이 테이블에 붙어 지나가지 않게 노드 간격도 충분히 띄운다(2026-09-18 사용자
 *  요청 — 간격이 좁으면 통로 레인이 압축·점프하며 선끼리 겹치고 테이블에 밀착한다) */
export interface LayoutSpacing {
  nodeNode: number
  betweenLayers: number
  component: number
  padding: number
  /** 관계선끼리의 최소 간격 — 통로가 넓어야 인접 관계가 구별된다 */
  edgeEdge: number
  /** 관계선과 테이블의 최소 간격 — 선이 테이블에 바로 붙지 않게 한다 */
  edgeNode: number
}

export const DEFAULT_LAYOUT_SPACING: LayoutSpacing = {
  nodeNode: 140,
  betweenLayers: 170,
  component: 160,
  padding: 80,
  edgeEdge: 28,
  edgeNode: 44,
}

/** ELK 인스턴스 지연 싱글턴 — 첫 자동 배치 실행 시에만 청크를 로드한다 */
let elkPromise: Promise<ELK> | null = null

function getElk(): Promise<ELK> {
  elkPromise ??= import('elkjs/lib/elk.bundled.js').then(({ default: ELKConstructor }) => new ELKConstructor())
  return elkPromise
}

/**
 * 문서 → ELK 그래프(순수·동기). 노드 = 테이블 전체(관계 없는 테이블 포함, 노트 제외),
 * 크기는 측정값(RF 실측) 우선, 없으면 렌더 추정치. 엣지 = 관계 부모→자식,
 * 자기 참조(부모===자식)는 제외한다.
 */
export function buildLayoutGraph(
  doc: EditorDocument,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
  sizes?: TableSizes,
): ElkNode {
  const children: ElkNode[] = doc.model.tables.map((table) => {
    const size = sizeOf(table, doc.diagram.nodes[table.id]?.width ?? null, sizes)
    return { id: table.id, width: size.w, height: size.h }
  })
  const edges = doc.model.relationships
    .filter((rel) => rel.parentTableId !== rel.childTableId)
    .map((rel) => ({ id: rel.id, sources: [rel.parentTableId], targets: [rel.childTableId] }))
  return {
    id: 'root',
    children,
    edges,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': `${spacing.nodeNode}`,
      'elk.spacing.edgeEdge': `${spacing.edgeEdge}`,
      'elk.spacing.edgeNode': `${spacing.edgeNode}`,
      'layered.spacing.nodeNodeBetweenLayers': `${spacing.betweenLayers}`,
      'elk.spacing.componentComponent': `${spacing.component}`,
      'elk.padding': `[top=${spacing.padding},left=${spacing.padding},bottom=${spacing.padding},right=${spacing.padding}]`,
    },
  }
}

/**
 * 자동 배치를 실행해 테이블별 새 좌표를 얻는다. 결과 x/y는 그래프 루트 원점(좌상단) 기준이라
 * 캔버스 좌표계와 같다. 테이블이 2개 미만이면 빈 객체(배치할 관계가 없다).
 * 실패는 예외를 전파한다 — 안내 토스트는 호출부가 담당한다.
 */
export async function layoutTablePositions(
  doc: EditorDocument,
  options: { elk?: ELK; spacing?: LayoutSpacing; sizes?: TableSizes } = {},
): Promise<Record<string, { x: number; y: number }>> {
  if (doc.model.tables.length < 2) return {}
  const elk = options.elk ?? (await getElk())
  const graph = await elk.layout(buildLayoutGraph(doc, options.spacing, options.sizes))
  const positions: Record<string, { x: number; y: number }> = {}
  for (const child of graph.children ?? []) {
    if (child.x === undefined || child.y === undefined) continue
    positions[child.id] = { x: Math.round(child.x), y: Math.round(child.y) }
  }
  return positions
}

/** 연관 노트를 테이블에 붙이는 간격 — 테이블 우측 폭 여유 */
const NOTE_TABLE_GAP = 24
/** 같은 테이블에 붙은 노트를 세로로 쌓는 간격 */
const NOTE_STACK_GAP = 16
/** 노트 세로 높이 추정치 — 내용량에 따라 가변이라 스택 계산용 근사값 */
const NOTE_STACK_HEIGHT = 150

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** 두 AABB가 겹치는지 — 경계 접촉은 겹침이 아니다 */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * 자동 배치 후 노트의 새 좌표 — 어떤 노트도 테이블 위에 포개지지 않게 한다.
 * · 연관 노트(linkedTableId): 테이블 우측(폭+24) 상단 정렬, 같은 테이블은 문서 순서로 세로
 *   스택. 그 자리에 다른 테이블이 배치돼 있으면 겹치지 않을 때까지 오른쪽으로 밀어낸다.
 * · 자유 노트: 현 위치가 테이블과 겹치지 않으면 그대로 둔다. 겹치면 콘텐츠 전체 우측
 *   여백 열(max 우측+24)로 옮겨 세로 스택한다 — 테이블이 새로 들어와도 덮이지 않는다.
 * 이동이 필요한 노트만 반환한다(없으면 note/patch 커밋도 생기지 않는다).
 */
export function positionNotes(
  doc: EditorDocument,
  tablePositions: Record<string, { x: number; y: number }>,
  sizes?: TableSizes,
): Record<string, { x: number; y: number }> {
  if (Object.keys(tablePositions).length === 0) return {}
  const tableBoxes: Box[] = doc.model.tables.flatMap((table) => {
    const pos = tablePositions[table.id]
    if (!pos) return []
    const size = sizeOf(table, doc.diagram.nodes[table.id]?.width ?? null, sizes)
    return [{ x: pos.x, y: pos.y, w: size.w, h: size.h }]
  })
  const tableById = new Map(doc.model.tables.map((table) => [table.id, table]))

  const nextY = new Map<string, number>() // tableId → 다음 노트 y 오프셋
  const contentRight = Math.max(...tableBoxes.map((box) => box.x + box.w))
  const contentTop = Math.min(...tableBoxes.map((box) => box.y))
  let freeY = contentTop
  const out: Record<string, { x: number; y: number }> = {}

  for (const note of doc.diagram.notes) {
    const noteBox: Box = { x: note.x, y: note.y, w: note.width ?? 360, h: NOTE_STACK_HEIGHT }

    if (note.linkedTableId && tablePositions[note.linkedTableId] && tableById.has(note.linkedTableId)) {
      const table = tableById.get(note.linkedTableId)!
      const pos = tablePositions[note.linkedTableId]
      const size = sizeOf(table, doc.diagram.nodes[table.id]?.width ?? null, sizes)
      const offsetY = nextY.get(note.linkedTableId) ?? 0
      let x = pos.x + size.w + NOTE_TABLE_GAP
      const y = pos.y + offsetY
      // 우측 스택 자리에 다른 테이블이 있으면 겹치지 않을 때까지 오른쪽으로 밀어낸다
      for (let guard = 0; guard <= tableBoxes.length; guard += 1) {
        const hit = tableBoxes.find((box) => overlaps({ ...noteBox, x, y }, box))
        if (!hit) break
        x = hit.x + hit.w + NOTE_TABLE_GAP
      }
      if (Math.round(x) !== note.x || Math.round(y) !== note.y) {
        out[note.id] = { x: Math.round(x), y: Math.round(y) }
      }
      nextY.set(note.linkedTableId, offsetY + NOTE_STACK_HEIGHT + NOTE_STACK_GAP)
      continue
    }

    // 자유 노트 — 겹칠 때만 콘텐츠 우측 여백 열로
    if (tableBoxes.some((box) => overlaps(noteBox, box))) {
      out[note.id] = { x: Math.round(contentRight + NOTE_TABLE_GAP), y: Math.round(freeY) }
      freeY += NOTE_STACK_HEIGHT + NOTE_STACK_GAP
    }
  }
  return out
}

/** 부모가 위치한 면의 정렬 우선순위 — 계층형(DOWN) 배치라 대부분 위, 다음 좌·우 */
const SIDE_RANK: Record<'above' | 'left' | 'right' | 'below', number> = { above: 0, left: 1, right: 2, below: 3 }

/**
 * 자동 배치 후 FK 컬럼 순서 정렬 — 연결되는 부모 테이블 **위치** 기준(사용자 요청).
 * FK 행 순서가 곧 관계선 부착 순서라, 같은 자식에 붙는 부모들이 좌→우로 늘어서 있으면
 * FK 행도 그 순서로 정렬해야 선들이 부채꼴로 펴지며 겹치지 않는다.
 * 정렬 키: ① 부모가 있는 면(위·왼쪽·오른쪽·아래), ② 면을 따르는 좌표(위/아래 면은 부모 x,
 * 좌/우 면은 부모 y — 오름차순), ③ 동률은 부모-자식 중심 거리(가까운 쪽 먼저).
 * 점-점 거리 단일 기준과 달리 면·좌표 우선이라 방향이 읽히고, 같은 레이어 형제에서도
 * 좌표가 갈라 거리 동률이 잘 안 생긴다.
 * · PK에 속한 FK(식별 관계)는 PK 순서가 의미를 갖는다 — 정렬에서 제외한다.
 * · 자기 참조·위치를 모르는 부모는 현 순서를 유지한다(끝에 안정 정렬).
 * 결과는 column/move 변경 목록 — 호출부가 node/move와 한 커밋으로 묶으면 Undo 1회로 되돌아간다.
 * 순서가 이미 같으면 빈 배열(커밋도 생기지 않는다).
 */
export function orderFkColumns(
  doc: EditorDocument,
  positions: Record<string, { x: number; y: number }>,
  sizes?: TableSizes,
): Extract<ErdChange, { type: 'column/move' }>[] {
  const changes: Extract<ErdChange, { type: 'column/move' }>[] = []
  if (Object.keys(positions).length === 0) return changes

  const tableById = new Map(doc.model.tables.map((table) => [table.id, table]))
  // FK 컬럼 → 관계 — 컬럼은 관계 생성 시 부모 PK를 향해 하나의 관계에만 속한다
  const relByChildColumn = new Map<string, { parentTableId: string }>()
  for (const rel of doc.model.relationships) {
    if (rel.parentTableId === rel.childTableId) continue
    for (const mapping of rel.columnMappings) {
      relByChildColumn.set(mapping.childColumnId, { parentTableId: rel.parentTableId })
    }
  }

  for (const table of doc.model.tables) {
    const pos = positions[table.id]
    if (!pos) continue
    const pkIds = new Set(table.primaryKey?.columnIds ?? [])
    const entries = table.columns
      .map((column, index) => ({ column, index, rel: relByChildColumn.get(column.id) ?? null }))
      .filter((entry) => entry.rel && !pkIds.has(entry.column.id))
    if (entries.length < 2) continue

    const size = sizeOf(table, doc.diagram.nodes[table.id]?.width ?? null, sizes)
    const centerX = pos.x + size.w / 2
    const centerY = pos.y + size.h / 2
    // 부모별 정렬 키 — 위치를 모르면 rank 맨 끝(원순)으로 빠진다
    const keyed = entries.map((entry) => {
      const parent = tableById.get(entry.rel!.parentTableId)
      const parentPos = parent && positions[entry.rel!.parentTableId]
      if (!parent || !parentPos) return { entry, key: null }
      const parentSize = sizeOf(parent, doc.diagram.nodes[parent.id]?.width ?? null, sizes)
      const dx = parentPos.x + parentSize.w / 2 - centerX
      const dy = parentPos.y + parentSize.h / 2 - centerY
      const side: 'above' | 'left' | 'right' | 'below' =
        Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'above' : 'below'
      return {
        entry,
        key: { rank: SIDE_RANK[side], along: side === 'above' || side === 'below' ? parentPos.x + parentSize.w / 2 : parentPos.y + parentSize.h / 2, dist: dx * dx + dy * dy },
      }
    })
    keyed.sort((a, b) => {
      if (!a.key || !b.key) return (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.entry.index - b.entry.index
      return a.key.rank - b.key.rank || a.key.along - b.key.along || a.key.dist - b.key.dist || a.entry.index - b.entry.index
    })

    // FK 멤버가 차지한 슬롯(인덱스)에 원하는 순서를 채운다 — 비멤버(PK·일반)는 그대로
    const memberIds = new Set(entries.map((entry) => entry.column.id))
    const slots: number[] = []
    const work = table.columns.map((column) => column.id)
    work.forEach((id, index) => {
      if (memberIds.has(id)) slots.push(index)
    })
    keyed.forEach((item, k) => {
      const want = item.entry.column.id
      const from = work.indexOf(want)
      const to = slots[k]
      if (from === to) return
      changes.push({ type: 'column/move', tableId: table.id, columnId: want, toIndex: to })
      work.splice(from, 1)
      work.splice(to, 0, want)
    })
  }
  return changes
}
