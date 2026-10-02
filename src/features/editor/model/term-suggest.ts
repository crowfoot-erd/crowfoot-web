/**
 * 컬럼 이름 입력의 사전 제안 — 용어와 단어를 나눈다 (05-editor/02-ui.md §2.2, 08-core/01-workspace.md §4.6) — 순수 함수.
 *
 * 사전의 항목은 쓰임이 둘이다.
 *  · 용어: 도메인 타입을 가리키거나 타입 표기가 있다 — 컬럼 하나의 표준. 이름 전체를 바꾼다
 *  · 단어: 둘 다 없다 — 이름의 조각. 지금 치고 있는 조각(마지막 `_` 뒤)만 완성한다
 */
import type { WorkspaceTerm } from '@/api/types'
import { inferName, type TermMap } from '@/features/editor/model/logical-name-inference'

/** 묶음마다 보여 주는 최대 수 */
export const TERM_SUGGEST_LIMIT = 5
export const WORD_SUGGEST_LIMIT = 5

/** 용어인지 — 도메인 타입을 가리키거나 타입 표기가 하나라도 있다 */
export function isTermEntry(row: Pick<WorkspaceTerm, 'types' | 'domainTypeId'>): boolean {
  return Boolean(row.domainTypeId) || (row.types != null && Object.keys(row.types).length > 0)
}

/** 초안을 "앞부분 + 치고 있는 조각"으로 나눈다 — 조각은 마지막 `_` 뒤의 글자다 */
export function splitFragment(draft: string): { prefix: string; fragment: string } {
  const cut = draft.lastIndexOf('_') + 1
  return { prefix: draft.slice(0, cut), fragment: draft.slice(cut) }
}

export interface TermSuggestions {
  terms: WorkspaceTerm[]
  words: WorkspaceTerm[]
}

/** 자동 생성 기본 물리명(column_N)은 미입력으로 본다 — 컬럼 추가 직후 전체 목록이 바로 열린다 */
function effectiveQuery(draft: string): string {
  const query = draft.trim().toLowerCase()
  return query === '' || /^column_\d+$/.test(query) ? '' : query
}

/** 제안 — 용어는 입력 전체와, 단어는 치고 있는 조각과 견준다(토큰·라벨 부분 일치, 대소문자 무시) */
export function suggestTerms(all: readonly WorkspaceTerm[], draft: string): TermSuggestions {
  const query = effectiveQuery(draft)
  const fragment = query === '' ? '' : splitFragment(query).fragment
  const matches = (row: WorkspaceTerm, needle: string) =>
    needle === '' || row.term.toLowerCase().includes(needle) || row.label.toLowerCase().includes(needle)
  const terms: WorkspaceTerm[] = []
  const words: WorkspaceTerm[] = []
  for (const row of all) {
    if (isTermEntry(row)) {
      if (terms.length < TERM_SUGGEST_LIMIT && matches(row, query)) terms.push(row)
    } else if (words.length < WORD_SUGGEST_LIMIT && matches(row, fragment)) {
      // 이미 그 단어를 다 쳤으면 완성할 것이 없다
      if (fragment !== '' && row.term.toLowerCase() === fragment) continue
      words.push(row)
    }
  }
  return { terms, words }
}

/** 단어 완성 — 치고 있는 조각만 그 단어로 바꾼다. `user_em` + email → `user_email` */
export function completeWord(draft: string, word: string): string {
  const query = effectiveQuery(draft)
  if (query === '') return word
  return splitFragment(draft.trim()).prefix + word
}

/** 사전(워크스페이스) → 추론 사전. 시스템 사전은 넣지 않는다(목록이 커서 입력 중에 쓰지 않는다) */
export function workspaceTermMap(all: readonly WorkspaceTerm[]): TermMap {
  const map: TermMap = {}
  for (const row of all) map[row.term] = row.label
  return map
}

/** 논리명 미리보기 — 사전에 걸리는 조각이 없으면 null */
export function previewLogicalName(draft: string, dict: TermMap): string | null {
  if (effectiveQuery(draft) === '') return null
  return inferName(draft.trim(), dict)
}
