import { afterEach, describe, expect, it } from 'vitest'
import { setIncrementalRouting, sharedRoutes, type CorridorEndpoint, type RouterBox } from '../canvas/edge-router'

/** 드래그 중 증분 라우팅(v1.37) — 바뀐 관계선만 다시 계산하고 나머지는 드래그 시작 때 경로를 그대로 쓴다 */
const boxes: RouterBox[] = [
  { x: 0, y: 0, w: 200, h: 120 },
  { x: 500, y: 0, w: 200, h: 120 },
  { x: 0, y: 400, w: 200, h: 120 },
  { x: 500, y: 400, w: 200, h: 120 },
]
const req = (relId: string, s: RouterBox, t: RouterBox): CorridorEndpoint => ({
  relId,
  source: { x: s.x + s.w + 20, y: s.y + s.h / 2 },
  target: { x: t.x - 20, y: t.y + t.h / 2 },
  sourceFace: 'right',
  targetFace: 'left',
  sourceTableId: relId + 's',
  targetTableId: relId + 't',
})

describe('증분 라우팅', () => {
  afterEach(() => setIncrementalRouting(false))

  it('끝점이 그대로이고 움직인 박스를 지나지 않는 관계선은 이전 경로 객체를 그대로 쓴다', () => {
    const top = req('a', boxes[0], boxes[1])
    const bottom = req('b', boxes[2], boxes[3])
    const full = sharedRoutes([top, bottom], boxes)
    setIncrementalRouting(true)
    // 오른쪽 아래 테이블을 아래로 옮긴다 — b의 도착점이 바뀐다
    const moved = { ...boxes[3], y: 600 }
    const bottomMoved = req('b', boxes[2], moved)
    const next = sharedRoutes([top, bottomMoved], [boxes[0], boxes[1], boxes[2], moved])
    expect(next.get('a')).toBe(full.get('a'))
    expect(next.get('b')).not.toEqual(full.get('b'))
    const end = next.get('b')!.at(-1)!
    expect(end).toEqual(bottomMoved.target)
  })

  it('움직인 박스가 가로막은 관계선은 다시 계산한다', () => {
    const top = req('a', boxes[0], boxes[1])
    const full = sharedRoutes([top], boxes)
    setIncrementalRouting(true)
    // 아래 왼쪽 테이블을 두 테이블 사이 통로로 끌어올린다
    const blocker = { x: 290, y: 0, w: 120, h: 120 }
    const next = sharedRoutes([top], [boxes[0], boxes[1], blocker, boxes[3]])
    expect(next.get('a')).not.toBe(full.get('a'))
    const points = next.get('a')!
    const crosses = points.some((p, i) => {
      if (i === 0) return false
      const a = points[i - 1]
      return Math.max(a.x, p.x) > blocker.x && Math.min(a.x, p.x) < blocker.x + blocker.w &&
        Math.max(a.y, p.y) > blocker.y && Math.min(a.y, p.y) < blocker.y + blocker.h
    })
    expect(crosses).toBe(false)
  })
})
