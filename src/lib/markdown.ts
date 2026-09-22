/**
 * 마크다운 본문 한 줄 요약 — 공개 문서(릴리스 노트 등)의 meta description 재료
 * (04-front/storyboard/00-common.md §3.11)
 */

/** 마크다운 문법을 걷어내고 공백을 정리한 뒤 max 글자로 자른다(초과 시 …). */
export function summarizeMarkdown(markdown: string, max = 160): string {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ') // 코드 펜스 — 요약에서는 통째로 제거
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // 이미지·링크 → 표시 문자만
    .replace(/`([^`]*)`/g, '$1') // 인라인 코드
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // 헤딩
    .replace(/^\s{0,3}>\s?/gm, '') // 인용
    .replace(/^-{3,}\s*$/gm, ' ') // 수평선
    .replace(/^\s{0,3}[-*+]\s+/gm, '') // 글머리 기호
    .replace(/(\*\*|~~|\*|==)/g, '') // 강조·취소선·하이라이트 마커
    .replace(/\|/g, ' ') // 표 구분선
    .replace(/-{3,}/g, ' ') // 표 구분 잔여
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped.length <= max) return stripped
  return `${stripped.slice(0, max - 1).trimEnd()}…`
}
