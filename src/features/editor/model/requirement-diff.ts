/**
 * 요구사항의 바뀐 내용 비교 (05-editor/02-ui.md §21.1, 08-core/17-model-edit.md §2.4)
 *
 * 마지막으로 반영한 내용(before)과 지금 내용(after)을 화면에 보여 줄 모양으로 나눈다.
 * - 내용(description)은 줄(`\n`) 단위로 비교한다. 같은 줄은 그대로, 더한 줄은 +, 지운 줄은 −
 * - 수용 기준과 연결된 테이블은 항목 단위로 더한 것과 뺀 것을 나눈다(순서는 지금 내용 → 이전 내용)
 */

export type LineDiffKind = 'same' | 'add' | 'remove'

export interface LineDiff {
  kind: LineDiffKind
  text: string
}

function splitLines(text: string): string[] {
  if (text.length === 0) return []
  return text.split('\n').map((line) => line.replace(/\r$/, ''))
}

/** 줄 단위 비교 — 가장 긴 공통 부분열(LCS)로 같은 줄을 맞춘다. 지운 줄을 더한 줄보다 먼저 둔다 */
export function diffLines(before: string, after: string): LineDiff[] {
  const a = splitLines(before)
  const b = splitLines(after)
  // lcs[i][j] = a[i..]와 b[j..]의 공통 부분열 길이 — 내용은 2,000자 이하라 표가 작다
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: LineDiff[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'remove', text: a[i] })
      i += 1
    } else {
      out.push({ kind: 'add', text: b[j] })
      j += 1
    }
  }
  for (; i < a.length; i += 1) out.push({ kind: 'remove', text: a[i] })
  for (; j < b.length; j += 1) out.push({ kind: 'add', text: b[j] })
  return out
}

/** 항목 목록의 더한 것과 뺀 것 — 같은 글이 여러 번 있으면 개수로 맞춘다 */
export function diffItems(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
  const remaining = new Map<string, number>()
  for (const item of before) remaining.set(item, (remaining.get(item) ?? 0) + 1)
  const added: string[] = []
  for (const item of after) {
    const left = remaining.get(item) ?? 0
    if (left > 0) remaining.set(item, left - 1)
    else added.push(item)
  }
  const removed: string[] = []
  for (const item of before) {
    const left = remaining.get(item) ?? 0
    if (left > 0) {
      removed.push(item)
      remaining.set(item, left - 1)
    }
  }
  return { added, removed }
}
