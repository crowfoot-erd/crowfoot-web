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
