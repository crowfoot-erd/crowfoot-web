import { describe, expect, it } from 'vitest'

import type { ErdRelationship, ErdTable } from '@/features/editor/model/content-schema'
import { relationshipSharedRoutes } from '../canvas/edge-route-table'
import type { RouterBox } from '../canvas/edge-router'

/** 최소 관계 — 라우팅은 id·양 끝 테이블·기수(글리프 폭)만 본다 */
function rel(id: string, parentTableId: string, childTableId: string): ErdRelationship {
  return {
    id,
    name: id,
    parentTableId,
    childTableId,
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'EXACTLY_ONE',
    childMultiplicity: 'ZERO_OR_MORE',
    fkName: id,
    columnMappings: [],
    onDelete: 'NO_ACTION',
    onUpdate: 'NO_ACTION',
  }
}

/** 테이블 배치 → boxOf 팩토리 (라우팅 테이블은 boxOf로 좌표를 받는다) */
function boxOfOf(boxes: Record<string, RouterBox>) {
  return (tableId: string): RouterBox | null => boxes[tableId] ?? null
}

describe('edge-route-table — 면 분산 앵커 순서(연결 대상 위치 기준)', () => {
  it('부모 하단 면에 자식 3개가 좌·중·우로 붙으면 앵커도 좌→우 순으로 벌어진다', () => {
    // 부모 P(상단) 아래 자식 L·C·R이 좌·중·우로 늘어선 배치 — 하단 면 앵커 순서가
    // 자식 위치와 같아야 선이 부채꼴로 펴지고 교차하지 않는다(거리 순서와는 다르다)
    const boxes: Record<string, RouterBox> = {
      P: { x: 250, y: 0, w: 600, h: 200 },
      L: { x: 320, y: 500, w: 150, h: 150 },
      C: { x: 475, y: 500, w: 150, h: 150 },
      R: { x: 630, y: 500, w: 150, h: 150 },
    }
    const relationships = [rel('r-l', 'P', 'L'), rel('r-c', 'P', 'C'), rel('r-r', 'P', 'R')]
    const tables = Object.keys(boxes).map((id) => ({ id }) as ErdTable)

    const { routes } = relationshipSharedRoutes({}, 'sig-1', tables, relationships, boxOfOf(boxes))

    // 부모(P) 끝 오프셋 — 왼쪽 자식이 음수(면의 왼쪽), 오른쪽 자식이 양수
    expect(routes.get('r-l')!.targetFaceOffset).toBe(-48)
    expect(routes.get('r-c')!.targetFaceOffset).toBe(0)
    expect(routes.get('r-r')!.targetFaceOffset).toBe(48)
    // 각 자식의 상단 면은 혼자라 분산 없음
    for (const id of ['r-l', 'r-c', 'r-r']) expect(routes.get(id)!.sourceFaceOffset).toBe(0)
  })

  it('면 분산은 좌표 순서뿐 아니라 끝점 앵커도 반영한다 — 하단 면 앵커 x가 대상 x 순으로', () => {
    // 앵커 좌표까지 확인: P 하단 면 중심 x=550, 오프셋 ±48이 각 자식 방향으로 이동한다
    const boxes: Record<string, RouterBox> = {
      P: { x: 250, y: 0, w: 600, h: 200 },
      L: { x: 320, y: 500, w: 150, h: 150 },
      R: { x: 630, y: 500, w: 150, h: 150 },
    }
    const relationships = [rel('r-l', 'P', 'L'), rel('r-r', 'P', 'R')]
    const tables = Object.keys(boxes).map((id) => ({ id }) as ErdTable)

    const { routes } = relationshipSharedRoutes({}, 'sig-2', tables, relationships, boxOfOf(boxes))

    // 라우팅 앵커는 글리프 폭만큼 면 바깥으로 밀리지만 x(면 따라 좌표)는 중심+오프셋을 유지한다.
    // 관계 2개는 간격의 절반씩(±24) 벌어진다
    const lAnchor = routes.get('r-l')!.points.at(-1)!
    const rAnchor = routes.get('r-r')!.points.at(-1)!
    expect(lAnchor.x).toBe(550 - 24) // 왼쪽 자식 — 면 중심보다 왼쪽
    expect(rAnchor.x).toBe(550 + 24) // 오른쪽 자식 — 면 중심보다 오른쪽
    expect(lAnchor.y).toBeGreaterThan(200) // 하단 면 아래(법선 밀기)
  })

  it('같은 문서·지문이면 캐시된 결과를 재사용한다', () => {
    const boxes: Record<string, RouterBox> = {
      P: { x: 0, y: 0, w: 300, h: 200 },
      L: { x: 0, y: 400, w: 300, h: 150 },
    }
    const doc = {}
    const relationships = [rel('r-1', 'P', 'L')]
    const tables = Object.keys(boxes).map((id) => ({ id }) as ErdTable)
    const first = relationshipSharedRoutes(doc, 'sig-cache', tables, relationships, boxOfOf(boxes))
    const second = relationshipSharedRoutes(doc, 'sig-cache', tables, relationships, boxOfOf(boxes))
    expect(second).toBe(first) // 같은 객체 — 재계산 없음
  })
})

describe('edge-route-table — 면 부하(faceLoad — 자기 참조 루프 좌우 선택 근거)', () => {
  it('테이블별 면에 붙은 관계 끝 수를 센다 — 자기 참조는 제외', () => {
    // S 왼쪽에 부모 2개, 오른쪽에 자식 1개 — S의 faceLoad는 left 2·right 1
    const boxes: Record<string, RouterBox> = {
      S: { x: 300, y: 200, w: 200, h: 150 },
      A: { x: 0, y: 150, w: 200, h: 150 },
      B: { x: 0, y: 350, w: 200, h: 150 },
      C: { x: 700, y: 200, w: 200, h: 150 },
    }
    const relationships = [
      rel('r-a', 'A', 'S'), // S의 왼쪽 면
      rel('r-b', 'B', 'S'), // S의 왼쪽 면
      rel('r-c', 'S', 'C'), // S의 오른쪽 면
      rel('r-self', 'S', 'S'), // 자기 참조 — 면 부하에서 제외
    ]
    const tables = Object.keys(boxes).map((id) => ({ id }) as ErdTable)

    const { faceLoad } = relationshipSharedRoutes({}, 'sig-load', tables, relationships, boxOfOf(boxes))

    // 4면 분산(v1.37) — 왼쪽 아래의 B는 A와 왼쪽 면을 나누지 않고 비어 있는 아래 면으로 붙는다
    expect(faceLoad.get('S')).toEqual({ left: 1, right: 1, top: 0, bottom: 1 })
    expect(faceLoad.get('C')).toEqual({ left: 1, right: 0, top: 0, bottom: 0 })
  })
})

describe('edge-route-table — 4면 분산 연결면(v1.37)', () => {
  it('한 면에 몰리던 관계를 상대 사분면을 향한 다른 면으로 나눈다', () => {
    // 허브 H 아래에 자식 6개가 넓게 늘어서 있다 — 최단 면이면 전부 H의 아래 면에 붙는다
    const boxes: Record<string, RouterBox> = { H: { x: 1000, y: 0, w: 200, h: 150 } }
    const relationships = []
    for (let i = 0; i < 6; i += 1) {
      const id = `C${i}`
      boxes[id] = { x: i * 400, y: 500, w: 200, h: 150 }
      relationships.push(rel(`r-${i}`, 'H', id))
    }
    const tables = Object.keys(boxes).map((id) => ({ id }) as ErdTable)
    const { faceLoad, routes } = relationshipSharedRoutes({}, 'sig-balance', tables, relationships, boxOfOf(boxes))
    const load = faceLoad.get('H')!
    expect(load.bottom).toBeLessThan(6)
    expect(load.left + load.right).toBeGreaterThan(0)
    // 상대를 등진 면은 쓰지 않는다 — 자식은 모두 H보다 아래라 위 면은 비어 있다
    expect(load.top).toBe(0)
    // 왼쪽 자식은 왼쪽 면, 오른쪽 자식은 오른쪽 면으로만 옮겨 간다
    for (const [relId, route] of routes) {
      const i = Number(relId.slice(2))
      if (route.targetFace === 'left') expect(boxes[`C${i}`].x).toBeLessThan(1000)
      if (route.targetFace === 'right') expect(boxes[`C${i}`].x).toBeGreaterThan(1000)
    }
  })
})
