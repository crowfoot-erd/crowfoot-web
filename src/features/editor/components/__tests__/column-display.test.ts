import { describe, expect, it } from 'vitest'

import { isZoneVisible } from '@/features/editor/components/canvas/TableNode'
import type { ColumnDisplayMode } from '@/features/editor/components/canvas/editor-context'

describe('TableNode — 컬럼 표시 모드(전체/키만)', () => {
  it("기본('all')은 세 영역 모두 표시한다", () => {
    for (const zone of ['pk', 'fk', 'general'] as const) {
      expect(isZoneVisible(zone, 'all')).toBe(true)
    }
  })

  it("'keys'는 일반 컬럼만 접는다 — PK·FK는 유지(UK·IX 영역은 별도라 영향 없음)", () => {
    expect(isZoneVisible('pk', 'keys')).toBe(true)
    expect(isZoneVisible('fk', 'keys')).toBe(true)
    expect(isZoneVisible('general', 'keys')).toBe(false)
  })

  it('보기 모드 값은 전체(all)·키만(keys) 두 가지다', () => {
    const modes: ColumnDisplayMode[] = ['all', 'keys']
    expect(modes).toHaveLength(2)
  })
})
