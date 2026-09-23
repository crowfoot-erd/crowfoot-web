/** 주제 영역(그룹) 헬퍼 — 이름 유일화·멤버 조회·표시 집합·색 고정 (05-editor/02-ui.md §6) */
import { describe, expect, it } from 'vitest'

import { createArea, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { groupColorOf, tablesOfArea, uniqueAreaName, visibleTableIds } from '@/features/editor/model/areas'

function doc(): EditorDocument {
  return { model: emptyContent().model, diagram: emptyContent().diagram }
}

function docWithArea(areaOverrides: Partial<ReturnType<typeof createArea>> = {}): EditorDocument {
  const table = createTable('users', { id: 'T-USERS' })
  const other = createTable('logs', { id: 'T-LOGS' })
  const area = createArea('회원', { id: 'A1', tableIds: ['T-USERS'], ...areaOverrides })
  return {
    model: { tables: [table, other], relationships: [] },
    diagram: { nodes: {}, notes: [], areas: [area], viewport: null },
  }
}

describe('uniqueAreaName', () => {
  it('기본명이 비어 있으면 그대로, 겹치면 접미 N을 붙인다', () => {
    expect(uniqueAreaName(doc(), '영역')).toBe('영역')
    const taken = docWithArea({ name: '영역' })
    expect(uniqueAreaName(taken, '영역')).toBe('영역 2')
    expect(uniqueAreaName({ ...taken, diagram: { ...taken.diagram, areas: [
      createArea('영역'), createArea('영역 2'), createArea('영역 3'),
    ] } }, '영역')).toBe('영역 4')
  })
})

describe('tablesOfArea', () => {
  it('살아 있는 멤버만 반환한다 — 삭제된 테이블 id는 문서에 남아 있어도 걸러진다', () => {
    const d = {
      ...docWithArea({ tableIds: ['T-USERS', 'T-GONE'] }),
    }
    expect(tablesOfArea(d, 'A1')).toEqual(new Set(['T-USERS']))
    expect(tablesOfArea(d, '없는-영역')).toEqual(new Set())
  })
})

describe('visibleTableIds — 캔버스 표시 집합(영역 필터)', () => {
  it('필터 없음(전체 보기): 문서의 테이블 전체다', () => {
    expect(visibleTableIds(docWithArea(), null)).toEqual(new Set(['T-USERS', 'T-LOGS']))
  })

  it('영역 필터: 그 영역의 살아 있는 멤버만 — 캔버스·엣지·익스플로러가 공유하는 식', () => {
    expect(visibleTableIds(docWithArea(), 'A1')).toEqual(new Set(['T-USERS']))
    expect(visibleTableIds(docWithArea({ tableIds: ['T-USERS', 'T-GONE'] }), 'A1')).toEqual(new Set(['T-USERS']))
    expect(visibleTableIds(docWithArea(), '없는-영역')).toEqual(new Set())
  })
})

describe('groupColorOf — 그룹 색이 멤버 테이블 렌더 색을 고정한다', () => {
  it('소속 그룹의 색을 반환한다 — 미소속이면 null(개별 색 폴백)', () => {
    const d = docWithArea({ color: 'sky' })
    expect(groupColorOf(d, 'T-USERS')).toBe('sky')
    expect(groupColorOf(d, 'T-LOGS')).toBeNull()
  })

  it('그룹 색이 default면 null — 개별 색이 살아난다', () => {
    expect(groupColorOf(docWithArea(), 'T-USERS')).toBeNull()
  })

  it('다중 소속이면 문서 순서 첫 번째 그룹의 색을 쓴다', () => {
    const base = docWithArea({ color: 'sky', tableIds: ['T-USERS'] })
    const second = createArea('결제', { id: 'A2', color: 'red', tableIds: ['T-USERS'] })
    const d = { ...base, diagram: { ...base.diagram, areas: [...base.diagram.areas, second] } }
    expect(groupColorOf(d, 'T-USERS')).toBe('sky')
    // 첫 그룹이 무색이면 폴백(다음 그룹 색을 따라가지 않는다 — 첫 소속이 원천)
    const uncoloredFirst = { ...base, diagram: { ...base.diagram, areas: [createArea('무색', { id: 'A0', tableIds: ['T-USERS'] }), ...base.diagram.areas, second] } }
    expect(groupColorOf(uncoloredFirst, 'T-USERS')).toBeNull()
  })
})
