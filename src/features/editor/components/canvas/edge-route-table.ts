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
}

export interface SharedRouteTable {
  routes: Map<string, RelationshipSharedRoute>
  /** 장애물 박스(전체 테이블) — 공유 경로가 없는 폴백 라우팅에 쓴다 */
  obstacles: RouterBox[]
}

let cache: { doc: object; signature: string; value: SharedRouteTable } | null = null

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

  // 1패스 — 관계별 양 끝 박스·연결면·거리. 거리는 같은 면 그룹의 위·아래 순서(연결 대상이
  // 먼 관계가 위에 온다)라 면 분산 계산 전에 전체가 모여야 한다
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
    const distance =
      Math.abs(child.x + child.w / 2 - (parent.x + parent.w / 2)) +
      Math.abs(child.y + child.h / 2 - (parent.y + parent.h / 2))
    endsList.push({ rel, child, parent, sides })
    endpoints.push({ relId: rel.id, tableId: rel.childTableId, face: sides.child, distance })
    endpoints.push({ relId: rel.id, tableId: rel.parentTableId, face: sides.parent, distance })
  }

  // 2패스 — 면 분산 앵커를 글리프 폭만큼 면 바깥으로 민 라우팅 앵커. sharedRoutes가 통로
  // 레인 배정(corridorLanes)과 순차 라우팅(먼저 그린 선의 통로 회피)을 함께 계산한다
  const reqs: CorridorEndpoint[] = []
  const faceOffsets = new Map<string, { source: number; target: number }>()
  for (const { rel, child, parent, sides } of endsList) {
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
  for (const req of reqs) {
    const offsets = faceOffsets.get(req.relId)!
    routes.set(req.relId, {
      points: routed.get(req.relId) ?? [],
      sourceFaceOffset: offsets.source,
      targetFaceOffset: offsets.target,
    })
  }

  const value = { routes, obstacles }
  cache = { doc, signature, value }
  return value
}
