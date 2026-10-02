/**
 * 자동 배치(Auto Layout) — elkjs 계층형(Layered) 알고리즘 (05-editor/02-ui.md §5.1)
 *
 * 하이브리드: elkjs는 **테이블 노드 좌표만** 계산한다(elk.direction DOWN — FK 참조 방향 기준
 * 부모가 위 레벨). 관계선 경로는 소비하지 않고 좌표가 바뀌면 자체 라우터(edge-router)가
 * 다시 계산한다 — 장애물 회피·까마귀발 글리프 끝점 연결은 그대로 유지된다.
 * 그룹(v1.13 논리 그룹)이 있으면 그래프가 2계층이 된다 — 그룹마다 컴파운드 노드 하나에
 * 멤버를 넣고 elk.hierarchyHandling INCLUDE_CHILDREN으로 계층 교차 관계까지 계층형
 * 알고리즘이 처리한다. 같은 그룹끼리 하나의 덩어리로 모여 배치되고(사용자 요청),
 * 그룹이 없으면 루트에 테이블이 그대로 놓이는 기존 평면 그래프와 동일하다.
 * 노트는 ELK 그래프에서 제외되지만 배치 후 테이블과 포개지지 않게 위치를 잡는다
 * (positionNotes — 연관 노트는 테이블 우측, 자유 노트는 겹칠 때만 우측 여백 열).
 * 자기 참조 관계는 레벨 제약이 없어 엣지에서 제외한다.
 * 결과는 호출부가 node/move + 노트 note/patch 묶음 커밋으로 반영해 Undo 1스택으로 되돌린다.
 * elkjs는 동적 import로 첫 실행 시에만 로드된다(번들 격리 — elk.bundled.js는 gzip 수백 KB).
 *
 * 방향(v1.29): 좌→우 배치는 **가로세로를 맞바꾼 문제**를 위→아래로 풀고 좌표를 다시 맞바꿔 얻는다.
 * 레이어가 열이 되고, 허브 정렬 다듬기 같은 후처리도 축만 바뀐 같은 규칙으로 동작한다.
 * 계산(v1.29): 브라우저에서는 elk를 워커에서 돌린다 — 큰 문서에서도 화면이 멈추지 않고 취소할 수 있다.
 * 워커를 쓸 수 없으면(테스트 환경 등) 종래처럼 같은 스레드에서 계산한다.
 */
import type { ELK, ElkNode } from 'elkjs/lib/elk.bundled.js'

import type { EditorDocument, ErdTable } from './content-schema'
import type { ErdChange } from './changes'
import { estimateTableHeight, tableRenderWidth } from './table-size'

/** 자동 배치 모드 — 툴바 분할 버튼 표기와 localStorage(crowfoot.editor.layout-mode) 값
 *  (layered=elkjs 계층형, hub=허브 중심 링 방사형, hybrid=허브 방사형 + 스포크별 계층형 트리) */
export type AutoLayoutMode = 'layered' | 'hub' | 'hybrid'

/** 방사형 계산의 배치 전략 — hub/hybrid 두 모드가 layoutHubPositions를 함께 쓴다
 *  (ring=링 반지름 공식의 동심원, tree=허브+1링 방사형에 스포크 서브트리는 계층형 블록) */
export type HubLayoutStrategy = 'ring' | 'tree'

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

/** 배치 방향 — down은 부모가 위(기본), right는 부모가 왼쪽. 허브(ring) 모드에는 방향이 없다 */
export type LayoutDirection = 'down' | 'right'

/** 취소된 배치 — 호출부가 실패 안내 없이 조용히 끝낸다 */
export class LayoutCancelledError extends Error {
  constructor() {
    super('layout cancelled')
    this.name = 'LayoutCancelledError'
  }
}

/** ELK 인스턴스 지연 싱글턴 — 첫 자동 배치 실행 시에만 청크를 로드한다 */
let elkPromise: Promise<ELK> | null = null
/** 워커에서 도는 인스턴스인지 — 취소는 워커를 끝내는 것으로 한다 */
let elkInWorker = false
/** 진행 중인 계산을 끊는 함수 — 계산이 없으면 null */
let abortRunning: (() => void) | null = null

async function createElk(): Promise<ELK> {
  if (typeof Worker !== 'undefined') {
    try {
      const { default: ELKConstructor } = await import('elkjs/lib/elk-api.js')
      const elk = new ELKConstructor({
        workerFactory: () => new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url)),
      })
      elkInWorker = true
      return elk
    } catch {
      // 워커를 만들지 못했다 — 같은 스레드 계산으로 돌아간다
    }
  }
  elkInWorker = false
  const { default: ELKConstructor } = await import('elkjs/lib/elk.bundled.js')
  return new ELKConstructor()
}

function getElk(): Promise<ELK> {
  elkPromise ??= createElk()
  return elkPromise
}

/**
 * 진행 중인 배치 계산을 취소한다. 워커를 끝내고 다음 실행 때 새로 만든다.
 * 같은 스레드 계산은 끊을 수 없다 — 결과만 버린다(계산은 끝까지 돈다).
 */
export function cancelLayout(): void {
  abortRunning?.()
}

/** elk 계산 한 번 — 취소하면 LayoutCancelledError로 끝난다 */
async function runElk(elk: ELK, graph: ElkNode, owned: boolean): Promise<ElkNode> {
  let abort: (() => void) | null = null
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      if (owned && elkInWorker) {
        elk.terminateWorker()
        elkPromise = null
      }
      reject(new LayoutCancelledError())
    }
  })
  abortRunning = abort
  try {
    return await Promise.race([elk.layout(graph), cancelled])
  } finally {
    if (abortRunning === abort) abortRunning = null
  }
}

/** 모든 테이블의 크기 — 실측이 있으면 실측, 없으면 추정 */
function resolveSizes(doc: EditorDocument, sizes?: TableSizes): TableSizes {
  const resolved: TableSizes = {}
  for (const table of doc.model.tables) {
    resolved[table.id] = sizeOf(table, doc.diagram.nodes[table.id]?.width ?? null, sizes)
  }
  return resolved
}

/** 가로세로를 맞바꾼 크기 — 좌→우 배치를 위→아래 문제로 바꾼다 */
function transposeSizes(doc: EditorDocument, sizes?: TableSizes): TableSizes {
  const transposed: TableSizes = {}
  for (const [id, size] of Object.entries(resolveSizes(doc, sizes))) transposed[id] = { w: size.h, h: size.w }
  return transposed
}

function transposePositions(positions: Record<string, { x: number; y: number }>) {
  const transposed: Record<string, { x: number; y: number }> = {}
  for (const [id, position] of Object.entries(positions)) transposed[id] = { x: position.y, y: position.x }
  return transposed
}

/** 그룹 컴파운드 노드의 안쪽 여백 — 그룹 상자는 캔버스에 그려지지 않으므로(논리 그룹) 이
 *  여백은 순수하게 **덩어리 사이 복도**로 작동한다. 그룹 경계를 넘는 관계선은 모두 이 복도로
 *  몰려 지나가는데 레이어 간격(170px)만으로는 선들이 인접 테이블에 밀착해 어느 관계인지
 *  읽기 어렵다(2026-09-23 실사용 피드백). 여백이 상자 양쪽으로 붙으니 멤버 간 실거리는
 *  betweenLayers + GROUP_PADDING×2로 벌어지고, 자체 라우터의 법선 스태브·장애물 회피가
 *  그 공간에서 펴진다. 그룹 안쪽 멤버 간격은 이 값의 영향을 받지 않는다 */
const GROUP_PADDING = 96

/** 허브 중심 배치의 그룹 슈퍼노드 안쪽 여백 — 계층형 복도(96)보다 작게 둔다. 허브 모드에서
 *  그룹 상자는 방사형 배치의 점유 반경(외접원)에 그대로 더해져 링 반지름·화음 간격을 벌리므로
 *  96이면 인접 그룹 멤버의 실거리가 96+nodeNode+96로 벌어져 한 화면에 여러 그룹이 들어오지
 *  않았다(2026-09-29 사용자 피드백 — 그룹 간격이 너무 멀어 왔다갔다 스크롤해야 된다). 반으로
 *  줄여도 관계선 복도(nodeNode 140 + 48×2)는 까마귀발 스텁·글리프 여유를 지킨다 */
const HUB_GROUP_PADDING = 48

/** 허브 링 압축에서 그룹↔그룹 쌍의 보장 간격 — 테이블↔테이블(nodeNode)보다 작다. 그룹 상자는
 *  안쪽 여백(HUB_GROUP_PADDING)이 상자에 포함돼 있어 상자 사이가 좁아도 멤버 테이블 실거리는
 *  48+간격+48로 관계선 복도를 지키고, 시각적으로는 묶음끼리 인접해야 한 화면에 여러 그룹이
 *  들어온다(2026-09-29 사용자 피드백 — 간격이 적당하니 조금만 더 줄여달라) */
const HUB_GROUP_CLEARANCE = 112

/** 그룹 내부(재귀 배치)용 간격 — 그룹 밖보다 조밀하되 멤버가 붙어 보이지는 않게. 멤버 사이
 *  관계선은 짧고 레인 경합이 적어 nodeNode보다 줄여도 읽힌다(2026-09-29 사용자 피드백 —
 *  테이블이 너무 가깝게 붙는다). betweenLayers는 트리 블록(부모-자식 수직 간격)에 쓰인다 */
function groupInnerSpacing(spacing: LayoutSpacing): LayoutSpacing {
  return {
    ...spacing,
    nodeNode: Math.min(spacing.nodeNode, 120),
    betweenLayers: Math.min(spacing.betweenLayers, 120),
  }
}

/** 그룹 내부 조밀 팩 — 방사형 재귀 대신 쓴다(2026-09-29). 그룹 멤버는 관계로 묶인 작은
 *  군집이라 원 점유(외접원) 기반 반지름은 2배 남짓 과대 평가해 6테이블 그룹이 1600×1800으로
 *  퍼졌다(사용자 피드백 — 간격이 너무 멀어 한 화면에 안 들어온다). 내부 관계로 BFS 순서를
 *  잡아 각 멤버를 인접 멤버(앵커)의 우·하·좌·상 빈자리 중 전체 bbox를 가장 적게 늘리는 곳에
 *  붙인다 — 2테이블은 나란히, 6테이블은 조밀한 블롭. 모든 쌍 AABB 간격 ≥ gap을 지키고
 *  후보 순서·평가식이 고정이라 결정론적이다 */
function packCluster(
  members: ErdTable[],
  innerEdges: Array<[string, string]>,
  sizeOf: (table: ErdTable) => { w: number; h: number },
  gap: number,
): Record<string, { x: number; y: number }> {
  const byId = new Map(members.map((table) => [table.id, table]))
  // 내부 인접 — 방향 무시, 쌍 수축
  const neighborsOf = new Map<string, Set<string>>()
  for (const table of members) neighborsOf.set(table.id, new Set())
  for (const [a, b] of innerEdges) {
    if (a === b) continue
    neighborsOf.get(a)?.add(b)
    neighborsOf.get(b)?.add(a)
  }
  // 시드 — 내부 차수 최대(동륜 문서 순)에서 BFS
  const start = members.reduce((best, table) => {
    const bestDeg = neighborsOf.get(best.id)?.size ?? 0
    const deg = neighborsOf.get(table.id)?.size ?? 0
    return deg > bestDeg ? table : best
  }, members[0])
  const placedOrder: string[] = []
  const seen = new Set<string>()
  const queue = [start.id]
  seen.add(start.id)
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head]
    placedOrder.push(id)
    const next = [...(neighborsOf.get(id) ?? [])]
      .filter((nid) => byId.has(nid) && !seen.has(nid))
      .sort((a, b) => members.findIndex((m) => m.id === a) - members.findIndex((m) => m.id === b))
    for (const nid of next) {
      seen.add(nid)
      queue.push(nid)
    }
  }
  for (const table of members) {
    if (!seen.has(table.id)) placedOrder.push(table.id)
  }

  const boxes = new Map<string, Box>()
  const extent = () => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const box of boxes.values()) {
      minX = Math.min(minX, box.x)
      minY = Math.min(minY, box.y)
      maxX = Math.max(maxX, box.x + box.w)
      maxY = Math.max(maxY, box.y + box.h)
    }
    return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) }
  }
  const axisGap = (a: Box, b: Box): number => {
    const gx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
    const gy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))
    return Math.max(gx, gy)
  }
  const fits = (candidate: Box, selfId: string): boolean => {
    for (const [otherId, other] of boxes) {
      if (otherId !== selfId && axisGap(candidate, other) < gap) return false
    }
    return true
  }

  for (const id of placedOrder) {
    const table = byId.get(id)!
    const size = sizeOf(table)
    if (boxes.size === 0) {
      boxes.set(id, { x: 0, y: 0, w: size.w, h: size.h })
      continue
    }
    // 앵커 — 이미 놓인 내부 이웃(문서 순), 없으면 마지막으로 놓은 테이블
    const anchors = [...(neighborsOf.get(id) ?? [])].filter((nid) => boxes.has(nid))
    const anchorIds = anchors.length > 0 ? anchors : [placedOrder[placedOrder.indexOf(id) - 1] ?? [...boxes.keys()].at(-1)!]
    const before = extent()
    let best: { box: Box; score: number } | null = null
    // 후보 순서 우·하·좌·상(읽기 방향 우선). 평가 — 결과 bbox의 최대 변을 우선 줄인다
    // (세로 체인 260×2800보다 2열 700×1500이 낫다 — 외부 링 점유가 정방형에 가까울수록
    // 촘촘히 돌아간다), 동륜은 bbox 면적, 그다음 후보 순서. 고정식이라 결정론 유지
    const offsets: Array<[number, number]> = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]
    for (const anchorId of anchorIds) {
      const anchor = boxes.get(anchorId)!
      for (const [ox, oy] of offsets) {
        const x = ox > 0 ? anchor.x + anchor.w + gap : ox < 0 ? anchor.x - size.w - gap : anchor.x
        const y = oy > 0 ? anchor.y + anchor.h + gap : oy < 0 ? anchor.y - size.h - gap : anchor.y
        const candidate: Box = { x, y, w: size.w, h: size.h }
        if (!fits(candidate, id)) continue
        const after = {
          minX: Math.min(before.minX, x),
          minY: Math.min(before.minY, y),
          maxX: Math.max(before.maxX, x + size.w),
          maxY: Math.max(before.maxY, y + size.h),
        }
        const w = after.maxX - after.minX
        const h = after.maxY - after.minY
        const score = Math.round(Math.max(w, h) * 10_000 + w * h)
        if (best === null || score < best.score) best = { box: candidate, score }
      }
    }
    // 전부 막혀도(이론상 없음 — 무한 평면) 보험: 가장 최근 박스 아래 줄바꿈
    boxes.set(id, best?.box ?? { x: 0, y: extent().maxY + gap, w: size.w, h: size.h })
  }

  const out: Record<string, { x: number; y: number }> = {}
  for (const [id, box] of boxes) out[id] = { x: Math.round(box.x), y: Math.round(box.y) }
  return out
}

/** 테이블별 첫 소속 그룹(문서 순서) — 계층형(buildLayoutGraph)과 허브 중심 배치
 *  (layoutHubPositions)가 같은 규칙을 공유한다. 스키마는 다중 소속을 허하지만 물리적으로는
 *  한 덩어리에만 속할 수 있다(groupColorOf와 같은 규칙). 존재하지 않는 테이블 id는 무시 */
function assignFirstGroups(doc: EditorDocument): Map<string, string> {
  const alive = new Set(doc.model.tables.map((table) => table.id))
  const firstGroupOf = new Map<string, string>() // tableId → areaId(문서 순서 첫 소속)
  for (const area of doc.diagram.areas ?? []) {
    for (const id of area.tableIds) {
      if (!firstGroupOf.has(id) && alive.has(id)) firstGroupOf.set(id, area.id)
    }
  }
  return firstGroupOf
}

/**
 * 문서 → ELK 그래프(순수·동기). 노드 = 테이블 전체(관계 없는 테이블 포함, 노트 제외),
 * 크기는 측정값(RF 실측) 우선, 없으면 렌더 추정치. 엣지 = 관계 부모→자식,
 * 자기 참조(부모===자식)는 제외한다.
 * 그룹이 있으면 그룹마다 자식을 품은 컴파운드 노드가 되고 미소속 테이블은 루트에 놓는다.
 * 각 테이블은 **문서 순서 첫 소속 그룹** 한 곳에만 들어간다(assignFirstGroups).
 * 엣지는 ELK 규칙대로 양 끝의 최소 공통 조상에 둔다: 같은 그룹이면 그룹 노드,
 * 경계를 넘으면(그룹↔그룹·그룹↔미소속) 루트. 계층 교차 엣지는 INCLUDE_CHILDREN로
 * 계층형 알고리즘이 직접 레벨 배정한다.
 */
export function buildLayoutGraph(
  doc: EditorDocument,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
  sizes?: TableSizes,
): ElkNode {
  /** 간격 옵션 — 루트뿐 아니라 **그룹 컴파운드 노드에도** 걸어야 그룹 안 멤버에 적용된다.
   *  루트에만 걸면 컴파운드 자식 사이는 ELK 기본 간격으로 무너진다(실측 2026-09-23:
   *  nodeNode 140인데 그룹 안 같은 레이어 간격이 110 — 관계선이 테이블에 붙어 식별이
   *  안 된다는 사용자 피드백). 같은 옵션을 양쪽에 명시하니 그룹 안 최소 간격이 208+로 회복 */
  const spacingOptions: Record<string, string> = {
    'elk.spacing.nodeNode': `${spacing.nodeNode}`,
    'elk.spacing.edgeEdge': `${spacing.edgeEdge}`,
    'elk.spacing.edgeNode': `${spacing.edgeNode}`,
    'layered.spacing.nodeNodeBetweenLayers': `${spacing.betweenLayers}`,
    'elk.spacing.componentComponent': `${spacing.component}`,
  }

  const tableNode = (table: ErdTable): ElkNode => {
    const size = sizeOf(table, doc.diagram.nodes[table.id]?.width ?? null, sizes)
    return { id: table.id, width: size.w, height: size.h }
  }

  // areas ?? [] — 리버스·SQL Import 다이얼로그는 서버 조립 JSON을 파싱해 그대로 넘긴다
  // (v1.13 이전 콘텐츠는 areas 키 자체가 없다 — content-io의 레거시 정규화와 같은 처지)
  const areas = doc.diagram.areas ?? []
  const firstGroupOf = assignFirstGroups(doc)

  const groupNodes: ElkNode[] = []
  const groupNodeOf = new Map<string, ElkNode>() // areaId → 컴파운드 노드
  for (const area of areas) {
    const members = doc.model.tables.filter((table) => firstGroupOf.get(table.id) === area.id)
    if (members.length === 0) continue
    const group: ElkNode = {
      id: `group:${area.id}`,
      children: members.map(tableNode),
      edges: [],
      layoutOptions: {
        'elk.padding': `[top=${GROUP_PADDING},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
        ...spacingOptions,
      },
    }
    groupNodes.push(group)
    groupNodeOf.set(area.id, group)
  }

  const looseNodes = doc.model.tables
    .filter((table) => !firstGroupOf.has(table.id))
    .map(tableNode)

  const rootEdges: Array<{ id: string; sources: [string]; targets: [string] }> = []
  for (const rel of doc.model.relationships) {
    if (rel.parentTableId === rel.childTableId) continue
    const edge = { id: rel.id, sources: [rel.parentTableId] as [string], targets: [rel.childTableId] as [string] }
    const parentGroup = firstGroupOf.get(rel.parentTableId)
    if (parentGroup && parentGroup === firstGroupOf.get(rel.childTableId)) {
      groupNodeOf.get(parentGroup)!.edges!.push(edge)
    } else {
      rootEdges.push(edge)
    }
  }

  return {
    id: 'root',
    children: [...groupNodes, ...looseNodes],
    edges: rootEdges,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      // 계층 교차 처리는 그룹이 있을 때만 켠다 — 평면 그래프에서 켜면 계층형 알고리즘이
      // 컴파운드 모드로 돌아 레이어 간격·엣지 레인 산출이 달라진다(2026-09-23 실사용 회귀 —
      // 그룹 없는 문서는 예전 결과와 완전히 같아야 한다)
      ...(groupNodes.length > 0 ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}),
      ...spacingOptions,
      'elk.padding': `[top=${spacing.padding},left=${spacing.padding},bottom=${spacing.padding},right=${spacing.padding}]`,
    },
  }
}

/**
 * 자동 배치를 실행해 테이블별 새 좌표를 얻는다. 결과 x/y는 그래프 루트 원점(좌상단) 기준이라
 * 캔버스 좌표계와 같다 — 그룹 컴파운드 노드 안의 테이블 좌표는 그룹 기준이라 부모 오프셋을
 * 누적해 절대 좌표로 바꾼다(ELK 좌표는 항상 자신을 담은 노드 기준).
 * 테이블이 2개 미만이면 빈 객체(배치할 관계가 없다).
 * 실패는 예외를 전파한다 — 안내 토스트는 호출부가 담당한다.
 */
export async function layoutTablePositions(
  doc: EditorDocument,
  options: { elk?: ELK; spacing?: LayoutSpacing; sizes?: TableSizes; direction?: LayoutDirection } = {},
): Promise<Record<string, { x: number; y: number }>> {
  if (doc.model.tables.length < 2) return {}
  if (options.direction === 'right') {
    const transposed = await layoutTablePositions(doc, {
      ...options,
      direction: 'down',
      sizes: transposeSizes(doc, options.sizes),
    })
    return transposePositions(transposed)
  }
  const elk = options.elk ?? (await getElk())
  const graph = await runElk(elk, buildLayoutGraph(doc, options.spacing, options.sizes), options.elk === undefined)
  const tableIds = new Set(doc.model.tables.map((table) => table.id))
  const positions: Record<string, { x: number; y: number }> = {}
  const collect = (node: ElkNode, offsetX: number, offsetY: number) => {
    const x = offsetX + (node.x ?? 0)
    const y = offsetY + (node.y ?? 0)
    if (node.id && tableIds.has(node.id)) {
      positions[node.id] = { x: Math.round(x), y: Math.round(y) }
    }
    for (const child of node.children ?? []) collect(child, x, y)
  }
  for (const child of graph.children ?? []) collect(child, 0, 0)
  return refineHubAlignment(doc, positions, options.sizes)
}

/**
 * 배치 후 허브(부모 1·자식 2 이상)의 가로 정렬 다듬기 — **아래 자식 중 중심이 가장
 * 가까운 자식과 세로로 맞춘다**(ELK 계층형은 허브를 위 부모와 정렬시키는데, 허브 아래
 * 복도는 자식 부채꼴과 다른 테이블에서 오는 엣지가 겹치는 가장 붐비는 구간이라 그곳의
 * 절선을 없애는 쪽이 관계선 식별에 낫다 — 조용한 위 복도[부모↔허브 1줄]에서 굽는다.
 * 2026-09-23 실사용 피드백: medicine_package_units가 부모와 정렬하느라 왼쪽 관계선에
 * 몰였고, 오른쪽 자식과 맞추니 식별이 좋아졌다).
 * 이동은 같은 띈(y가 겹치는) 테이블과 겹치지 않는 범위로 되돌린다. 허브가 아니면(부모
 * 0·2 이상, 자식 0·1) 그대로 둔다.
 */
export function refineHubAlignment(
  doc: EditorDocument,
  positions: Record<string, { x: number; y: number }>,
  sizes?: TableSizes,
): Record<string, { x: number; y: number }> {
  if (Object.keys(positions).length === 0) return positions
  const parentsOf = new Map<string, Set<string>>()
  const childrenOf = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    const set = map.get(key) ?? new Set<string>()
    set.add(value)
    map.set(key, set)
  }
  for (const rel of doc.model.relationships) {
    if (rel.parentTableId === rel.childTableId) continue
    add(parentsOf, rel.childTableId, rel.parentTableId)
    add(childrenOf, rel.parentTableId, rel.childTableId)
  }

  const boxOf = (id: string): Box | null => {
    const table = doc.model.tables.find((t) => t.id === id)
    const pos = positions[id]
    if (!table || !pos) return null
    const size = sizeOf(table, doc.diagram.nodes[id]?.width ?? null, sizes)
    return { x: pos.x, y: pos.y, w: size.w, h: size.h }
  }

  const out = { ...positions }
  for (const table of doc.model.tables) {
    const hub = boxOf(table.id)
    const parents = parentsOf.get(table.id)
    const children = childrenOf.get(table.id)
    if (!hub || parents?.size !== 1 || !children || children.size < 2) continue
    // 계층형 DOWN이라 자식은 아래 레이어에 있다 — 허브 바로 아래(세로로 안 겹치는) 자식만
    const below = [...children].flatMap((id) => {
      const box = boxOf(id)
      return box && box.y >= hub.y + hub.h ? [box] : []
    })
    if (below.length === 0) continue
    const hubCx = hub.x + hub.w / 2
    const nearest = below.reduce((a, b) =>
      Math.abs(b.x + b.w / 2 - hubCx) < Math.abs(a.x + a.w / 2 - hubCx) ? b : a,
    )
    let shift = nearest.x + nearest.w / 2 - hubCx
    if (Math.abs(shift) < 1) continue
    // 같은 띈 이웃에게 겹칠 만큼 가면 되돌린다(부모·자식은 위아래라 안 걸린다). 이때
    // 딱 붙이면 관계선이 두 테이블 사이를 지나갈 통로가 없어진다 — 라우터는 면에서
    // 마진(24)을 두고, 밀착 감지가 박스를 ±22 부풀려 재계산하므로 두 테이블 사이에
    // 레인이 하나 들어가려면 24+22+22+24 ≈ 92는 필요하다(2026-09-23 organization_members가
    // invitations에 붙어 글리프 스텁이 관통한 회귀 — 60으로는 잔존 밀착 4px)
    const neighborGap = 96
    for (const other of doc.model.tables) {
      if (other.id === table.id) continue
      const ob = boxOf(other.id)
      if (!ob || ob.y >= hub.y + hub.h || hub.y >= ob.y + ob.h) continue
      const moved = hub.x + shift
      if (ob.x >= moved + hub.w || moved >= ob.x + ob.w) continue // 이동 결과가 안 겹친다
      shift = shift > 0
        ? ob.x - hub.x - hub.w - neighborGap
        : ob.x + ob.w + neighborGap - hub.x
    }
    if (Math.abs(shift) < 1) continue
    out[table.id] = { x: Math.round(hub.x + shift), y: hub.y }
  }
  return out
}

/** 허브 중심 방사형의 배치 단위 — 느슨한 테이블 하나 또는 그룹(슈퍼노드) */
interface HubEntity {
  id: string
  /** 그룹 슈퍼노드면 true — 멤버 좌표는 localPositions에 따로 담는다 */
  isGroup: boolean
  /** 그룹 멤버 테이블 id (isGroup일 때만) */
  memberIds: string[]
  /** 전체 타이브레이크 — 그룹은 멤버의 최소 문서 인덱스(문서 순서가 곧 결정 순서) */
  orderKey: number
  /** 외부 그래프에서 차지하는 AABB — 그룹은 멤버 bbox ± HUB_GROUP_PADDING */
  box: Box
  /** 그룹 내부 배치 결과(재귀 호출 원점계) — isGroup일 때만 */
  localPositions: Record<string, { x: number; y: number }>
  /** localPositions 좌표계의 멤버 최소 좌표 — 슈퍼노드 박스 안에 대응할 때 뺀다 */
  localOrigin: { x: number; y: number }
}

/**
 * 자동 배치(허브 중심 방사형) — 관계가 가장 많은 테이블을 중심에 두고 나머지를 사방으로
 * 펼친다 (05-editor/02-ui.md §5.1, v1.24 — 사용자 요청 "상하좌우, 필요하면 대각선까지").
 * 두 전략: `ring`(허브 모드 — 링 반지름 공식으로 균일한 동심원)과 `tree`(하이브리드 모드 —
 * 허브와 1링 스포크만 방사형, 각 스포크의 서브트리는 부모 위·자식 아래 계층형 트리 블록으로
 * 레이 바깥에 뻗는다. 계층형과 허브 중심의 혼합, 2026-09-29 사용자 요청).
 * elkjs를 쓰지 않는 순수 동기 계산이라 같은 문서는 항상 같은 결과를 낸다 — 타이브레이크는
 * 전부 문서 순서라 **관계 생성 순서는 결과에 무영향**이다(elkjs force는 비결정론적,
 * radial은 트리 전용이라 직접 구현했다).
 *
 * 단위(엔티티)는 느슨한 테이블 하나 또는 그룹 슈퍼노드 — 그룹은 먼저 멤버끼리 재귀 배치해
 * 그 덩어리를 하나의 큰 노드로 수축한다(경계를 넘는 관계만 외부 그래프에 남는다). 각 연결
 * 성분은 최대 degree 허브(동률은 이웃 degree 합 → 문서 순)를 루트로 BFS 스패닝을 만들고,
 * 리프 수 비례 부채꼴 각도(고전 radial)의 이등분선에 노드를 놓으며, 링 반지름은
 * ① 인접 링 두께(외접원 반경 합 + nodeNode)와 ② 호 수용(링 내 인접 쌍의 화음 ≥ 지름 합 +
 * nodeNode)의 최댓값으로 잡는다 — 이기종 크기에도 원천적으로 겹치지 않는다(이완 패스는
 * 반올림 잔털용 안전망이라 고정 4라운드, 허브는 핀 고정).
 * 메인 성분은 원점, 부성분(다중 엔티티 성분·고립 그룹)은 메인 아래 가로 행, 관계 없는
 * 고립 테이블은 우측 열에 문서 순으로 쌓는다. 결과 좌표는 계층형과 같은 관례(전체 AABB의
 * min = padding, 정수)라 canvas-bounds·fitView가 양 모드에서 같게 작동한다. 후처리
 * (orderFkColumns·positionNotes)는 위치 기반이라 방사형 결과에도 그대로 재사용한다.
 * 테이블이 2개 미만이면 빈 객체(계층형 가드와 동일).
 */
export function layoutHubPositions(
  doc: EditorDocument,
  options: { spacing?: LayoutSpacing; sizes?: TableSizes; strategy?: HubLayoutStrategy; direction?: LayoutDirection } = {},
): Record<string, { x: number; y: number }> {
  if (doc.model.tables.length < 2) return {}
  // 좌→우는 계층형 블록이 있는 tree(하이브리드)에만 뜻이 있다 — 동심원(ring)은 방향이 없다
  if (options.direction === 'right' && options.strategy === 'tree') {
    return transposePositions(
      layoutHubPositions(doc, { ...options, direction: 'down', sizes: transposeSizes(doc, options.sizes) }),
    )
  }
  const spacing = options.spacing ?? DEFAULT_LAYOUT_SPACING
  const strategy = options.strategy ?? 'ring'
  const sizeOfTable = (table: ErdTable) =>
    sizeOf(table, doc.diagram.nodes[table.id]?.width ?? null, options.sizes)

  // ── 엔티티 구성: 그룹 슈퍼노드(내부 먼저 재귀 배치) + 느슨한 테이블 ──
  const firstGroupOf = assignFirstGroups(doc)
  const indexOfTable = new Map(doc.model.tables.map((table, index) => [table.id, index]))
  const entityOf = new Map<string, string>() // tableId → entityId
  const entities: HubEntity[] = []

  for (const area of doc.diagram.areas ?? []) {
    const members = doc.model.tables.filter((table) => firstGroupOf.get(table.id) === area.id)
    if (members.length === 0) continue
    // 내부 배치 — 조밀 팩(packCluster). 방사형 재귀는 원 점유 과대 평가 때문에 그만둔다
    const memberIds = new Set(members.map((table) => table.id))
    const innerEdges: Array<[string, string]> = []
    for (const rel of doc.model.relationships) {
      if (rel.parentTableId === rel.childTableId) continue
      if (memberIds.has(rel.parentTableId) && memberIds.has(rel.childTableId)) {
        innerEdges.push([rel.parentTableId, rel.childTableId])
      }
    }
    const inner = groupInnerSpacing(spacing)
    const localPositions =
      members.length >= 2
        ? packCluster(members, innerEdges, sizeOfTable, inner.nodeNode)
        : { [members[0].id]: { x: inner.padding, y: inner.padding } }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const member of members) {
      const pos = localPositions[member.id]
      const size = sizeOfTable(member)
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + size.w)
      maxY = Math.max(maxY, pos.y + size.h)
    }
    entities.push({
      id: `group:${area.id}`,
      isGroup: true,
      memberIds: members.map((table) => table.id),
      orderKey: Math.min(...members.map((table) => indexOfTable.get(table.id)!)),
      box: { x: 0, y: 0, w: maxX - minX + HUB_GROUP_PADDING * 2, h: maxY - minY + HUB_GROUP_PADDING * 2 },
      localPositions,
      localOrigin: { x: minX, y: minY },
    })
    for (const member of members) entityOf.set(member.id, `group:${area.id}`)
  }

  for (const table of doc.model.tables) {
    if (firstGroupOf.has(table.id)) continue
    const size = sizeOfTable(table)
    entities.push({
      id: table.id,
      isGroup: false,
      memberIds: [],
      orderKey: indexOfTable.get(table.id)!,
      box: { x: 0, y: 0, w: size.w, h: size.h },
      localPositions: {},
      localOrigin: { x: 0, y: 0 },
    })
    entityOf.set(table.id, table.id)
  }

  // 외부 엔티티 그래프 — 그룹 경계를 넘는 관계만 무방향 간선으로(동일 쌍 다중 관계는 수축)
  const adjacency = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (a === b) return
    const forward = adjacency.get(a) ?? new Set<string>()
    forward.add(b)
    adjacency.set(a, forward)
    const backward = adjacency.get(b) ?? new Set<string>()
    backward.add(a)
    adjacency.set(b, backward)
  }
  for (const rel of doc.model.relationships) {
    if (rel.parentTableId === rel.childTableId) continue
    const a = entityOf.get(rel.parentTableId)
    const b = entityOf.get(rel.childTableId)
    if (a && b) link(a, b)
  }
  const entityById = new Map(entities.map((entity) => [entity.id, entity]))

  /** 한 연결 성분의 방사형 배치 — 허브를 원점에 두고 좌상단 좌표(블롭 국소계)를 반환 */
  const layoutBlob = (comp: HubEntity[]): { boxes: Map<string, Box>; bbox: Box } => {
    if (comp.length === 1) {
      const only = comp[0]
      const box = { x: 0, y: 0, w: only.box.w, h: only.box.h }
      return { boxes: new Map([[only.id, box]]), bbox: box }
    }
    const order = [...comp].sort((a, b) => a.orderKey - b.orderKey)
    // 허브 — degree · 이웃 degree 합 · 문서 순 키로 최댓값(동률은 모두 결정적으로 갈린다)
    const degreeOf = new Map<string, number>()
    const neighborDegreeSumOf = new Map<string, number>()
    for (const entity of order) {
      const neighbors = [...(adjacency.get(entity.id) ?? [])].map((id) => entityById.get(id)!)
      degreeOf.set(entity.id, neighbors.length)
      neighborDegreeSumOf.set(
        entity.id,
        neighbors.reduce((sum, n) => sum + (adjacency.get(n.id)?.size ?? 0), 0),
      )
    }
    const hub = order.reduce((best, entity) => {
      const better =
        (degreeOf.get(entity.id)! - degreeOf.get(best.id)!) ||
        (neighborDegreeSumOf.get(entity.id)! - neighborDegreeSumOf.get(best.id)!) ||
        best.orderKey - entity.orderKey
      return better > 0 ? entity : best
    })

    // BFS 스패닝 — 이웃은 항상 orderKey 정렬로 방문(Set 순서에 기대지 않는다)
    const ringOf = new Map<string, number>()
    const childrenOf = new Map<string, HubEntity[]>()
    const bfsOrder: HubEntity[] = [hub]
    ringOf.set(hub.id, 0)
    for (let head = 0; head < bfsOrder.length; head += 1) {
      const current = bfsOrder[head]
      const kids: HubEntity[] = []
      for (const neighbor of [...(adjacency.get(current.id) ?? [])]
        .map((id) => entityById.get(id)!)
        .sort((a, b) => a.orderKey - b.orderKey)) {
        if (ringOf.has(neighbor.id)) continue
        ringOf.set(neighbor.id, ringOf.get(current.id)! + 1)
        kids.push(neighbor)
        bfsOrder.push(neighbor)
      }
      childrenOf.set(current.id, kids)
    }
    // 서브트리 리프 수 — 역방향(자식 먼저) 누적, 재귀 없이 깊은 체인도 안전하다
    const leavesOf = new Map<string, number>()
    for (let i = bfsOrder.length - 1; i >= 0; i -= 1) {
      const entity = bfsOrder[i]
      const kids = childrenOf.get(entity.id) ?? []
      leavesOf.set(
        entity.id,
        kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + leavesOf.get(kid.id)!, 0),
      )
    }
    // 부채꼴 각도 — BFS 방문 순서대로 자식에게 리프 비례 폭을 배정하고 이등분선에 놓는다.
    // 시작각 12시 고정. 단일 자식은 부모 wedge 전체를 물려받아 체인이 일직선으로 뻗는다
    const START = -Math.PI / 2
    const angleOf = new Map<string, number>()
    const rangeOf = new Map<string, [number, number]>()
    rangeOf.set(hub.id, [START, START + Math.PI * 2])
    for (const entity of bfsOrder) {
      const [from, to] = rangeOf.get(entity.id)!
      angleOf.set(entity.id, (from + to) / 2)
      const kids = childrenOf.get(entity.id) ?? []
      let cursor = from
      for (const kid of kids) {
        const width = ((to - from) * leavesOf.get(kid.id)!) / leavesOf.get(entity.id)!
        rangeOf.set(kid.id, [cursor, cursor + width])
        cursor += width
      }
    }
    const halfDiag = (entity: HubEntity) => Math.hypot(entity.box.w, entity.box.h) / 2
    const boxes = new Map<string, Box>()
    if (strategy === 'tree') {
      // ── 하이브리드 — 허브와 1링(스포크)까지만 방사형이고, 각 스포크의 서브트리는
      // 계층형 트리 블록(부모 위·자식 아래, 형제 나란히·부모 중앙)으로 뻗는다
      // (2026-09-29 사용자 재요청: "계층형과 허브 중심을 섞은 게 하이브리드" — 링 압축만
      // 바꾼 이전 fill 전략은 형태가 허브 모드와 거의 같았다). 블록은 레이의 사분면에
      // 맞춰 좌우 반전·상하 반전해 바깥쪽으로 뻗게 하고, 이미 놓인 것들(허브·이전 블록)과
      // 겹치면 스포크 레이를 따라 첫 빈틈까지 밀어낸다 — 구성상 무겹침이라 이완 불필요.
      const placed: Box[] = []
      const push = (entity: HubEntity, box: Box) => {
        boxes.set(entity.id, box)
        placed.push(box)
      }
      push(hub, { x: -hub.box.w / 2, y: -hub.box.h / 2, w: hub.box.w, h: hub.box.h })
      // 간격 여유 — nodeNode에 최종 int 반올림 보정 1 (블록 내부 간격도 같은 이유로 +1)
      const SLACK = spacing.nodeNode + 1
      const GAP = spacing.nodeNode + 1

      const spokes = childrenOf.get(hub.id) ?? []
      // 링1 반지름 — 허브·스포크 두께 합에 인접 스포크 화음 수용(링 전략 1링 공식 그대로)
      let radius = halfDiag(hub) + Math.max(...spokes.map(halfDiag)) + spacing.nodeNode
      if (spokes.length >= 2) {
        const byAngle = [...spokes].sort(
          (a, b) => angleOf.get(a.id)! - angleOf.get(b.id)! || a.orderKey - b.orderKey,
        )
        for (let i = 0; i < byAngle.length; i += 1) {
          const a = byAngle[i]
          const b = byAngle[(i + 1) % byAngle.length]
          let raw = angleOf.get(b.id)! - angleOf.get(a.id)!
          if (raw < 0) raw += Math.PI * 2
          const separation = Math.min(raw, Math.PI * 2 - raw)
          radius = Math.max(
            radius,
            (halfDiag(a) + halfDiag(b) + spacing.nodeNode) / (2 * Math.sin(Math.max(separation, 0.01) / 2)),
          )
        }
      }

      /** 장애물이 이 레이에서 만드는 겹침 r-구간 — 축별 조건을 1차식으로 풀어 교집합 */
      const blockingIntervals = (
        ux: number,
        uy: number,
        halfW: number,
        halfH: number,
        offX: number,
        offY: number,
      ): Array<[number, number]> => {
        const out: Array<[number, number]> = []
        for (const obstacle of placed) {
          const axis = (u: number, center: number, half: number, off: number): [number, number] | null => {
            // 이동 기준점 r·u + off 에 대해 |r·u + off - center| < half 인 r 의 구간
            if (Math.abs(u) > 1e-9) {
              const lo = (center - half - off) / u
              const hi = (center + half - off) / u
              return lo <= hi ? [lo, hi] : [hi, lo]
            }
            // 레이가 그 축과 평행 — 조건이 r 무관: 참이면 전구간, 거짓이면 공집합
            return Math.abs(center - off) < half ? [-Infinity, Infinity] : null
          }
          const ax = axis(ux, obstacle.x + obstacle.w / 2, halfW, offX)
          const ay = axis(uy, obstacle.y + obstacle.h / 2, halfH, offY)
          if (!ax || !ay) continue
          const from = Math.max(ax[0], ay[0])
          const to = Math.min(ax[1], ay[1])
          if (from < to) out.push([from, to])
        }
        return out
      }

      for (const spoke of spokes) {
        const angle = angleOf.get(spoke.id)!
        const ux = Math.cos(angle)
        const uy = Math.sin(angle)

        // ── 블록 국소 계산 — 루트(스포크)를 0행, 아래로 깊이별 행 (스택 DFS — 재귀 아님)
        const subtree: Array<{ entity: HubEntity; depth: number }> = []
        const stack: Array<[HubEntity, number]> = [[spoke, 0]]
        while (stack.length > 0) {
          const [entity, depth] = stack.pop()!
          subtree.push({ entity, depth })
          for (const kid of childrenOf.get(entity.id) ?? []) stack.push([kid, depth + 1])
        }
        // 서브트리 폭 — 역순(자식 먼저: DFS 팝 순서상 부모가 항상 앞) 누적
        const widthOf = new Map<string, number>()
        for (let i = subtree.length - 1; i >= 0; i -= 1) {
          const { entity } = subtree[i]
          const kids = childrenOf.get(entity.id) ?? []
          let inner = 0
          for (const kid of kids) inner += widthOf.get(kid.id)!
          if (kids.length > 1) inner += GAP * (kids.length - 1)
          widthOf.set(entity.id, Math.max(entity.box.w, inner))
        }
        // 행 높이·y — 깊이별 최대 높이 누적
        const rowH: number[] = []
        for (const { entity, depth } of subtree) rowH[depth] = Math.max(rowH[depth] ?? 0, entity.box.h)
        const yRow: number[] = [0]
        for (let d = 1; d < rowH.length; d += 1) yRow[d] = yRow[d - 1] + rowH[d - 1] + GAP
        // x — 부모 폭 안에 자식들을 중앙 정렬(프리오더, left는 부모가 물려준다)
        const xOf = new Map<string, number>()
        const work: Array<[HubEntity, number]> = [[spoke, 0]]
        while (work.length > 0) {
          const [entity, left] = work.pop()!
          xOf.set(entity.id, left + (widthOf.get(entity.id)! - entity.box.w) / 2)
          const kids = childrenOf.get(entity.id) ?? []
          if (kids.length === 0) continue
          const total =
            kids.reduce((sum, kid) => sum + widthOf.get(kid.id)!, 0) + GAP * (kids.length - 1)
          let cursor = left + (widthOf.get(entity.id)! - total) / 2
          for (const kid of kids) {
            work.push([kid, cursor])
            cursor += widthOf.get(kid.id)! + GAP
          }
        }
        const blockW = widthOf.get(spoke.id)!
        const blockH = yRow[rowH.length - 1] + rowH[rowH.length - 1]

        // 사분면 반전 — 블록이 레이 바깥쪽으로 뻗게. 반전 후 루트 중심의 블록 내 위치
        const mirrorX = ux < 0
        const flipY = uy < 0
        const rootCx = mirrorX ? blockW - (xOf.get(spoke.id)! + spoke.box.w / 2) : xOf.get(spoke.id)! + spoke.box.w / 2
        const rootCy = flipY ? blockH - (yRow[0] + spoke.box.h / 2) : yRow[0] + spoke.box.h / 2

        // 첫 가용 r — 블록 AABB가 허브·이전 블록과 SLACK 여유를 두는 첫 지점
        const halfW = blockW / 2 + SLACK
        const halfH = blockH / 2 + SLACK
        // 블록 중심 = r·u + (W/2 − rootCx, H/2 − rootCy) → off 항으로 흘린다
        const intervals = blockingIntervals(
          ux,
          uy,
          halfW,
          halfH,
          blockW / 2 - rootCx,
          blockH / 2 - rootCy,
        )
        intervals.sort((a, b) => a[0] - b[0])
        let r = radius
        for (const [from, to] of intervals) {
          if (r < from) break
          r = Math.max(r, to)
        }
        const ox = r * ux - rootCx
        const oy = r * uy - rootCy
        for (const { entity, depth } of subtree) {
          const lx = xOf.get(entity.id)!
          const ly = yRow[depth]
          const bx = mirrorX ? blockW - lx - entity.box.w : lx
          const by = flipY ? blockH - ly - entity.box.h : ly
          push(entity, { x: ox + bx, y: oy + by, w: entity.box.w, h: entity.box.h })
        }
      }
    } else {
      // ── 링 반지름 — ① 인접 링 두께 합 ② 링 내 각 인접 쌍의 호 수용(화음 ≥ 지름 합 + 간격).
      // 링을 오름차순으로 확정해 다음 링이 확대된 반지름을 물려받는다
      const rings = new Map<number, HubEntity[]>()
      for (const entity of comp) {
        const ring = ringOf.get(entity.id)!
        const list = rings.get(ring) ?? []
        list.push(entity)
        rings.set(ring, list)
      }
      const hdr = (list: HubEntity[]) => (list.length === 0 ? 0 : Math.max(...list.map(halfDiag)))
      const radii: number[] = [0]
      for (let ring = 1; ring <= Math.max(...rings.keys()); ring += 1) {
        const members = rings.get(ring) ?? []
        let radius = radii[ring - 1] + hdr(rings.get(ring - 1) ?? []) + hdr(members) + spacing.nodeNode
        if (members.length >= 2) {
          const byAngle = [...members].sort(
            (a, b) => angleOf.get(a.id)! - angleOf.get(b.id)! || a.orderKey - b.orderKey,
          )
          for (let i = 0; i < byAngle.length; i += 1) {
            const a = byAngle[i]
            const b = byAngle[(i + 1) % byAngle.length]
            let raw = angleOf.get(b.id)! - angleOf.get(a.id)!
            if (raw < 0) raw += Math.PI * 2 // 마지막→첫 순환 쌍
            const separation = Math.min(raw, Math.PI * 2 - raw)
            radius = Math.max(
              radius,
              (halfDiag(a) + halfDiag(b) + spacing.nodeNode) /
                (2 * Math.sin(Math.max(separation, 0.01) / 2)),
            )
          }
        }
        radii[ring] = radius
      }
      for (const entity of comp) {
        const radius = radii[ringOf.get(entity.id)!]
        const angle = angleOf.get(entity.id)!
        const cx = radius * Math.cos(angle)
        const cy = radius * Math.sin(angle)
        boxes.set(entity.id, { x: cx - entity.box.w / 2, y: cy - entity.box.h / 2, w: entity.box.w, h: entity.box.h })
      }
      // ── AABB 압축 — 외접원 반지름은 직사각 점유를 크게 과대 평가한다(260×400 테이블의
      // 점유 반지름 ≈ 480). 링 각도·질서는 그대로 두고 모든 쌍의 AABB 간격이 nodeNode 이상인
      // 한도에서 허브 방향으로 당겨 원 낭비를 없앤다(2026-09-29 사용자 피드백 — 간격이 너무
      // 멀어 한 화면에 여러 그룹이 들어오지 않는다). 보장 복도 폭(nodeNode)은 그대로 지키고
      // 거리만 축소한다. 허브 핀 고정·문서 순 방문·고정 라운드/이분탐색 — 결정론 유지
      const axisGap = (a: Box, b: Box): number => {
        const gx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
        const gy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))
        return Math.max(gx, gy) // 옆 이웃은 x분리, 위·아래 이웃은 y분리 하나만 있으면 된다
      }
      const groupIds = new Set(comp.filter((entity) => entity.isGroup).map((entity) => entity.id))
      /** 쌍별 보장 간격 — 그룹↔그룹은 상자가 안쪽 여백을 포함하므로 HUB_GROUP_CLEARANCE로
       *  조여 묶음끼리 인접하게, 나머지 쌍은 nodeNode 복도를 지킨다 */
      const pairClearance = (a: string, b: string): number =>
        groupIds.has(a) && groupIds.has(b) ? HUB_GROUP_CLEARANCE : spacing.nodeNode
      const compactClear = (moved: Box, selfId: string): boolean => {
        for (const [otherId, other] of boxes) {
          if (otherId === selfId) continue
          if (axisGap(moved, other) < pairClearance(selfId, otherId)) return false
        }
        return true
      }
      for (let round = 0; round < 3; round += 1) {
        for (const entity of order) {
          if (entity.id === hub.id) continue
          const box = boxes.get(entity.id)!
          const hubBox = boxes.get(hub.id)!
          const ux = hubBox.x + hubBox.w / 2 - (box.x + box.w / 2)
          const uy = hubBox.y + hubBox.h / 2 - (box.y + box.h / 2)
          const dist = Math.hypot(ux, uy)
          if (dist < 1e-9) continue
          const dx = ux / dist
          const dy = uy / dist
          let lo = 0
          let hi = dist * 0.9 // 허브 중심 관통 방지
          for (let iter = 0; iter < 24; iter += 1) {
            const mid = (lo + hi) / 2
            if (compactClear({ x: box.x + dx * mid, y: box.y + dy * mid, w: box.w, h: box.h }, entity.id)) lo = mid
            else hi = mid
          }
          if (lo > 0.5) boxes.set(entity.id, { x: box.x + dx * lo, y: box.y + dy * lo, w: box.w, h: box.h })
        }
      }
      // 접선 정착 — 순수 방사 당김은 각도가 고정돼 이웃 뒤의 빈 부채꼴로 못 들어간다. 허브
      // 중심 회전(고정 각도 후보 ±4°..±40°) 후 다시 당겨, 지금보다 허브에 가까워지는
      // 회전만 채택한다(문서 순 방문·고정 후보 순서 — 결정론). 정방형 그룹이 서로 홈에 맞물린다
      const pullToFloor = (box: Box, selfId: string): Box => {
        const hubBox = boxes.get(hub.id)!
        const ux = hubBox.x + hubBox.w / 2 - (box.x + box.w / 2)
        const uy = hubBox.y + hubBox.h / 2 - (box.y + box.h / 2)
        const dist = Math.hypot(ux, uy)
        if (dist < 1e-9) return box
        const dx = ux / dist
        const dy = uy / dist
        let lo = 0
        let hi = dist * 0.9
        for (let iter = 0; iter < 24; iter += 1) {
          const mid = (lo + hi) / 2
          if (compactClear({ x: box.x + dx * mid, y: box.y + dy * mid, w: box.w, h: box.h }, selfId)) lo = mid
          else hi = mid
        }
        return lo > 0.5 ? { x: box.x + dx * lo, y: box.y + dy * lo, w: box.w, h: box.h } : box
      }
      const hubCx = () => {
        const hubBox = boxes.get(hub.id)!
        return { x: hubBox.x + hubBox.w / 2, y: hubBox.y + hubBox.h / 2 }
      }
      for (let round = 0; round < 2; round += 1) {
        for (const entity of order) {
          if (entity.id === hub.id) continue
          const box = boxes.get(entity.id)!
          const center = hubCx()
          const cx = box.x + box.w / 2 - center.x
          const cy = box.y + box.h / 2 - center.y
          const currentDist = Math.hypot(cx, cy)
          let bestBox = box
          let bestDist = currentDist
          for (const deg of [4, -4, 8, -8, 12, -12, 16, -16, 20, -20, 24, -24, 28, -28, 32, -32, 36, -36, 40, -40]) {
            const rad = (deg * Math.PI) / 180
            const rotX = cx * Math.cos(rad) - cy * Math.sin(rad)
            const rotY = cx * Math.sin(rad) + cy * Math.cos(rad)
            const rotated: Box = {
              x: center.x + rotX - box.w / 2,
              y: center.y + rotY - box.h / 2,
              w: box.w,
              h: box.h,
            }
            if (!compactClear(rotated, entity.id)) continue
            const pulled = pullToFloor(rotated, entity.id)
            const pulledDist = Math.hypot(
              pulled.x + pulled.w / 2 - center.x,
              pulled.y + pulled.h / 2 - center.y,
            )
            if (pulledDist < bestDist - 1) {
              bestDist = pulledDist
              bestBox = pulled
            }
          }
          boxes.set(entity.id, bestBox)
        }
      }
      // 이완 안전망 — 설계상 무겹침이지만 반올림·극단 비율 잔털용. 고정 4라운드, 허브 핀 고정,
      // 침투+1 돌파 밀기(한 번에 터뜨린다). 그룹 슈퍼노드는 강체(내부를 건드리지 않는다)
      for (let round = 0; round < 4; round += 1) {
        let moved = false
        for (let i = 0; i < bfsOrder.length; i += 1) {
          for (let j = i + 1; j < bfsOrder.length; j += 1) {
            const a = boxes.get(bfsOrder[i].id)!
            const b = boxes.get(bfsOrder[j].id)!
            if (!overlaps(a, b)) continue
            const ux = a.x + a.w / 2 - (b.x + b.w / 2)
            const uy = a.y + a.h / 2 - (b.y + b.h / 2)
            const length = Math.hypot(ux, uy)
            const dx = length > 1e-9 ? ux / length : 1 // 동심 겹침(거리 0)은 +x로 갈라낸다
            const dy = length > 1e-9 ? uy / length : 0
            const pen =
              Math.max(
                Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
                Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
              ) + 1
            const aPinned = bfsOrder[i].id === hub.id
            const bPinned = bfsOrder[j].id === hub.id
            if (aPinned && !bPinned) {
              b.x -= dx * pen
              b.y -= dy * pen
            } else if (bPinned && !aPinned) {
              a.x += dx * pen
              a.y += dy * pen
            } else {
              a.x += (dx * pen) / 2
              a.y += (dy * pen) / 2
              b.x -= (dx * pen) / 2
              b.y -= (dy * pen) / 2
            }
            moved = true
          }
        }
        if (!moved) break
      }
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const box of boxes.values()) {
      minX = Math.min(minX, box.x)
      minY = Math.min(minY, box.y)
      maxX = Math.max(maxX, box.x + box.w)
      maxY = Math.max(maxY, box.y + box.h)
    }
    return { boxes, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } }
  }

  // ── 성분 분리·랭킹(하위 테이블 수 내림 → 최소 orderKey) — 1위가 메인 ──
  const components: HubEntity[][] = []
  const visited = new Set<string>()
  for (const entity of entities) {
    if (visited.has(entity.id)) continue
    const comp: HubEntity[] = []
    const queue = [entity]
    visited.add(entity.id)
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head]
      comp.push(current)
      for (const nextId of adjacency.get(current.id) ?? []) {
        if (visited.has(nextId)) continue
        visited.add(nextId)
        queue.push(entityById.get(nextId)!)
      }
    }
    comp.sort((a, b) => a.orderKey - b.orderKey)
    components.push(comp)
  }
  const tableCount = (comp: HubEntity[]) =>
    comp.reduce((sum, entity) => sum + (entity.isGroup ? entity.memberIds.length : 1), 0)
  components.sort(
    (a, b) =>
      tableCount(b) - tableCount(a) ||
      Math.min(...a.map((entity) => entity.orderKey)) -
        Math.min(...b.map((entity) => entity.orderKey)),
  )

  // ── 조립: 메인 원점 · 부성분 아래 가로 행 · 고립 테이블 우측 열 ──
  const worldBoxes = new Map<string, Box>()
  const place = (result: { boxes: Map<string, Box>; bbox: Box }, dx: number, dy: number) => {
    for (const [id, box] of result.boxes) {
      worldBoxes.set(id, { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h })
    }
  }
  const mainResult = layoutBlob(components[0])
  place(mainResult, -mainResult.bbox.x, -mainResult.bbox.y) // 메인 블롭을 (0,0)부터
  const secondary = components
    .slice(1)
    .filter((comp) => comp.length > 1 || comp[0].isGroup) // 다중 엔티티 성분 + 고립 그룹
  let cursorX = 0
  const rowY = mainResult.bbox.h + spacing.component
  let rowRight = mainResult.bbox.w
  for (const comp of secondary) {
    const result = layoutBlob(comp)
    place(result, cursorX - result.bbox.x, rowY - result.bbox.y)
    cursorX += result.bbox.w + spacing.component
    rowRight = Math.max(rowRight, cursorX)
  }
  // 진짜 고립(관계 0 느슨한 테이블) — 메인·부성분 행보다 오른쪽 열에 문서 순 스택
  let stackY = 0
  const stackX = rowRight + spacing.component
  for (const entity of components.slice(1)) {
    if (entity.length > 1 || entity[0].isGroup) continue
    worldBoxes.set(entity[0].id, { x: stackX, y: stackY, w: entity[0].box.w, h: entity[0].box.h })
    stackY += entity[0].box.h + spacing.nodeNode
  }

  // ── 슈퍼노드 전개 + 정규화(min = padding, 계층형 관례) + 반올림 ──
  const out: Record<string, { x: number; y: number }> = {}
  for (const entity of entities) {
    const world = worldBoxes.get(entity.id)
    if (!world) continue
    if (!entity.isGroup) {
      out[entity.id] = { x: world.x, y: world.y }
    } else {
      for (const memberId of entity.memberIds) {
        const local = entity.localPositions[memberId]
        out[memberId] = {
          x: world.x + HUB_GROUP_PADDING + local.x - entity.localOrigin.x,
          y: world.y + HUB_GROUP_PADDING + local.y - entity.localOrigin.y,
        }
      }
    }
  }
  const positions = Object.values(out)
  const shiftX = spacing.padding - Math.min(...positions.map((pos) => pos.x))
  const shiftY = spacing.padding - Math.min(...positions.map((pos) => pos.y))
  const result: Record<string, { x: number; y: number }> = {}
  for (const [id, pos] of Object.entries(out)) {
    result[id] = { x: Math.round(pos.x + shiftX), y: Math.round(pos.y + shiftY) }
  }
  return result
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
  const placedNotes: Box[] = [] // 이번 패스에 놓은 노트 — 노트끼리 겹침 방지의 장애물

  for (const note of doc.diagram.notes) {
    // 높이는 노트 실제 확정값(note.height) — 미확정이면 rows=4 기본 높이. 스택 전진도 실제
    // 높이만큼 한다(고정값이면 긴 노트 아래 다음 노트가 파고 들었다, 2026-09-29)
    const height = note.height ?? NOTE_STACK_HEIGHT
    const noteBox: Box = { x: note.x, y: note.y, w: note.width ?? 360, h: height }

    if (note.linkedTableId && tablePositions[note.linkedTableId] && tableById.has(note.linkedTableId)) {
      const table = tableById.get(note.linkedTableId)!
      const pos = tablePositions[note.linkedTableId]
      const size = sizeOf(table, doc.diagram.nodes[table.id]?.width ?? null, sizes)
      const offsetY = nextY.get(note.linkedTableId) ?? 0
      let x = pos.x + size.w + NOTE_TABLE_GAP
      const y = pos.y + offsetY
      // 우측 스택 자리에 다른 테이블이나 먼저 놓은 노트가 있으면 겹치지 않을 때까지 오른쪽으로
      const obstacles = [...tableBoxes, ...placedNotes]
      for (let guard = 0; guard <= obstacles.length; guard += 1) {
        const hit = obstacles.find((box) => overlaps({ ...noteBox, x, y }, box))
        if (!hit) break
        x = hit.x + hit.w + NOTE_TABLE_GAP
      }
      if (Math.round(x) !== note.x || Math.round(y) !== note.y) {
        out[note.id] = { x: Math.round(x), y: Math.round(y) }
        noteBox.x = Math.round(x)
        noteBox.y = Math.round(y)
      }
      placedNotes.push(noteBox)
      nextY.set(note.linkedTableId, offsetY + height + NOTE_STACK_GAP)
      continue
    }

    // 자유 노트 — 겹칠 때만 콘텐츠 우측 여백 열로
    if (tableBoxes.some((box) => overlaps(noteBox, box))) {
      const x = Math.round(contentRight + NOTE_TABLE_GAP)
      out[note.id] = { x, y: Math.round(freeY) }
      placedNotes.push({ ...noteBox, x, y: Math.round(freeY) })
      freeY += height + NOTE_STACK_GAP
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
