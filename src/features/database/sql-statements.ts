/**
 * SQL 입력 칸에서 실행할 문장 고르기 (09-database-manager/00-data-browser.md §5.3)
 *
 * 입력 칸에 문장이 여러 개 있으면 커서가 놓인 문장만 보낸다. 서버는 한 번에 한 문장만 받는다(§3.6).
 * 따옴표·주석·PostgreSQL 달러 인용 안의 세미콜론은 문장 경계가 아니다 — 서버의 SqlScanner와 같은 규칙이다.
 * 여기서 잘못 나눠도 위험하지 않다: 서버가 문장 수를 다시 세고, 둘 이상이면 실행하지 않는다.
 */

export interface StatementRange {
  /** 문장 시작 위치(포함) */
  start: number
  /** 문장 끝 위치(세미콜론 앞, 제외) */
  end: number
}

/** 세미콜론으로 나뉜 구간들 — 내용이 없는 구간(공백·주석뿐)도 포함한다 */
export function statementRanges(sql: string, mysql: boolean): StatementRange[] {
  const ranges: StatementRange[] = []
  let start = 0
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      i = skipLine(sql, i)
    } else if (mysql && c === '#') {
      i = skipLine(sql, i)
    } else if (c === '/' && next === '*') {
      i = skipBlockComment(sql, i, !mysql)
    } else if (c === "'") {
      const backslash = mysql || sql[i - 1] === 'E' || sql[i - 1] === 'e'
      i = skipQuoted(sql, i, "'", backslash)
    } else if (c === '"') {
      i = skipQuoted(sql, i, '"', mysql)
    } else if (mysql && c === '`') {
      i = skipQuoted(sql, i, '`', false)
    } else if (!mysql && c === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length)
        i = close < 0 ? n : close + tag[0].length
      } else {
        i++
      }
    } else if (c === ';') {
      ranges.push({ start, end: i })
      start = i + 1
      i++
    } else {
      i++
    }
  }
  ranges.push({ start, end: n })
  return ranges
}

/**
 * 실행할 문장 — 선택 영역이 있으면 그 글자, 없으면 커서가 놓인 문장.
 * 커서가 세미콜론 바로 뒤(문장 끝)에 있으면 앞 문장을 고른다. 내용이 없으면 빈 문자열이다.
 */
export function statementToRun(
  sql: string,
  selectionStart: number,
  selectionEnd: number,
  mysql: boolean,
): string {
  if (selectionEnd > selectionStart) {
    return sql.slice(selectionStart, selectionEnd).trim()
  }
  const ranges = statementRanges(sql, mysql)
  let index = ranges.findIndex(
    (range) => selectionStart >= range.start && selectionStart <= range.end,
  )
  if (index < 0) index = ranges.length - 1
  // 커서가 빈 구간(마지막 세미콜론 뒤 등)에 있으면 내용이 있는 앞 문장으로 물러선다
  while (index > 0 && sql.slice(ranges[index].start, ranges[index].end).trim() === '') index--
  return sql.slice(ranges[index].start, ranges[index].end).trim()
}

function skipLine(sql: string, from: number): number {
  const end = sql.indexOf('\n', from)
  return end < 0 ? sql.length : end + 1
}

function skipBlockComment(sql: string, from: number, nested: boolean): number {
  let depth = 1
  let i = from + 2
  while (i < sql.length && depth > 0) {
    if (sql.startsWith('*/', i)) {
      depth--
      i += 2
    } else if (nested && sql.startsWith('/*', i)) {
      depth++
      i += 2
    } else {
      i++
    }
  }
  return i
}

function skipQuoted(sql: string, from: number, quote: string, backslashEscapes: boolean): number {
  let i = from + 1
  while (i < sql.length) {
    const c = sql[i]
    if (backslashEscapes && c === '\\') {
      i += 2
    } else if (c === quote) {
      if (sql[i + 1] === quote) i += 2
      else return i + 1
    } else {
      i++
    }
  }
  return sql.length
}
