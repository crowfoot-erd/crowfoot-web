/**
 * 관계선 공유 라우팅 테이블 — 모든 엣지가 같은 입력으로 따로 계산하던 전역 라우팅을
 * 문서·좌표 지문당 한 번으로 줄인다.
 *
 * RelationshipEdge는 RF 엣지 타입이라 계산 결과를 props로 내려줄 수 없어 각 엣지가 스토어를
 * 직접 구독한다. 관계 수를 R이라 하면 전역 계산(연결면·면 분산 오프셋·통로 레인 입력)은
 * O(R²)인데 엣지마다 반복하면 프레임당 O(R³)이 된다 — 테이블 200개 문서에서 드래그
 * 프레임이 수백 ms로 튀는 원인이었다. 문서(present 참조)와 노드 좌표·크기 지문을 키로
 * 단일 슬롯 캐시에 계산 결과를 담아 첫 엣지만 계산하고 나머지는 조회로 공유한다.
 * 드래그 중 present는 불변(드롭 커밋 전)이고 좌표 지문만 바뀌므로 프레임당 정확히 한 번
 * 재계산된다. 결과는 결정론이라 어느 엣지가 먼저 계산해도 같다.
 */
import {
  faceShareOffset,
  handleAnchors,
  insetAnchors,
  isIncrementalRouting,
  offsetAlongFace,
  sharedRoutes,
  shortestHandlePair,
  type FaceSide,
  type RelationEndpoint,
  type CorridorEndpoint,
  type RouterBox,
  type RouterPoint,
} from './edge-router'
import type { ErdTable, ErdRelationship } from '@/features/editor/model/content-schema'

/** 면 부담 가중치 — 그 면에 이미 붙은 선 하나가 선 길이 몇 px만큼의 비용인지. 면 분산 간격(48px)의 몇 배로 두어
 *  가까운 면이 붐비면 조금 먼 빈 면을 고르게 한다. 문서 646(테이블 40·관계 74)에서 40~320을 재어 겹침·꺾임이
 *  가장 적은 값으로 정했다(v1.37) */
const FACE_LOAD_WEIGHT = 200
/** 상대를 등진 면 벌점 — 선이 테이블을 돌아 나가야 하는 면은 사실상 고르지 않는다 */
const BACKWARD_FACE_PENALTY = 2000

interface BalanceEnds {
  rel: { id: string; childTableId: string; parentTableId: string }
  child: RouterBox
  parent: RouterBox
  sides: { child: FaceSide; parent: FaceSide }
}

const centerOf = (b: RouterBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
const faceCenter = (b: RouterBox, f: FaceSide) =>
  f === 'left' ? { x: b.x, y: b.y + b.h / 2 } : f === 'right' ? { x: b.x + b.w, y: b.y + b.h / 2 }
    : f === 'top' ? { x: b.x + b.w / 2, y: b.y } : { x: b.x + b.w / 2, y: b.y + b.h }
/** 상대 쪽을 향한 면 두 개 — 가로(좌/우) 하나와 세로(상/하) 하나 */
const facingFaces = (from: RouterBox, to: RouterBox): FaceSide[] => {
  const a = centerOf(from)
  const b = centerOf(to)
  return [b.x >= a.x ? 'right' : 'left', b.y >= a.y ? 'bottom' : 'top']
}
/** 면 법선이 상대 앵커 쪽을 향하는지 — 반대면 선이 테이블을 돌아 나가야 한다 */
const facesToward = (b: RouterBox, f: FaceSide, target: RouterPoint) => {
  const c = faceCenter(b, f)
  return f === 'left' ? target.x <= c.x : f === 'right' ? target.x >= c.x : f === 'top' ? target.y <= c.y : target.y >= c.y
}

/**
 * 4면 분산 연결면 배정(v1.37, 사용자 요청 — "상·하·좌·우 4면을 최대한 활용해 겹치지 않도록") — 관계마다 상대 사분면을 향한 면(가로·세로) 조합 최대 4쌍에서, 선 길이 + 그 면에 이미 붙은
 * 선 수 × 가중치 + 상대를 등진 면 벌점이 가장 작은 쌍을 고른다. 모든 관계를 몇 차례 다시 배정해 수렴시킨다.
 */
function balanceFaces(list: BalanceEnds[]): void {
  const load = new Map<string, number>()
  const key = (tableId: string, f: FaceSide) => `${tableId}|${f}`
  const add = (e: BalanceEnds, d: number) => {
    load.set(key(e.rel.childTableId, e.sides.child), (load.get(key(e.rel.childTableId, e.sides.child)) ?? 0) + d)
    load.set(key(e.rel.parentTableId, e.sides.parent), (load.get(key(e.rel.parentTableId, e.sides.parent)) ?? 0) + d)
  }
  list.forEach((e) => add(e, 1))
  const cost = (e: BalanceEnds, cf: FaceSide, pf: FaceSide) => {
    const ca = faceCenter(e.child, cf)
    const pa = faceCenter(e.parent, pf)
    let c = Math.abs(ca.x - pa.x) + Math.abs(ca.y - pa.y)
    c += FACE_LOAD_WEIGHT * ((load.get(key(e.rel.childTableId, cf)) ?? 0) + (load.get(key(e.rel.parentTableId, pf)) ?? 0))
    if (!facesToward(e.child, cf, pa)) c += BACKWARD_FACE_PENALTY
    if (!facesToward(e.parent, pf, ca)) c += BACKWARD_FACE_PENALTY
    return c
  }
  for (let round = 0; round < 6; round += 1) {
    let changed = false
    for (const e of list) {
      add(e, -1)
      let best = e.sides
      let bestCost = cost(e, e.sides.child, e.sides.parent)
      for (const cf of facingFaces(e.child, e.parent)) {
        for (const pf of facingFaces(e.parent, e.child)) {
          const c = cost(e, cf, pf)
          if (c < bestCost - 1e-6) {
            bestCost = c
            best = { child: cf, parent: pf }
          }
        }
      }
      if (best !== e.sides) {
        e.sides = best
        changed = true
      }
      add(e, 1)
    }
    if (!changed) break
  }
}

/** 자식(시작) 글리프가 노드 경계에서 선 쪽으로 차지하는 길이(가장 바깥 심볼 + 스트로크 절반).
 *  선 몸체는 이 지점에서 시작해 글리프와 포개지지 않는다. */
export function sourceGlyphExtent(rel: Pick<ErdRelationship, 'type' | 'childMultiplicity'>): number {
  if (rel.type === 'ONE_TO_MANY') {
    if (rel.childMultiplicity === 'ZERO_OR_MORE') return 32 // 발톱(16) + ○(27+r3.5)
    return 23 // 발톱 + |(21)
  }
  return rel.childMultiplicity === 'ZERO_OR_ONE' ? 26 : 16 // ‖ + ○(21+r3.5) / ‖(14)
}

/** 부모(끝) 글리프가 차지하는 길이 — ‖ + ○ 또는 ‖ */
export function targetGlyphExtent(rel: Pick<ErdRelationship, 'parentMultiplicity'>): number {
  return rel.parentMultiplicity === 'ZERO_OR_ONE' ? 26 : 16
}

/** 관계 하나의 공유 라우팅 결과 */
export interface RelationshipSharedRoute {
  /** 라우팅 waypoint — 양 끝은 통로 앵커(면 분산 + 법선 밀기 적용). 엣지는 양 끝을
   *  RF 실측 앵커로 교체해 글리프에 정확히 붙인다 */
  points: RouterPoint[]
  /** 면 공유 분산 오프셋(자식·부모 끝 각각) — 같은 (테이블, 면)에 붙은 관계끼리 벌리는 폭 */
  sourceFaceOffset: number
  targetFaceOffset: number
  /** 연결면(자식·부모) — 라이브 박스(boxOf)로 계산한 현재 면. 엣지 렌더가 RF props
   *  (sourcePosition — 스토어 좌표로 구운 핸들, 드롭 전까지 과거 면) 대신 이 면을 따라가
   *  드래그 중 렌더 == 드롭 후 렌더가 된다(v1.24 §2 실시간 재경로) */
  sourceFace: FaceSide
  targetFace: FaceSide
  /** 면 평면 앵커(면 중심 + 면 분산 오프셋) — 엣지 스텝·글리프 앵커의 라이브 원천 */
  sourceFaceAnchor: RouterPoint
  targetFaceAnchor: RouterPoint
  /** 라우팅 앵커(면 평면 앵커를 글리프 폭만큼 법선으로 민 것) — 엣지가 양 끝을 교체하는 값 */
  sourceAnchor: RouterPoint
  targetAnchor: RouterPoint
}

export interface SharedRouteTable {
  routes: Map<string, RelationshipSharedRoute>
  /** 장애물 박스(전체 테이블) — 공유 경로가 없는 폴백 라우팅에 쓴다 */
  obstacles: RouterBox[]
  /** 테이블별 면별 붙은 관계 끝 수 — 자기 참조 루프가 덜 붐비는 면(좌/우)을 고르는 근거 */
  faceLoad: Map<string, Record<FaceSide, number>>
}

let cache: { doc: object; signature: string; value: SharedRouteTable } | null = null

/** 마지막 전체 계산 — 드래그 중(증분 라우팅)에는 움직이지 않은 테이블끼리 잇는 관계의 앵커를 이 값으로 고정한다.
 *  끄는 테이블과 이어진 테이블의 면 분산이 프레임마다 바뀌어, 끌지 않는 관계선 수십 개가 매 프레임 다시 라우팅됐다
 *  (v1.37 드래그 성능). 드롭하면 전체 계산으로 다시 맞춘다 */
let fullBase: {
  doc: object
  value: SharedRouteTable
  reqs: Map<string, CorridorEndpoint>
  boxes: Map<string, string>
} | null = null

const boxSig = (b: RouterBox | null) => (b ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}` : '-')

/**
 * 문서 전체 관계의 공유 라우팅 테이블 — 연결면(shortestHandlePair)·면 분산(faceShareOffset)·
 * 통로 레인 입력(corridorReqs)·순차 라우팅(sharedRoutes)을 한 번에 계산한다. RelationshipEdge의
 * 엣지별 useMemo가 하던 계산과 같은 식을 그대로 옮겼다 — 입력이 같으니 결과도 같다.
 */
export function relationshipSharedRoutes(
  doc: object,
  signature: string,
  tables: ErdTable[],
  relationships: ErdRelationship[],
  boxOf: (tableId: string) => RouterBox | null,
): SharedRouteTable {
  if (cache && cache.doc === doc && cache.signature === signature) return cache.value

  const boxCache = new Map<string, RouterBox | null>()
  const box = (tableId: string): RouterBox | null => {
    if (!boxCache.has(tableId)) boxCache.set(tableId, boxOf(tableId))
    return boxCache.get(tableId) ?? null
  }

  const obstacles: RouterBox[] = []
  for (const table of tables) {
    const b = box(table.id)
    if (b) obstacles.push(b)
  }

  // 1패스 — 관계별 양 끝 박스·연결면·면 따라 좌표. along(연결 대상 중심의 면 따라 좌표)은
  // 같은 면 그룹의 앵커 순서(대상이 왼쪽·위에 있는 관계가 먼저)라 면 분산 계산 전에
  // 전체가 모여야 한다
  /** 면의 평행축 좌표 — 상/하 면은 x, 좌/우 면은 y */
  const alongOf = (face: FaceSide, counterpart: RouterBox) =>
    face === 'left' || face === 'right' ? counterpart.y + counterpart.h / 2 : counterpart.x + counterpart.w / 2
  interface Ends {
    rel: ErdRelationship
    child: RouterBox
    parent: RouterBox
    sides: { child: FaceSide; parent: FaceSide }
  }
  const endsList: Ends[] = []
  const endpoints: RelationEndpoint[] = []
  for (const rel of relationships) {
    if (rel.childTableId === rel.parentTableId) continue // 자기 참조 — 오른쪽 면 루프 고정
    const child = box(rel.childTableId)
    const parent = box(rel.parentTableId)
    if (!child || !parent) continue
    const sides = shortestHandlePair(child, parent, child, parent)
    endsList.push({ rel, child, parent, sides })
  }
  // 4면 분산 — 가장 짧은 면 쌍에서 시작해, 붐비는 면의 선을 상대 사분면을 향한 다른 면으로 옮긴다(v1.37)
  balanceFaces(endsList)
  for (const { rel, child, parent, sides } of endsList) {
    endpoints.push({ relId: rel.id, tableId: rel.childTableId, face: sides.child, along: alongOf(sides.child, parent) })
    endpoints.push({ relId: rel.id, tableId: rel.parentTableId, face: sides.parent, along: alongOf(sides.parent, child) })
  }

  // 2패스 — 면 분산 앵커를 글리프 폭만큼 면 바깥으로 민 라우팅 앵커. sharedRoutes가 통로
  // 레인 배정(corridorLanes)과 순차 라우팅(먼저 그린 선의 통로 회피)을 함께 계산한다
  const reqs: CorridorEndpoint[] = []
  const faceOffsets = new Map<string, { source: number; target: number }>()
  /** 면·앵커 원천 — 라우팅 입력으로 쓴 값 그대로 엣지 렌더에 돌려준다(라이브 면 스펙, v1.24 §2) */
  const endAnchors = new Map<
    string,
    {
      child: RouterPoint
      parent: RouterPoint
      inset: { source: RouterPoint; target: RouterPoint }
      faces: { child: FaceSide; parent: FaceSide }
    }
  >()
  const incremental = isIncrementalRouting() && fullBase !== null && fullBase.doc === doc
  const moved = (tableId: string) => fullBase!.boxes.get(tableId) !== boxSig(box(tableId))
  for (const { rel, child, parent, sides } of endsList) {
    const frozen = incremental && !moved(rel.childTableId) && !moved(rel.parentTableId) ? fullBase!.value.routes.get(rel.id) : undefined
    const frozenReq = frozen ? fullBase!.reqs.get(rel.id) : undefined
    if (frozen && frozenReq) {
      faceOffsets.set(rel.id, { source: frozen.sourceFaceOffset, target: frozen.targetFaceOffset })
      endAnchors.set(rel.id, {
        child: frozen.sourceFaceAnchor,
        parent: frozen.targetFaceAnchor,
        inset: { source: frozen.sourceAnchor, target: frozen.targetAnchor },
        faces: { child: frozen.sourceFace, parent: frozen.targetFace },
      })
      reqs.push(frozenReq)
      continue
    }
    const sourceFaceOffset = faceShareOffset(endpoints, rel.id, rel.childTableId)
    const targetFaceOffset = faceShareOffset(endpoints, rel.id, rel.parentTableId)
    faceOffsets.set(rel.id, { source: sourceFaceOffset, target: targetFaceOffset })
    const childAnchor = offsetAlongFace(
      handleAnchors(child, child)[sides.child],
      sides.child,
      sourceFaceOffset,
      sides.child === 'left' || sides.child === 'right' ? child.h : child.w,
    )
    const parentAnchor = offsetAlongFace(
      handleAnchors(parent, parent)[sides.parent],
      sides.parent,
      targetFaceOffset,
      sides.parent === 'left' || sides.parent === 'right' ? parent.h : parent.w,
    )
    const anchors = insetAnchors(
      childAnchor,
      parentAnchor,
      sides.child,
      sides.parent,
      sourceGlyphExtent(rel),
      targetGlyphExtent(rel),
    )
    endAnchors.set(rel.id, { child: childAnchor, parent: parentAnchor, inset: anchors, faces: sides })
    reqs.push({
      relId: rel.id,
      source: anchors.source,
      target: anchors.target,
      sourceFace: sides.child,
      targetFace: sides.parent,
      sourceTableId: rel.childTableId,
      targetTableId: rel.parentTableId,
    })
  }

  const routed = sharedRoutes(reqs, obstacles)
  const routes = new Map<string, RelationshipSharedRoute>()
  const previous = cache?.value.routes
  for (const req of reqs) {
    const offsets = faceOffsets.get(req.relId)!
    const anchors = endAnchors.get(req.relId)!
    const next: RelationshipSharedRoute = {
      points: routed.get(req.relId) ?? [],
      sourceFaceOffset: offsets.source,
      targetFaceOffset: offsets.target,
      sourceFace: anchors.faces.child,
      targetFace: anchors.faces.parent,
      sourceFaceAnchor: anchors.child,
      targetFaceAnchor: anchors.parent,
      sourceAnchor: anchors.inset.source,
      targetAnchor: anchors.inset.target,
    }
    // 내용이 같으면 이전 객체를 그대로 쓴다 — 엣지는 자기 경로 객체만 구독하므로, 드래그 중 경로가 그대로인
    // 관계선은 다시 그려지지 않는다(v1.37 드래그 성능)
    const before = previous?.get(req.relId)
    routes.set(req.relId, before && sameSharedRoute(before, next) ? before : next)
  }

  const faceLoad = new Map<string, Record<FaceSide, number>>()
  for (const e of endpoints) {
    let load = faceLoad.get(e.tableId)
    if (!load) {
      load = { left: 0, right: 0, top: 0, bottom: 0 }
      faceLoad.set(e.tableId, load)
    }
    load[e.face] += 1
  }

  const value = { routes, obstacles, faceLoad }
  cache = { doc, signature, value }
  if (!isIncrementalRouting()) {
    fullBase = {
      doc,
      value,
      reqs: new Map(reqs.map((r) => [r.relId, r])),
      boxes: new Map(tables.map((t) => [t.id, boxSig(box(t.id))])),
    }
  }
  return value
}

const samePoint = (a: RouterPoint, b: RouterPoint) => a.x === b.x && a.y === b.y

function sameSharedRoute(a: RelationshipSharedRoute, b: RelationshipSharedRoute): boolean {
  return (
    a.sourceFace === b.sourceFace &&
    a.targetFace === b.targetFace &&
    a.sourceFaceOffset === b.sourceFaceOffset &&
    a.targetFaceOffset === b.targetFaceOffset &&
    samePoint(a.sourceFaceAnchor, b.sourceFaceAnchor) &&
    samePoint(a.targetFaceAnchor, b.targetFaceAnchor) &&
    samePoint(a.sourceAnchor, b.sourceAnchor) &&
    samePoint(a.targetAnchor, b.targetAnchor) &&
    a.points.length === b.points.length &&
    a.points.every((p, i) => samePoint(p, b.points[i]))
  )
}
