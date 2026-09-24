/**
 * 용어 대량 등록 텍스트 파서 (용어 사전 패널 — v1.14)
 *
 * 한 줄에 한 용어씩 "토큰,라벨" 또는 "토큰,라벨,타입"(쉼표·탭 구분) 텍스트를
 * 붙여넣어 등록한다. 구분자는 매 단계에서 쉼표/탭 중 먼저 오는 쪽 하나씩 나눈다 —
 * 2열이면 라벨은 잔여 전체라 라벨에 쉼표가 있어도 잘리지 않는다
 * ("user,회원, VIP"의 라벨은 "회원, VIP"). 3열을 쓰면 타입에 구분자가 올 수 없으니
 * 라벨에도 구분자를 쓸 수 없다 — 남는 조각이 있으면 tooManyColumns로 알린다.
 *
 * 순수 모듈(스토어·API 무관)이라 다이얼로그 미리보기·테스트가 같은 계산을 공유한다.
 * 정규화 규칙은 서버와 같다(08-core/01-workspace.md §4.2): term은 trim+소문자·내부 공백
 * 금지, label은 trim, type은 trim(빈 값은 null — 선택 값). 형식 오류 줄은 entries에서
 * 빼고 issues로 돌려가며 실행 전에 보여준다.
 */

export type TermBulkIssueReason = 'missingSeparator' | 'emptyLabel' | 'spaceInTerm' | 'tooManyColumns'

export interface TermBulkEntry {
  /** 1 기반 줄 번호 — 실행 결과의 성공·실패 안내가 원문 줄을 가리킨다 */
  line: number
  /** trim+소문자 정규화된 물리명 토큰(서버 규칙) */
  term: string
  /** trim된 라벨(표기 그대로 — 소문자화하지 않는다) */
  label: string
  /** trim된 데이터 타입 예: VARCHAR(100) — 빈 값은 null(선택 값) */
  type: string | null
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

/** 다음 쉼표 또는 탭 위치 — 둘 중 먼저 나오는 쪽이 구분자다 */
function nextSeparator(line: string, from: number): number {
  const comma = line.indexOf(',', from)
  const tab = line.indexOf('\t', from)
  return comma === -1 ? tab : tab === -1 ? comma : Math.min(comma, tab)
}

export function parseTermBulkText(text: string): TermBulkParseResult {
  const entries: TermBulkEntry[] = []
  const issues: TermBulkIssue[] = []

  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]
    const line = index + 1
    if (raw.trim() === '') continue // 빈 줄은 조용히 건너뛴다

    const first = nextSeparator(raw, 0)
    if (first === -1) {
      issues.push({ line, text: raw, reason: 'missingSeparator' })
      continue
    }
    const second = nextSeparator(raw, first + 1)
    // 2열 — 라벨은 잔여 전체(구분자 포함 허용). 3열 — 세 조각으로 정확히 나눠야 한다
    const term = raw.slice(0, first).trim()
    const label = second === -1 ? raw.slice(first + 1).trim() : raw.slice(first + 1, second).trim()
    const type = second === -1 ? null : raw.slice(second + 1).trim()
    if (second !== -1 && nextSeparator(raw, second + 1) !== -1) {
      issues.push({ line, text: raw, reason: 'tooManyColumns' })
      continue
    }
    if (/\s/.test(term)) {
      issues.push({ line, text: raw, reason: 'spaceInTerm' })
      continue
    }
    if (term === '' || label === '') {
      issues.push({ line, text: raw, reason: 'emptyLabel' })
      continue
    }
    entries.push({ line, term: term.toLowerCase(), label, type: type === '' ? null : type })
  }
  return { entries, issues }
}
