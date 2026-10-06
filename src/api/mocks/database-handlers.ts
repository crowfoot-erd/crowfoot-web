/**
 * MSW 핸들러 — 데이터 브라우저(DB 매니저) API의 실행 가능한 명세
 * (09-database-manager/00-data-browser.md §3.1~3.4)
 *
 * 기본(성공) 시나리오만 정의한다. 행 조회는 요청 본문의 정렬·조건·페이지를 실제로 적용해
 * 화면이 보낸 요청이 결과에 드러나게 한다(EQ·CONTAINS·IS_NULL만 — 테스트가 쓰는 범위).
 * 기본 키(id) 순서면 키 기준 페이지 넘김(after·before — §5.11)도 서버처럼 처리한다.
 * SQL 콘솔은 첫 키워드로 종류를 나눠 계약 형태(읽기 결과·확인 요청·영향 행 수·거부)만 흉내 낸다.
 * 수용 기준 데이터 확인(checks)도 SQL 문구로 결과를 정한다.
 */
import { HttpResponse, http } from 'msw'

import { fail, ok } from '@/api/mocks/handlers'
import type {
  CellValue,
  ColumnMeta,
  DatabaseObjects,
  ObjectStructure,
  RowFilter,
  RowsQuery,
} from '@/features/database/api'

const BASE = '/api/v1/database-manager/workspaces/:workspaceId/connections/:connectionId'

export const databaseFixtures = {
  objects: {
    dbmsType: 'mysql',
    schema: 'members',
    objects: [
      { name: 'order_logs', kind: 'TABLE', estimatedRows: 12, editable: false, comment: null },
      { name: 'orders', kind: 'TABLE', estimatedRows: 128400, editable: true, comment: '주문' },
      { name: 'paid_orders', kind: 'VIEW', estimatedRows: null, editable: false, comment: null },
      { name: 'users', kind: 'TABLE', estimatedRows: 3, editable: true, comment: '회원' },
    ],
  } satisfies DatabaseObjects,
  orderColumns: [
    { name: 'id', typeName: 'BIGINT', category: 'integer', nullable: false, primaryKey: true },
    { name: 'status', typeName: 'VARCHAR(20)', category: 'character', nullable: false, primaryKey: false },
    { name: 'memo', typeName: 'TEXT', category: 'text', nullable: true, primaryKey: false },
    { name: 'receipt', typeName: 'BLOB', category: 'binary', nullable: true, primaryKey: false },
  ] satisfies ColumnMeta[],
  /** orders 5행 — NULL·빈 문자열·잘린 값·이진 값을 한 번씩 담는다 */
  orderRows: [
    ['1', 'PAID', null, null],
    ['2', 'PAID', '', null],
    ['3', 'READY', { truncated: true, text: '긴 메모의 앞부분', length: 51234 }, null],
    ['4', 'PAID', '선물 포장', { binary: true, length: 2048, previewHex: '89504e47' }],
    ['5', 'CANCELLED', '고객 요청', null],
  ] satisfies CellValue[][],
  /** 3번 주문의 memo 전체 — 행 조회에서는 앞부분만 잘려 내려온다 */
  longMemo: '긴 메모의 앞부분' + ' 그리고 이어지는 뒷부분'.repeat(3),
  orderStructure: {
    name: 'orders',
    kind: 'TABLE',
    comment: '주문',
    editable: true,
    columns: [
      { name: 'id', typeName: 'BIGINT', category: 'integer', nullable: false, primaryKey: true, defaultValue: null, autoIncrement: true, comment: '주문 ID' },
      { name: 'status', typeName: 'VARCHAR(20)', category: 'character', nullable: false, primaryKey: false, defaultValue: 'READY', autoIncrement: false, comment: null },
      { name: 'memo', typeName: 'TEXT', category: 'text', nullable: true, primaryKey: false, defaultValue: null, autoIncrement: false, comment: null },
      { name: 'receipt', typeName: 'BLOB', category: 'binary', nullable: true, primaryKey: false, defaultValue: null, autoIncrement: false, comment: null },
    ],
    primaryKey: ['id'],
    indexes: [{ name: 'idx_orders_status', unique: false, columns: ['status'] }],
    foreignKeys: [{ name: 'fk_orders_user_id', columns: ['user_id'], referencedObject: 'users', referencedColumns: ['id'] }],
  } satisfies ObjectStructure,
}

function matches(row: CellValue[], filter: RowFilter, columns: ColumnMeta[]): boolean {
  const cell = row[columns.findIndex((column) => column.name === filter.column)]
  if (filter.op === 'IS_NULL') return cell === null
  if (filter.op === 'IS_NOT_NULL') return cell !== null
  const text = typeof cell === 'string' ? cell : ''
  if (filter.op === 'EQ') return text === filter.value
  if (filter.op === 'CONTAINS') return typeof filter.value === 'string' && text.includes(filter.value)
  return true
}

export const databaseHandlers = [
  http.post(`${BASE}/objects`, () => HttpResponse.json(ok({ response: databaseFixtures.objects }))),

  http.post(`${BASE}/objects/:objectName/structure`, ({ params }) =>
    params.objectName === 'orders'
      ? HttpResponse.json(ok({ response: databaseFixtures.orderStructure }))
      : fail('OBJECT_NOT_FOUND', 404),
  ),

  http.post(`${BASE}/objects/:objectName/rows`, async ({ params, request }) => {
    if (params.objectName !== 'orders') return fail('OBJECT_NOT_FOUND', 404)
    const query = (await request.json()) as RowsQuery
    const columns = databaseFixtures.orderColumns
    let rows: CellValue[][] = databaseFixtures.orderRows.filter((row) =>
      (query.filters ?? []).every((filter) => matches(row, filter, columns)),
    )
    const sort = query.sort?.[0]
    if (sort) {
      const index = columns.findIndex((column) => column.name === sort.column)
      rows = [...rows].sort((a, b) => String(a[index] ?? '').localeCompare(String(b[index] ?? '')))
      if (sort.direction === 'DESC') rows.reverse()
    }
    // 키 기준 페이지 넘김 — 정렬이 없거나 기본 키(id) 하나일 때만. 그 밖에 after·before가 오면 400
    const keyset = !sort || (query.sort.length === 1 && sort.column === 'id')
    if ((query.after || query.before) && (!keyset || (query.after && query.before))) {
      return fail('INVALID_REQUEST', 400)
    }
    const descending = sort?.direction === 'DESC'
    const idOf = (row: CellValue[]) => Number(row[0])
    let page: CellValue[][]
    let hasNext: boolean
    let hasPrevious: boolean
    if (query.after) {
      const key = Number(query.after.id)
      const rest = rows.filter((row) => (descending ? idOf(row) < key : idOf(row) > key))
      page = rest.slice(0, query.size)
      hasNext = rest.length > query.size
      hasPrevious = true
    } else if (query.before) {
      const key = Number(query.before.id)
      const ahead = rows.filter((row) => (descending ? idOf(row) > key : idOf(row) < key))
      page = ahead.slice(Math.max(0, ahead.length - query.size))
      hasNext = true
      hasPrevious = ahead.length > query.size
    } else {
      const start = (query.page - 1) * query.size
      page = rows.slice(start, start + query.size)
      hasNext = rows.length > start + query.size
      hasPrevious = query.page > 1
    }
    const keyOf = (row: CellValue[] | undefined) => (row ? { id: String(row[0]) } : null)
    return HttpResponse.json(
      ok({
        response: {
          columns,
          rows: page,
          page: query.page,
          size: query.size,
          hasNext,
          truncated: false,
          elapsedMs: 12,
          hasPrevious,
          keyset,
          firstKey: keyset ? keyOf(page[0]) : null,
          lastKey: keyset ? keyOf(page.at(-1)) : null,
        },
      }),
    )
  }),

  http.post(`${BASE}/objects/:objectName/count`, async ({ request }) => {
    const body = (await request.json()) as { filters?: RowFilter[] }
    const count = databaseFixtures.orderRows.filter((row) =>
      (body.filters ?? []).every((filter) => matches(row, filter, databaseFixtures.orderColumns)),
    ).length
    return HttpResponse.json(ok({ response: { count: String(128431 - 5 + count), elapsedMs: 310 } }))
  }),

  http.post(`${BASE}/queries`, async ({ request }) => {
    const body = (await request.json()) as { sql: string; confirmed?: boolean }
    const keyword = body.sql.trim().split(/\s+/)[0].toUpperCase()
    if (body.sql.includes('no_such_table')) {
      return HttpResponse.json(
        ok({
          response: {
            kind: 'READ', ok: false, columns: null, rows: null, rowCount: null, truncated: false, affectedRows: null,
            elapsedMs: 4, error: { message: "Table 'members.no_such_table' doesn't exist", sqlState: '42S02' },
          },
        }),
      )
    }
    if (keyword === 'SELECT') {
      return HttpResponse.json(
        ok({
          response: {
            kind: 'READ', ok: true, columns: databaseFixtures.orderColumns, rows: databaseFixtures.orderRows.slice(0, 2),
            rowCount: 2, truncated: false, affectedRows: null, elapsedMs: 18, error: null,
          },
        }),
      )
    }
    const kind = ['INSERT', 'UPDATE', 'DELETE'].includes(keyword) ? 'WRITE' : 'DDL'
    if (!body.confirmed) {
      return fail('CONFIRMATION_REQUIRED', 409, [{ field: 'kind', code: kind, message: '' }])
    }
    return HttpResponse.json(
      ok({
        response: {
          kind, ok: true, columns: null, rows: null, rowCount: null, truncated: false,
          affectedRows: kind === 'WRITE' ? 3 : null, elapsedMs: 9, error: null,
        },
      }),
    )
  }),

  /** 행 편집 적용 — 건수만 세어 돌려준다. 실패 시나리오는 테스트가 server.use()로 덧씌운다 */
  http.post(`${BASE}/objects/:objectName/changes`, async ({ request }) => {
    const body = (await request.json()) as { changes: { op: string }[] }
    const countOf = (op: string) => body.changes.filter((change) => change.op === op).length
    return HttpResponse.json(
      ok({
        response: {
          inserted: countOf('INSERT'),
          updated: countOf('UPDATE'),
          deleted: countOf('DELETE'),
          generatedKeys: body.changes
            .map((change, index) => ({ change, index }))
            .filter(({ change }) => change.op === 'INSERT')
            .map(({ index }) => ({ index, key: { id: String(100 + index) } })),
          elapsedMs: 21,
        },
      }),
    )
  }),

  /**
   * 수용 기준 데이터 확인(v1.36) — SQL을 실행하지 않고 문구로 결과를 정한다.
   * 둘째 문장이 있으면 MULTIPLE_STATEMENTS, SELECT·WITH가 아니면 UNSUPPORTED_STATEMENT(첫 키워드),
   * no_such_table이면 QUERY_FAILED(데이터베이스 문구), SLEEP이면 QUERY_TIMEOUT, "WHERE 1 = 0"이면 NO_RESULT.
   * 그 밖에는 값을 "0"으로 돌려준다 — 단 IS NULL이 있으면 "3"(실패를 흉내 낸다).
   */
  http.post(`${BASE}/checks`, async ({ request }) => {
    const body = (await request.json()) as { checks: { key: string; sql: string; expect?: string }[] }
    const results = body.checks.map(({ key, sql, expect = '0' }) => {
      const text = sql.trim().replace(/;\s*$/, '')
      const keyword = text.split(/\s+/)[0].toUpperCase()
      const error = (errorCode: string, message: string | null = null) =>
        ({ key, status: 'ERROR', value: null, expect, errorCode, message, elapsedMs: 3 }) as const
      if (text.includes(';')) return error('MULTIPLE_STATEMENTS')
      if (keyword !== 'SELECT' && keyword !== 'WITH') return error('UNSUPPORTED_STATEMENT', keyword)
      if (text.includes('no_such_table')) return error('QUERY_FAILED', "Table 'members.no_such_table' doesn't exist")
      if (/sleep/i.test(text)) return error('QUERY_TIMEOUT')
      if (/where\s+1\s*=\s*0/i.test(text)) return error('NO_RESULT')
      const value = /is\s+null/i.test(text) ? '3' : '0'
      return { key, status: value === expect ? 'PASSED' : 'FAILED', value, expect, errorCode: null, message: null, elapsedMs: 7 }
    })
    const count = (status: string) => results.filter((result) => result.status === status).length
    return HttpResponse.json(
      ok({ response: { results, passed: count('PASSED'), failed: count('FAILED'), errors: count('ERROR'), elapsedMs: 24 } }),
    )
  }),

  /** 긴 값 읽기 — 3번 주문의 memo 전체 */
  http.post(`${BASE}/objects/:objectName/cell`, () =>
    HttpResponse.json(ok({ response: { column: 'memo', value: databaseFixtures.longMemo, length: databaseFixtures.longMemo.length } })),
  ),
]

