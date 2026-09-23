/** 주제 영역 헬퍼 — 이름 유일화·멤버 조회·숨김 집합·표시 집합 (05-editor/02-ui.md §6) */
import { describe, expect, it } from 'vitest'

import { createArea, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import {
  AREA_MIN_HEIGHT,
  AREA_MIN_WIDTH,
  fitAreaToMembers,
  tablesOfArea,
  uniqueAreaName,
  visibleTableIds,
  hiddenTableIds,
} from '@/features/editor/model/areas'

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

describe('hiddenTableIds', () => {
  it('접힌 영역의 멤버만 숨긴다 — 펼친 영역·비멤버는 그대로', () => {
    const d = docWithArea({ collapsed: true })
    expect(hiddenTableIds(d)).toEqual(new Set(['T-USERS']))
    expect(hiddenTableIds(docWithArea())).toEqual(new Set())
  })

  it('여러 영역에 걸친 멤버는 어느 하나라도 접혀 있으면 숨겨진다', () => {
    const base = docWithArea()
    const second = createArea('결제', { id: 'A2', tableIds: ['T-USERS', 'T-LOGS'], collapsed: true })
    const d = { ...base, diagram: { ...base.diagram, areas: [...base.diagram.areas, second] } }
    expect(hiddenTableIds(d)).toEqual(new Set(['T-USERS', 'T-LOGS']))
  })
})

describe('visibleTableIds — 캔버스 표시 집합(영역 필터 ∩ 접힘 제외)', () => {
  it('필터 없음(전체 보기): 접힌 영역의 멤버만 제외한다', () => {
    const collapsed = docWithArea({ collapsed: true })
    expect(visibleTableIds(collapsed, null)).toEqual(new Set(['T-LOGS']))
    expect(visibleTableIds(docWithArea(), null)).toEqual(new Set(['T-USERS', 'T-LOGS']))
  })

  it('영역 필터: 그 영역의 멤버 중 접히지 않은 것만 — 캔버스·엣지·익스플로러가 공유하는 식', () => {
    expect(visibleTableIds(docWithArea(), 'A1')).toEqual(new Set(['T-USERS']))
    // 필터로 선택한 영역 자체가 접혀 있으면 멤버 전부가 숨겨진다(접기=멤버 숨김)
    expect(visibleTableIds(docWithArea({ collapsed: true }), 'A1')).toEqual(new Set())
  })
})

describe('fitAreaToMembers — 멤버십 변경 시 영역이 멤버를 감싼다 (v1.13)', () => {
  /** T-USERS(100,200)·T-LOGS(600,400) 컬럼 0개 — 렌더 추정 크기 370×112 (contentBounds 폴백과 같은 식) */
  function docWithLayouts(): EditorDocument {
    const base = docWithArea()
    return {
      ...base,
      diagram: {
        ...base.diagram,
        nodes: {
          'T-USERS': { x: 100, y: 200, width: null, color: 'default' },
          'T-LOGS': { x: 600, y: 400, width: null, color: 'default' },
        },
      },
    }
  }

  it('멤버 bbox를 사방 패딩으로 감싸고 위쪽엔 헤더 여유를 더한다', () => {
    // bbox (100,200)→(970,512): x=100-28, y=200-28-48, w=870+56, h=312+56+48
    expect(fitAreaToMembers(docWithLayouts(), ['T-USERS', 'T-LOGS'])).toEqual({
      x: 72,
      y: 124,
      width: 926,
      height: 416,
    })
  })

  it('단일 멤버도 감싼다 — 최소 크기(240×160)보다 작아지지 않는다', () => {
    const fit = fitAreaToMembers(docWithLayouts(), ['T-USERS'])
    expect(fit).not.toBeNull()
    expect(fit!.width).toBeGreaterThanOrEqual(AREA_MIN_WIDTH)
    expect(fit!.height).toBeGreaterThanOrEqual(AREA_MIN_HEIGHT)
  })

  it('감쌀 멤버가 없으면 null — 호출자가 기존 경계를 유지한다(멤버 전부 해제 케이스)', () => {
    expect(fitAreaToMembers(docWithLayouts(), [])).toBeNull()
    // 죽은 id·레이아웃 없는 id만으로도 null
    expect(fitAreaToMembers(docWithLayouts(), ['T-GONE'])).toBeNull()
    expect(fitAreaToMembers(docWithArea(), ['T-USERS'])).toBeNull()
  })
})
