/**
 * 관계선 엣지 — 장애물 회피 직교 경로 + 크로우풋 글리프 (05-editor/01-core.md §6, 02-ui.md §8.3)
 *
 * 기수 4종 표기 — 심볼 순서는 선에서 테이블 쪽으로 ○ → | → 발톱/‖ (IE 표기):
 * · 하나(|) = ‖ · 0 또는 하나(○|) = ‖+바깥 ○ · 0 이상(○<) = 발톱+바깥 ○ · 하나 이상(|<) = 발톱+발목 바깥 |
 * 발톱 세 발가락은 모두 테이블 경계에 닿는다(중앙 발가락은 본선과 겹치므로 굵게 그려 식별시킨다).
 * 부모(1) 쪽은 ‖ 계열, 자식은 1:N이면 발톱 계열·1:1이면 ‖ 계열.
 * 경로는 edge-router가 테이블 박스(양 끝 포함)를 피해 계산한다 — 첫·끝 선분은 면 법선으로
 * 나갔다가 꺾는다(routeWithNormalStubs). 식별 관계 실선 / 비식별 점선.
 * 선 몸체는 양 끝 앵커를 면 법선으로 심볼 폭만큼 밀어(insetAnchors) 글리프의 가장 바깥
 * 심볼 끝에서 시작/끝난다 — 라우터가 첫 선분을 면 평행으로 꺾어도 시작점은 심볼 끝에 붙는다.
 * 같은 테이블의 같은 면에 여러 관계가 붙으면 앵커를 면을 따라 등간격으로 벌려 분산하고
 * (상호 참조도 이 규칙으로 흡수), 자기 참조(같은 테이블 FK)는 오른쪽 면 고정 루프로
 * 그린다(장애물 회피 없음).
 * 엣지 id = 관계 id로 스토어를 직접 구독하고 memo로 격리 — 노드 위치가 불변인 엣지는
 * 경로 재계산·리렌더가 없다.
 */
import { memo, useCallback, useMemo } from 'react'
import { BaseEdge, EdgeLabelRenderer, useStore, type Edge, type EdgeProps } from '@xyflow/react'

import { cn } from 'cn'
import { useEditorStore } from '@/features/editor/store/editor-store'
import type { ErdRelationship } from '@/features/editor/model/content-schema'
import {
  faceShareOffset,
  handleAnchors,
  insetAnchors,
  offsetAlongFace,
  orthogonalRoundedPath,
  polylineMidpoint,
  routeWithNormalStubs,
  selfLoopPoints,
  sharedRoutes,
  shortestHandlePair,
  trimPolyline,
  type CorridorEndpoint,
  type RelationEndpoint,
  type RouterBox,
} from './edge-router'
import { estimateTableHeight, tableRenderWidth } from './TableNode'

export type RelationshipEdgeData = Record<string, never>
export type RelationshipEdgeType = Edge<RelationshipEdgeData, 'relationship'>

/** 핸들 위치 → 글리프 회전각(그림자 +x 방향이 엣지를 향하도록) */
const GLYPH_ANGLE: Record<string, number> = {
  left: 180,
  right: 0,
  top: 270,
  bottom: 90,
}

/* ---------- 글리프 조각 — x=0이 노드 경계, +x가 선 쪽. 심볼은 테이블에 가까운 것부터 ---------- */

/** 유일(‖) — 막대 2개, 노드 경계 바로 옆 */
function OneMark() {
  return (
    <>
      <line x1={8} y1={-5} x2={8} y2={5} />
      <line x1={14} y1={-5} x2={14} y2={5} />
    </>
  )
}

/** 하나(|) 한 줄 막대 — "하나 이상(|<)"에서 발목 바깥에 결합된다 */
function OneBar({ x = 21 }: { x?: number }) {
  return <line x1={x} y1={-5} x2={x} y2={5} />
}

/** 선택(○) — 심볼 바깥(선 쪽)에 놓는다 (0 이상 = 발톱 + 바깥 ○) */
function OptionalCircle({ x = 27 }: { x?: number }) {
  return <circle cx={x} cy={0} r={3.5} fill="none" />
}

/** 갈까마귀 발톱(<) — 세 발가락이 모두 노드 경계(x=0)에 닿고 발목(x=16)이 선 쪽.
 *  중앙 발가락은 엣지 본선과 겹치므로 굵은 스트로크로 그려 3발가락이 모두 보이게 한다. */
function CrowFoot() {
  return (
    <>
      <line x1={16} y1={0} x2={0} y2={-7} />
      <line x1={16} y1={0} x2={0} y2={0} />
      <line x1={16} y1={0} x2={0} y2={7} />
    </>
  )
}

/* ---------- 선 물러남 — 글리프 끝점끼리 선이 이어진다 ---------- */

/** 자식(시작) 글리프가 노드 경계에서 선 쪽으로 차지하는 길이(가장 바깥 심볼 + 스트로크 절반).
 *  선 몸체는 이 지점에서 시작해 글리프와 포개지지 않는다. */
function sourceGlyphExtent(rel: Pick<ErdRelationship, 'type' | 'childMultiplicity'>): number {
  if (rel.type === 'ONE_TO_MANY') {
    if (rel.childMultiplicity === 'ZERO_OR_MORE') return 32 // 발톱(16) + ○(27+r3.5)
    return 23 // 발톱 + |(21)
  }
  return rel.childMultiplicity === 'ZERO_OR_ONE' ? 26 : 16 // ‖ + ○(21+r3.5) / ‖(14)
}

/** 부모(끝) 글리프가 차지하는 길이 — ‖ + ○ 또는 ‖ */
function targetGlyphExtent(rel: Pick<ErdRelationship, 'parentMultiplicity'>): number {
  return rel.parentMultiplicity === 'ZERO_OR_ONE' ? 26 : 16
}

function RelationshipEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps<RelationshipEdgeType>) {
  const relationship = useEditorStore((s) => s.present.model.relationships.find((r) => r.id === id))
  const relationships = useEditorStore((s) => s.present.model.relationships)
  const tables = useEditorStore((s) => s.present.model.tables)
  const layouts = useEditorStore((s) => s.present.diagram.nodes)
  /** RF 내부 노드 맵 — 드래그 중에도 화면에 보이는 위치(internals.positionAbsolute)와
   *  실측 크기(measured)를 제공한다. 스토어 좌표는 드롭 커밋 전까지 과거 위치라 장애물로 부적합.
   *  RF는 드래그 중 nodeLookup Map 참조를 유지한 채 내부만 갱신하는 fast path가 있어,
   *  참조 구독으로는 재계산이 촉발되지 않는다 — 좌표 원시값 시그니처를 별도로 구독한다 */
  const nodeLookup = useStore((s) => s.nodeLookup)
  const nodeSignature = useStore((s) => {
    let sig = ''
    for (const node of s.nodeLookup.values()) {
      sig += `${node.id}:${Math.round(node.internals.positionAbsolute.x)},${Math.round(node.internals.positionAbsolute.y)};`
    }
    return sig
  })

  /** 자기 참조 — source·target이 같은 노드라 RF 좌표는 퇴화한다. 오른쪽 면 실측 앵커로 고정 루프를 그린다 */
  const isSelfLoop = !!relationship && relationship.childTableId === relationship.parentTableId

  /** 테이블 장애물 박스 — RF 실측(시각 좌표·크기) 우선, 측정 전엔 렌더 추정치로 폴백 */
  const boxOf = useCallback(
    (tableId: string): RouterBox | null => {
      const table = tables.find((t) => t.id === tableId)
      const layout = layouts[tableId]
      if (!table || !layout) return null
      const internal = nodeLookup.get(tableId)
      if (internal) {
        const w = internal.measured.width
        const h = internal.measured.height
        if (w !== undefined && h !== undefined) {
          return { x: internal.internals.positionAbsolute.x, y: internal.internals.positionAbsolute.y, w, h }
        }
      }
      return {
        x: layout.x,
        y: layout.y,
        w: tableRenderWidth(layout.width ?? null, 0),
        h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length),
      }
    },
    [tables, layouts, nodeLookup],
  )

  /** 장애물 — 양 끝 테이블 포함 전체. 선이 출발·도착 테이블 몸통을 관통하면 어느 쪽 끝인지
   *  읽기 어려워서, 이동 중 겹침 배치에서도 몸통은 피해 돌아간다. 법선 밀기 앵커는 항상
   *  박스 밖이라 정상 배치 경로는 그대로 유지된다. */
  const obstacles = useMemo<RouterBox[]>(() => {
    if (!relationship || isSelfLoop) return []
    return tables.flatMap((table) => {
      const box = boxOf(table.id)
      return box ? [box] : []
    })
    // nodeSignature — 드래그 중 Map 참조가 불변일 때도 시각 좌표를 따라가게 하는 의존
  }, [relationship, isSelfLoop, boxOf, nodeSignature])

  /** 전체 관계의 양 끝 (테이블, 면) — 앵커는 면 중심 하나라 한 면에 관계가 여럿이면 선이
   *  포개진다. 면은 배치마다 shortestHandlePair로 다시 계산하므로 드래그 중에도 분산이
   *  실시간으로 따라간다(nodeSignature 의존). distance(두 테이블 중심 맨해튼 거리)는
   *  같은 면 그룹의 위·아래 순서 — 연결 대상이 먼 관계가 위에 온다. 자기 참조는
   *  오른쪽 면 루프 고정이라 뺀다 */
  const relationEndpoints = useMemo<RelationEndpoint[]>(() => {
    const endpoints: RelationEndpoint[] = []
    for (const rel of relationships) {
      if (rel.childTableId === rel.parentTableId) continue
      const child = boxOf(rel.childTableId)
      const parent = boxOf(rel.parentTableId)
      if (!child || !parent) continue
      const sides = shortestHandlePair(child, parent, child, parent)
      const distance =
        Math.abs(child.x + child.w / 2 - (parent.x + parent.w / 2)) +
        Math.abs(child.y + child.h / 2 - (parent.y + parent.h / 2))
      endpoints.push({ relId: rel.id, tableId: rel.childTableId, face: sides.child, distance })
      endpoints.push({ relId: rel.id, tableId: rel.parentTableId, face: sides.parent, distance })
    }
    return endpoints
  }, [relationships, boxOf, nodeSignature])

  /** 면 공유 분산 오프셋 — 자식 끝·부모 끝 각각 같은 (테이블, 면)을 쓰는 관계들과
   *  그룹 중심 대칭 등간격으로 벌린다. 상호 참조도 같은 규칙으로 흡수된다 */
  const sourceFaceOffset = useMemo(
    () => (relationship && !isSelfLoop ? faceShareOffset(relationEndpoints, relationship.id, relationship.childTableId) : 0),
    [relationEndpoints, relationship, isSelfLoop],
  )
  const targetFaceOffset = useMemo(
    () => (relationship && !isSelfLoop ? faceShareOffset(relationEndpoints, relationship.id, relationship.parentTableId) : 0),
    [relationEndpoints, relationship, isSelfLoop],
  )

  /** 면 공유 분산 — 여러 선이 같은 면에 포개지지 않게 양 끝 앵커를 면을 따라 벌린다.
   *  면 길이(좌우 면=높이, 상하 면=폭, RF 실측 우선)로 클램프해 앵커가 면 밖으로 나가지 않게 한다 */
  const adjustedAnchors = useMemo(() => {
    const src = { x: sourceX, y: sourceY }
    const tgt = { x: targetX, y: targetY }
    if (!relationship || (sourceFaceOffset === 0 && targetFaceOffset === 0)) return { source: src, target: tgt }
    const child = boxOf(relationship.childTableId)
    const parent = boxOf(relationship.parentTableId)
    return {
      source: offsetAlongFace(
        src,
        sourcePosition,
        sourceFaceOffset,
        sourcePosition === 'left' || sourcePosition === 'right' ? (child?.h ?? 0) : (child?.w ?? 0),
      ),
      target: offsetAlongFace(
        tgt,
        targetPosition,
        targetFaceOffset,
        targetPosition === 'left' || targetPosition === 'right' ? (parent?.h ?? 0) : (parent?.w ?? 0),
      ),
    }
  }, [relationship, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceFaceOffset, targetFaceOffset, boxOf, nodeSignature])

  /** 라우팅 앵커 — 양 끝을 면 법선(글리프가 뻗는 방향)으로 심볼 폭만큼 밀어 선 몸체가
   *  가장 바깥 심볼 끝에서 시작/끝나게 한다. 라우터의 첫 선분은 면 평행 방향으로 꺾일 수
   *  있어 경로를 자르는 방식으론 심볼 끝과 맞출 수 없다 — 시작점을 밀면 어떤 경로든 붙는다 */
  const routeAnchors = useMemo(() => {
    if (!relationship || isSelfLoop) return adjustedAnchors
    return insetAnchors(
      adjustedAnchors.source,
      adjustedAnchors.target,
      sourcePosition,
      targetPosition,
      sourceGlyphExtent(relationship),
      targetGlyphExtent(relationship),
    )
  }, [relationship, isSelfLoop, adjustedAnchors, sourcePosition, targetPosition])

  /** 전체 관계의 라우팅 요청 — 면 분산 앵커를 글리프 폭만큼 면 바깥으로 민 라우팅 앵커로.
   *  sharedRoutes가 통로 레인 배정(corridorLanes)과 순차 라우팅(먼저 그린 선의 통로 회피)을
   *  함께 계산한다. 결정론이라 엣지마다 따로 계산해도 같은 결과가 나온다 (캐시로 공유) */
  const corridorReqs = useMemo<CorridorEndpoint[]>(() => {
    if (!relationship || isSelfLoop) return []
    const reqs: CorridorEndpoint[] = []
    for (const rel of relationships) {
      if (rel.childTableId === rel.parentTableId) continue
      const child = boxOf(rel.childTableId)
      const parent = boxOf(rel.parentTableId)
      if (!child || !parent) continue
      const sides = shortestHandlePair(child, parent, child, parent)
      const childAnchor = offsetAlongFace(
        handleAnchors(child, child)[sides.child],
        sides.child,
        faceShareOffset(relationEndpoints, rel.id, rel.childTableId),
        sides.child === 'left' || sides.child === 'right' ? child.h : child.w,
      )
      const parentAnchor = offsetAlongFace(
        handleAnchors(parent, parent)[sides.parent],
        sides.parent,
        faceShareOffset(relationEndpoints, rel.id, rel.parentTableId),
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
    return reqs
  }, [relationship, isSelfLoop, relationships, boxOf, relationEndpoints, nodeSignature])

  const points = useMemo(() => {
    if (isSelfLoop) return selfLoopPoints({ x: sourceX, y: sourceY })
    if (!relationship) return []
    // 첫·끝 선분은 면 법선 — 앵커에서 잠깐 면 바깥으로 나갔다가 꺾여야 글리프 방향이 읽힌다.
    // 문서 전체 관계를 순차 라우팅한 결과에서 내 경로를 가져온다(레인 강제 + 통로 회피).
    // 양 끝점은 RF 실측 앵커(routeAnchors)로 교체해 글리프에 정확히 붙는다
    const shared = sharedRoutes(corridorReqs, obstacles).get(relationship.id)
    if (shared && shared.length >= 2)
      return [routeAnchors.source, ...shared.slice(1, -1), routeAnchors.target]
    return routeWithNormalStubs(
      routeAnchors.source,
      routeAnchors.target,
      sourcePosition,
      targetPosition,
      obstacles,
    )
  }, [isSelfLoop, sourceX, sourceY, relationship, corridorReqs, obstacles, routeAnchors, sourcePosition, targetPosition])

  /** 보이는 선 — 일반 관계는 라우팅 앵커가 이미 심볼 폭만큼 물러났고, 자기 참조 루프는
   *  양 끝 선분이 항상 법선(오른쪽)이라 경로를 잘라 물러남을 만든다 */
  const loopTrims = useMemo(
    () =>
      relationship && isSelfLoop
        ? { start: sourceGlyphExtent(relationship), end: targetGlyphExtent(relationship) }
        : { start: 0, end: 0 },
    [relationship, isSelfLoop],
  )
  const visiblePoints = useMemo(
    () => trimPolyline(points, loopTrims.start, loopTrims.end),
    [points, loopTrims.start, loopTrims.end],
  )
  const path = useMemo(() => orthogonalRoundedPath(visiblePoints), [visiblePoints])
  const labelPoint = useMemo(() => polylineMidpoint(visiblePoints), [visiblePoints])

  /** 글리프 앵커 — 평행 분리·자기 참조 루프에서도 물러난 선의 시작·끝점에 정확히 붙는다 */
  const glyphSource = isSelfLoop ? points[0] : adjustedAnchors.source
  const glyphTarget = isSelfLoop ? points[points.length - 1] : adjustedAnchors.target

  if (!relationship) return null

  /** 자식 쪽 글리프 — 1:N은 발톱 계열(0 이상 ○< / 하나 이상 |<), 1:1은 ‖ 계열.
   *  심볼 순서는 선 쪽에서 테이블로 ○ → | → 발톱. */
  const sourceGlyph =
    relationship.type === 'ONE_TO_MANY' ? (
      relationship.childMultiplicity === 'ZERO_OR_MORE' ? (
        <>
          <CrowFoot />
          <OptionalCircle /> {/* 0 이상 — 발목 바깥(선 쪽)에 ○ */}
        </>
      ) : (
        <>
          <CrowFoot />
          <OneBar /> {/* 하나 이상(|<) — 발목 바깥에 | */}
        </>
      )
    ) : relationship.childMultiplicity === 'ZERO_OR_ONE' ? (
      <>
        <OneMark />
        <OptionalCircle x={21} /> {/* 1:1 선택 — 막대 바깥에 ○ */}
      </>
    ) : (
      <OneMark /> // 1:1 필수
    )

  /** 부모(1) 쪽 글리프 — ‖ / ‖+○ (부모는 발톱 없음 — 선 쪽에서 ‖ 앞에 ○) */
  const targetGlyph =
    relationship.parentMultiplicity === 'ZERO_OR_ONE' ? (
      <>
        <OneMark />
        <OptionalCircle x={21} /> {/* 0 또는 하나 — 막대 바깥에 ○ */}
      </>
    ) : (
      <OneMark /> // 하나
    )

  return (
    <g
      className={cn(
        'erd-relationship text-muted-foreground',
        // 선택 — 무채색 테마라 진하게만 하면 식별이 안 된다. 색조 있는 파랑 + 굵기로 강조(§8.3)
        selected && 'erd-relationship--selected text-blue-600 dark:text-blue-400',
      )}
    >
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: 'currentColor',
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: relationship.identifying ? undefined : '6 3',
        }}
      />
      <g
        transform={`translate(${glyphSource.x} ${glyphSource.y}) rotate(${GLYPH_ANGLE[sourcePosition] ?? 0})`}
        stroke="currentColor"
        strokeWidth={selected ? 3 : 2.5}
      >
        {sourceGlyph}
      </g>
      <g
        transform={`translate(${glyphTarget.x} ${glyphTarget.y}) rotate(${GLYPH_ANGLE[targetPosition] ?? 0})`}
        stroke="currentColor"
        strokeWidth={selected ? 3 : 2.5}
      >
        {targetGlyph}
      </g>
      {selected ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan rounded border border-blue-600/40 bg-popover px-1.5 py-0.5 text-[10px] text-blue-700 shadow-sm dark:border-blue-400/40 dark:text-blue-300"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
              pointerEvents: 'none',
            }}
          >
            {relationship.fkName}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  )
}

export const RelationshipEdge = memo(RelationshipEdgeComponent)
