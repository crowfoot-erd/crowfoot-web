/**
 * 배치 품질 — 배치 후보를 화면에 실제로 그려질 관계선(공유 라우팅 테이블)으로 재서 가장 나은 것을 고른다(v1.37).
 *
 * 배치 알고리즘(ELK·방사형)은 테이블 중심을 잇는 가상의 선으로 교차를 줄이지만, 화면의 선은 직교 라우터가 면을 골라
 * 따로 그린다. 그래서 후보마다 라우터로 그려 선끼리의 교차·포개짐·꺾임을 센다. 포개짐(같은 통로를 나란히 달려
 * 구분되지 않는 선)은 교차보다 읽기 어렵게 만들어 무겁게 친다.
 */
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/model/table-size'
import {
  LayoutCancelledError,
  layoutHubPositions,
  layoutTablePositions,
  type AutoLayoutMode,
  type HubLayoutVariant,
  type LayoutDirection,
  type TableSizes,
} from '@/features/editor/model/auto-layout'
import { relationshipSharedRoutes } from './edge-route-table'
import type { RouterBox, RouterPoint } from './edge-router'

export interface LayoutQuality {
  crossings: number
  overlaps: number
  bends: number
  length: number
  /** 작을수록 좋다 — 교차 + 포개짐×3 + 꺾임×0.2 + 길이(동률 가르기) */
  score: number
}

/** 같은 선으로 보는 간격과 포개짐으로 치는 최소 길이 — 라우터의 통로 회피 기준과 같다 */
const SAME_LINE = 6
const MIN_OVERLAP = 12

export function layoutQuality(
  doc: EditorDocument,
  positions: Record<string, { x: number; y: number }>,
  sizes: TableSizes = {},
): LayoutQuality {
  const boxOf = (id: string): RouterBox | null => {
    const table = doc.model.tables.find((tb) => tb.id === id)
    const p = positions[id] ?? doc.diagram.nodes[id]
    if (!table || !p) return null
    const measured = sizes[id]
    return {
      x: p.x,
      y: p.y,
      w: measured?.w ?? tableRenderWidth(doc.diagram.nodes[id]?.width ?? null, 0),
      h:
        measured?.h ??
        estimateTableHeight(table.columns.length, (table.uniques?.length ?? 0) + (table.indexes?.length ?? 0) + (table.checks?.length ?? 0)),
    }
  }
  // 새 키 객체 — 캔버스의 캐시와 섞이지 않게 후보마다 따로 계산한다
  const { routes } = relationshipSharedRoutes({}, 'layout-quality', doc.model.tables, doc.model.relationships, boxOf)
  const horizontal: { rel: string; at: number; lo: number; hi: number }[] = []
  const vertical: { rel: string; at: number; lo: number; hi: number }[] = []
  let bends = 0
  let length = 0
  for (const [rel, route] of routes) {
    const points: RouterPoint[] = route.points
    bends += Math.max(0, points.length - 2)
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]
      const b = points[i]
      length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
      if (Math.abs(a.y - b.y) < 0.5) horizontal.push({ rel, at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) })
      else vertical.push({ rel, at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) })
    }
  }
  let crossings = 0
  for (const h of horizontal) {
    for (const v of vertical) {
      if (h.rel !== v.rel && v.at > h.lo + 1 && v.at < h.hi - 1 && h.at > v.lo + 1 && h.at < v.hi - 1) crossings += 1
    }
  }
  let overlaps = 0
  for (const list of [horizontal, vertical]) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]
        const b = list[j]
        if (a.rel !== b.rel && Math.abs(a.at - b.at) < SAME_LINE && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > MIN_OVERLAP)
          overlaps += 1
      }
    }
  }
  return { crossings, overlaps, bends, length, score: crossings + overlaps * 3 + bends * 0.2 + length / 100000 }
}

/** 계층형 후보 — ELK 기본값과 교차 최소화·노드 배치 옵션 조합. 문서 7개(테이블 20~100·관계 30~74)에서
 *  각 후보가 한 번 이상 최선이었다. considerModelOrder는 그룹이 있는 문서에서 ELK 내부 오류가 나 뺐다(v1.37) */
export const LAYERED_CANDIDATES: Record<string, string>[] = [
  {},
  { 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX' },
  { 'elk.layered.thoroughness': '100', 'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED' },
  {
    'elk.layered.thoroughness': '100',
    'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  },
  { 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED' },
]

/** 허브·하이브리드 후보 — 자식 순서(문서 순·무게중심)와 시작 각도(0·45·90도) */
export const HUB_CANDIDATES: HubLayoutVariant[] = [
  {},
  { order: 'barycenter' },
  { rotate: Math.PI / 4 },
  { order: 'barycenter', rotate: Math.PI / 4 },
  { rotate: Math.PI / 2 },
  { order: 'barycenter', rotate: Math.PI / 2 },
]

/**
 * 모드 안에서 후보를 모두 배치해 보고 선이 가장 덜 엉키는 배치를 고른다. 첫 후보가 기존 배치라 결과가 기존보다 나빠지지 않는다.
 * 후보 하나가 실패하면 그 후보만 건너뛴다. 취소(LayoutCancelledError)는 그대로 던진다.
 */
export async function bestLayout(
  doc: EditorDocument,
  mode: AutoLayoutMode,
  options: { sizes?: TableSizes; direction?: LayoutDirection } = {},
): Promise<Record<string, { x: number; y: number }>> {
  let best: { positions: Record<string, { x: number; y: number }>; score: number } | null = null
  let lastError: unknown = null
  const consider = (positions: Record<string, { x: number; y: number }>) => {
    if (Object.keys(positions).length === 0) return
    const { score } = layoutQuality(doc, positions, options.sizes)
    if (!best || score < best.score) best = { positions, score }
  }
  if (mode === 'layered') {
    for (const elkOptions of LAYERED_CANDIDATES) {
      try {
        consider(await layoutTablePositions(doc, { sizes: options.sizes, direction: options.direction, elkOptions }))
      } catch (error) {
        if (error instanceof LayoutCancelledError) throw error
        lastError = error
      }
    }
  } else {
    for (const variant of HUB_CANDIDATES) {
      try {
        consider(
          layoutHubPositions(doc, {
            sizes: options.sizes,
            strategy: mode === 'hybrid' ? 'tree' : 'ring',
            direction: options.direction,
            variant,
          }),
        )
      } catch (error) {
        lastError = error
      }
      // 후보 사이에 화면에 한 번 양보한다 — 진행 안내가 멈추지 않게
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  const chosen = best as { positions: Record<string, { x: number; y: number }> } | null
  if (chosen) return chosen.positions
  if (lastError) throw lastError
  return {}
}
