/**
 * 논리명 자동 추론 (05-editor/04-dbms-engineering.md §3.2 — v1.13, 사전 서버화 v1.14)
 *
 * 리버스·SQL Import 문서는 DB 코멘트 없는 객체의 논리명이 물리명과 같다
 * (ReverseContentAssembler가 코멘트 없으면 복제). 이 모듈이 사전으로 그런
 * 논리명을 채운다 — user_id → "사용자 ID".
 *
 * 순수 모듈(스토어·API 무관)이라 미리보기·적용·테스트가 같은 계산을 공유한다.
 *
 * - 사전은 2층이다 — 시스템 사전(전역, 관리자 관리·다국어 labels)을 바닥에 깔고
 *   워크스페이스 사전 등록이 우선한다. 시스템 라벨은 추론 다이얼로그에서 고른 언어로
 *   해석한다(resolveLabel 폴백, 기본 UI 언어). 해석된 라벨이 적용 시점에 문서 논리명으로
 *   영구 기록되는 것은 v1.13과 같다 — 언어를 바꿔도 이미 적용된 논리명은 바뀌지 않는다.
 * - 후보 필터: 논리명이 ''이거나 물리명과 **같은** 객체만. 이 필터 자체가 보존 장치다 —
 *   리버스가 DB 코멘트를 논리명으로 옮겨 뒀으면(논리명≠물리명) 추론이 건드리지 않는다.
 *   sync-merge의 보존 규칙(§3.3)과 같은 신호 구조라 동기화와도 충돌하지 않는다.
 * - 전체 이름 조회 우선: 워크스페이스 사전에 user_id처럼 통째로 등록했으면 토큰 결합보다 이긴다.
 * - 토큰화: '_'·camelCase로 분해 → 사전 조회 → 미등록 토큰은 원문 유지 → 공백 결합.
 *   토큰이 하나도 사전에 걸리지 않으면 추론이 아니라 재포맷이니 결과를 내지 않는다(null).
 * - 결과는 기존 table/patch·column/patch 체인지 재사용 — 신규 체인지 타입이 없고,
 *   commitAll 한 덩어리라 undo 한 번으로 전체 취소된다.
 */
import type { ErdChange } from '@/features/editor/model/changes'
import type { SystemTerm, WorkspaceTerm } from '@/api/types'

/** 추론 사전 — 물리명(전체·토큰, 소문자) → 라벨 */
export type TermMap = Record<string, string>

/** 다국어 라벨 해석 — UI 언어 → en → ko → 첫 값 폴백. 어느 언어로 등록됐어도 항상 라벨이 나온다 */
export function resolveLabel(labels: Record<string, string>, locale: string): string {
  return labels[locale] ?? labels.en ?? labels.ko ?? Object.values(labels)[0] ?? ''
}

/** 병합 사전 — 시스템 사전(전역, 로케일로 해석)을 바닥에 깔고 워크스페이스 사전이 덮어쓴다.
 *  어느 쪽이 undefined여도 나머지 한쪽으로 계산한다(로드 실패 안내는 UI가 담당) */
export function buildTermMap(
  system: readonly SystemTerm[] | undefined,
  custom: readonly WorkspaceTerm[] | undefined,
  locale: string,
): TermMap {
  const map: TermMap = {}
  for (const term of system ?? []) map[term.term] = resolveLabel(term.labels, locale)
  for (const term of custom ?? []) map[term.term] = term.label
  return map
}

/** camelCase 경계 분해 — orderItem → ['order', 'item'], OrderItem → ['order', 'item'] */
function splitCamelCase(token: string): string[] {
  return token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
}

/** 이름 → 토큰 배열. '_', 공백, camelCase 경계로 분해하고 전부 소문자로 정규화한다 */
export function tokenizeName(name: string): string[] {
  return name
    .split(/[\s_]+/)
    .filter(Boolean)
    .flatMap(splitCamelCase)
    .map((token) => token.toLowerCase())
}

/** 단일 이름 추론 — 전체 이름 조회 우선, 없으면 토큰별 조회·원문 유지·공백 결합.
 *  토큰이 하나도 사전에 걸리지 않으면 null(추론 아님 — snake→공백 재포맷과 구분한다) */
export function inferName(physicalName: string, dict: TermMap): string | null {
  const tokens = tokenizeName(physicalName)
  if (tokens.length === 0) return null

  const whole = tokens.join('_')
  const wholeHit = dict[whole]
  if (tokens.length > 1 && wholeHit !== undefined) return wholeHit

  let hit = false
  const mapped = tokens.map((token) => {
    const label = dict[token]
    if (label !== undefined) hit = true
    return label ?? token
  })
  return hit ? mapped.join(' ') : null
}

/** 추론 후보 한 건 — 미리보기 행·체크박스 단위 */
export interface InferenceEntry {
  tableId: string
  tablePhysicalName: string
  columnId: string | null
  columnPhysicalName: string | null
  /** 추론 논리명 — inferName 결과 */
  inferred: string
}

/** 현재 논리명 (후보 판정 기준) — ''이거나 물리명과 같으면 추론 대상 */
function isBlankOrSame(logicalName: string | null | undefined, physicalName: string): boolean {
  const logical = logicalName ?? ''
  return logical === '' || logical === physicalName
}

/** 문서 전체 추론 계획 — 치환될 것이 있는 테이블만 담는다(빈 결과·치환 0건 제외) */
export function planLogicalNameInference(
  doc: { model: { tables: Array<{ id: string; physicalName: string; logicalName: string | null; columns: Array<{ id: string; physicalName: string; logicalName: string | null }> }> } },
  dict: TermMap,
): InferenceEntry[] {
  const entries: InferenceEntry[] = []
  const push = (
    table: { id: string; physicalName: string },
    column: { id: string; physicalName: string } | null,
    inferred: string | null,
  ) => {
    // null은 사전 적중 0건(추론 아님), 물리명과 같은 결과도 의미 없다
    if (inferred === null || inferred === (column ?? table).physicalName) return
    entries.push({
      tableId: table.id,
      tablePhysicalName: table.physicalName,
      columnId: column?.id ?? null,
      columnPhysicalName: column?.physicalName ?? null,
      inferred,
    })
  }
  for (const table of doc.model.tables) {
    if (isBlankOrSame(table.logicalName, table.physicalName)) {
      push(table, null, inferName(table.physicalName, dict))
    }
    for (const column of table.columns) {
      if (isBlankOrSame(column.logicalName, column.physicalName)) {
        push(table, column, inferName(column.physicalName, dict))
      }
    }
  }
  return entries
}

/** 선택된 후보를 체인지 배열로 — 적용 클릭 시점에 재계산된 entries를 받는다 */
export function inferenceChanges(entries: readonly InferenceEntry[]): ErdChange[] {
  return entries.map((entry) =>
    entry.columnId === null
      ? { type: 'table/patch', tableId: entry.tableId, patch: { logicalName: entry.inferred } }
      : {
          type: 'column/patch',
          tableId: entry.tableId,
          columnId: entry.columnId,
          patch: { logicalName: entry.inferred },
        },
  )
}
