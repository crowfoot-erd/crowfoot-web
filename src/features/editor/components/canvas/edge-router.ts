/**
 * 관계선 직교 라우터 — 장애물(테이블 박스)을 피해 그리는 경로 (05-editor/02-ui.md §8.3)
 *
 * 레인 그리드 탐색: 후보 x/y 레인(양 끝 앵커 + 각 박스 좌우·상하 여백)의 교차점을 노드로
 * 놓고 다익스트라로 직교 최단 경로(굽음 페널티 포함 — 덜 꺾이는 경로를 선호)를 찾는다.
 * 장애물은 복도 AABB(양 끝을 감싼 사각형 + 여백)와 겹치는 박스만 우선 고려해 그리드를 작게
 * 유지하고, 완성 경로가 복도 밖 장애물을 관통하면 그 박스를 더해 다시 푼다(관통 검증 루프).
 * 경계를 스치는 선분은 허용(내부 관통만 차단)하고, 막다른 길이면 L자로 물러난다.
 */
export interface RouterBox {
  x: number
  y: number
  w: number
  h: number
}

export interface RouterPoint {
  x: number
  y: number
}

/** 직교 선분이 박스 내부를 지나는지 — 경계 접촉(스침)은 허용한다 */
function segmentHitsBox(a: RouterPoint, b: RouterPoint, box: RouterBox): boolean {
  const minx = Math.min(a.x, b.x)
  const maxx = Math.max(a.x, b.x)
  const miny = Math.min(a.y, b.y)
  const maxy = Math.max(a.y, b.y)
  return maxx > box.x && minx < box.x + box.w && maxy > box.y && miny < box.y + box.h
}

function segmentClear(a: RouterPoint, b: RouterPoint, boxes: RouterBox[]): boolean {
  for (const box of boxes) {
    if (segmentHitsBox(a, b, box)) return false
  }
  return true
}

const BEND_PENALTY = 28

/** 이미 그려진 다른 관계선의 이동 선분 — 다익스트라 폴백들이 전부 장애물 바로 앞의
 *  같은 통로로 수렴해 포개지는 것을 막는 소프트 장애물. 통로를 '따라 가는' 비용만
 *  올리고 가로지르는 것은 무료다(수직→수평 교차는 겹침이 아니다) */
export interface UsedSegment {
  axis: 'h' | 'v'
  /** 선분이 놓인 라인 좌표(수평이면 y, 수직이면 x) */
  at: number
  lo: number
  hi: number
}

/** 소프트 회피 비용 — 한 번이라도 쓴 통로를 다시 쓰면 지불한다. 인접 레인(20px)으로
 *  한 칸 물러나는 비용(굽음 2회 + 이동)보다 커야 물러난 쪽을 고른다 */
const CORRIDOR_AVOID_PENALTY = 600
/** 같은 선 판정 여유 — 레인 배정 간격(20px)보다 작아야 클러스터 내 인접 레인은 걸리지 않는다 */
const USED_LINE_TOLERANCE = 6
/** 포개짐으로 치는 최소 병행 길이 — 짧은 스침은 무시한다 */
const USED_OVERLAP_MIN = 12

/** 선분이 소프트 회피 대상(다른 관계가 쓴 통로)과 같은 선에서 포개지는지 */
function overlapsUsed(
  axis: 'h' | 'v',
  at: number,
  lo: number,
  hi: number,
  used: UsedSegment[],
): boolean {
  for (const u of used) {
    if (u.axis !== axis) continue
    if (Math.abs(u.at - at) >= USED_LINE_TOLERANCE) continue
    if (Math.min(u.hi, hi) - Math.max(u.lo, lo) < USED_OVERLAP_MIN) continue
    return true
  }
  return false
}

/** 경로의 이동 선분 중 하나라도 소프트 회피 대상과 포개지는지 — 레인 경로 채택 조건에 쓴다 */
function routeOverlapsUsed(waypoints: RouterPoint[], used: UsedSegment[]): boolean {
  for (let i = 1; i < waypoints.length; i += 1) {
    const a = waypoints[i - 1]
    const b = waypoints[i]
    if (Math.abs(a.y - b.y) < 0.5) {
      if (overlapsUsed('h', a.y, Math.min(a.x, b.x), Math.max(a.x, b.x), used)) return true
    } else if (Math.abs(a.x - b.x) < 0.5) {
      if (overlapsUsed('v', a.x, Math.min(a.y, b.y), Math.max(a.y, b.y), used)) return true
    }
  }
  return false
}

/**
 * 양 끝 앵커에서 출발해 obstacles를 피하는 직교 waypoint 목록.
 * 항상 source로 시작해 target으로 끝난다(동축이면 2점 직선).
 */
export function routeOrthogonal(
  source: RouterPoint,
  target: RouterPoint,
  obstacles: RouterBox[],
  margin = 24,
  avoid: UsedSegment[] = [],
): RouterPoint[] {
  // 복도 AABB — 이 안과 겹치는 박스만 우선 회피 대상으로 삼아 그리드 크기를 노드 수와
  // 무관하게 유지한다. 단, 후보 레인은 포함된 박스의 경계에서 나오므로 경로가 복도 밖으로
  // 샐 수 있고, 복도 밖 장애물은 그리드가 보지 못한다 — 레인이 다른 박스 경계에서 나와
  // 복도 밖으로 내려간 선이 아무도 모르게 테이블을 관통해 뒤로 숨는다(2026-09-23 그룹
  // 클러스터링 배치 실측: 양 끝 AABB 아래에 있던 테이블 두 장을 지나갔다). 완성 경로를
  // **전체** 장애물로 검증해 걸린 박스를 회피 집합에 더하고 다시 푼다 — 회피 집합은
  // 늘기만 하므로 유한 번(≤ 장애물 수)에 수렴하고, 걸리지 않는 경로는 1번으로 끝난다.
  const minX = Math.min(source.x, target.x)
  const maxX = Math.max(source.x, target.x)
  const minY = Math.min(source.y, target.y)
  const maxY = Math.max(source.y, target.y)
  const overlapsCorridor = (box: RouterBox) =>
    box.x < maxX + margin && box.x + box.w > minX - margin && box.y < maxY + margin && box.y + box.h > minY - margin

  /** 회피 집합 boxes로 그리드 다익스트라를 돌린다 — complete=false는 막다른 길(L자 폴백) */
  const solve = (boxes: RouterBox[]): { points: RouterPoint[]; complete: boolean } => {
    // 레인 후보 — 양 끝 앵커 + 각 박스 바깥 여백(박스를 돌아가는 길을 연다)
    const xsSet = new Set<number>([source.x, target.x])
    const ysSet = new Set<number>([source.y, target.y])
    for (const box of boxes) {
      xsSet.add(box.x - margin)
      xsSet.add(box.x + box.w + margin)
      ysSet.add(box.y - margin)
      ysSet.add(box.y + box.h + margin)
    }
    const xs = [...xsSet].sort((a, b) => a - b)
    const ys = [...ysSet].sort((a, b) => a - b)
    const si = xs.indexOf(source.x)
    const sj = ys.indexOf(source.y)
    const ti = xs.indexOf(target.x)
    const tj = ys.indexOf(target.y)
    if (si < 0 || sj < 0 || ti < 0 || tj < 0) return { points: [source, target], complete: true }

    // 다익스트라 — 노드 (i,j), 방향(0=가로 이동 후 도착, 1=세로)까지 포함해 굽음 비용을 반영
    const cols = xs.length
    const rows = ys.length
    const nodeKey = (i: number, j: number, dir: 0 | 1) => (j * cols + i) * 2 + dir
    const size = cols * rows * 2
    const dist = new Float64Array(size).fill(Infinity)
    const prev = new Int32Array(size).fill(-1)
    const visited = new Uint8Array(size)

    const point = (i: number, j: number): RouterPoint => ({ x: xs[i], y: ys[j] })
    /** (i,j)로 이동하는 선분이 장애물에 막히지 않는지 — 레인 배열에 캐시한다 */
    const hClearCache = new Map<number, boolean>()
    const hClear = (i: number, j: number) => {
      const key = j * cols + i
      let clear = hClearCache.get(key)
      if (clear === undefined) {
        clear = segmentClear(point(i, j), point(i + 1, j), boxes)
        hClearCache.set(key, clear)
      }
      return clear
    }
    const vClearCache = new Map<number, boolean>()
    const vClear = (i: number, j: number) => {
      const key = j * cols + i
      let clear = vClearCache.get(key)
      if (clear === undefined) {
        clear = segmentClear(point(i, j), point(i, j + 1), boxes)
        vClearCache.set(key, clear)
      }
      return clear
    }

    // 시작 — 방향 미정(=-1 취급): 첫 이동에는 굽음 페널티 없음
    const startKey = nodeKey(si, sj, 0)
    const startKeyAlt = nodeKey(si, sj, 1)
    dist[startKey] = 0
    dist[startKeyAlt] = 0

    let reached: number | null = null
    for (;;) {
      // 미방문 최소 노드 — 그리드가 작아 선형 스캔으로 충분하다
      let u = -1
      let best = Infinity
      for (let k = 0; k < size; k += 1) {
        if (!visited[k] && dist[k] < best) {
          best = dist[k]
          u = k
        }
      }
      if (u < 0) break
      if (best === Infinity) break
      visited[u] = 1

      const isTarget = u === nodeKey(ti, tj, 0) || u === nodeKey(ti, tj, 1)
      if (isTarget) {
        reached = u
        break
      }

      const dir = (u % 2) as 0 | 1
      const i = Math.floor(u / 2) % cols
      const j = Math.floor(u / 2 / cols)

      // 가로 이동(다음 방향 0) — 세로로 도착한 노드면 굽음. 다른 관계가 쓴 통로 위라면 회피 비용
      for (const [ni, ok] of [
        [i - 1, i > 0 && hClear(i - 1, j)],
        [i + 1, i + 1 < cols && hClear(i, j)],
      ] as const) {
        if (!ok) continue
        let cost = Math.abs(xs[ni] - xs[i]) + (dir === 1 ? BEND_PENALTY : 0)
        if (avoid.length > 0 && overlapsUsed('h', ys[j], Math.min(xs[ni], xs[i]), Math.max(xs[ni], xs[i]), avoid))
          cost += CORRIDOR_AVOID_PENALTY
        const v = nodeKey(ni, j, 0)
        if (dist[u] + cost < dist[v]) {
          dist[v] = dist[u] + cost
          prev[v] = u
        }
      }
      // 세로 이동(다음 방향 1)
      for (const [nj, ok] of [
        [j - 1, j > 0 && vClear(i, j - 1)],
        [j + 1, j + 1 < rows && vClear(i, j)],
      ] as const) {
        if (!ok) continue
        let cost = Math.abs(ys[nj] - ys[j]) + (dir === 0 ? BEND_PENALTY : 0)
        if (avoid.length > 0 && overlapsUsed('v', xs[i], Math.min(ys[nj], ys[j]), Math.max(ys[nj], ys[j]), avoid))
          cost += CORRIDOR_AVOID_PENALTY
        const v = nodeKey(i, nj, 1)
        if (dist[u] + cost < dist[v]) {
          dist[v] = dist[u] + cost
          prev[v] = u
        }
      }
    }

    // 막다른 길 — L자로 물러간다(장애물 관통 가능. 완전히 갇힌 배치는 드물다)
    if (reached === null) {
      return { points: [source, { x: target.x, y: source.y }, target], complete: false }
    }

    // 역추적 → waypoint (레인 교차점) → 시작·끝 앵커 확정
    const reversed: RouterPoint[] = []
    for (let k = reached; k >= 0; k = prev[k]) {
      const i = Math.floor(k / 2) % cols
      const j = Math.floor(k / 2 / cols)
      reversed.push(point(i, j))
    }
    reversed.reverse()
    return { points: collapseCollinear([source, ...reversed.slice(1), target]), complete: true }
  }

  let active = obstacles.filter(overlapsCorridor)
  for (let round = 0; round < 8; round += 1) {
    const { points, complete } = solve(active)
    // L자 폴백 — 회피 집합을 늘려도 뚫리지 않으니 그대로 반환한다
    if (!complete) return points
    const hidden = obstacles.filter(
      (box) =>
        !active.includes(box) &&
        points.some((p, i) => i > 0 && segmentHitsBox(points[i - 1], p, box)),
    )
    if (hidden.length === 0) return points
    active = [...active, ...hidden]
  }
  return solve(obstacles).points
}

/** 같은 직선상의 점 제거 — 시작·끝은 유지 */
function collapseCollinear(points: RouterPoint[]): RouterPoint[] {
  const out: RouterPoint[] = []
  for (const p of points) {
    const n = out.length
    if (n >= 2) {
      const [a, b] = [out[n - 2], out[n - 1]]
      // a→b→p가 한 직선(가로 또는 세로)이면 b를 뺀다
      if ((a.y === b.y && b.y === p.y) || (a.x === b.x && b.x === p.x)) {
        out.pop()
      }
    }
    out.push(p)
  }
  return out
}

/**
 * 첫·끝 선분을 면 법선으로 강제한 직교 경로 — 앵커에서 바로 옆(면 평행)으로 꺾이면
 * 글리프가 어느 방향으로 뻗는지 읽히지 않는다. 앵커에서 법선으로 stub만큼 나간
 * 지점을 경유지로 삼아, 위→아래 관계는 아래로 잠깐 나갔다가 꺾이고 아래→위는
 * 위로 나갔다가 꺽인다. 가운데 구간은 routeOrthogonal이 장애물을 피해 잇는다.
 */
/** 점이 장애물 안에 있으면 법선 방향으로 밀어 밖으로 내보낸다 — 앵커의 핸들 오프셋이
 *  stub보다 짧으면 stub 지점이 상대 박스 안쪽으로 들어가 라우터가 이상한 꺽임을 만든다 */
function ejectAlong(point: RouterPoint, normal: RouterPoint, obstacles: RouterBox[]): RouterPoint {
  let p = point
  for (let guard = 0; guard <= obstacles.length; guard += 1) {
    const box = obstacles.find((b) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h)
    if (!box) break
    const exit =
      normal.x !== 0
        ? (normal.x > 0 ? box.x + box.w - p.x : p.x - box.x) + 1
        : (normal.y > 0 ? box.y + box.h - p.y : p.y - box.y) + 1
    p = { x: p.x + normal.x * exit, y: p.y + normal.y * exit }
  }
  return p
}

/** 마주 보는 면의 stub 지점 — 간극이 좁으면 stub을 줄여 교차를 막고, 장애물 안이면 밖으로 배출한다 */
function stubEndpoints(
  source: RouterPoint,
  target: RouterPoint,
  sourceFace: string,
  targetFace: string,
  obstacles: RouterBox[],
  stub: number,
): { s1: RouterPoint; t1: RouterPoint } {
  const ns = faceNormal(sourceFace)
  const nt = faceNormal(targetFace)
  // 마주 보는 같은 축 면(위↔아래·좌↔우)은 앵커 간극이 stub*2보다 좁으면 두 stub이 교차해
  // 되돌아오는 지그재그가 생긴다 — 간극의 절반씩으로 줄여 교차하지 않게 한다
  let stubS = stub
  let stubT = stub
  if (ns.x === -nt.x && ns.y === -nt.y) {
    const gap = Math.abs((target.x - source.x) * ns.x + (target.y - source.y) * ns.y)
    const fit = Math.max(6, Math.floor(gap / 2) - 1)
    if (fit < stub) {
      stubS = fit
      stubT = fit
    }
  }
  // stub 지점이 장애물(주로 상대 테이블 몸통) 안에 들어가면 밖으로 배출한다
  const s1 = ejectAlong({ x: source.x + ns.x * stubS, y: source.y + ns.y * stubS }, ns, obstacles)
  const t1 = ejectAlong({ x: target.x + nt.x * stubT, y: target.y + nt.y * stubT }, nt, obstacles)
  return { s1, t1 }
}

export function routeWithNormalStubs(
  source: RouterPoint,
  target: RouterPoint,
  sourceFace: string,
  targetFace: string,
  obstacles: RouterBox[],
  opts: { stub?: number; margin?: number; lane?: number | null; avoid?: UsedSegment[] } = {},
): RouterPoint[] {
  const ns = faceNormal(sourceFace)
  const nt = faceNormal(targetFace)
  const { s1, t1 } = stubEndpoints(source, target, sourceFace, targetFace, obstacles, opts.stub ?? 24)
  // 강제 통로 레인 — 마주 보는 면에서 다른 관계와 같은 통로를 나눠 쓸 때 벌어진 중간 레인.
  // 3점 경유 경로가 장애물에 막히거나 먼저 그린 관계의 통로와 포개지면 기존 다익스트라
  // 라우팅으로 돌아간다(레인 포기 — 다익스트라는 회피 비용으로 통로를 피해 간다)
  if (opts.lane != null && ns.x === -nt.x && ns.y === -nt.y) {
    const horizontal = ns.y !== 0 // 위/아래 면 → 몸체는 수평 이동(y 레인)
    const waypoints = horizontal
      ? [s1, { x: s1.x, y: opts.lane }, { x: t1.x, y: opts.lane }, t1]
      : [s1, { x: opts.lane, y: s1.y }, { x: opts.lane, y: t1.y }, t1]
    const clear = waypoints.every((p, i) => i === 0 || segmentClear(waypoints[i - 1], p, obstacles))
      && !(opts.avoid && opts.avoid.length > 0 && routeOverlapsUsed(waypoints, opts.avoid))
    if (clear) return collapseCollinear([source, ...waypoints, target])
  }
  const mid = routeOrthogonal(s1, t1, obstacles, opts.margin, opts.avoid)
  return collapseCollinear([source, ...mid, target])
}

/** waypoint 폴리라인을 모서리 둥근 SVG path로 — getSmoothStepPath와 같은 느낌 */
export function orthogonalRoundedPath(points: RouterPoint[], radius = 10): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const corner = points[i]
    const next = points[i + 1]
    const d1 = Math.hypot(corner.x - prev.x, corner.y - prev.y) || 1
    const d2 = Math.hypot(next.x - corner.x, next.y - corner.y) || 1
    const r = Math.min(radius, d1 / 2, d2 / 2)
    const a = { x: corner.x + ((prev.x - corner.x) / d1) * r, y: corner.y + ((prev.y - corner.y) / d1) * r }
    const b = { x: corner.x + ((next.x - corner.x) / d2) * r, y: corner.y + ((next.y - corner.y) / d2) * r }
    d += ` L ${a.x} ${a.y} Q ${corner.x} ${corner.y} ${b.x} ${b.y}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

/** 폴리라인 총 길이의 중점 — 관계 라벨(FK 이름) 위치 */
export function polylineMidpoint(points: RouterPoint[]): RouterPoint {
  const total = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
  let walked = 0
  for (let i = 1; i < points.length; i += 1) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    if (walked + seg >= total / 2) {
      const t = seg === 0 ? 0 : (total / 2 - walked) / seg
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      }
    }
    walked += seg
  }
  return points[points.length - 1] ?? { x: 0, y: 0 }
}

// --- 연결면 계산·면 공유 분산·자기 참조 루프 (05-editor/02-ui.md §5) ---

export type FaceSide = 'left' | 'right' | 'top' | 'bottom'

/** 노드 4면(핸들) 앵커의 좌표 — 임시 선 시작점·가장 가까운 면 계산에 쓴다 */
export function handleAnchors(
  pos: { x: number; y: number },
  size: { w: number; h: number },
): Record<FaceSide, { x: number; y: number }> {
  return {
    top: { x: pos.x + size.w / 2, y: pos.y },
    bottom: { x: pos.x + size.w / 2, y: pos.y + size.h },
    left: { x: pos.x, y: pos.y + size.h / 2 },
    right: { x: pos.x + size.w, y: pos.y + size.h / 2 },
  }
}

/**
 * 두 노드 4면(핸들) 앵커 쌍 중 거리가 가장 짧은 조합 — 관계선 연결면은 배치가 바뀌면
 * 매번 다시 계산된다(저장된 면을 따라가지 않는다). 테이블을 옮기면 선이 따라서
 * 가장 가까운 면으로 붙는다. 박스(RouterBox)를 통째로 좌표·크기 인자에 넘겨도 된다.
 */
export function shortestHandlePair(
  child: { x: number; y: number },
  parent: { x: number; y: number },
  childSize: { w: number; h: number },
  parentSize: { w: number; h: number },
): { child: FaceSide; parent: FaceSide } {
  const childAnchors = handleAnchors(child, childSize)
  const parentAnchors = handleAnchors(parent, parentSize)
  let best: { child: FaceSide; parent: FaceSide } = { child: 'right', parent: 'left' }
  let bestDist = Infinity
  for (const [childSide, ca] of Object.entries(childAnchors)) {
    for (const [parentSide, pa] of Object.entries(parentAnchors)) {
      const dist = Math.abs(ca.x - pa.x) + Math.abs(ca.y - pa.y)
      if (dist < bestDist) {
        bestDist = dist
        best = { child: childSide as FaceSide, parent: parentSide as FaceSide }
      }
    }
  }
  return best
}

/** 면에서 바깥쪽(선 쪽) 단위벡터 — 글리프 심볼이 뻗는 방향과 같다 */
export function faceNormal(face: string): RouterPoint {
  if (face === 'left') return { x: -1, y: 0 }
  if (face === 'right') return { x: 1, y: 0 }
  if (face === 'top') return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}

/**
 * 두 앵커를 각 면의 법선(바깥) 방향으로 밀어 라우팅 시작·끝점을 만든다 — 선 몸체가 글리프의
 * 가장 바깥 심볼 끝에서 시작/끝나게 하는 물러남(v1). 라우터의 첫 선분은 레인 그리드 사정으로
 * 법선이 아닌 면 평행 방향으로 꺾일 수 있어, 경로를 자르는 방식은 심볼 끝과 어긋나므로
 * 시작점 자체를 민다. 두 앵커가 가까우면 비례 축소해 최소 선분(minStub)은 남긴다.
 */
export function insetAnchors(
  source: RouterPoint,
  target: RouterPoint,
  sourceFace: string,
  targetFace: string,
  startInset: number,
  endInset: number,
  minStub = 8,
): { source: RouterPoint; target: RouterPoint } {
  let s = Math.max(0, startInset)
  let e = Math.max(0, endInset)
  const gap = Math.abs(target.x - source.x) + Math.abs(target.y - source.y)
  if (s + e > 0 && s + e > gap - minStub) {
    const k = Math.max(0, gap - minStub) / (s + e)
    s *= k
    e *= k
  }
  const ns = faceNormal(sourceFace)
  const nt = faceNormal(targetFace)
  return {
    source: { x: source.x + ns.x * s, y: source.y + ns.y * s },
    target: { x: target.x + nt.x * e, y: target.y + nt.y * e },
  }
}

/** 앵커를 면을 따라 평행이동 — 좌/우 면은 y±, 상/하 면은 x±. 면 밖으로 나가지 않게 클램프한다.
 *  face는 React Flow Position enum도 받게 string으로 받는다('left'|'right'|'top'|'bottom'). */
export function offsetAlongFace(point: RouterPoint, face: string, offset: number, faceLength: number): RouterPoint {
  const limit = Math.max(0, faceLength / 2 - 12)
  const d = Math.sign(offset) * Math.min(Math.abs(offset), limit)
  if (face === 'left' || face === 'right') return { x: point.x, y: point.y + d }
  return { x: point.x + d, y: point.y }
}

/** 관계의 한쪽 끝 — 어떤 관계가 어느 테이블의 어느 면에 붙는지. along은 **연결 대상**
 *  테이블 중심의 면 따라 좌표(상/하 면은 x, 좌/우 면은 y)로, 같은 면에 붙은 관계들의
 *  앵커 순서를 정한다 — 대상이 면의 왼쪽(위)에 있으면 앵커도 왼쪽(위)에 온다. */
export interface RelationEndpoint {
  relId: string
  tableId: string
  face: string
  along: number
}

/** 통로 레인 배정 계산의 입력 — 관계의 양 끝 앵커(면 분산 적용)와 면 방향 */
export interface CorridorEndpoint {
  relId: string
  source: RouterPoint
  target: RouterPoint
  sourceFace: string
  targetFace: string
  /** 면 그룹 병합 키 재료 — 나란히 놓인 다른 테이블의 같은 좌표 면과 구분한다 */
  sourceTableId?: string
  targetTableId?: string
}

/** 통로 레인을 벌리는 간격 — 인접 관계가 나란히 놓여 서로 구별되는 최소 폭.
 *  오토레이아웃의 관계선 간격(edgeEdge 28px)과 같은 값으로 맞췄다(2026-09-18). */
const CORRIDOR_SPACING = 28
/** 통로가 좁아 클러스터가 다 안 들어갈 때 허용하는 최소 압축 간격 — 이보다 좁으면 포개져 보인다 */
const CORRIDOR_SPACING_MIN = 12
/** 두 관계의 통로 레인이 이 값 이내로 가까우면 포개질 위험이 있다 */
const CORRIDOR_TOLERANCE = 28
/** 레인 통로가 장애물에서 물러나는 여백 — 선 굵기·시각 여유. 6px는 테이블에 붙어
 *  지나가는 것처럼 보여 12px로 넓혔고, 12px에도 우측 표기 배지(NN·AI) 바로 옆을
 *  스치듯 지나는 것처럼 보인다는 피드백으로 20px로 넓혔다(2026-09-18 사용자 요청) */
const LANE_MARGIN = 20

/**
 * 관계별 중간 통로 레인 — 마주 보는 면(위↔아래·좌↔우)으로 잇는 관계들이 같은 통로를
 * 나눠 쓸 때 서로 포개지지 않게 벌린 레인을 배정한다. 묶음(클러스터)은 두 조건:
 * ① 같은 (테이블, 면)에 붙는 관계들 — 레인 차이와 무관하게 무조건 묶는다. 장애물 회피
 * 라우팅(다익스트라)이 면 바로 앞 통로로 수렴하는 성질 때문에, 면을 공유하면 자연 레인이
 * 멀어도 결국 같은 줄에 포개진다. ② 서로 다른 면이어도 레인이 근접하고 이동 범위가
 * 겹치는 이웃. 배정은 클러스터 안에서 멤버 각각의 자연 레인 순서로, 각자의 이동 범위가
 * 스치는 장애물만으로 계산한 자유 구간에 놓고 포개지는 만큼 위로 민다 — 클러스터 전체를
 * 한 통로에 등간격으로 묶으면 지나가지도 않는 박스가 만드는 좁은 구간으로 전원이 몰려
 * 압축된다(모델 17 sensor_types 아래 통로 사례). 혼자 쓰는 통로는 배정 없음 — 기존
 * 장애물 회피 라우팅을 그대로 쓴다. 모든 엣지가 같은 입력으로 같은 결과를 내는 결정론
 * 계산이라 각 엣지가 따로 불러도 결과가 일치한다 (faceShareOffset과 같은 패턴).
 */
export function corridorLanes(
  endpoints: CorridorEndpoint[],
  obstacles: RouterBox[] = [],
): Map<string, number> {
  const lanes = new Map<string, number>()
  interface Candidate {
    relId: string
    lane: number
    lo: number
    hi: number
    /** 붙는 면의 좌표로 만든 그룹 키 — 같은 테이블의 같은 면이면 같은 키 */
    faceKeys: string[]
  }
  // 축별 후보 — 위/아래 면 관계는 수평 통로(y 레인), 좌/우 면 관계는 수직 통로(x 레인)
  const horizontal: Candidate[] = []
  const vertical: Candidate[] = []
  for (const e of endpoints) {
    const ns = faceNormal(e.sourceFace)
    const nt = faceNormal(e.targetFace)
    if (ns.x !== -nt.x || ns.y !== -nt.y) continue // 마주 보는 면만
    if (ns.y !== 0) {
      horizontal.push({
        relId: e.relId,
        lane: (e.source.y + e.target.y) / 2,
        lo: Math.min(e.source.x, e.target.x),
        hi: Math.max(e.source.x, e.target.x),
        // 면 키 — 도착(부모) 테이블의 면. 한 면에 붙는 관계들은 장애물 회피 라우팅이
        // 그 면 바로 앞 통로로 수렴하므로 레인 차이와 무관하게 묶는다. 출발(자식) 면은
        // faceShareOffset(앵커 분산)·레인 근접 조건이 이미 담당하므로 키에 넣지 않는다 —
        // 출발 면까지 묶으면 서로 다른 통로를 쓰는 관계까지 한데 묶여 레인을 불필요하게
        // 민다. tableId가 없는 호출(테스트 조각)은 좌표 폴백 대신 병합 자체를 생략한다 —
        // 좌표 키는 나란히 놓인 다른 테이블의 같은 행 면까지 묶는다
        faceKeys: e.targetTableId ? [`${e.targetFace[0]}${e.targetTableId}`] : [],
      })
    } else {
      vertical.push({
        relId: e.relId,
        lane: (e.source.x + e.target.x) / 2,
        lo: Math.min(e.source.y, e.target.y),
        hi: Math.max(e.source.y, e.target.y),
        faceKeys: e.targetTableId ? [`${e.targetFace[0]}${e.targetTableId}`] : [],
      })
    }
  }
  for (const [group, axis] of [[horizontal, 'h'], [vertical, 'v']] as const) {
    // 1단계 — 레인 순 그리디 클러스터: 이웃 레인이 근접하고 이동 범위가 겹칠 때만 묶는다
    group.sort((a, b) => a.lane - b.lane || (a.relId < b.relId ? -1 : 1))
    let clusterId = 0
    const clusterOf = new Map<string, number>()
    let prev: Candidate | null = null
    for (const c of group) {
      if (prev != null) {
        const near = c.lane - prev.lane <= CORRIDOR_TOLERANCE
        const overlap = clusterOf.get(prev.relId) !== undefined
          && group.some((k) => clusterOf.get(k.relId) === clusterOf.get(prev!.relId) && c.lo < k.hi && k.lo < c.hi)
        if (!near || !overlap) clusterId += 1
      }
      clusterOf.set(c.relId, clusterId)
      prev = c
    }
    // 2단계 — 같은 (테이블, 면) 그룹은 클러스터 번호와 무관하게 병합(유니온-파인드)
    const parent = new Map<number, number>()
    const find = (id: number): number => {
      let root = id
      while (parent.get(root) !== root) root = parent.get(root) ?? root
      let cur = id
      while (parent.get(cur) !== root) {
        const next = parent.get(cur) ?? root
        parent.set(cur, root)
        cur = next
      }
      return root
    }
    const union = (a: number, b: number) => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
    for (let id = 0; id <= clusterId; id += 1) parent.set(id, id)
    const clusterOfKey = new Map<string, number>()
    for (const c of group) {
      for (const key of c.faceKeys) {
        const existing = clusterOfKey.get(key)
        const mine = clusterOf.get(c.relId)!
        if (existing === undefined) clusterOfKey.set(key, mine)
        else union(existing, mine)
      }
    }
    // 3단계 — 병합된 클러스터 내 멤버별 배정 (자연 레인 순서)
    const clusters = new Map<number, Candidate[]>()
    for (const c of group) {
      const root = find(clusterOf.get(c.relId)!)
      if (!clusters.has(root)) clusters.set(root, [])
      clusters.get(root)!.push(c)
    }
    const laneBounds = (b: RouterBox): { low: number; high: number } =>
      axis === 'h'
        ? { low: b.y - LANE_MARGIN, high: b.y + b.h + LANE_MARGIN }
        : { low: b.x - LANE_MARGIN, high: b.x + b.w + LANE_MARGIN }
    /** 멤버의 자유 구간 — 이 멤버의 이동 범위가 스치는 박스의 여유 띠 바깥 구간.
     *  기준 좌표(at)의 위·아래로 박스를 분류하므로, 자연 레인이 띠 안에 있으면
     *  구간이 퇴화(아래한 > 위한)한다 — 점프 판단에 쓴다 */
    const freeInterval = (m: Candidate, at: number): { lo: number; hi: number } => {
      let lo = -Infinity
      let hi = Infinity
      for (const b of obstacles) {
        const hit = axis === 'h' ? m.hi > b.x && m.lo < b.x + b.w : m.hi > b.y && m.lo < b.y + b.h
        if (!hit) continue
        const e = laneBounds(b)
        if (e.high <= at) lo = Math.max(lo, e.high)
        else if (e.low >= at) hi = Math.min(hi, e.low)
        else {
          // 기준 좌표가 박스 여유 띠 안 — 양쪽 가장자리로 구간이 좁아진다
          lo = Math.max(lo, e.high)
          hi = Math.min(hi, e.low)
        }
      }
      return { lo, hi }
    }
    for (const cluster of clusters.values()) {
      if (cluster.length < 2) continue
      cluster.sort((a, b) => a.lane - b.lane || (a.relId < b.relId ? -1 : 1))
      const placed: Array<{
        relId: string
        lane: number
        free: { lo: number; hi: number }
      }> = []
      for (const c of cluster) {
        let free = freeInterval(c, c.lane)
        let desired = c.lane
        if (free.lo > free.hi) {
          // 자연 레인이 박스 여유 띠 안 — 가까운(같으면 아래) 가장자리로 점프하고 그
          // 기준으로 구간을 다시 계산한다(위·아래 박스 분류가 바뀐다)
          desired = c.lane - free.hi < free.lo - c.lane ? free.hi : free.lo
          free = freeInterval(c, desired)
        }
        desired = Math.min(Math.max(desired, free.lo), free.hi)
        // 먼저 배정된 멤버와 포개질 것 같으면(레인 근접) 그 위로 CORRIDOR_SPACING씩 민다
        let lane = desired
        let overflow = false
        for (let guard = 0; guard < 1000; guard += 1) {
          if (lane > free.hi) {
            overflow = true
            break
          }
          const blocker = placed.find((p) => Math.abs(lane - p.lane) < CORRIDOR_SPACING_MIN)
          if (!blocker) break
          lane = blocker.lane + CORRIDOR_SPACING
        }
        if (overflow && placed.length > 0) {
          // 구간이 좁아 위로 밀 자리가 없다 — 같은 구간을 쓰는 멤버들을 최소 간격(12px)까지
          // 압축해 등간격으로 다시 편다. 그래도 못 들어가면 이 관계만 레인을 포기하고
          // 다익스트라 폴백(통로 회피 비용으로 서로 피해 간다)에 맡긴다
          const mates = placed.filter((p) => p.free.lo === free.lo && p.free.hi === free.hi)
          const gaps = mates.length
          const available = free.hi - free.lo
          if (gaps === 0) {
            lane = free.hi
            overflow = false
          } else if (available >= gaps * CORRIDOR_SPACING_MIN) {
            const spacing = available / gaps
            mates.forEach((p, i) => {
              p.lane = free.lo + i * spacing
            })
            lane = free.lo + gaps * spacing
            overflow = false
          }
        }
        if (overflow) continue
        placed.push({ relId: c.relId, lane: Math.round(lane), free })
      }
      for (const p of placed) lanes.set(p.relId, p.lane)
    }
  }
  return lanes
}

/** sharedRoutes가 통로 재사용 판정에 넣는 최소 선분 길이 — stub(~24px)보다 긴 이동 선분만 */
const USED_SEGMENT_MIN = 24

let sharedRoutesCache: { key: string; routes: Map<string, RouterPoint[]> } | null = null

/**
 * 문서 전체 관계를 한 번에 순차 라우팅한다 — relId 순서로 하나씩 그려 먼저 그린 선의
 * 이동 통로(UsedSegment)를 다음 선의 소프트 장애물로 쓴다. 통로 레인 배정(corridorLanes)까지
 * 함께 계산한다. 레인을 배정받지 못하거나 레인 3점 경로가 막힌 관계는 다익스트라 폴백인데,
 * 폴백들은 장애물 바로 앞의 같은 통로로 수렴하는 성질이 있어 순차 회피가 필요하다.
 * 관계선은 RF 엣지 타입이라 계산 결과를 props로 내려줄 수 없어 각 엣지가 따로 호출하는데,
 * 내용 지문 캐시로 문서당 한 번만 계산하고 나머지는 같은 결과를 공유한다.
 */
export function sharedRoutes(
  reqs: CorridorEndpoint[],
  obstacles: RouterBox[],
): Map<string, RouterPoint[]> {
  // 캐시 키 — 좌표·면 반올림 지문. 드래그 중 매 프레임 전 엣지가 같은 내용으로 호출한다
  const key = `${reqs.length}:${obstacles.length}:${reqs
    .map(
      (r) =>
        `${r.relId},${r.sourceFace[0]}${r.targetFace[0]},${Math.round(r.source.x)},${Math.round(r.source.y)},${Math.round(r.target.x)},${Math.round(r.target.y)}`,
    )
    .join(';')}|${obstacles
    .map((b) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`)
    .join(';')}`
  if (sharedRoutesCache && sharedRoutesCache.key === key) return sharedRoutesCache.routes

  const lanes = corridorLanes(reqs, obstacles)
  const used: UsedSegment[] = []
  const routes = new Map<string, RouterPoint[]>()
  for (const req of [...reqs].sort((a, b) => (a.relId < b.relId ? -1 : 1))) {
    const points = routeWithNormalStubs(req.source, req.target, req.sourceFace, req.targetFace, obstacles, {
      lane: lanes.get(req.relId) ?? null,
      avoid: used,
    })
    routes.set(req.relId, points)
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]
      const b = points[i]
      if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= USED_SEGMENT_MIN)
        used.push({ axis: 'h', at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) })
      else if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= USED_SEGMENT_MIN)
        used.push({ axis: 'v', at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) })
    }
  }
  sharedRoutesCache = { key, routes }
  return routes
}

/** 면 공유 분산 간격 — 같은 면에 붙은 관계 끝끼리 벌리는 폭.
 *  16→32px에도 나란히 놓인 글리프가 겹쳐 보여 식별이 안 된다는 피드백으로 48px로 넓혔다. */
const FACE_SPACING = 48

/**
 * 같은 테이블의 같은 면에 붙은 관계들의 면 따라 오프셋 — 앵커는 면 중심 하나라 한 면에
 * 관계가 여럿이면 선이 포개져 읽을 수 없다. 같은 (테이블, 면) 그룹을 **연결 대상의 면
 * 따라 좌표 순서**(along 오름차순, 같으면 relId)로 정렬해 그룹 중심 대칭 등간격 배치한다 —
 * 대상이 왼쪽(위)에 있는 관계부터 면의 왼쪽(위) 끝에 오므로 선이 부채꼴로 펴지고 교차하지
 * 않는다(거리 순서 heuristics는 대상들이 좌·우로 늘어선 경우 위치와 어긋나 선을 교차시켰다).
 * 상호 참조(A↔B)는 대상이 같아 along이 같다 — relId 순서로 흡수된다(별도 케이스가 아니다).
 * 자기 참조는 오른쪽 면 루프 고정이라 호출자가 끝 목록에서 빼준다.
 */
export function faceShareOffset(endpoints: RelationEndpoint[], relId: string, tableId: string): number {
  const mine = endpoints.find((e) => e.relId === relId && e.tableId === tableId)
  if (!mine) return 0
  const group = endpoints
    .filter((e) => e.tableId === mine.tableId && e.face === mine.face)
    .sort((a, b) => a.along - b.along || (a.relId < b.relId ? -1 : a.relId > b.relId ? 1 : 0))
  if (group.length < 2) return 0
  const index = group.findIndex((e) => e.relId === relId && e.tableId === tableId)
  return (index - (group.length - 1) / 2) * FACE_SPACING
}

/** 자기 참조 관계의 고정 루프 — 오른쪽 면 중심 앵커에서 면을 따라 벌렸다가 돌아온다(장애물 회피 없음) */
export function selfLoopPoints(anchor: RouterPoint, opts: { spread?: number; outset?: number } = {}): RouterPoint[] {
  const spread = opts.spread ?? 32
  const outset = opts.outset ?? 40
  return [
    { x: anchor.x, y: anchor.y - spread },
    { x: anchor.x + outset, y: anchor.y - spread },
    { x: anchor.x + outset, y: anchor.y + spread },
    { x: anchor.x, y: anchor.y + spread },
  ]
}

/**
 * 폴리라인 양 끝을 주어진 길이만큼 잘라낸 구간 — 양 끝 글리프(까마귀발 심볼)와 선 몸체가
 * 포개지지 않게 선이 물러나 시작/끝나는 지점을 만든다. 경로 도형(실제 지나가는 선)을 따라 자른다.
 * 일반 관계는 insetAnchors(시작점 밀기)가 물러남을 담당하고, 첫·끝 선분이 항상 법선인
 * 자기 참조 루프에서 쓴다 — 그래야 심볼 폭과 정확히 일치한다.
 */
export function trimPolyline(points: RouterPoint[], startTrim: number, endTrim: number): RouterPoint[] {
  if (points.length < 2) return points
  const segs: Array<{ a: RouterPoint; b: RouterPoint; len: number }> = []
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push({ a, b, len })
    total += len
  }
  // 너무 짧아 양쪽 물러남이 전체를 삼키면 비례 축소해 최소한의 선분은 남긴다
  let start = Math.max(0, startTrim)
  let end = Math.max(0, endTrim)
  if (start + end >= total && start + end > 0) {
    const k = Math.max(0, total - 2) / (start + end)
    start *= k
    end *= k
  }
  /** 시작점에서 dist만큼 지난 위치와 그 위치가 속한 선분 인덱스 */
  const pointAt = (dist: number): { point: RouterPoint; index: number } => {
    let acc = 0
    for (let i = 0; i < segs.length; i += 1) {
      const { a, b, len } = segs[i]
      if (len > 0 && acc + len >= dist) {
        const t = (dist - acc) / len
        return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, index: i }
      }
      acc += len
    }
    return { point: segs[segs.length - 1].b, index: segs.length - 1 }
  }
  const from = pointAt(start)
  const to = pointAt(total - end)
  const out: RouterPoint[] = [from.point]
  for (let i = from.index + 1; i <= to.index; i += 1) out.push(segs[i].a)
  out.push(to.point)
  return out
}
