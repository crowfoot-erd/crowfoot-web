/**
 * MSW 핸들러 — 데이터 브라우저(DB 매니저) API의 실행 가능한 명세
 * (09-database-manager/00-data-browser.md §3.1~3.4)
 *
 * 기본(성공) 시나리오만 정의한다. 행 조회는 요청 본문의 정렬·조건·페이지를 실제로 적용해
 * 화면이 보낸 요청이 결과에 드러나게 한다(EQ·CONTAINS·IS_NULL만 — 테스트가 쓰는 범위).
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
    const start = (query.page - 1) * query.size
    return HttpResponse.json(
      ok({
        response: {
          columns,
          rows: rows.slice(start, start + query.size),
          page: query.page,
          size: query.size,
          hasNext: rows.length > start + query.size,
          truncated: false,
          elapsedMs: 12,
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
]
