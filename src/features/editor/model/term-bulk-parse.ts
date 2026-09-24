/**
 * 용어 대량 등록 텍스트 파서 (용어 사전 패널 — v1.14)
 *
 * 한 줄에 한 용어씩 "토큰,라벨"(쉼표) 또는 탭 구분 텍스트를 붙여넣어 등록한다.
 * 첫 구분자에서만 나눈다 — 라벨에 쉼표가 있어도 잘리지 않는다("user,회원, VIP"의
 * 라벨은 "회원, VIP").
 *
 * 순수 모듈(스토어·API 무관)이라 다이얼로그 미리보기·테스트가 같은 계산을 공유한다.
 * 정규화 규칙은 서버와 같다(08-core/01-workspace.md §4.2): term은 trim+소문자·내부 공백
 * 금지, label은 trim. 형식 오류 줄은 entries에서 빼고 issues로 돌려가며 실행 전에 보여준다.
 */

export type TermBulkIssueReason = 'missingSeparator' | 'emptyLabel' | 'spaceInTerm'

export interface TermBulkEntry {
  /** 1 기반 줄 번호 — 실행 결과의 성공·실패 안내가 원문 줄을 가리킨다 */
  line: number
  /** trim+소문자 정규화된 물리명 토큰(서버 규칙) */
  term: string
  /** trim된 라벨(표기 그대로 — 소문자화하지 않는다) */
  label: string
}

export interface TermBulkIssue {
  line: number
  /** 오류 원문 줄 — 사용자가 원본에서 그 줄을 찾을 수 있게 */
  text: string
  reason: TermBulkIssueReason
}

export interface TermBulkParseResult {
  entries: TermBulkEntry[]
  issues: TermBulkIssue[]
}

/** 첫 쉼표 또는 탭 위치 — 둘 중 먼저 나오는 쪽이 구분자다 */
function splitTermLabel(line: string): { term: string; label: string } | null {
  const comma = line.indexOf(',')
  const tab = line.indexOf('\t')
  const sep = comma === -1 ? tab : tab === -1 ? comma : Math.min(comma, tab)
  if (sep === -1) return null
  return { term: line.slice(0, sep).trim(), label: line.slice(sep + 1).trim() }
}

export function parseTermBulkText(text: string): TermBulkParseResult {
  const entries: TermBulkEntry[] = []
  const issues: TermBulkIssue[] = []

  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]
    const line = index + 1
    if (raw.trim() === '') continue // 빈 줄은 조용히 건너뛴다

    const parts = splitTermLabel(raw)
    if (parts === null) {
      issues.push({ line, text: raw, reason: 'missingSeparator' })
      continue
    }
    if (/\s/.test(parts.term)) {
      issues.push({ line, text: raw, reason: 'spaceInTerm' })
      continue
    }
    if (parts.term === '' || parts.label === '') {
      issues.push({ line, text: raw, reason: 'emptyLabel' })
      continue
    }
    entries.push({ line, term: parts.term.toLowerCase(), label: parts.label })
  }
  return { entries, issues }
}
