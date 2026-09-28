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
 * (상호 참조도 이 규칙으로 흡수), 자기 참조(같은 테이블 FK)는 좌/우 면 중 일반 관계가 덜
 * 붙은 쪽에 FK 행→PK 행 높이로 잇는 루프로 그린다(장애물 회피 없음 — 보라색 계열).
 * 문서 전역 계산(연결면·면 분산·통로 레인 라우팅)은 관계 수의 제곱이라 엣지마다 반복하면
 * 프레임 비용이 세제곱으로 커진다 — edge-route-table이 문서·좌표 지문당 한 번 계산한
 * 공유 테이블을 조회하고, 엣지별 남은 일은 양 끝 앵커(자기 관계의 RF 실측 좌표)뿐이다.
 * 연결면도 공유 테이블의 라이브 면(드래그 중 화면 좌표로 계산)을 따라간다(v1.25 §2) —
 * RF props의 면은 드롭 커밋 전까지 과거라 "드롭할 때 그때가서 다시 그려지던" 원인이었다.
 * 엣지 id = 관계 id로 스토어를 직접 구독하고 memo로 격리 — 노드 위치가 불변인 엣지는
 * 경로 재계산·리렌더가 없다.
 */
import { memo, useCallback, useMemo } from 'react'
import { BaseEdge, EdgeLabelRenderer, useStore, type Edge, type EdgeProps } from '@xyflow/react'

import { cn } from 'cn'
import { useEditorStore } from '@/features/editor/store/editor-store'
import {
  insetAnchors,
  orthogonalRoundedPath,
  polylineMidpoint,
  routeWithNormalStubs,
  selfLoopPoints,
  trimPolyline,
  type RouterBox,
  type RouterPoint,
} from './edge-router'
import { relationshipSharedRoutes, sourceGlyphExtent, targetGlyphExtent } from './edge-route-table'
import { columnRowAnchor } from './row-anchors'
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

/** 까마귀발 발목(x=16) — 발톱 끝(자식) 쪽 스텁은 발목까지만 내려온다. 발톱 아래로 선을 깔면
 *  가운데 발가락과 겹쳐 '가운데만 연결된' 것처럼 보여 발톱 자체가 연결부가 되게 한다(2026-09-28) */
const CROWFOOT_ANKLE = 16

/** 점을 면 법선(글리프 +x 방향)으로 d만큼 옮긴다 */
const outward = (p: RouterPoint, position: string, d: number): RouterPoint =>
  position === 'left'
    ? { ...p, x: p.x - d }
    : position === 'right'
      ? { ...p, x: p.x + d }
      : position === 'top'
        ? { ...p, y: p.y - d }
        : position === 'bottom'
          ? { ...p, y: p.y + d }
          : p

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
   *  같은 결과를 공유한다 — 장애물 박스도 전체 테이블을 감싸 드래그 중 실시간으로 따라간다.
   *  자기 참조 엣지도 면 부하(faceLoad — 루프 좌우 선택)를 위해 조회한다(캐시 공유라 공짜) */
  const shared = useMemo(
    () =>
      relationship
        ? relationshipSharedRoutes(present, nodeSignature, tables, relationships, boxOf)
        : null,
    [relationship, present, nodeSignature, tables, relationships, boxOf],
  )
  const sharedRoute = shared?.routes.get(id) ?? null

  /** 라이브 연결면 — 공유 라우팅 테이블이 boxOf(드래그 중에도 화면 좌표)로 이미 계산한 면.
   *  RF props(sourcePosition)는 buildEdges가 스토어 좌표로 구운 핸들을 따라가서 드롭 커밋
   *  전까지 과거 면이다 — 그사이 스텝 방향·글리프 회전·법선 밀기가 면과 어긋나 "드롭할 때
   *  그때가서 다시 그려지는" 원인이었다(v1.25 §2). 경로가 없을 때(자기 참조·박스 미측정)만
   *  RF 면으로 폴백 — 자기 참조는 루프 면(selfLoop.side)이 따로 있다 */
  const liveSourcePosition = sharedRoute?.sourceFace ?? sourcePosition
  const liveTargetPosition = sharedRoute?.targetFace ?? targetPosition

  /** 면 공유 분산 — 여러 선이 같은 면에 포개지지 않게 양 끝 앵커를 면을 따라 벌린다.
   *  공유 라우팅이 라이브 박스로 계산한 면 평면 앵커(면 중심 + 분산 오프셋)를 그대로 쓴다 —
   *  폴백(공유 경로가 없을 때 = 자기 참조 등)은 RF 실측 앵커 그대로 */
  const adjustedAnchors = useMemo(() => {
    if (sharedRoute) {
      return { source: sharedRoute.sourceFaceAnchor, target: sharedRoute.targetFaceAnchor }
    }
    return { source: { x: sourceX, y: sourceY }, target: { x: targetX, y: targetY } }
  }, [sharedRoute, sourceX, sourceY, targetX, targetY])

  /** 라우팅 앵커 — 양 끝을 면 법선(글리프가 뻗는 방향)으로 심볼 폭만큼 밀어 선 몸체가
   *  가장 바깥 심볼 끝에서 시작/끝나게 한다. 라우터의 첫 선분은 면 평행 방향으로 꺾일 수
   *  있어 경로를 자르는 방식으론 심볼 끝과 맞출 수 없다 — 시작점을 밀면 어떤 경로든 붙는다.
   *  공유 라우팅이 라우팅 입력으로 쓴 앵커가 곧 엣지 양 끝값이다(라이브 면 기준) */
  const routeAnchors = useMemo(() => {
    if (!relationship || isSelfLoop) return adjustedAnchors
    if (sharedRoute) return { source: sharedRoute.sourceAnchor, target: sharedRoute.targetAnchor }
    return insetAnchors(
      adjustedAnchors.source,
      adjustedAnchors.target,
      liveSourcePosition,
      liveTargetPosition,
      // 글리프 원점이 면 평면이므로 물러남 = 심볼 폭 그대로 — 몸체가 최외곽 심볼 끝에 정확히 붙는다
      sourceGlyphExtent(relationship),
      targetGlyphExtent(relationship),
    )
  }, [relationship, isSelfLoop, adjustedAnchors, sharedRoute, liveSourcePosition, liveTargetPosition])

  /** 자기 참조 루프 배치 — 좌/우 면 중 일반 관계가 덜 붙은 쪽에, 앵커는 FK 행·PK 행 높이로
   *  (row-anchors 레지스트리 — 미등록 첫 프레임은 면 중심으로 폴백). 같은 테이블에 자기
   *  참조가 여럿이면 relId 순서로 outset을 벌려 포개짐을 피한다 */
  const selfLoop = useMemo(() => {
    if (!relationship || !isSelfLoop) return null
    const load = shared?.faceLoad.get(relationship.childTableId)
    const side: 'left' | 'right' = (load?.left ?? 0) < (load?.right ?? 0) ? 'left' : 'right'
    const selfIndex = relationships
      .filter((r) => r.childTableId === relationship.childTableId && r.parentTableId === r.childTableId)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .findIndex((r) => r.id === relationship.id)
    const outset = 40 + Math.max(0, selfIndex) * 26
    const box = boxOf(relationship.childTableId)
    if (!box) return { child: { x: sourceX, y: sourceY }, parent: { x: sourceX, y: sourceY }, side, outset }
    const faceX = side === 'left' ? box.x : box.x + box.w
    const anchorAt = (columnId: string | undefined): RouterPoint => {
      const row = columnId ? columnRowAnchor(relationship.childTableId, columnId) : null
      // 행을 못 찾으면 면의 위(자식)·아래(부모) 절반으로 — 예전 면 중심 루프와 같은 자리 배분
      const fallbackY = box.y + box.h * (columnId === relationship.columnMappings[0]?.childColumnId ? 0.4 : 0.6)
      return { x: faceX, y: row ? box.y + row.top + row.height / 2 : fallbackY }
    }
    return {
      child: anchorAt(relationship.columnMappings[0]?.childColumnId),
      parent: anchorAt(relationship.columnMappings[relationship.columnMappings.length - 1]?.parentColumnId),
      side,
      outset,
    }
  }, [relationship, isSelfLoop, shared, boxOf, relationships, sourceX, sourceY])

  const points = useMemo(() => {
    if (isSelfLoop)
      return selfLoop
        ? selfLoopPoints(selfLoop.child, selfLoop.parent, { side: selfLoop.side, outset: selfLoop.outset })
        : []
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
      liveSourcePosition,
      liveTargetPosition,
      shared?.obstacles ?? [],
    )
  }, [isSelfLoop, selfLoop, relationship, sharedRoute, shared, routeAnchors, liveSourcePosition, liveTargetPosition])

  /** 보이는 선 — 일반 관계는 라우팅 앵커가 이미 심볼 폭만큼 물러났고, 자기 참조 루프는
   *  양 끝 선분이 항상 법선(선택한 면)이라 경로를 잘라 물러남을 만든다 */
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
  /** 그리는 선 — 라우팅 몸체 양끝에 면 앵커까지의 스텁을 얹어 ○·| 글리프를 관통해 테이블
   *  면까지 이어진다(#281). 라우팅 시작점은 심볼 끝으로 밀린 채로 둔다 — 법선 스텝(Section 5)이
   *  꺾는 지점이 글리프 구간 안으로 들어와 심볼을 가로지르지 않게. 스텁은 앵커→밀린 시작점의
   *  직선(면 법선)이라 어느 경로에도 붙는다. 글리프(2.5px)가 선(1.5px)보다 굵어 관통해도 읽힌다.
   *  스텁 끝점은 실측 면 평면으로 당긴 앵커(faceAnchors)라 핸들 오프셋과 무관하고, 끝을
   *  법선 방향으로 8px 더 밀어 면 안쪽까지 과통과시키면 엣지 레이어가 노드 아래에 묻혀 테이블
   *  몸체가 초과분을 덮어, 어느 오프셋에서도 선이 면에 닿은 것으로 보인다.
   *  점선(비식별) 몸체와는 별도 서브패스로 항상 실선으로 그린다 — '6 3' 위상이 스텝 구간에
   *  빈칸을 맞추면 심볼 바로 뒤~면 사이가 뚫려 선이 닿지 않은 것처럼 보인다 */
  /** 글리프·스텁의 면 좌표(#281·#282) — 점(핸들)은 면 안쪽에 붙어 있고, 글리프 원점·스텁 끝은
   *  모두 실측 박스의 면 평면 그 자체다 — 발톱·‖가 테이블에 바로 닿고 1(‖) 쪽 선도 면까지
   *  이어진다(2026-09-28 사용자 조정). 면을 따라 벌린 앵커 위치(분산 오프셋)만 취하고 법선
   *  좌표는 박스로 정확히 잡는다 — RF 앵커가 점 중심을 어디로 보고하든 흔들리지 않는다.
   *  자기 참조 루프 앵커는 이미 면 평면이다 */
  const faceAnchors = useMemo(() => {
    const adjust = (anchor: RouterPoint, position: string, tableId: string | undefined): RouterPoint => {
      const box = tableId ? boxOf(tableId) : null
      if (!box) return anchor
      if (position === 'left' || position === 'right') {
        return { ...anchor, x: position === 'left' ? box.x : box.x + box.w }
      }
      if (position === 'top' || position === 'bottom') {
        return { ...anchor, y: position === 'top' ? box.y : box.y + box.h }
      }
      return anchor
    }
    return {
      source: adjust(adjustedAnchors.source, liveSourcePosition, relationship?.childTableId),
      target: adjust(adjustedAnchors.target, liveTargetPosition, relationship?.parentTableId),
    }
  }, [adjustedAnchors, liveSourcePosition, liveTargetPosition, relationship, boxOf])
  const faceStubs = useMemo(() => {
    if (visiblePoints.length < 2) return ''
    // 자식 끝이 발톱이면 스텁은 발목까지만 — 발톱 아래로 선을 깔지 않는다(발톱이 연결부다)
    const head = isSelfLoop
      ? points[0]
      : relationship?.type === 'ONE_TO_MANY'
        ? outward(faceAnchors.source, liveSourcePosition, CROWFOOT_ANKLE)
        : faceAnchors.source
    const tail = isSelfLoop ? points[points.length - 1] : faceAnchors.target
    const intoFace = (from: RouterPoint, to: RouterPoint, overshoot: number): string | null => {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.hypot(dx, dy)
      if (len < 0.5) return null
      const ex = to.x + (dx / len) * overshoot
      const ey = to.y + (dy / len) * overshoot
      // 몸체 시작점 → 끝점(±과통과)까지 한 직선 — 글리프 구간(‖·○·발톱) 전체에 선이 깔린다
      return `M ${from.x} ${from.y} L ${ex} ${ey}`
    }
    // 발톱 끝은 발목에서 정확히 멈춘다(과통과 0 — 발톱 아래로 선이 새지 않게). ‖ 쪽·루프 끝은
    // 면 평면을 8px 과통과해 안쪽까지 — 엣지 레이어가 노드 아래라 테이블이 초과분을 덮는다
    const headOvershoot = !isSelfLoop && relationship?.type === 'ONE_TO_MANY' ? 0 : 8
    return [
      intoFace(visiblePoints[0], head, headOvershoot),
      intoFace(visiblePoints[visiblePoints.length - 1], tail, 8),
    ]
      .filter(Boolean)
      .join(' ')
  }, [visiblePoints, isSelfLoop, points, faceAnchors, relationship, liveSourcePosition])
  const path = useMemo(() => orthogonalRoundedPath(visiblePoints), [visiblePoints])
  const labelPoint = useMemo(() => polylineMidpoint(visiblePoints), [visiblePoints])

  /** 글리프 앵커 — 면 평면. 평행 분리·자기 참조 루프는 면 평면 그대로 */
  const glyphSource = isSelfLoop ? points[0] : faceAnchors.source
  const glyphTarget = isSelfLoop ? points[points.length - 1] : faceAnchors.target

  if (!relationship) return null

  /** 자기 참조 글리프 회전각 — RF 핸들(sourcePosition)은 오른쪽 고정이라 실제 루프 면으로 교정 */
  const loopFaceAngle = isSelfLoop && selfLoop ? GLYPH_ANGLE[selfLoop.side] : null

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
        // 자기 참조 — 필드끼리 잇는 루프라는 게 한눈에 읽히게 일반 관계(무채색)와 다른 보라 계열(§8.3).
        // 선택 강조(파랑)가 우선한다 — twMerge later-wins
        isSelfLoop && 'text-violet-600 dark:text-violet-400',
        // 선택 — 무채색 테마라 진하게만 하면 식별이 안 된다. 색조 있는 파랑 + 굵기로 강조(§8.3)
        selected && 'erd-relationship--selected text-blue-600 dark:text-blue-400',
      )}
    >
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={0}
        style={{
          stroke: 'currentColor',
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: relationship.identifying ? undefined : '6 3',
        }}
      />
      {/* 면 스텁(#281) — 점선 위상과 무관하게 면까지는 항상 실선. 몸체(BaseEdge)와 각지게 이어져
       *  스텁 시작점에서 점선 첫 대시가 이어 붙는다 */}
      <path
        d={faceStubs}
        fill="none"
        stroke="currentColor"
        strokeWidth={selected ? 2.5 : 1.5}
      />
      {/* 클릭 히트 영역 — BaseEdge 내장(20px·butt cap) 대신 폭을 넓혀 선 근처를 짚어도
       *  잡히게 한다(#278). 코너는 round cap으로 메워 직교 꺾임점의 사각 틈까지 커버.
       *  transparent stroke 트릭(RF 내장과 같은 방식)이라 눈에 보이지 않는다 */}
      <path
        d={`${path} ${faceStubs}`}
        fill="none"
        stroke="transparent"
        strokeWidth={26}
        strokeLinecap="round"
        className="react-flow__edge-interaction"
      />
      <g
        transform={`translate(${glyphSource.x} ${glyphSource.y}) rotate(${loopFaceAngle ?? GLYPH_ANGLE[liveSourcePosition] ?? 0})`}
        stroke="currentColor"
        strokeWidth={selected ? 3 : 2.5}
      >
        {sourceGlyph}
      </g>
      <g
        transform={`translate(${glyphTarget.x} ${glyphTarget.y}) rotate(${loopFaceAngle ?? GLYPH_ANGLE[liveTargetPosition] ?? 0})`}
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
              // edgelabel-renderer는 DOM 순서가 노드 레이어 아래(z-index 없음)라 그대로면
              // 라벨이 테이블 뒤로 깔린다(#277) — z-index 1로 노드(auto) 위에 뜨게 한다
              zIndex: 1,
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
