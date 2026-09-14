import { describe, expect, it } from 'vitest'

import { NOTE_DROP_HEIGHT, findNoteDropTarget } from '../note-link'

describe('note-link — 메모 드롭 판정', () => {
  const boxes = [
    { id: 'A', box: { x: 0, y: 0, w: 340, h: 206 } },
    { id: 'B', box: { x: 400, y: 200, w: 340, h: 206 } },
  ]

  it('메모 중심점이 테이블 안에 있으면 그 테이블을 반환한다', () => {
    // 메모 (100, 40) 폭 200 → 중심점 (200, 40 + 65) = A 안
    expect(findNoteDropTarget({ x: 100, y: 40, width: 200 }, boxes)).toBe('A')
    // 메모 (450, 250) 폭 200 → 중심점 (550, 315) = B 안
    expect(findNoteDropTarget({ x: 450, y: 250, width: 200 }, boxes)).toBe('B')
  })

  it('중심점이 모든 테이블 밖이면 null을 반환한다', () => {
    // 메모 (100, 300) 폭 200 → 중심점 (200, 365) — A(y 0~206)·B(x 400~) 어디에도 없다
    expect(findNoteDropTarget({ x: 100, y: 300, width: 200 }, boxes)).toBeNull()
  })

  it('메모 좌상단(밴드)만 테이블에 걸쳐도 중심점이 밖이면 지정하지 않는다', () => {
    // 메모 (220, 150) 폭 200 → 중심점 (320, 215) — 밴드는 A 안에 있지만 중심점은 A(y 0~206)·B(x 400~) 어디에도 없다
    expect(findNoteDropTarget({ x: 220, y: 150, width: 200 }, boxes)).toBeNull()
  })

  it('중심점이 여러 테이블에 겹치면 문서 순서상 첫 번째를 반환한다', () => {
    const overlapping = [
      { id: 'FIRST', box: { x: 0, y: 0, w: 400, h: 300 } },
      { id: 'SECOND', box: { x: 0, y: 0, w: 500, h: 400 } },
    ]
    expect(findNoteDropTarget({ x: 100, y: 100, width: 100 }, overlapping)).toBe('FIRST')
  })

  it('판정 높이 추정치는 밴드+본문 규모를 유지한다 — 중심점 오프셋의 기준', () => {
    // 중심점 y = note.y + NOTE_DROP_HEIGHT/2 — 근사값이 극단적으로 커지면 판정이 뒤틀린다
    expect(NOTE_DROP_HEIGHT).toBeGreaterThan(50)
    expect(NOTE_DROP_HEIGHT).toBeLessThan(250)
  })
})
