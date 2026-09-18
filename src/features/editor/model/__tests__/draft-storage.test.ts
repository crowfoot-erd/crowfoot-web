/**
 * 임시 저장(draft) 저장소 단위 테스트 — roundtrip·키 분리·형태 검증·쿼터/파손 내성
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearDraft, draftKey, loadDraft, saveDraft } from '@/features/editor/model/draft-storage'

const KEY = draftKey('ws', 'm1')

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('draft-storage', () => {
  it('save → load roundtrip, clear 후 null', () => {
    expect(loadDraft('ws', 'm1')).toBeNull()

    expect(saveDraft('ws', 'm1', { baseVersion: 3, content: '{"a":1}', savedAt: 1234 })).toBe(true)
    expect(loadDraft('ws', 'm1')).toEqual({ baseVersion: 3, content: '{"a":1}', savedAt: 1234 })

    clearDraft('ws', 'm1')
    expect(loadDraft('ws', 'm1')).toBeNull()
  })

  it('키는 워크스페이스·모델별로 분리된다', () => {
    saveDraft('ws', 'm1', { baseVersion: 1, content: 'a', savedAt: 1 })
    saveDraft('ws', 'm2', { baseVersion: 2, content: 'b', savedAt: 2 })
    expect(loadDraft('ws', 'm1')?.content).toBe('a')
    expect(loadDraft('ws', 'm2')?.content).toBe('b')
  })

  it('파손된 JSON·잘못된 형태는 null — 예외 없이 폐기된다', () => {
    window.localStorage.setItem(KEY, '{not json')
    expect(loadDraft('ws', 'm1')).toBeNull()

    window.localStorage.setItem(KEY, JSON.stringify({ baseVersion: '3', content: 'x', savedAt: 1 }))
    expect(loadDraft('ws', 'm1')).toBeNull()

    window.localStorage.setItem(KEY, JSON.stringify({ baseVersion: 3, savedAt: 1 })) // content 누락
    expect(loadDraft('ws', 'm1')).toBeNull()
  })

  it('쓰기 실패(쿼터 초과 등)는 false로 알리고 예외를 던지지 않는다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    expect(saveDraft('ws', 'm1', { baseVersion: 3, content: 'x', savedAt: 1 })).toBe(false)
  })

  it('삭제 실패(clear)도 조용히 넘어간다', () => {
    window.localStorage.setItem(KEY, 'x')
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('locked', 'InvalidStateError')
    })
    expect(() => clearDraft('ws', 'm1')).not.toThrow()
  })
})
