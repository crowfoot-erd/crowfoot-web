/**
 * 파일 → base64 data URL 변환 (커뮤니티 게시글 — 이미지 업로드 API 없이 마크다운 본문에 인라인)
 *
 * Toast UI Editor의 addImageBlobHook에서 삽입 직전 호출한다.
 * 상한을 넘는 이미지는 거부(RejectedFileError) — 서버 본문 상한(1,000,000자)의 실효 방어선.
 */

/** 인라인 이미지 1장 상한 — 512KB(파일 바이트 기준) */
export const MAX_INLINE_IMAGE_BYTES = 512 * 1024

/** 상한 초과로 거부된 이미지 — 호출부가 토스트로 안내한다 */
export class InlineImageTooLargeError extends Error {
  readonly file: Blob

  constructor(file: Blob) {
    super(`이미지가 ${Math.round(MAX_INLINE_IMAGE_BYTES / 1024)}KB를 초과합니다`)
    this.name = 'InlineImageTooLargeError'
    this.file = file
  }
}

/** Blob을 data URL(base64)로 변환 — FileReader.readAsDataURL 기반 */
export function fileToDataUrl(file: Blob): Promise<string> {
  if (file.size > MAX_INLINE_IMAGE_BYTES) {
    return Promise.reject(new InlineImageTooLargeError(file))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다'))
    reader.readAsDataURL(file)
  })
}
