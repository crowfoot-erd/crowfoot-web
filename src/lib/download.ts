/**
 * 텍스트 파일 다운로드 — Blob + createObjectURL + anchor 클릭.
 * 저장 대화상자 없이 브라우저 기본 다운로드로 즉시 내려간다.
 */
export function downloadTextFile(filename: string, text: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // 클릭 핸들링이 끝난 뒤 해제 — 즉시 revoke하면 일부 브라우저에서 다운로드가 취소된다
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** 파일명으로 쓸 수 없는 문자(경로 구분자·예약 문자·공백)를 밑줄로 — 빈 결과는 fallback */
export function safeFilename(name: string, fallback = 'model'): string {
  const cleaned = name.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || fallback
}

/** dataURL 다운로드 — 캔버스 캡처 이미지 등. Blob 변환 없이 href에 그대로 건다 */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.click()
}
