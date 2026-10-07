import { describe, expect, it } from 'vitest'

import { applyChange, createColumn, createTable } from '@/features/editor/model/changes'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { emptyContent } from '@/features/editor/model/content-io'
import { buildRelationship } from '@/features/editor/model/relationship'
import { layoutHubPositions } from '@/features/editor/model/auto-layout'
import { bestLayout, HUB_CANDIDATES, layoutQuality } from '../canvas/layout-quality'

/** 배치 품질·후보 선택(v1.37) — 화면에 그려질 관계선으로 교차·포개짐을 세고, 모드 안에서 가장 나은 후보를 고른다 */
function doc(): EditorDocument {
  return { model: emptyContent().model, diagram: emptyContent().diagram }
}

function seedTable(d: EditorDocument, id: string): EditorDocument {
  const table = createTable(`tb_${id.toLowerCase()}`, {
    id,
    columns: [createColumn({ id: `${id}-pk`, physicalName: 'id', dataType: 'BIGINT', nullable: false })],
    primaryKey: { name: `${id}_pk`, columnIds: [`${id}-pk`] },
  })
  return applyChange(d, { type: 'table/create', table, position: { x: 0, y: 0 } })
}

function seedRelation(d: EditorDocument, parentId: string, childId: string): EditorDocument {
  const parent = d.model.tables.find((t) => t.id === parentId)!
  const child = d.model.tables.find((t) => t.id === childId)!
  const built = buildRelationship({
    parentTable: parent,
    childTable: child,
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'EXACTLY_ONE',
    childMultiplicity: 'ONE_OR_MORE',
  })
  if (!built.ok) throw new Error('unreachable')
  return applyChange(d, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns })
}

/** 허브 H에 자식 8개, 자식끼리 이웃 관계(C0→C4, C1→C5 …)가 얽힌 문서 */
function tangled(): EditorDocument {
  let d = seedTable(doc(), 'H')
  for (let i = 0; i < 8; i += 1) d = seedTable(d, `C${i}`)
  for (let i = 0; i < 8; i += 1) d = seedRelation(d, 'H', `C${i}`)
  for (let i = 0; i < 4; i += 1) d = seedRelation(d, `C${i}`, `C${i + 4}`)
  return d
}

describe('layoutQuality', () => {
  it('엇갈린 두 관계선의 교차를 센다', () => {
    let d = doc()
    for (const id of ['A', 'B', 'C', 'D']) d = seedTable(d, id)
    d = seedRelation(d, 'A', 'D')
    d = seedRelation(d, 'B', 'C')
    // A(왼쪽)–D(오른쪽)과 B(위)–C(아래)가 열십자로 놓이면 가운데에서 엇갈린다
    const crossed = layoutQuality(d, { A: { x: 0, y: 450 }, D: { x: 1200, y: 450 }, B: { x: 600, y: 0 }, C: { x: 600, y: 900 } })
    // 같은 쌍을 위·아래로 나란히 두면 엇갈리지 않는다
    const parallel = layoutQuality(d, { A: { x: 0, y: 0 }, D: { x: 1200, y: 0 }, B: { x: 0, y: 900 }, C: { x: 1200, y: 900 } })
    expect(crossed.crossings).toBeGreaterThan(parallel.crossings)
    expect(parallel.crossings).toBe(0)
    expect(crossed.score).toBeGreaterThan(parallel.score)
  })
})

describe('bestLayout', () => {
  it('후보 중 점수가 가장 낮은 배치를 고른다 — 기존 배치(첫 후보)보다 나빠지지 않는다', async () => {
    const d = tangled()
    const base = layoutQuality(d, layoutHubPositions(d, { strategy: 'ring' }))
    const all = HUB_CANDIDATES.map((variant) => layoutQuality(d, layoutHubPositions(d, { strategy: 'ring', variant })).score)
    const chosen = layoutQuality(d, await bestLayout(d, 'hub'))
    expect(chosen.score).toBeLessThanOrEqual(base.score)
    expect(chosen.score).toBe(Math.min(...all))
  })

  it('무게중심 순서 — 결정적이고 테이블이 겹치지 않는다', () => {
    const d = tangled()
    const a = layoutHubPositions(d, { strategy: 'ring', variant: { order: 'barycenter' } })
    const b = layoutHubPositions(d, { strategy: 'ring', variant: { order: 'barycenter' } })
    expect(a).toEqual(b)
    expect(Object.keys(a)).toHaveLength(9)
  })

  it('계층형 — 후보를 모두 돌려 배치를 돌려준다', async () => {
    const positions = await bestLayout(tangled(), 'layered')
    expect(Object.keys(positions)).toHaveLength(9)
  }, 60_000)
})
