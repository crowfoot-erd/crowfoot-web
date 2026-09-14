/**
 * 관계선 겹침 진단 — 렌더와 같은 계산(edge-router + RelationshipEdge 앵커 로직)으로
 * 모든 관계의 폴리라인을 구하고, 평행 선분이 포개지는 쌍을 검출한다.
 * 사용: node --experimental-strip-types scripts/edge-overlap-debug.mjs /tmp/model2.json
 */
import { readFileSync } from 'node:fs'

import {
  corridorLanes,
  faceShareOffset,
  handleAnchors,
  insetAnchors,
  offsetAlongFace,
  sharedRoutes,
  shortestHandlePair,
} from '../src/features/editor/components/canvas/edge-router.ts'

const path = process.argv[2] ?? '/tmp/model2.json'
const doc = JSON.parse(readFileSync(path, 'utf8'))
const tables = doc.model.tables
const relationships = doc.model.relationships.filter((r) => r.childTableId !== r.parentTableId)
const layouts = doc.diagram.nodes

// TableNode.tsx — 렌더 크기 추정 (RF 실측이 없는 헤드리스 계산)
const tableRenderWidth = (stored, contentWidth) => Math.max(stored ?? 300, contentWidth, 300)
const estimateTableHeight = (columnCount, keyRowCount = 0) => 112 + columnCount * 47 + keyRowCount * 25

const boxOf = (tableId) => {
  const table = tables.find((t) => t.id === tableId)
  const layout = layouts[tableId]
  if (!table || !layout) return null
  return {
    x: layout.x,
    y: layout.y,
    w: tableRenderWidth(layout.width ?? null, 0),
    h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length),
  }
}

// RelationshipEdge.tsx — 글리프 물러남
function sourceGlyphExtent(rel) {
  if (rel.type === 'ONE_TO_MANY') return rel.childMultiplicity === 'ZERO_OR_MORE' ? 32 : 23
  return rel.childMultiplicity === 'ZERO_OR_ONE' ? 26 : 16
}
function targetGlyphExtent(rel) {
  return rel.parentMultiplicity === 'ZERO_OR_ONE' ? 26 : 16
}

// --- RelationEndpoint (면 분산 입력) ---
const relationEndpoints = []
for (const rel of relationships) {
  const child = boxOf(rel.childTableId)
  const parent = boxOf(rel.parentTableId)
  if (!child || !parent) continue
  const sides = shortestHandlePair(child, parent, child, parent)
  const distance =
    Math.abs(child.x + child.w / 2 - (parent.x + parent.w / 2)) +
    Math.abs(child.y + child.h / 2 - (parent.y + parent.h / 2))
  relationEndpoints.push({ relId: rel.id, tableId: rel.childTableId, face: sides.child, distance })
  relationEndpoints.push({ relId: rel.id, tableId: rel.parentTableId, face: sides.parent, distance })
}

// --- CorridorEndpoint (라우팅 요청 — 면 분산 + 글리프 인셋 앵커) ---
const corridorReqs = relationships.map((rel) => {
  const child = boxOf(rel.childTableId)
  const parent = boxOf(rel.parentTableId)
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
  return {
    relId: rel.id,
    source: anchors.source,
    target: anchors.target,
    sourceFace: sides.child,
    targetFace: sides.parent,
    sourceTableId: rel.childTableId,
    targetTableId: rel.parentTableId,
  }
})
const lanes = corridorLanes(corridorReqs, tables.flatMap((t) => (boxOf(t.id) ? [boxOf(t.id)] : [])))

const tableOf = (id) => tables.find((t) => t.id === id)?.physicalName ?? id.slice(0, 8)
const obstacles = tables.flatMap((t) => (boxOf(t.id) ? [boxOf(t.id)] : []))

// --- 각 관계의 최종 points — sharedRoutes(순차 라우팅)와 동일하게 ---
const routed = sharedRoutes(corridorReqs, obstacles)
const routes = new Map()
for (const rel of relationships) {
  const sides = corridorReqs.find((r) => r.relId === rel.id)
  if (!sides) continue
  routes.set(rel.id, {
    points: routed.get(rel.id) ?? [],
    sides: { child: sides.sourceFace, parent: sides.targetFace },
    lane: lanes.get(rel.id) ?? null,
  })
}

// --- 평행 선분 겹침 검출: 같은 y 수평(또는 같은 x 수직) 선분이 나란히 포개지는 쌍 ---
const MIN_OVERLAP = 12
const segmentsOf = (points) => {
  const segs = []
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    if (Math.abs(a.y - b.y) < 0.5) segs.push({ axis: 'h', at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) })
    else if (Math.abs(a.x - b.x) < 0.5) segs.push({ axis: 'v', at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) })
  }
  return segs
}

const overlaps = []
const relIds = [...routes.keys()]
for (let i = 0; i < relIds.length; i += 1) {
  for (let j = i + 1; j < relIds.length; j += 1) {
    const a = segmentsOf(routes.get(relIds[i]).points)
    const b = segmentsOf(routes.get(relIds[j]).points)
    for (const sa of a) {
      for (const sb of b) {
        if (sa.axis !== sb.axis) continue
        if (Math.abs(sa.at - sb.at) >= 1) continue // 같은 라인上(±1px)에서만 포개짐
        const overlap = Math.min(sa.hi, sb.hi) - Math.max(sa.lo, sb.lo)
        if (overlap >= MIN_OVERLAP) {
          overlaps.push({
            a: relIds[i],
            b: relIds[j],
            axis: sa.axis,
            at: Math.round(sa.at),
            overlap: Math.round(overlap),
            laneA: routes.get(relIds[i]).lane,
            laneB: routes.get(relIds[j]).lane,
          })
        }
      }
    }
  }
}

// 유니크 쌍별 요약
const byPair = new Map()
for (const o of overlaps) {
  const key = `${o.a}|${o.b}`
  if (!byPair.has(key)) byPair.set(key, { count: 0, worst: o })
  const entry = byPair.get(key)
  entry.count += 1
  if (o.overlap > entry.worst.overlap) entry.worst = o
}

console.log(`문서: ${path} — 테이블 ${tables.length}, 관계 ${relationships.length}, 레인 배정 ${lanes.size}건`)
console.log(`겹침 관계 쌍: ${byPair.size}쌍 (선분 겹침 ${overlaps.length}건, ${MIN_OVERLAP}px 이상)`)
for (const [key, { count, worst }] of byPair) {
  const [a, b] = key.split('|')
  const ra = routes.get(a)
  const rb = routes.get(b)
  const relA = relationships.find((r) => r.id === a)
  const relB = relationships.find((r) => r.id === b)
  console.log(`- ${tableOf(relA.childTableId)}→${tableOf(relA.parentTableId)} (${ra.sides.child}↔${ra.sides.parent}${ra.lane != null ? `, 레인 ${Math.round(ra.lane)}` : ', 레인 없음'})`)
  console.log(`  × ${tableOf(relB.childTableId)}→${tableOf(relB.parentTableId)} (${rb.sides.child}↔${rb.sides.parent}${rb.lane != null ? `, 레인 ${Math.round(rb.lane)}` : ', 레인 없음'})`)
  console.log(`  → ${worst.axis === 'h' ? '수평' : '수직'} @${worst.at} ${worst.overlap}px × ${count}개 선분`)
}
