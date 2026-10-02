/**
 * 새 배포 알아채기 (05-editor/02-ui.md §19) — version.json의 빌드 식별자를 자기 것과 견준다
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkForAppUpdate, useAppUpdateStore } from '@/lib/app-update'

const respond = (body: unknown, ok = true) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, json: async () => body } as Response)

afterEach(() => {
  vi.restoreAllMocks()
  useAppUpdateStore.setState({ available: false })
})

describe('checkForAppUpdate', () => {
  it('배포된 식별자가 내 것과 다르면 새 버전이다', async () => {
    const fetchMock = respond({ build: '200' })
    expect(await checkForAppUpdate('100')).toBe(true)
    expect(useAppUpdateStore.getState().available).toBe(true)
    // 캐시된 응답을 읽지 않는다
    expect(fetchMock.mock.calls[0][0]).toMatch(/^\/version\.json\?t=\d+$/)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
  })

  it('식별자가 같으면 새 버전이 아니다', async () => {
    respond({ build: '100' })
    expect(await checkForAppUpdate('100')).toBe(false)
    expect(useAppUpdateStore.getState().available).toBe(false)
  })

  it('읽지 못하면(오프라인, 배포 중, 형식 다름) 새 버전으로 치지 않는다', async () => {
    respond({}, false)
    expect(await checkForAppUpdate('100')).toBe(false)
    vi.restoreAllMocks()
    respond({ other: 1 })
    expect(await checkForAppUpdate('100')).toBe(false)
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(await checkForAppUpdate('100')).toBe(false)
  })

  it('개발 서버와 테스트(dev)에서는 확인하지 않는다', async () => {
    const fetchMock = respond({ build: '200' })
    expect(await checkForAppUpdate('dev')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
