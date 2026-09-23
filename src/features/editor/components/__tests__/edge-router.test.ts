import { describe, expect, it } from 'vitest'

import {
  corridorLanes,
  faceNormal,
  faceShareOffset,
  handleAnchors,
  insetAnchors,
  offsetAlongFace,
  orthogonalRoundedPath,
  polylineMidpoint,
  routeOrthogonal,
  routeWithNormalStubs,
  selfLoopPoints,
  sharedRoutes,
  shortestHandlePair,
  trimPolyline,
  type CorridorEndpoint,
  type RelationEndpoint,
  type RouterBox,
} from '../canvas/edge-router'

describe('edge-router — routeOrthogonal', () => {
  const box = (x: number, y: number, w: number, h: number): RouterBox => ({ x, y, w, h })

  /** 모든 선분이 직교(가로·세로)이고 어떤 박스 내부도 관통하지 않는지 */
  function assertOrthogonalClear(points: { x: number; y: number }[], boxes: RouterBox[]) {
    expect(points.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]
      const b = points[i]
      expect(a.x === b.x || a.y === b.y).toBe(true)
      for (const bx of boxes) {
        const hit =
          Math.max(a.x, b.x) > bx.x &&
          Math.min(a.x, b.x) < bx.x + bx.w &&
          Math.max(a.y, b.y) > bx.y &&
          Math.min(a.y, b.y) < bx.y + bx.h
        expect(hit, `선분 (${a.x},${a.y})→(${b.x},${b.y})가 박스 (${bx.x},${bx.y},${bx.w},${bx.h})를 관통`).toBe(false)
      }
    }
  }

  it('장애물이 없으면 직교 최단(굽음 1 이하)으로 잇는다', () => {
    const source = { x: 0, y: 0 }
    const target = { x: 200, y: 100 }
    const points = routeOrthogonal(source, target, [])
    expect(points[0]).toEqual(source)
    expect(points[points.length - 1]).toEqual(target)
    assertOrthogonalClear(points, [])
    expect(points.length).toBeLessThanOrEqual(3)
  })

  it('같은 축에 있으면 굽음 없이 직선으로 잇는다', () => {
    const points = routeOrthogonal({ x: 0, y: 50 }, { x: 300, y: 50 }, [])
    expect(points).toEqual([{ x: 0, y: 50 }, { x: 300, y: 50 }])
  })

  it('중간에 테이블이 있으면 박스를 돌아간다 — 어떤 선분도 내부를 관통하지 않는다', () => {
    const source = { x: 0, y: 100 }
    const target = { x: 400, y: 100 }
    const obstacle = box(150, 0, 120, 200) // 복도 중앙을 가로막는 테이블
    const points = routeOrthogonal(source, target, [obstacle])
    expect(points[0]).toEqual(source)
    expect(points[points.length - 1]).toEqual(target)
    assertOrthogonalClear(points, [obstacle])
  })

  it('대각선 배치에서도 장애물을 피해 직교로 잇는다', () => {
    const source = { x: 0, y: 0 }
    const target = { x: 300, y: 200 }
    const obstacle = box(100, 60, 120, 100)
    const points = routeOrthogonal(source, target, [obstacle])
    expect(points[0]).toEqual(source)
    expect(points[points.length - 1]).toEqual(target)
    assertOrthogonalClear(points, [obstacle])
  })

  it('복도 AABB 밖 장애물은 무시한다 — 직선 경로가 유지된다', () => {
    const points = routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 0 }, [box(500, 500, 50, 50)])
    expect(points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
  })

  it('경로가 복도 밖으로 새면 그곳의 장애물도 돌아간다 — 복도 AABB 필터 밖 관통 방지', () => {
    // 복도(양 끝을 감싼 사각형) 중앙을 M이 막으면 레인은 위·아래로 새는데, 그 지점에
    // 복도 밖 장애물(U·L)이 있어도 그리드가 보지 못해 선이 테이블 뒤로 숨는다(2026-09
    // 실사용 회귀). 완성 경로를 전체 장애물로 재검증해 U·L도 피하는지 확인한다
    const source = { x: 0, y: 100 }
    const target = { x: 1000, y: 100 }
    const corridor = box(450, 20, 100, 260) // 복도 중앙 가로막음 — 직선(y=100) 불가
    const above = box(600, -100, 300, 140) // 복도 위쪽 탈출로(y≈20)에 붙은 박스
    const below = box(600, 200, 300, 150) // 복도 아래쪽 탈출로(y≈304)에 붙은 박스

    const points = routeOrthogonal(source, target, [corridor, above, below])
    expect(points[0]).toEqual(source)
    expect(points[points.length - 1]).toEqual(target)
    assertOrthogonalClear(points, [corridor, above, below])
  })

  it('여러 장애물이 있어도 모두 피해서 잇는다', () => {
    const source = { x: 0, y: 100 }
    const target = { x: 600, y: 100 }
    const points = routeOrthogonal(source, target, [
      box(120, 20, 100, 160),
      box(300, 20, 100, 160),
      box(480, 20, 100, 160),
    ])
    expect(points[0]).toEqual(source)
    expect(points[points.length - 1]).toEqual(target)
    assertOrthogonalClear(points, [
      box(120, 20, 100, 160),
      box(300, 20, 100, 160),
      box(480, 20, 100, 160),
    ])
  })

  /** 축평행 선분과 박스의 최소 거리 — 밀착 단정에 쓴다(관통이면 0) */
  function minGap(points: { x: number; y: number }[], bx: RouterBox): number {
    let min = Infinity
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]
      const b = points[i]
      if (a.x === b.x || a.y === b.y) {
        // 직교 선분 — 박스로의 최단 거리는 양끝·박스 투영으로 정확히 계산된다
        const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }
        const hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }
        const dx = Math.max(bx.x - hi.x, lo.x - (bx.x + bx.w), 0)
        const dy = Math.max(bx.y - hi.y, lo.y - (bx.y + bx.h), 0)
        if (dx === 0 && dy === 0) return 0 // 관통(내부 겹침)
        min = Math.min(min, Math.hypot(dx, dy))
      }
    }
    return min
  }

  it('앵커 레인이 복도 안 이웃 테이블 면에 1px로 붙어 달리면 마진 레인으로 물러난다', () => {
    // 모델 33 실측 재현(2026-09-23) — 출발 x 레인(100)이 그리드 후보라 늘 존재하고 raw
    // 박스(x=101)에 걸리지 않아 그대로 통과된다. 밀착 감지가 박스를 부풀려(±22) 재계산하면
    // 경로는 ±24 레인으로 물러난다
    const source = { x: 100, y: 100 }
    const target = { x: 100, y: 700 }
    const neighbor = box(101, 200, 120, 100) // 좌면이 레인에서 1px 오른쪽
    const points = routeOrthogonal(source, target, [neighbor])
    expect(points[0]).toEqual(source)
    expect(points[points.length - 1]).toEqual(target)
    assertOrthogonalClear(points, [neighbor])
    expect(points.length).toBeGreaterThan(2) // 직선(밀착)이 아니라 물러난 경로다
    expect(minGap(points, neighbor)).toBeGreaterThanOrEqual(22)
  })

  it('짧은 모서리 스침(<48px 병행)은 밀착으로 치지 않는다 — 직선이 유지된다', () => {
    const neighbor = box(101, 200, 120, 30) // 병행 구간 30px뿐
    const points = routeOrthogonal({ x: 100, y: 100 }, { x: 100, y: 700 }, [neighbor])
    expect(points).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 700 },
    ])
  })

  it('레인 마진(24px) 간격의 병행은 설계된 위치다 — 물러나지 않는다', () => {
    const neighbor = box(124, 200, 120, 100) // 좌면이 레인(x=100)에서 정확히 24px
    const points = routeOrthogonal({ x: 100, y: 100 }, { x: 100, y: 700 }, [neighbor])
    expect(points).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 700 },
    ])
  })
})

describe('edge-router — path 헬퍼', () => {
  it('orthogonalRoundedPath — 시작점으로 시작하고 굽은 점은 Q 커브로 둥글게 한다', () => {
    const d = orthogonalRoundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
    ])
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d).toContain('Q')
    expect(d.endsWith('L 100 80')).toBe(true)
  })

  it('직선 2점은 Q 없이 이어진다', () => {
    const d = orthogonalRoundedPath([
      { x: 0, y: 50 },
      { x: 300, y: 50 },
    ])
    expect(d).toBe('M 0 50 L 300 50')
  })

  it('polylineMidpoint — 총 길이의 정확히 중점을 반환한다', () => {
    expect(polylineMidpoint([{ x: 0, y: 50 }, { x: 300, y: 50 }])).toEqual({ x: 150, y: 50 })
    // L자 (100 가로 + 100 세로) → 총 200의 중점(100)은 첫 선분의 끝 (100, 0)
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ]),
    ).toEqual({ x: 100, y: 0 })
  })
})

describe('edge-router — 면 공유 분산(같은 면 관계선 간격 벌리기)', () => {
  it('offsetAlongFace — 좌우 면은 y로, 상하 면은 x로 면을 따라 이동한다', () => {
    expect(offsetAlongFace({ x: 10, y: 50 }, 'right', 16, 200)).toEqual({ x: 10, y: 66 })
    expect(offsetAlongFace({ x: 10, y: 50 }, 'left', -16, 200)).toEqual({ x: 10, y: 34 })
    expect(offsetAlongFace({ x: 10, y: 50 }, 'top', 16, 300)).toEqual({ x: 26, y: 50 })
    expect(offsetAlongFace({ x: 10, y: 50 }, 'bottom', 0, 300)).toEqual({ x: 10, y: 50 })
  })

  it('offsetAlongFace — 면 길이의 절반−12를 넘으면 면 안쪽으로 클램프된다', () => {
    expect(offsetAlongFace({ x: 0, y: 50 }, 'right', 99, 40)).toEqual({ x: 0, y: 58 }) // 40/2−12 = 8
  })

  it('faceShareOffset — 같은 (테이블, 면)에 관계 3개가 붙으면 연결 대상의 면 따라 좌표 순서로 −48/0/+48', () => {
    // 한 부모의 오른쪽 면에 자식 3개 — 대상의 y(면 따라 좌표)가 r-a(위) < r-b < r-c(아래)면
    // 위에 있는 대소 관계가 앵커도 위(음수 오프셋)에 와서 선이 교차하지 않는다
    const endpoints: RelationEndpoint[] = [
      { relId: 'r-c', tableId: 'P', face: 'right', along: 900 },
      { relId: 'r-a', tableId: 'P', face: 'right', along: 100 },
      { relId: 'r-b', tableId: 'P', face: 'right', along: 500 },
    ]
    expect(faceShareOffset(endpoints, 'r-a', 'P')).toBe(-48)
    expect(faceShareOffset(endpoints, 'r-b', 'P')).toBe(0)
    expect(faceShareOffset(endpoints, 'r-c', 'P')).toBe(48)
  })

  it('faceShareOffset — 그룹에 혼자면(다른 면·다른 테이블) 분산하지 않는다', () => {
    const endpoints: RelationEndpoint[] = [
      { relId: 'r-1', tableId: 'P', face: 'right', along: 100 },
      { relId: 'r-2', tableId: 'P', face: 'bottom', along: 100 }, // 같은 테이블, 다른 면
      { relId: 'r-3', tableId: 'Q', face: 'right', along: 100 }, // 다른 테이블, 같은 면
    ]
    expect(faceShareOffset(endpoints, 'r-1', 'P')).toBe(0)
    expect(faceShareOffset(endpoints, 'r-2', 'P')).toBe(0)
    expect(faceShareOffset(endpoints, 'r-3', 'Q')).toBe(0)
  })

  it('faceShareOffset — 상호 참조 두 관계가 같은 면에 포개지면 간격의 절반씩 벌린다', () => {
    // A→B와 B→A가 모두 B의 같은 면에 붙는 상호 참조 — 대상이 같아 along도 같다
    const endpoints: RelationEndpoint[] = [
      { relId: 'r-b', tableId: 'B', face: 'left', along: 300 },
      { relId: 'r-a', tableId: 'B', face: 'left', along: 300 },
    ]
    // 같은 좌표면 relId 순서로 tie-break — r-a가 위(−)
    expect(faceShareOffset(endpoints, 'r-a', 'B')).toBe(-24)
    expect(faceShareOffset(endpoints, 'r-b', 'B')).toBe(24)
  })

  it('faceShareOffset — 한 관계의 자식 끝·부모 끝은 각각 독립적으로 분산한다', () => {
    // r-1의 자식 끝은 P right(다른 관계와 겹침), 부모 끝은 Q left(혼자)
    const endpoints: RelationEndpoint[] = [
      { relId: 'r-1', tableId: 'P', face: 'right', along: 800 },
      { relId: 'r-1', tableId: 'Q', face: 'left', along: 800 },
      { relId: 'r-2', tableId: 'P', face: 'right', along: 200 },
    ]
    expect(faceShareOffset(endpoints, 'r-2', 'P')).toBe(-24) // r-2 대상이 위(작은 along) → 위
    expect(faceShareOffset(endpoints, 'r-1', 'P')).toBe(24)
    expect(faceShareOffset(endpoints, 'r-1', 'Q')).toBe(0)
    expect(faceShareOffset(endpoints, 'r-1', 'Q')).toBe(0)
  })

  it('faceShareOffset — 끝 목록에 없는 관계·테이블이면 0을 돌려준다', () => {
    expect(faceShareOffset([], 'r-x', 'P')).toBe(0)
  })
})

describe('edge-router — 연결면 계산(handleAnchors·shortestHandlePair)', () => {
  it('handleAnchors — 노드 4면의 중심 앵커 좌표를 반환한다', () => {
    expect(handleAnchors({ x: 0, y: 0 }, { w: 100, h: 60 })).toEqual({
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 60 },
      left: { x: 0, y: 30 },
      right: { x: 100, y: 30 },
    })
  })

  it('shortestHandlePair — 자식이 오른쪽에 있으면 child left ↔ parent right', () => {
    expect(shortestHandlePair({ x: 400, y: 0 }, { x: 0, y: 0 }, { w: 100, h: 60 }, { w: 100, h: 60 })).toEqual({
      child: 'left',
      parent: 'right',
    })
  })

  it('shortestHandlePair — 자식이 아래에 있으면 child top ↔ parent bottom', () => {
    expect(shortestHandlePair({ x: 0, y: 400 }, { x: 0, y: 0 }, { w: 100, h: 60 }, { w: 100, h: 60 })).toEqual({
      child: 'top',
      parent: 'bottom',
    })
  })

  it('shortestHandlePair — 대각 배치에서는 맨해튼 거리가 가장 짧은 면 쌍을 고른다', () => {
    // 자식 (200, 200) — child left↔parent right(300)이 top↔bottom(340)보다 짧다
    const sides = shortestHandlePair({ x: 200, y: 200 }, { x: 0, y: 0 }, { w: 100, h: 60 }, { w: 100, h: 60 })
    expect(sides).toEqual({ child: 'left', parent: 'right' })
  })
})

describe('edge-router — 법선 스타브 경로(routeWithNormalStubs)', () => {
  it('세로 면(bottom→top)은 첫·끝 선분이 세로(법선)로 나간다 — 바로 옆으로 꺾이지 않는다', () => {
    // 자식이 위(bottom 면), 부모가 오른쪽 아래(top 면)에 치우친 배치
    const pts = routeWithNormalStubs({ x: 100, y: 100 }, { x: 500, y: 400 }, 'bottom', 'top', [])
    expect(pts[0]).toEqual({ x: 100, y: 100 })
    expect(pts[1].x).toBe(100) // 첫 선분 = 법선(+y) 세로
    expect(pts[1].y).toBeGreaterThan(100)
    const last = pts[pts.length - 1]
    expect(last).toEqual({ x: 500, y: 400 })
    expect(pts[pts.length - 2].x).toBe(500) // 마지막 선분 = 법선(−y) 세로
  })

  it('좌우 마주봄(right→left)은 첫·끝 선분이 가로(법선)로 나간다', () => {
    const pts = routeWithNormalStubs({ x: 100, y: 100 }, { x: 500, y: 300 }, 'right', 'left', [])
    expect(pts[1].y).toBe(100) // 첫 선분 = 법선(+x) 가로
    expect(pts[1].x).toBeGreaterThan(100)
    expect(pts[pts.length - 2].y).toBe(300)
    expect(pts[pts.length - 2].x).toBeLessThan(500)
  })

  it('장애물이 있으면 중간 구간은 박스를 피해 돌아간다 — 전 선분 관통 0', () => {
    const obstacle: RouterBox = { x: 200, y: 150, w: 120, h: 120 }
    const pts = routeWithNormalStubs({ x: 100, y: 100 }, { x: 500, y: 400 }, 'bottom', 'top', [obstacle])
    for (let i = 1; i < pts.length; i += 1) {
      expect(pierces(pts[i - 1], pts[i], obstacle), `관통: ${JSON.stringify(pts)}`).toBe(false)
    }
  })

  it('stub 지점이 상대 박스 안에 들어가면(핸들 오프셋 < stub) 밖으로 배출해 경로가 뭉개지지 않는다', () => {
    // 부모 박스 (0,0,100,50)의 top 면 앵커가 면에서 21px 아래(71) — stub 24를 밀면 (50,47)로
    // 박스 안쪽에 들어간다. 배출되지 않으면 라우터가 첫 선분을 3px로 뭉개는 꺽임을 만든다
    const parent: RouterBox = { x: 0, y: 0, w: 100, h: 50 }
    const pts = routeWithNormalStubs({ x: 300, y: 200 }, { x: 50, y: 71 }, 'right', 'top', [parent])
    const last = pts[pts.length - 1]
    expect(last).toEqual({ x: 50, y: 71 })
    // 마지막 선분은 여전히 법선(−y)으로 들어온다 — 직전 점이 앵커 위쪽에 있다
    expect(pts[pts.length - 2].x).toBe(50)
    expect(pts[pts.length - 2].y).toBeLessThan(71)
    for (const pt of pts) {
      const inside = pt.x > parent.x && pt.x < parent.x + parent.w && pt.y > parent.y && pt.y < parent.y + parent.h
      expect(inside, `박스 내부 점: ${JSON.stringify(pt)}`).toBe(false)
    }
  })

  it('마주 보는 면의 앵커 간극이 stub*2보다 좁으면 stub을 절반씩으로 줄여 지그재그를 만들지 않는다', () => {
    // 자식 top(위로 출발)·부모 bottom(아래로 출발)이 31px 떨어진 타이트한 계층 배치 —
    // stub 24*2가 교차하면 위로 나갔다가 되돌아오는 U자 꺽임이 생긴다
    const child: RouterBox = { x: 40, y: 326, w: 340, h: 206 }
    const parent: RouterBox = { x: 125, y: 40, w: 340, h: 206 }
    const pts = routeWithNormalStubs({ x: 210, y: 298 }, { x: 295, y: 267 }, 'top', 'bottom', [child, parent])
    // 첫 선분은 위로(법선), 마지막 선분은 아래로(법선) — 되돌아오는 세로 꺽임이 없다
    expect(pts[1].x).toBe(210)
    expect(pts[1].y).toBeLessThan(298)
    expect(pts[1].y).toBeGreaterThan(267) // stub이 줄어 교차하지 않는다
    const last = pts[pts.length - 1]
    expect(last).toEqual({ x: 295, y: 267 })
    expect(pts[pts.length - 2].x).toBe(295)
    expect(pts[pts.length - 2].y).toBeGreaterThan(267)
    // 세로 방향 꺽임이 연속으로 반전하지 않는다(지그재그 없음)
    let prevDir = 0
    for (let i = 1; i < pts.length; i += 1) {
      if (pts[i].x !== pts[i - 1].x) continue
      const dir = Math.sign(pts[i].y - pts[i - 1].y)
      if (dir !== 0 && prevDir !== 0) expect(dir === prevDir, `세로 지그재그: ${JSON.stringify(pts)}`).toBe(true)
      if (dir !== 0) prevDir = dir
    }
  })

  it('stub은 옵션으로 조절할 수 있다 — 0이면 법선 강제가 사라진다', () => {
    const pts = routeWithNormalStubs({ x: 0, y: 50 }, { x: 300, y: 50 }, 'right', 'left', [], { stub: 0 })
    expect(pts).toEqual([
      { x: 0, y: 50 },
      { x: 300, y: 50 },
    ])
  })
})

describe('edge-router — 자기 참조 루프', () => {
  it('오른쪽 면에서 벌어져 돌아오는 직교 루프 4점을 만든다 — 시작·끝은 면에 붙는다', () => {
    const pts = selfLoopPoints({ x: 100, y: 50 })
    expect(pts).toEqual([
      { x: 100, y: 18 },
      { x: 140, y: 18 },
      { x: 140, y: 82 },
      { x: 100, y: 82 },
    ])
  })

  it('spread·outset은 옵션으로 조절할 수 있다', () => {
    expect(selfLoopPoints({ x: 0, y: 0 }, { spread: 20, outset: 50 })).toEqual([
      { x: 0, y: -20 },
      { x: 50, y: -20 },
      { x: 50, y: 20 },
      { x: 0, y: 20 },
    ])
  })
})

describe('edge-router — 선 물러남(글리프 끝점 연결)', () => {
  it('직선은 양 끝에서 주어진 길이만큼 잘린다', () => {
    expect(trimPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, 20)).toEqual([{ x: 10, y: 0 }, { x: 80, y: 0 }])
  })

  it('자르는 지점이 굽은 점을 지나면 중간 waypoint를 삼키고 새 끝점을 만든다', () => {
    // L자 (0,0)→(100,0)→(100,100) — 시작에서 120, 끝에서 10
    expect(trimPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 120, 10)).toEqual([
      { x: 100, y: 20 },
      { x: 100, y: 90 },
    ])
  })

  it('물러남 0은 폴리라인을 그대로 돌려준다', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    expect(trimPolyline(points, 0, 0)).toEqual(points)
  })

  it('양쪽 물러남이 전체 길이를 삼키면 비례 축소돼 최소한의 선분이 남는다', () => {
    // 길이 100 직선에 60+60 → 49/49로 축소
    expect(trimPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 60, 60)).toEqual([{ x: 49, y: 0 }, { x: 51, y: 0 }])
  })
})

describe('edge-router — 법선 밀기 앵커(insetAnchors)', () => {
  it('faceNormal — 면에서 바깥(선 쪽) 단위벡터를 반환한다', () => {
    expect(faceNormal('right')).toEqual({ x: 1, y: 0 })
    expect(faceNormal('left')).toEqual({ x: -1, y: 0 })
    expect(faceNormal('top')).toEqual({ x: 0, y: -1 })
    expect(faceNormal('bottom')).toEqual({ x: 0, y: 1 })
  })

  it('양 끝을 각 면의 법선 방향(글리프가 뻗는 방향)으로 민다 — 수평 마주봄', () => {
    // 자식 right 면(+x)에서 23, 부모 left 면(−x)에서 16
    expect(insetAnchors({ x: 100, y: 50 }, { x: 400, y: 50 }, 'right', 'left', 23, 16)).toEqual({
      source: { x: 123, y: 50 },
      target: { x: 384, y: 50 },
    })
  })

  it('세로 배치에서도 면 법선으로 민다 — top은 −y, bottom은 +y', () => {
    expect(insetAnchors({ x: 50, y: 100 }, { x: 50, y: 400 }, 'bottom', 'top', 23, 16)).toEqual({
      source: { x: 50, y: 123 },
      target: { x: 50, y: 384 },
    })
  })

  it('물러남 0은 앵커를 그대로 돌려준다', () => {
    const source = { x: 0, y: 0 }
    const target = { x: 500, y: 120 }
    expect(insetAnchors(source, target, 'right', 'left', 0, 0)).toEqual({ source, target })
  })

  it('두 앵커가 가까우면 비례 축소돼 최소 선분(minStub=8)은 남긴다', () => {
    // gap 50에 32+16=48 — k = (50−8)/48 = 0.875 → 28/14
    expect(insetAnchors({ x: 0, y: 0 }, { x: 50, y: 0 }, 'right', 'left', 32, 16)).toEqual({
      source: { x: 28, y: 0 },
      target: { x: 36, y: 0 },
    })
  })

  it('대각 배치(Y 어긋남)에서도 각자 자기 면의 법선으로 민다', () => {
    expect(insetAnchors({ x: 0, y: 0 }, { x: 400, y: 250 }, 'right', 'left', 23, 26)).toEqual({
      source: { x: 23, y: 0 },
      target: { x: 374, y: 250 },
    })
  })
})

/** 선분이 박스 내부를 관통하는지 — 라우터 segmentHits와 같은 판정식 */
function pierces(a: RouterPoint2, b: RouterPoint2, box: RouterBox) {
  const minx = Math.min(a.x, b.x)
  const maxx = Math.max(a.x, b.x)
  const miny = Math.min(a.y, b.y)
  const maxy = Math.max(a.y, b.y)
  return maxx > box.x && minx < box.x + box.w && maxy > box.y && miny < box.y + box.h
}

type RouterPoint2 = { x: number; y: number }

describe('edge-router — 양 끝 테이블 관통 방지(장애물에 출발·도착 포함)', () => {
  it('드래그로 B가 A에 겹친 배치에서 A·B 몸통을 피해 돌아간다', () => {
    // 브라우저 실측 재현 — B left 앵커(292,303)에서 A right 앵커(361,103)로,
    // A·B가 x축으로 겹치는(320 < 340) 이동 중 배치
    const A = { x: 0, y: 0, w: 340, h: 206 }
    const B = { x: 320, y: 200, w: 340, h: 206 }
    const route = routeOrthogonal({ x: 292, y: 303 }, { x: 361, y: 103 }, [A, B])
    for (let i = 1; i < route.length; i += 1) {
      expect(pierces(route[i - 1], route[i], A), `A 관통: ${JSON.stringify(route)}`).toBe(false)
      expect(pierces(route[i - 1], route[i], B), `B 관통: ${JSON.stringify(route)}`).toBe(false)
    }
    expect(route[0]).toEqual({ x: 292, y: 303 })
    expect(route[route.length - 1]).toEqual({ x: 361, y: 103 })
  })

  it('깊이 겹쳐 앵커가 상대 박스 안에 있으면 폴백(L자)이라도 최소한 유지한다', () => {
    // 완전 겹침 — 다익스트라가 길을 못 찾아도 예외 없이 시작·끝은 보존
    const A = { x: 0, y: 0, w: 340, h: 206 }
    const B = { x: 40, y: 20, w: 340, h: 206 }
    const route = routeOrthogonal({ x: 10, y: 300 }, { x: 100, y: 100 }, [A, B])
    expect(route[0]).toEqual({ x: 10, y: 300 })
    expect(route[route.length - 1]).toEqual({ x: 100, y: 100 })
  })
})

describe('edge-router — 통로 레인 분리(corridorLanes)', () => {
  /** 아래면→위면(수평 통로) 관계 조각 — 앵커 좌표로 레인·범위가 결정된다 */
  const bottomTop = (relId: string, sx: number, tx: number): CorridorEndpoint => ({
    relId,
    source: { x: sx, y: 100 },
    target: { x: tx, y: 200 },
    sourceFace: 'bottom',
    targetFace: 'top',
  })

  it('같은 통로를 쓰는 관계들은 첫 관계의 자연 레인에서 위로 28px씩 벌어진다', () => {
    // 둘 다 자연 레인 150, 이동 범위가 겹친다 → 먼저 배정된 a가 150을 유지하고 b가 위로 178
    const lanes = corridorLanes([bottomTop('a', 0, 40), bottomTop('b', 20, 60)])
    expect(lanes.get('a')).toBe(150)
    expect(lanes.get('b')).toBe(178)
  })

  it('이동 범위가 겹치지 않으면 같은 레인이라도 벌리지 않는다', () => {
    const lanes = corridorLanes([bottomTop('a', 0, 40), bottomTop('b', 500, 540)])
    expect(lanes.has('a')).toBe(false)
    expect(lanes.has('b')).toBe(false)
  })

  it('세 관계가 한 통로를 쓰면 자연 레인부터 28px씩 펴진다', () => {
    const lanes = corridorLanes([bottomTop('a', 0, 40), bottomTop('b', 10, 50), bottomTop('c', 20, 60)])
    expect(lanes.get('a')).toBe(150)
    expect(lanes.get('b')).toBe(178)
    expect(lanes.get('c')).toBe(206)
  })

  it('마주 보지 않는 면은 배정 대상이 아니다', () => {
    const lanes = corridorLanes([
      { relId: 'a', source: { x: 0, y: 100 }, target: { x: 100, y: 300 }, sourceFace: 'right', targetFace: 'top' },
    ])
    expect(lanes.size).toBe(0)
  })

  it('같은 (부모 테이블, 면)에 붙는 관계들은 자연 레인이 달라도 묶는다 — 레인을 받아 수렴을 막는다', () => {
    // 자연 레인 150과 250 — 근접도·범위 겹침 조건은 아니지만 장애물 회피 라우팅이
    // 같은 부모 면 앞으로 수렴하므로 면 키로 묶는다. 배정은 각자의 자연 레인을
    // 그대로 쓴다(포개지지 않으니 밀 필요가 없다)
    const e = (relId: string, sy: number, ty: number): CorridorEndpoint => ({
      relId,
      source: { x: 40, y: sy },
      target: { x: 40, y: ty },
      sourceFace: 'top',
      targetFace: 'bottom',
      sourceTableId: `child-${relId}`,
      targetTableId: 'P',
    })
    const lanes = corridorLanes([e('a', 200, 100), e('b', 300, 200)])
    expect(lanes.get('a')).toBe(150)
    expect(lanes.get('b')).toBe(250)
  })

  it('같은 면이라도 이동 범위가 스치는 장애물이 다르면 각자의 통로에 놓인다 — 좁은 통로로 전원이 몰리지 않는다', () => {
    // 모델 17 sensor_types 사례 재현 — 부모 P 아래 면에 4개 관계가 붙는다. 왼쪽 2개(a·b)는
    // 통로 중간에 끼어든 이웃 테이블 S를 스치는 좁은 구간(204~216)만 쓸 수 있고, 오른쪽
    // 2개(c·d)는 S를 스치지 않아 넓은 구간(80~220)의 자연 레인 부근에 놓인다. 클러스터
    // 전체를 한 구간에 등간격으로 묶으면 4개 전원이 좁은 구간으로 몰려 12px까지 압축된다
    const P: RouterBox = { x: 0, y: 0, w: 800, h: 60 } // 부모 — 아래 면 y=60
    const S: RouterBox = { x: 100, y: 120, w: 160, h: 60 } // 왼쪽 통로에 끼어든 이웃 테이블
    const row: RouterBox = { x: 0, y: 240, w: 800, h: 60 } // 자식 행 — 윗면 y=240
    const child = (relId: string, x: number): CorridorEndpoint => ({
      relId,
      source: { x, y: 240 },
      target: { x, y: 60 },
      sourceFace: 'top',
      targetFace: 'bottom',
      sourceTableId: `child-${relId}`,
      targetTableId: 'P',
    })
    const lanes = corridorLanes([child('a', 140), child('b', 180), child('c', 500), child('d', 540)], [P, S, row])
    // S를 스치는 a·b는 S 아래 좁은 구간(204~216)에 최소 간격으로 놓인다
    expect(lanes.get('a')).toBe(204)
    expect(lanes.get('b')).toBe(216)
    // 스치지 않는 c·d는 자연 레인(150)부터 28px 간격 — 좁은 구간과 30px 이상 떨어진다
    expect(lanes.get('c')).toBe(150)
    expect(lanes.get('d')).toBe(178)
    expect(Math.abs(lanes.get('c')! - lanes.get('a')!)).toBeGreaterThanOrEqual(28)
  })

  it('통로가 좁으면 등간격을 압축해서라도 통로 안에 넣는다', () => {
    // 부모 행(바닥 60)과 자식 행(천장 168) 사이 통로(레인 여유 24px를 빼면 60px)에 6개 레인 —
    // 28px 등간격(140px)은 안 들어가므로 최소 12px까지 압축한다. 그래도 못 들어가면 그 관계만 레인을 잃는다
    const obstacles: RouterBox[] = [
      { x: 0, y: 0, w: 900, h: 60 },
      { x: 0, y: 168, w: 900, h: 120 },
    ]
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const reqs = ids.map((relId, i): CorridorEndpoint => ({
      relId,
      source: { x: 100 + i * 120, y: 168 },
      target: { x: 100 + i * 120, y: 60 },
      sourceFace: 'top',
      targetFace: 'bottom',
      sourceTableId: `child-${relId}`,
      targetTableId: 'P',
    }))
    const lanes = corridorLanes(reqs, obstacles)
    const values = ids.map((k) => lanes.get(k)!)
    const sorted = [...values].sort((x, y) => x - y)
    expect(sorted[0]).toBeGreaterThanOrEqual(84)
    expect(sorted[sorted.length - 1]).toBeLessThanOrEqual(144)
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(12)
      expect(sorted[i] - sorted[i - 1]).toBeLessThanOrEqual(28)
    }
  })
})

describe('edge-router — 문서 전체 순차 라우팅(sharedRoutes)', () => {
  /** 두 경로의 평행 이동 선분이 같은 라인에 12px 이상 포개지는지 — 진단 스크립트와 같은 판정 */
  function parallelOverlap(a: RouterPoint2[], b: RouterPoint2[]): boolean {
    for (let i = 1; i < a.length; i += 1) {
      for (let j = 1; j < b.length; j += 1) {
        const p1 = a[i - 1]
        const p2 = a[i]
        const q1 = b[j - 1]
        const q2 = b[j]
        if (
          Math.abs(p1.y - p2.y) < 0.5 && Math.abs(q1.y - q2.y) < 0.5 && Math.abs(p1.y - q1.y) < 6
          && Math.min(p2.x, q2.x) - Math.max(p1.x, q1.x) >= 12
        ) return true
        if (
          Math.abs(p1.x - p2.x) < 0.5 && Math.abs(q1.x - q2.x) < 0.5 && Math.abs(p1.x - q1.x) < 6
          && Math.min(p2.y, q2.y) - Math.max(p1.y, q1.y) >= 12
        ) return true
      }
    }
    return false
  }

  it('레인을 쓰지 못해 폴백한 관계들은 먼저 그린 선의 통로를 피해 간다', () => {
    // 부모(P)와 자식들(C1·C2) 사이를 테이블 M이 전폭으로 막은 배치 — 두 관계 모두
    // 레인 3점 경로가 막혀 다익스트라 폴백이 되고, 폴백들은 M 왼쪽(-24) 통로로 수렴한다.
    // 순차 라우팅이 나중 관계를 오른쪽 통로로 보내 포개짐을 피한다
    const obstacles: RouterBox[] = [
      { x: 0, y: 0, w: 300, h: 60 }, // P
      { x: 0, y: 100, w: 300, h: 160 }, // M — 레인 접근을 막는 장애물
      { x: 20, y: 300, w: 100, h: 60 }, // C1
      { x: 60, y: 300, w: 100, h: 60 }, // C2
    ]
    const reqs: CorridorEndpoint[] = [
      { relId: 'a', source: { x: 70, y: 284 }, target: { x: 136, y: 76 }, sourceFace: 'top', targetFace: 'bottom', sourceTableId: 'c1', targetTableId: 'P' },
      { relId: 'b', source: { x: 110, y: 284 }, target: { x: 164, y: 76 }, sourceFace: 'top', targetFace: 'bottom', sourceTableId: 'c2', targetTableId: 'P' },
    ]
    const routes = sharedRoutes(reqs, obstacles)
    const a = routes.get('a')!
    const b = routes.get('b')!
    // 두 경로 모두 장애물을 관통하지 않는다
    for (const route of [a, b]) {
      for (let i = 1; i < route.length; i += 1) {
        for (const box of obstacles) {
          expect(pierces(route[i - 1], route[i], box)).toBe(false)
        }
      }
    }
    // 평행 이동 선분이 같은 라인에 포개지지 않는다
    expect(parallelOverlap(a, b)).toBe(false)
  })

  it('같은 입력은 캐시로 같은 결과(Map 참조)를 돌려준다', () => {
    const reqs: CorridorEndpoint[] = [
      { relId: 'a', source: { x: 70, y: 284 }, target: { x: 136, y: 76 }, sourceFace: 'top', targetFace: 'bottom', sourceTableId: 'c1', targetTableId: 'P' },
    ]
    const obstacles: RouterBox[] = [{ x: 0, y: 0, w: 300, h: 60 }]
    expect(sharedRoutes(reqs, obstacles)).toBe(sharedRoutes(reqs, obstacles))
  })
})

describe('edge-router — 강제 통로 레인(routeWithNormalStubs lane)', () => {
  it('lane을 주면 중간 수평 구간이 그 레인을 지난다', () => {
    const obstacles: RouterBox[] = [
      { x: 0, y: 0, w: 100, h: 60 },
      { x: 100, y: 300, w: 100, h: 60 },
    ]
    const points = routeWithNormalStubs(
      { x: 50, y: 60 },
      { x: 150, y: 300 },
      'bottom',
      'top',
      obstacles,
      { lane: 180 },
    )
    expect(points.some((p) => p.y === 180)).toBe(true)
  })

  it('레인 경로가 장애물에 막히면 기존 라우팅으로 돌아간다 — 시작·끝은 그대로', () => {
    const obstacles: RouterBox[] = [
      { x: 0, y: 0, w: 100, h: 60 },
      { x: 100, y: 300, w: 100, h: 60 },
      { x: 80, y: 160, w: 120, h: 40 }, // 레인 180을 가로막는 테이블
    ]
    const points = routeWithNormalStubs(
      { x: 50, y: 60 },
      { x: 150, y: 300 },
      'bottom',
      'top',
      obstacles,
      { lane: 180 },
    )
    expect(points[0]).toEqual({ x: 50, y: 60 })
    expect(points[points.length - 1]).toEqual({ x: 150, y: 300 })
  })
})
