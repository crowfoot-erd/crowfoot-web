/**
 * 데이터 브라우저 API (09-database-manager/00-data-browser.md) — 객체 목록·구조·행 조회·행 수.
 *
 * DB 매니저(`crowfoot-database-manager`)가 제공한다. 조회도 POST다 — 자격 증명과 비용이 따르는 경로이고
 * 응답을 캐시하면 안 된다. 값은 문자열·null·잘린 셀·이진 셀 넷 중 하나로 온다(§2.2).
 */
import { apiPost } from '@/api/client'

const base = (workspaceId: string, connectionId: string) =>
  `/api/v1/database-manager/workspaces/${workspaceId}/connections/${connectionId}`

const objectBase = (workspaceId: string, connectionId: string, objectName: string) =>
  `${base(workspaceId, connectionId)}/objects/${encodeURIComponent(objectName)}`

export interface DatabaseObject {
  name: string
  kind: 'TABLE' | 'VIEW'
  /** 카탈로그 통계의 추정 행 수 — 정확한 수가 아니다. 통계가 없으면 null */
  estimatedRows: number | null
  /** 행 편집을 할 수 있는지 — 기본 키가 있는 테이블만 true */
  editable: boolean
  comment: string | null
}

export interface DatabaseObjects {
  dbmsType: string
  schema: string
  objects: DatabaseObject[]
}

export type ColumnCategory =
  | 'integer' | 'decimal' | 'float' | 'character' | 'text' | 'boolean'
  | 'datetime' | 'json' | 'uuid' | 'binary' | 'other'

export interface ColumnMeta {
  name: string
  typeName: string
  category: ColumnCategory
  nullable: boolean
  primaryKey: boolean
}

export interface StructureColumn extends ColumnMeta {
  defaultValue: string | null
  autoIncrement: boolean
  comment: string | null
}

export interface ObjectStructure {
  name: string
  kind: 'TABLE' | 'VIEW'
  comment: string | null
  editable: boolean
  columns: StructureColumn[]
  primaryKey: string[]
  indexes: { name: string; unique: boolean; columns: string[] }[]
  foreignKeys: { name: string; columns: string[]; referencedObject: string; referencedColumns: string[] }[]
}

/** 잘린 문자 값 — text는 앞부분, length는 전체 글자 수 */
export interface TruncatedCell {
  truncated: true
  text: string
  length: number
}

/** 이진 값 — previewHex는 앞 32바이트의 16진 표기 */
export interface BinaryCell {
  binary: true
  length: number
  previewHex: string
}

export type CellValue = string | null | TruncatedCell | BinaryCell

export const isTruncatedCell = (cell: CellValue): cell is TruncatedCell =>
  typeof cell === 'object' && cell !== null && 'truncated' in cell
export const isBinaryCell = (cell: CellValue): cell is BinaryCell =>
  typeof cell === 'object' && cell !== null && 'binary' in cell

export type FilterOp =
  | 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE'
  | 'CONTAINS' | 'STARTS_WITH' | 'IN' | 'IS_NULL' | 'IS_NOT_NULL'

export interface RowFilter {
  column: string
  op: FilterOp
  /** 문자열(비교·LIKE), 문자열 배열(IN), 없음(IS_NULL·IS_NOT_NULL) */
  value?: string | string[]
}

export interface RowSort {
  column: string
  direction: 'ASC' | 'DESC'
}

export interface RowsQuery {
  page: number
  size: number
  filters: RowFilter[]
  sort: RowSort[]
}

export interface RowsPage {
  columns: ColumnMeta[]
  rows: CellValue[][]
  page: number
  size: number
  /** 다음 페이지가 있는지 — 전체 행 수는 세지 않는다 */
  hasNext: boolean
  /** 응답 크기 한도 때문에 이 페이지의 행을 줄였는지 */
  truncated: boolean
  elapsedMs: number
}

export function fetchDatabaseObjects(workspaceId: string, connectionId: string, signal?: AbortSignal) {
  return apiPost<DatabaseObjects>(`${base(workspaceId, connectionId)}/objects`, undefined, signal)
}

export function fetchObjectStructure(workspaceId: string, connectionId: string, objectName: string, signal?: AbortSignal) {
  return apiPost<ObjectStructure>(`${objectBase(workspaceId, connectionId, objectName)}/structure`, undefined, signal)
}

export function fetchObjectRows(
  workspaceId: string,
  connectionId: string,
  objectName: string,
  query: RowsQuery,
  signal?: AbortSignal,
) {
  return apiPost<RowsPage>(`${objectBase(workspaceId, connectionId, objectName)}/rows`, query, signal)
}

/** 정확한 행 수 — 수도 문자열로 온다 */
export function countObjectRows(workspaceId: string, connectionId: string, objectName: string, filters: RowFilter[]) {
  return apiPost<{ count: string; elapsedMs: number }>(
    `${objectBase(workspaceId, connectionId, objectName)}/count`,
    { filters },
  )
}

export type StatementKind = 'READ' | 'WRITE' | 'DDL'

/** SQL 콘솔 실행 결과(§3.6) — 데이터베이스가 문장을 거부해도 200이고 ok가 false다 */
export interface QueryResult {
  kind: StatementKind
  ok: boolean
  columns: ColumnMeta[] | null
  rows: CellValue[][] | null
  rowCount: number | null
  /** 행 수·응답 크기 한도 때문에 결과를 잘랐는지 */
  truncated: boolean
  affectedRows: number | null
  elapsedMs: number
  error: { message: string; sqlState: string | null } | null
}

/** SQL 한 문장 실행 — 쓰기·구조 문장은 confirmed 없이 보내면 CONFIRMATION_REQUIRED(errors[0].code = 종류)로 돌아온다 */
export function runQuery(workspaceId: string, connectionId: string, sql: string, confirmed: boolean) {
  return apiPost<QueryResult>(`${base(workspaceId, connectionId)}/queries`, { sql, confirmed })
}

/** 데이터 브라우저 화면 경로 — 새 창 전체 화면(§5.1). object를 주면 그 객체를 고른 상태로 열린다 */
export function databaseBrowserPath(workspaceId: string, connectionId: string, objectName?: string): string {
  const path = `/workspaces/${workspaceId}/connections/${connectionId}/data`
  return objectName ? `${path}?object=${encodeURIComponent(objectName)}` : path
}
