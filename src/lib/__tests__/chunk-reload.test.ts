/**
 * 지워진 코드 조각 불러오기 실패 시 새로고침 — 같은 탭에서 30초 안에는 한 번만
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { shouldReloadForChunkError } from '../chunk-reload'

describe('shouldReloadForChunkError', () => {
  beforeEach(() => sessionStorage.clear())

  it('처음 실패하면 새로고침한다', () => {
    expect(shouldReloadForChunkError(100_000)).toBe(true)
  })

  it('30초 안에 다시 실패하면 되풀이하지 않는다', () => {
    shouldReloadForChunkError(100_000)
    expect(shouldReloadForChunkError(120_000)).toBe(false)
  })

  it('30초가 지나면 다시 새로고침한다', () => {
    shouldReloadForChunkError(100_000)
    expect(shouldReloadForChunkError(131_000)).toBe(true)
  })
})
