import { describe, expect, it } from 'vitest'

import type { EditorDocument } from '@/features/editor/model/content-schema'
import {
  NOTE_OVERLAP_GAP,
  objectRects,
  placeNoteFree,
  rectsOverlap,
  type ObjectRect,
} from '@/features/editor/model/note-overlap'

const rect = (id: string, x: number, y: number, w: number, h: number, kind: 'table' | 'note' = 'table'): ObjectRect => ({
  id, kind, x, y, w, h,
})

describe('note-overlap — 메모 겹침 해소', () => {
  it('빈 자리에 놓으면 좌표를 그대로 돌려준다', () => {
    // 테이블(0,0 300×200) 오른쪽 옆 — x가 안 겹치므로 그대로
    const free = placeNoteFree({ x: 350, y: 100, w: 360, h: 120 }, [rect('t1', 0, 0, 300, 200)])
    expect(free).toEqual({ x: 350, y: 100 })
  })

  it('테이블과 겹치면 오른쪽/아래 중 이동량이 작은 쪽으로 밀려난다 — 최소 간격(NOTE_OVERLAP_GAP) 유지', () => {
    // 메모(360×120)가 테이블(300×200) 오른쪽 절반에 걸쳐 있다 — 아래로 피하는 게 더 가깝다
    const pushed = placeNoteFree({ x: 200, y: 150, w: 360, h: 120 }, [rect('t1', 0, 0, 300, 200)])
    expect(pushed.y).toBe(200 + NOTE_OVERLAP_GAP)
    expect(pushed.x).toBe(200)
    // 밀려난 자리가 실제로 비었는지 — 간격까지 포함해 겹침 없음
    expect(rectsOverlap(rect('n', pushed.x, pushed.y, 360, 120, 'note'), rect('t1', 0, 0, 300, 200))).toBe(false)
  })

  it('완전히 포개진 메모(같은 좌표 생성)는 이동량이 작은 아래로 빠져나간다', () => {
    // pushX = 300+32-0 = 332, pushY = 200+32-0 = 232 — 아래가 더 가깝다
    const pushed = placeNoteFree({ x: 0, y: 0, w: 360, h: 120 }, [rect('t1', 0, 0, 300, 200)])
    expect(pushed).toEqual({ x: 0, y: 200 + NOTE_OVERLAP_GAP })
  })

  it('장애물이 연쇄돼도 수렴한다 — 아래로 피한 자리에 다른 메모가 있으면 다시 피한다', () => {
    const obstacles = [
      rect('t1', 0, 0, 300, 200),                    // 테이블
      rect('n1', 0, 232, 360, 120, 'note'),          // 테이블 바로 아래 메모(간격 12 아님 — 밀림 확인용)
    ]
    const pushed = placeNoteFree({ x: 0, y: 100, w: 360, h: 120 }, obstacles)
    for (const o of obstacles) {
      expect(rectsOverlap(rect('n', pushed.x, pushed.y, 360, 120, 'note'), o)).toBe(false)
    }
    expect(pushed.y).toBeGreaterThan(232) // n1 아래로 내려가거나
  })

  it('objectRects — 테이블(실측 우선) 다음 메모(폭 저장값·높이 추정) 문서 순서', () => {
    const doc = {
      schemaVersion: 1,
      model: {
        tables: [{
          id: 't1', logicalName: '회원', physicalName: 'member', comment: null,
          columns: [], primaryKey: null, uniques: [], indexes: [],
        }],
        relationships: [],
      },
      diagram: {
        nodes: { t1: { x: 10, y: 20, width: null } },
        notes: [{ id: 'n1', x: 400, y: 500, width: 240, text: '', title: '', color: 'yellow', linkedTableId: null }],
        viewport: null,
      },
    } as unknown as EditorDocument
    const rects = objectRects(doc, { t1: { w: 340, h: 253 } })
    expect(rects).toEqual([
      { id: 't1', kind: 'table', x: 10, y: 20, w: 340, h: 253 }, // 실측 크기 우선
      { id: 'n1', kind: 'note', x: 400, y: 500, w: 240, h: 120 }, // 폭 저장값·높이 추정
    ])
  })
})
