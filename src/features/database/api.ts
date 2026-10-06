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
  | 'integer'
  | 'decimal'
  | 'float'
  | 'character'
  | 'text'
  | 'boolean'
  | 'datetime'
  | 'json'
  | 'uuid'
  | 'binary'
  | 'other'

export interface ColumnMeta {
  name: string
  typeName: string
  category: ColumnCategory
  nullable: boolean
  primaryKey: boolean
  /** 생성 컬럼(계산 컬럼) — 값을 넣거나 고칠 수 없다(§5.9). 질의 결과 열에는 없다 */
  generated?: boolean
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
  foreignKeys: {
    name: string
    columns: string[]
    referencedObject: string
    referencedColumns: string[]
  }[]
  /** 이 테이블을 참조하는 외래 키 — object의 columns가 이 테이블의 referencedColumns를 가리킨다(§5.9) */
  referencedBy?: { name: string; object: string; columns: string[]; referencedColumns: string[] }[]
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
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE'
  | 'CONTAINS'
  | 'STARTS_WITH'
  | 'IN'
  | 'IS_NULL'
  | 'IS_NOT_NULL'

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

/** 기본 키 컬럼 이름 → 값(문자열) — 키 기준 페이지 넘김에 쓴다(§5.11) */
export type RowKey = Record<string, string>

export interface RowsQuery {
  /** 1부터. after·before와 함께 보내면 서버는 건너뛰는 데 쓰지 않고 그대로 돌려준다 */
  page: number
  size: number
  filters: RowFilter[]
  sort: RowSort[]
  /** 이 기본 키 값 다음 행부터 — 앞 페이지 응답의 lastKey(§5.11) */
  after?: RowKey
  /** 이 기본 키 값 앞의 행 — 뒤 페이지 응답의 firstKey(§5.11). after와 함께 보내지 않는다 */
  before?: RowKey
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
  /** 이전 페이지가 있는지(v1.36) — 없으면 쪽 번호로 판단한다 */
  hasPrevious?: boolean
  /** 이 정렬에서 키 기준 페이지 넘김(after·before)을 쓸 수 있는지(v1.36) */
  keyset?: boolean
  /** keyset일 때 첫 행·마지막 행의 기본 키 값 — 행이 없으면 null */
  firstKey?: RowKey | null
  lastKey?: RowKey | null
}

export function fetchDatabaseObjects(
  workspaceId: string,
  connectionId: string,
  signal?: AbortSignal,
) {
  return apiPost<DatabaseObjects>(`${base(workspaceId, connectionId)}/objects`, undefined, signal)
}

export function fetchObjectStructure(
  workspaceId: string,
  connectionId: string,
  objectName: string,
  signal?: AbortSignal,
) {
  return apiPost<ObjectStructure>(
    `${objectBase(workspaceId, connectionId, objectName)}/structure`,
    undefined,
    signal,
  )
}

export function fetchObjectRows(
  workspaceId: string,
  connectionId: string,
  objectName: string,
  query: RowsQuery,
  signal?: AbortSignal,
) {
  return apiPost<RowsPage>(
    `${objectBase(workspaceId, connectionId, objectName)}/rows`,
    query,
    signal,
  )
}

/** 정확한 행 수 — 수도 문자열로 온다 */
export function countObjectRows(
  workspaceId: string,
  connectionId: string,
  objectName: string,
  filters: RowFilter[],
) {
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
export function runQuery(
  workspaceId: string,
  connectionId: string,
  sql: string,
  confirmed: boolean,
) {
  return apiPost<QueryResult>(`${base(workspaceId, connectionId)}/queries`, { sql, confirmed })
}

/** 행 편집 적용 결과(§3.5) */
export interface ChangesResult {
  inserted: number
  updated: number
  deleted: number
  /** 추가한 행의 기본 키 — index는 요청의 변경 번호(0부터) */
  generatedKeys: { index: number; key: Record<string, string> }[]
  elapsedMs: number
}

/** 모아 둔 변경을 한 번에 적용한다 — 요청 하나가 트랜잭션 하나다. 하나라도 실패하면 전부 되돌린다 */
export function applyRowChanges(
  workspaceId: string,
  connectionId: string,
  objectName: string,
  changes: unknown[],
) {
  return apiPost<ChangesResult>(`${objectBase(workspaceId, connectionId, objectName)}/changes`, {
    changes,
  })
}

/** 긴 값 읽기(§3.7) — 잘려 내려온 문자 값 하나를 통째로 읽는다. NULL이면 value가 null이다 */
export function fetchCellValue(
  workspaceId: string,
  connectionId: string,
  objectName: string,
  key: Record<string, string>,
  column: string,
  signal?: AbortSignal,
) {
  return apiPost<{ column: string; value: string | null; length: number }>(
    `${objectBase(workspaceId, connectionId, objectName)}/cell`,
    { key, column },
    signal,
  )
}

/** 수용 기준 데이터 확인 한 건(v1.36) — key는 요청이 정한다(요구사항 코드/기준 id) */
export interface CriterionCheckRequest {
  key: string
  sql: string
  expect: string
}

export type CheckStatus = 'PASSED' | 'FAILED' | 'ERROR'

export type CheckErrorCode =
  | 'MULTIPLE_STATEMENTS'
  | 'UNSUPPORTED_STATEMENT'
  | 'NO_RESULT'
  | 'QUERY_TIMEOUT'
  | 'QUERY_FAILED'

export interface CheckResult {
  key: string
  status: CheckStatus
  /** 첫 행 첫 열의 값(문자열) — 오류이거나 NULL이면 null */
  value: string | null
  expect: string
  errorCode: CheckErrorCode | null
  /** QUERY_FAILED는 데이터베이스 문구, UNSUPPORTED_STATEMENT는 첫 키워드 */
  message: string | null
  elapsedMs: number
}

export interface ChecksResult {
  results: CheckResult[]
  passed: number
  failed: number
  errors: number
  elapsedMs: number
}

/** 수용 기준 데이터 확인 — 읽기 전용으로 SELECT를 하나씩 실행해 기대값과 비교한다(1~50건) */
export function runCriterionChecks(
  workspaceId: string,
  connectionId: string,
  checks: CriterionCheckRequest[],
) {
  return apiPost<ChecksResult>(`${base(workspaceId, connectionId)}/checks`, { checks })
}

/**
 * 데이터 브라우저 화면 경로 — 새 창 전체 화면(§5.1).
 * object를 주면 그 객체를 고른 상태로 열린다. model은 논리명을 읽어 올 ERD 문서다(§5.2 — 에디터에서 들어올 때).
 */
export function databaseBrowserPath(
  workspaceId: string,
  connectionId: string,
  options: { objectName?: string; modelId?: string } = {},
): string {
  const params = new URLSearchParams()
  if (options.objectName) params.set('object', options.objectName)
  if (options.modelId) params.set('model', options.modelId)
  const query = params.toString()
  const path = `/workspaces/${workspaceId}/connections/${connectionId}/data`
  return query ? `${path}?${query}` : path
}
