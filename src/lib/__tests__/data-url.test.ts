/**
 * base64 data URL 공통 처리 단위 테스트 — 만들기(fileToDataUrl)·풀기·새 창으로 열기·내려받기
 *
 * given: 크기가 다른 Blob
 * when: fileToDataUrl 호출
 * then: 상한 이내만 data URL로 변환되고 초과분은 InlineImageTooLargeError로 거부된다
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  InlineImageTooLargeError,
  MAX_INLINE_IMAGE_BYTES,
  dataUrlToBlob,
  downloadDataUrl,
  fileToDataUrl,
  openImageInNewWindow,
} from '@/lib/data-url'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fileToDataUrl', () => {
  it('converts a small blob into a base64 data URL', async () => {
    // given: 8바이트 Blob
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'image/png' })

    // when
    const dataUrl = await fileToDataUrl(blob)

    // then: data URL 스킴 + base64 페이로드
    expect(dataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
  })

  it('rejects blobs over the inline image limit', async () => {
    // given: 상한(512KB)을 넘는 Blob
    const oversized = new Blob([new Uint8Array(MAX_INLINE_IMAGE_BYTES + 1)])

    // when & then: 거부 — 에러가 파일을 물고 있다
    await expect(fileToDataUrl(oversized)).rejects.toBeInstanceOf(InlineImageTooLargeError)
    try {
      await fileToDataUrl(oversized)
      expect.unreachable('거부되지 않았다')
    } catch (error) {
      expect((error as InlineImageTooLargeError).file).toBe(oversized)
      expect((error as InlineImageTooLargeError).message).toContain('512')
    }
  })

  it('accepts blobs exactly at the limit', async () => {
    // given: 상한과 정확히 같은 크기
    const boundary = new Blob([new Uint8Array(MAX_INLINE_IMAGE_BYTES)])

    // when & then: 경계값은 통과
    await expect(fileToDataUrl(boundary)).resolves.toMatch(/^data:.*base64,/)
  })
})

describe('dataUrlToBlob', () => {
  it('base64 data URL을 타입과 바이트 그대로 Blob으로 바꾼다', async () => {
    const blob = dataUrlToBlob('data:image/webp;base64,UklGRg==')
    expect(blob?.type).toBe('image/webp')
    expect(Array.from(new Uint8Array(await blob!.arrayBuffer()))).toEqual([0x52, 0x49, 0x46, 0x46])
  })

  it('base64가 아닌 data URL은 글자를 풀어 담고, 형식이 깨졌으면 null이다', async () => {
    expect(await dataUrlToBlob('data:text/plain,a%20b')!.text()).toBe('a b')
    expect(dataUrlToBlob('data:image/png;base64')).toBeNull()
    expect(dataUrlToBlob('data:image/png;base64,@@@')).toBeNull()
  })
})

describe('openImageInNewWindow', () => {
  it('data: 그림은 blob: 주소로 새 창을 열고, 잠시 뒤 주소를 거둔다', () => {
    vi.useFakeTimers()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const create = vi.fn(() => 'blob:http://localhost/1')
    const revoke = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))

    openImageInNewWindow('data:image/webp;base64,UklGRg==')

    expect(create).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith('blob:http://localhost/1', '_blank', 'noopener,noreferrer')
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/1')
  })

  it('파일 주소 그림은 그 주소를 그대로 연다(사용 가이드)', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    openImageInNewWindow('http://localhost/guide-assets/ko/editor-history.webp')

    expect(open).toHaveBeenCalledWith('http://localhost/guide-assets/ko/editor-history.webp', '_blank', 'noopener,noreferrer')
  })
})

describe('downloadDataUrl', () => {
  it('data URL을 blob: 주소의 링크로 내려받는다', () => {
    const create = vi.fn(() => 'blob:http://localhost/2')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadDataUrl('erd.png', 'data:image/png;base64,iVBORw==')

    const anchor = click.mock.contexts[0] as HTMLAnchorElement | undefined
    expect(anchor?.href).toBe('blob:http://localhost/2')
    expect(anchor?.download).toBe('erd.png')
  })
})
