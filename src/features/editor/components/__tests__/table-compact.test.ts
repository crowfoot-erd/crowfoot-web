import { describe, expect, it } from 'vitest'

import { TABLE_COMPACT_ZOOM, compactLabelFontSize } from '@/features/editor/components/canvas/TableNode'

describe('TableNode — 축소(줌아웃) 렌더', () => {
  it('임계 배율은 컬럼이 읽히지 않는 수준(0.5) — 이보다 작으면 축소 렌더', () => {
    // 축소 렌더 조건: transform[2] < TABLE_COMPACT_ZOOM (TableNode 내부 selector)
    expect(TABLE_COMPACT_ZOOM).toBe(0.5)
    expect(0.4 < TABLE_COMPACT_ZOOM).toBe(true)
    expect(0.6 < TABLE_COMPACT_ZOOM).toBe(false)
  })

  it('라벨 폰트(플로우 px)는 화면 목표 ÷ 배율 — 줌아웃해도 화면 크기가 유지된다', () => {
    // 화면 크기 = 플로우 폰트 × 배율이 목표와 같아야 한다
    for (const zoom of [0.5, 0.4, 0.3]) {
      expect(compactLabelFontSize(13, zoom) * zoom).toBeCloseTo(13)
    }
  })

  it('하한 배율(0.3) 아래에서는 폰트가 더 자라지 않는다 — 라벨이 상자보다 커지지 않게', () => {
    expect(compactLabelFontSize(13, 0.3)).toBeCloseTo(13 / 0.3)
    expect(compactLabelFontSize(13, 0.1)).toBeCloseTo(13 / 0.3)
    expect(compactLabelFontSize(11, 0.2)).toBeCloseTo(11 / 0.3)
  })
})
