/**
 * base64 data URL 공통 처리 — data URL을 만들고, 풀고, 열고, 내려받는 일은 모두 이 모듈을 거친다(2026-10-15 사용자 요청).
 *
 * - 만들기: fileToDataUrl — 커뮤니티 글·릴리스 노트의 이미지를 업로드 API 없이 마크다운 본문에 인라인한다
 *   (Toast UI Editor의 addImageBlobHook이 삽입 직전 부른다). 상한을 넘는 이미지는 거부 — 서버 본문 상한(1,000,000자)의 실효 방어선.
 * - 풀기: dataUrlToBlob — 클릭 이벤트 안에서 동기로 바꾼다.
 * - 열기: openImageInNewWindow — 브라우저는 data: 주소를 최상위 창으로 여는 것을 막아 빈 창이 된다. blob: 주소로 바꿔 연다.
 * - 내려받기: downloadDataUrl — 캔버스 캡처(PNG 내보내기)도 blob: 주소로 내려받는다.
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

/** blob 주소를 새 창·다운로드가 다 읽을 때까지 남겨 두는 시간 */
const BLOB_URL_TTL_MS = 60_000

export function isDataUrl(src: string): boolean {
  return src.startsWith('data:')
}

/** data:[타입][;base64],내용 → Blob. 형식이 맞지 않으면 null */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!isDataUrl(dataUrl)) return null
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  const header = dataUrl.slice(5, comma)
  const body = dataUrl.slice(comma + 1)
  const type = header.split(';')[0] || 'application/octet-stream'
  try {
    if (!header.endsWith(';base64')) return new Blob([decodeURIComponent(body)], { type })
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type })
  } catch {
    return null
  }
}

/** data URL이면 잠시 쓰는 blob: 주소로, 아니면 그대로 — 쓴 뒤 거두는 것까지 맡는다 */
function withObjectUrl(src: string, use: (url: string) => void): void {
  if (!isDataUrl(src)) {
    use(src)
    return
  }
  const blob = dataUrlToBlob(src)
  if (!blob) return
  const url = URL.createObjectURL(blob)
  use(url)
  window.setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_TTL_MS)
}

/** 그림을 원래 크기로 새 창에서 연다 — 본문 그림 클릭(사용 가이드·릴리스 노트) */
export function openImageInNewWindow(src: string): void {
  withObjectUrl(src, (url) => window.open(url, '_blank', 'noopener,noreferrer'))
}

/** data URL 내려받기 — 캔버스 캡처 이미지 등 */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  withObjectUrl(dataUrl, (url) => {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  })
}
