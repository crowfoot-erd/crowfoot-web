/**
 * SQL 실행 이력 — 브라우저에만 저장한다 (09-database-manager/00-data-browser.md §5.3)
 *
 * 커넥션마다 최근 50건이다. 서버에는 SQL 본문을 저장하지 않는다(§1.2) — 이력은 이 브라우저에서만 보인다.
 * 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 이력 없이 동작한다.
 */

export interface SqlHistoryEntry {
  sql: string
  /** 실행 시각 — ISO 8601 */
  at: string
  ok: boolean
}

const HISTORY_MAX = 50
const key = (connectionId: string) => `crowfoot.database.sql-history.${connectionId}`

export function readSqlHistory(connectionId: string): SqlHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(connectionId)) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is SqlHistoryEntry =>
        typeof entry === 'object' && entry !== null && typeof (entry as SqlHistoryEntry).sql === 'string',
    )
  } catch {
    return []
  }
}

/** 맨 앞에 넣는다 — 바로 앞과 같은 문장은 시각만 갱신한다 */
export function pushSqlHistory(connectionId: string, entry: SqlHistoryEntry): SqlHistoryEntry[] {
  const previous = readSqlHistory(connectionId)
  const next = [entry, ...(previous[0]?.sql === entry.sql ? previous.slice(1) : previous)].slice(0, HISTORY_MAX)
  try {
    window.localStorage.setItem(key(connectionId), JSON.stringify(next))
  } catch {
    // 저장 실패는 이력만 잃는다 — 실행 결과에는 영향이 없다
  }
  return next
}
