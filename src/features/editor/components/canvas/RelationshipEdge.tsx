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
 * 문서 전역 계산(연결면·면 분산·통로 레인 라우팅)은 관계 수의 제곱이라 엣지마다 반복하면
 * 프레임 비용이 세제곱으로 커진다 — edge-route-table이 문서·좌표 지문당 한 번 계산한
 * 공유 테이블을 조회하고, 엣지별 남은 일은 양 끝 앵커(자기 관계의 RF 실측 좌표)뿐이다.
 * 엣지 id = 관계 id로 스토어를 직접 구독하고 memo로 격리 — 노드 위치가 불변인 엣지는
 * 경로 재계산·리렌더가 없다.
 */
import { memo, useCallback, useMemo } from 'react'
import { BaseEdge, EdgeLabelRenderer, useStore, type Edge, type EdgeProps } from '@xyflow/react'

import { cn } from 'cn'
import { useEditorStore } from '@/features/editor/store/editor-store'
import {
  insetAnchors,
  offsetAlongFace,
  orthogonalRoundedPath,
  polylineMidpoint,
  routeWithNormalStubs,
  selfLoopPoints,
  trimPolyline,
  type RouterBox,
} from './edge-router'
import { relationshipSharedRoutes, sourceGlyphExtent, targetGlyphExtent } from './edge-route-table'
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
  /** present 참조 — 문서 커밋(편집·드롭·undo)마다 변한다. 공유 라우팅 테이블의 캐시 키로,
   *  문서 구조가 바뀌면(관계 추가·컬럼 편집 등) 전역 라우팅이 다시 계산되게 한다 */
  const present = useEditorStore((s) => s.present)
  /** RF 내부 노드 맵 — 드래그 중에도 화면에 보이는 위치(internals.positionAbsolute)와
   *  실측 크기(measured)를 제공한다. 스토어 좌표는 드롭 커밋 전까지 과거 위치라 장애물로 부적합.
   *  RF는 드래그 중 nodeLookup Map 참조를 유지한 채 내부만 갱신하는 fast path가 있어,
   *  참조 구독으로는 재계산이 촉발되지 않는다 — 좌표 원시값 시그니처를 별도로 구독한다.
   *  크기(measured)도 지문에 넣어 측정이 늦게 오거나 폭이 바뀌어도 테이블이 따라간다 */
  const nodeLookup = useStore((s) => s.nodeLookup)
  const nodeSignature = useStore((s) => {
    let sig = ''
    for (const node of s.nodeLookup.values()) {
      const m = node.measured
      // positionAbsolute는 RF 타입상 undefined 가능 — 미측정 노드는 0으로 식별(측정 크기 '?'와 함께 판별)
      sig += `${node.id}:${Math.round(node.internals.positionAbsolute.x ?? 0)},${Math.round(node.internals.positionAbsolute.y ?? 0)}:${m ? `${Math.round(m.width ?? 0)}x${Math.round(m.height ?? 0)}` : '?'};`
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

  /** 문서 전체 공유 라우팅 테이블 — 연결면(shortestHandlePair)·면 분산(faceShareOffset)·
   *  장애물 박스·통로 레인 라우팅(sharedRoutes)은 관계 수의 제곱이라 엣지마다 계산하면
   *  프레임 비용이 세제곱으로 커진다(테이블 수백 개 문서의 드래그 문제 원인).
   *  edge-route-table이 문서(present)·좌표 지문(nodeSignature)당 한 번 계산해 모든 엣지가
   *  같은 결과를 공유한다 — 장애물 박스도 전체 테이블을 감싸 드래그 중 실시간으로 따라간다 */
  const shared = useMemo(
    () =>
      relationship && !isSelfLoop
        ? relationshipSharedRoutes(present, nodeSignature, tables, relationships, boxOf)
        : null,
    [relationship, isSelfLoop, present, nodeSignature, tables, relationships, boxOf],
  )
  const sharedRoute = shared?.routes.get(id) ?? null

  /** 면 공유 분산 — 여러 선이 같은 면에 포개지지 않게 양 끝 앵커를 면을 따라 벌린다.
   *  면 길이(좌우 면=높이, 상하 면=폭, RF 실측 우선)로 클램프해 앵커가 면 밖으로 나가지 않게 한다 */
  const adjustedAnchors = useMemo(() => {
    const src = { x: sourceX, y: sourceY }
    const tgt = { x: targetX, y: targetY }
    const sourceFaceOffset = sharedRoute?.sourceFaceOffset ?? 0
    const targetFaceOffset = sharedRoute?.targetFaceOffset ?? 0
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
  }, [relationship, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sharedRoute, boxOf])

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

  const points = useMemo(() => {
    if (isSelfLoop) return selfLoopPoints({ x: sourceX, y: sourceY })
    if (!relationship) return []
    // 첫·끝 선분은 면 법선 — 앵커에서 잠깐 면 바깥으로 나갔다가 꺾여야 글리프 방향이 읽힌다.
    // 문서 전체 관계를 순차 라우팅한 공유 결과에서 내 경로를 가져온다(레인 강제 + 통로 회피).
    // 양 끝점은 RF 실측 앵커(routeAnchors)로 교체해 글리프에 정확히 붙는다
    const sharedPoints = sharedRoute?.points
    if (sharedPoints && sharedPoints.length >= 2)
      return [routeAnchors.source, ...sharedPoints.slice(1, -1), routeAnchors.target]
    return routeWithNormalStubs(
      routeAnchors.source,
      routeAnchors.target,
      sourcePosition,
      targetPosition,
      shared?.obstacles ?? [],
    )
  }, [isSelfLoop, sourceX, sourceY, relationship, sharedRoute, shared, routeAnchors, sourcePosition, targetPosition])

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
