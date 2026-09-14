import { beforeEach, describe, expect, it } from 'vitest'

import { readStoredViewport, storeViewport, viewportStorageKey } from '../viewport-memory'

describe('viewport-memory — 마지막 화면(줌·팬) 문서별 기억', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('문서별 키로 저장·읽기 — 줌·팬 종료 화면이 그대로 돌아온다', () => {
    const viewport = { x: -120.5, y: 300, zoom: 0.75 }
    storeViewport('m1', viewport)

    expect(readStoredViewport('m1')).toEqual(viewport)
  })

  it('문서가 다르면 화면이 섞이지 않는다', () => {
    storeViewport('m1', { x: 0, y: 0, zoom: 1 })
    storeViewport('m2', { x: -50, y: 20, zoom: 1.5 })

    expect(readStoredViewport('m1')).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(readStoredViewport('m2')).toEqual({ x: -50, y: 20, zoom: 1.5 })
  })

  it('기록이 없으면 null — 첫 열기(전체 맞춤) 대상', () => {
    expect(readStoredViewport('unknown')).toBeNull()
  })

  it('modelId가 없으면(로드 전) 읽지도 쓰지도 않는다', () => {
    storeViewport(null, { x: 1, y: 2, zoom: 3 })
    expect(readStoredViewport(null)).toBeNull()
  })

  it('깨진 기록은 없는 셈친다 — 숫자가 아니거나 JSON이 아니면 null', () => {
    localStorage.setItem(viewportStorageKey('m1'), '{oops')
    expect(readStoredViewport('m1')).toBeNull()

    localStorage.setItem(viewportStorageKey('m2'), JSON.stringify({ x: 'a', y: 0, zoom: 1 }))
    expect(readStoredViewport('m2')).toBeNull()
  })

  it('JSON.stringify 불가한 값이 섞여도 쓰기 실패는 조용히 넘긴다', () => {
    expect(() => storeViewport('m1', { x: NaN, y: 0, zoom: 1 })).not.toThrow()
  })
})
