/**
 * 파일 → base64 data URL 변환 단위 테스트
 *
 * given: 크기가 다른 Blob
 * when: fileToDataUrl 호출
 * then: 상한 이내만 data URL로 변환되고 초과분은 InlineImageTooLargeError로 거부된다
 */
import { describe, expect, it } from 'vitest'

import { InlineImageTooLargeError, MAX_INLINE_IMAGE_BYTES, fileToDataUrl } from '@/lib/file-to-data-url'

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
