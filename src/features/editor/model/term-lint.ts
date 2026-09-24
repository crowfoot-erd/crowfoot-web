/**
 * 비표준 단어 검증 (05-editor/02-ui.md 용어 사전 패널 — v1.14)
 *
 * 문서의 테이블·컬럼 물리명을 토큰화해 **병합 사전(표준 > 시스템)**에 없는 토큰을
 * 모은다 — 데이터 모델링 표준화 관점에서 "사전에 없는 축약어"를 찾아내는 검증이다.
 *
 * 순수 모듈(스토어·API 무관)이라 패널 섹션·테스트가 같은 계산을 공유한다.
 *
 * - 판정 기준은 inferName과 정합한다: 전체 이름(tokens.join('_'))이 사전에 등록됐으면
 *   그 이름의 토큰 전체를 커버된 것으로 본다(토큰 결합보다 전체 등록이 우선하는 추론 규칙).
 * - 시스템 사전(BUILTIN_TERMS)에 있으면 통과 — 조용한 기본. 결과는 병합 사전 기준이라
 *   표준 사전 등록(buildTermMap)이 시스템 라벨을 덮어도 판정에는 영향이 없다(키 존재만 본다).
 * - 같은 토큰이 여러 객체에 있으면 한 finding에 출처(occurrences)를 쌓는다 —
 *   패널 행이 "토큰 + N곳"으로 요약된다.
 */
import type { TermMap } from '@/features/editor/model/logical-name-inference'
import { tokenizeName } from '@/features/editor/model/logical-name-inference'

/** 비표준 토큰의 등장 위치 — columnId가 null이면 테이블 이름 자체에서 등장 */
export interface TermLintOccurrence {
  tableId: string
  tablePhysicalName: string
  columnId: string | null
  columnPhysicalName: string | null
}

/** 비표준 토큰 한 건 — 패널의 비표준 섹션 행 단위 */
export interface TermLintFinding {
  token: string
  occurrences: TermLintOccurrence[]
}

/** 문서의 물리명 토큰 중 병합 사전에 없는 토큰을 출처와 함께 모은다(토큰 오름차순) */
export function lintNonStandardTerms(
  doc: { model: { tables: Array<{ id: string; physicalName: string; columns: Array<{ id: string; physicalName: string }> }> } },
  dict: TermMap,
): TermLintFinding[] {
  const findings = new Map<string, TermLintOccurrence[]>()
  const seen = new Map<string, Set<string>>()

  const check = (
    table: { id: string; physicalName: string },
    column: { id: string; physicalName: string } | null,
    name: string,
  ) => {
    const tokens = tokenizeName(name)
    if (tokens.length === 0) return
    // 전체 이름 등록이 있으면 그 이름의 토큰 전체가 커버 — inferName 우선 규칙과 정합
    if (tokens.length > 1 && dict[tokens.join('_')] !== undefined) return
    for (const token of tokens) {
      if (dict[token] !== undefined) continue
      // 같은 이름 안에 같은 토큰이 반복돼도('usr_usr') 출처는 한 번만 센다
      const key = `${table.id}:${column?.id ?? '-'}`
      if (seen.get(token)?.has(key)) continue
      seen.set(token, (seen.get(token) ?? new Set()).add(key))
      const occurrence: TermLintOccurrence = {
        tableId: table.id,
        tablePhysicalName: table.physicalName,
        columnId: column?.id ?? null,
        columnPhysicalName: column?.physicalName ?? null,
      }
      const list = findings.get(token)
      if (list) list.push(occurrence)
      else findings.set(token, [occurrence])
    }
  }

  for (const table of doc.model.tables) {
    check(table, null, table.physicalName)
    for (const column of table.columns) check(table, column, column.physicalName)
  }

  return [...findings.entries()]
    .map(([token, occurrences]) => ({ token, occurrences }))
    .sort((a, b) => (a.token < b.token ? -1 : a.token > b.token ? 1 : 0))
}
