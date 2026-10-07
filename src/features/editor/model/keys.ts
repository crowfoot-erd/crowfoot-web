/**
 * 유니크 키·인덱스 이름 규칙 (05-editor/01-core.md §18)
 *
 * 키 이름은 **문서 전체에서 유일**하다. DBMS마다 제약·인덱스 이름 네임스페이스가
 * 다르지만(MySQL은 테이블 단위, PostgreSQL·Oracle은 스키마 단위) 문서 수준 유일이
 * 어느 쪽에도 안전하다. 네임스페이스는 UK·인덱스끼리만이 아니라 PK·FK 제약 이름까지
 * 포함한다 — DDL 생성 시 같은 스키마에서 충돌하지 않게.
 *
 * 기본 이름: `uk_테이블_컬럼…` / `idx_테이블_컬럼…` 소문자(복합은 선택 순서).
 * CHECK 제약(v1.34)도 같은 네임스페이스다 — 기본 이름은 `ck_테이블_n`(n은 1부터, 겹치지 않는 첫 번호).
 * 충돌 시 `_1`, `_2` 접미 — FK 컬럼 이름 규칙(relationship.ts)과 같은 방식.
 */
import type { ErdColumn, ErdIndex, ErdModelData, ErdTable } from '@/features/editor/model/content-schema'

export type KeyKind = 'unique' | 'index'

/** 문서 전체 키 이름 집합(소문자) — 자동 이름 충돌 회피·중복 검증이 같은 집합을 쓴다 */
export function documentKeyNames(model: ErdModelData): Set<string> {
  const names = new Set<string>()
  for (const table of model.tables) {
    if (table.primaryKey) names.add(table.primaryKey.name.toLowerCase())
    for (const unique of table.uniques) names.add(unique.name.toLowerCase())
    for (const index of table.indexes) names.add(index.name.toLowerCase())
    for (const check of table.checks) names.add(check.name.toLowerCase())
  }
  for (const rel of model.relationships) names.add(rel.fkName.toLowerCase())
  return names
}

/** 충돌 회피 접미 — base가 있으면 `_1`, `_2`… (대소문자 무시 비교 — 집합은 소문자로 정규화되어 있다) */
export function nextName(existing: ReadonlySet<string>, base: string): string {
  if (!existing.has(base.toLowerCase())) return base
  for (let i = 1; ; i += 1) {
    const candidate = `${base}_${i}`
    if (!existing.has(candidate.toLowerCase())) return candidate
  }
}

/** 기본 키 이름 — kind 접두(uk/idx) + 테이블 물리명 + 컬럼 물리명들(선택 순서), 문서 내 유일 보장 */
export function defaultKeyName(
  model: ErdModelData,
  table: ErdTable,
  kind: KeyKind,
  columns: ErdColumn[],
): string {
  const parts = [
    kind === 'unique' ? 'uk' : 'idx',
    table.physicalName.toLowerCase() || 'table',
    ...columns.map((column) => column.physicalName.toLowerCase() || 'column'),
  ]
  return nextName(documentKeyNames(model), parts.join('_'))
}

/** CHECK 제약 기본 이름 — `ck_테이블_n` 소문자. 식은 컬럼을 가리키지 않으므로 번호로 구분한다 */
export function defaultCheckName(model: ErdModelData, table: ErdTable): string {
  const existing = documentKeyNames(model)
  const base = `ck_${table.physicalName.toLowerCase() || 'table'}`
  for (let n = 1; ; n += 1) {
    const candidate = `${base}_${n}`
    if (!existing.has(candidate)) return candidate
  }
}

/** CHECK 식이 컬럼을 쓰는지 — 문자열 리터럴 안은 보지 않고, 따옴표 없는 식별자와 따옴표(큰따옴표·백틱·대괄호)
 *  식별자를 대소문자 없이 비교한다. core CheckExpressions와 같은 규칙(컬럼을 지우면 그 컬럼을 쓰는 CHECK도 지운다 — v1.37) */
export function checkReferencesColumn(expression: string, columnName: string): boolean {
  if (!columnName) return false
  const target = columnName.toLowerCase()
  const isWordStart = (ch: string) => /[\p{L}_]/u.test(ch)
  const isWordPart = (ch: string) => /[\p{L}\p{N}_$]/u.test(ch)
  const skipQuoted = (open: number, close: string): number => {
    let i = open + 1
    while (i < expression.length) {
      if (expression[i] === close) {
        if (expression[i + 1] === close) {
          i += 2
          continue
        }
        return i + 1
      }
      i += 1
    }
    return expression.length
  }
  let i = 0
  while (i < expression.length) {
    const ch = expression[i]
    if (ch === "'") {
      i = skipQuoted(i, "'")
      continue
    }
    if (ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch
      const end = skipQuoted(i, close)
      const name = expression.slice(i + 1, Math.max(i + 1, end - 1)).split(close + close).join(close)
      if (name.toLowerCase() === target) return true
      i = end
      continue
    }
    if (isWordStart(ch)) {
      const start = i
      while (i < expression.length && isWordPart(expression[i])) i += 1
      if (expression.slice(start, i).toLowerCase() === target) return true
      continue
    }
    if (/[0-9]/.test(ch)) {
      // 숫자 뒤에 붙은 글자(1e5·0x1F)는 식별자가 아니다
      while (i < expression.length && /[\p{L}\p{N}.]/u.test(expression[i])) i += 1
      continue
    }
    i += 1
  }
  return false
}

/** 식의 바깥 괄호 한 겹을 벗긴다 — `(a > 0)`은 `a > 0`. `(a) OR (b)`처럼 괄호가 짝이 아니면 그대로 둔다 */
export function stripOuterParens(raw: string): string {
  const text = raw.trim()
  if (!text.startsWith('(') || !text.endsWith(')')) return text
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') depth -= 1
    // 끝에 닿기 전에 바깥 괄호가 닫히면 한 겹이 아니다
    if (depth === 0 && i < text.length - 1) return text
  }
  return text.slice(1, -1).trim()
}

/* ---------- 특수 인덱스(v1.37 — 유니크·식·부분·INCLUDE·연산자 클래스) ---------- */

/** 식 인덱스인가 — 키 목록이 원문(expression)이면 columns는 비어 있고 무시한다 */
export function isExpressionIndex(index: ErdIndex): boolean {
  return (index.expression ?? '').trim() !== ''
}

/** FK를 덮는 인덱스로 칠 수 있는가 — 식 인덱스·부분 인덱스(WHERE)는 모든 행의 FK 컬럼을 덮지 않으므로 세지 않는다 */
export function indexCoversColumns(index: ErdIndex): boolean {
  return !isExpressionIndex(index) && (index.where ?? '').trim() === ''
}

/** 인덱스 내용 서명 — 이름·종류·파서·컬럼(정렬·연산자 클래스)·유니크·식·조건·INCLUDE.
 *  비교 전용(차분·병합) — 없는 필드와 null·false·빈 배열을 같게 본다(이전 문서와 새 필드 기본값이 같은 뜻) */
export function indexSignature(index: ErdIndex): string {
  return JSON.stringify([
    index.name,
    index.type ?? 'BTREE',
    index.parser ?? null,
    index.columns.map((c) => [c.columnId, c.order, c.opclass ?? null]),
    index.unique === true,
    index.expression ?? null,
    index.where ?? null,
    index.include ?? [],
  ])
}

/** 인덱스 한 줄 표기 — `UNIQUE GIN lower(nickname) INCLUDE (a) WHERE …`. 컬럼 이름은 nameOf로 푼다(차분 상세·캔버스 툴팁) */
export function indexDetail(index: ErdIndex, nameOf: (columnId: string) => string): string {
  const parts: string[] = []
  if (index.unique) parts.push('UNIQUE')
  if (index.type && index.type !== 'BTREE') parts.push(index.type)
  parts.push(
    isExpressionIndex(index)
      ? (index.expression ?? '').trim()
      : index.columns.map((c) => (c.opclass ? `${nameOf(c.columnId)} ${c.opclass}` : nameOf(c.columnId))).join(', '),
  )
  if (index.include && index.include.length > 0) parts.push(`INCLUDE (${index.include.map(nameOf).join(', ')})`)
  if (index.where && index.where.trim() !== '') parts.push(`WHERE ${index.where.trim()}`)
  return parts.join(' ')
}

/** 컬럼 삭제 시 인덱스 정리 — 키·INCLUDE에서 그 컬럼을 빼고, 식·조건 원문이 그 컬럼 이름을 쓰면 인덱스째 지운다
 *  (CHECK와 같은 규칙 — checkReferencesColumn). 컬럼도 식도 남지 않은 인덱스는 지운다. 정렬·연산자 클래스는 보존 */
export function indexesWithoutColumn(indexes: ErdIndex[], columnId: string, columnName: string): ErdIndex[] {
  return indexes
    .filter(
      (index) =>
        !checkReferencesColumn(index.expression ?? '', columnName) && !checkReferencesColumn(index.where ?? '', columnName),
    )
    .map((index) => {
      const inKey = index.columns.some((entry) => entry.columnId === columnId)
      const inInclude = index.include?.includes(columnId) ?? false
      if (!inKey && !inInclude) return index
      return {
        ...index,
        ...(inKey ? { columns: index.columns.filter((entry) => entry.columnId !== columnId) } : {}),
        ...(inInclude ? { include: index.include!.filter((id) => id !== columnId) } : {}),
      }
    })
    .filter((index) => index.columns.length > 0 || isExpressionIndex(index))
}

/** 특수 인덱스 필드(v1.37)를 덮어쓴다 — 값이 없으면(false·null·빈 배열) 키째 뺀다.
 *  일반 인덱스가 이전 문서와 같은 모양(새 키 없음)으로 남게 한다 */
export function withIndexExtras(
  index: ErdIndex,
  extras: { unique: boolean; expression: string | null; where: string | null; include: string[] },
): ErdIndex {
  const rest: ErdIndex = { ...index }
  delete rest.unique
  delete rest.expression
  delete rest.where
  delete rest.include
  return {
    ...rest,
    ...(extras.unique ? { unique: true } : {}),
    ...(extras.expression ? { expression: extras.expression, columns: [] } : {}),
    ...(extras.where ? { where: extras.where } : {}),
    ...(extras.include.length > 0 ? { include: extras.include } : {}),
  }
}

/** PostgreSQL 캐스트 — `::text`, `::character varying(20)`, `::text[]` (core SchemaDiffer.PG_CAST와 같다) */
const PG_CAST = /::(?:character varying|double precision|timestamp(?: with(?:out)? time zone)?|[a-z_][a-z0-9_]*)(?:\(\d+(?:,\s*\d+)?\))?(?:\[\])?/g
/** `= ANY (ARRAY[` — IN 목록을 PostgreSQL이 다시 쓴 꼴 */
const PG_ANY_ARRAY = /=\s*any\s*\(+\s*array\s*\[/g

/** 식 비교 키 — DBMS가 돌려줄 때 덧붙이는 괄호·백틱·큰따옴표·공백·대소문자·PostgreSQL 캐스트를 무시한다.
 *  core SchemaDiffer.expressionKey와 같은 정규화(v1.37 — 인덱스 식·조건 비교). null·빈값은 null */
export function expressionKey(expression: string | null | undefined): string | null {
  if (expression == null || expression.trim() === '') return null
  return expression
    .toLowerCase()
    .replace(PG_CAST, '')
    .replace(PG_ANY_ARRAY, ' in (')
    .replaceAll(']', ')')
    .replace(/[()`"\s]/g, '')
}
