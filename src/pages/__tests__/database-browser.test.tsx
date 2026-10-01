/**
 * 데이터 브라우저 화면 테스트 (09-database-manager/00-data-browser.md §5)
 *
 * given: DB 매니저 API를 MSW로 정의(database-handlers — 정렬·조건·페이지를 실제로 적용)
 * when: 객체를 고르고 정렬·조건·탭을 조작
 * then: 목록·셀 표기(NULL·잘린 값·이진 값)·요청 반영·권한 안내
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fail, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent, serializeContent } from '@/features/editor/model/content-io'
import type { RowsQuery } from '@/features/database/api'
import DatabaseBrowserPage from '@/pages/database-browser'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

const PATH = '/workspaces/:workspaceId/connections/:connectionId/data'

function renderBrowser(route = '/workspaces/101/connections/302/data') {
  return renderWithProviders(<Route path={PATH} element={<DatabaseBrowserPage />} />, { route })
}

/** id 컬럼 값들 — 표의 행 순서 확인용. orders는 편집할 수 있는 표라 첫 칸이 행 작업이고 둘째 칸이 id다 */
function idsInTable(): string[] {
  const table = screen.getByRole('table')
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1].textContent ?? '')
}

beforeEach(() => {
  asAuthenticated()
})

describe('데이터 브라우저 — 객체 목록', () => {
  it('테이블과 뷰를 나눠 보여 주고, 추정 행 수를 붙인다', async () => {
    renderBrowser()

    // then: 머리에 커넥션 이름·DBMS 표시명·접속 대상
    expect(await screen.findByRole('heading', { level: 1, name: '개발 MySQL' })).toBeVisible()
    expect(screen.getByText('MySQL')).toBeVisible()
    expect(await screen.findByText(/db\.dev\.example\.com:3306 \/ members/)).toBeVisible()

    const list = await screen.findByRole('complementary', { name: '테이블과 뷰' })
    expect(await within(list).findByRole('heading', { name: '테이블 (3)' })).toBeVisible()
    expect(within(list).getByRole('heading', { name: '뷰 (1)' })).toBeVisible()
    expect(within(list).getByRole('button', { name: /^orders/ })).toHaveTextContent('약 128,400')
    // 아직 고르지 않았다 — 안내 문구
    expect(screen.getByText('왼쪽에서 테이블이나 뷰를 고르세요')).toBeVisible()
  })

  it('이름으로 찾는다 — 일치하는 것이 없으면 안내한다', async () => {
    renderBrowser()
    const search = await screen.findByLabelText('테이블·뷰 검색')
    await screen.findByRole('button', { name: /users/ })

    await userEvent.type(search, 'paid')
    expect(screen.getByRole('button', { name: /paid_orders/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /users/ })).not.toBeInTheDocument()

    await userEvent.clear(search)
    await userEvent.type(search, 'zzz')
    expect(screen.getByText('일치하는 객체가 없습니다')).toBeVisible()
  })

  it('접속 실패는 목록 자리에 문구와 다시 시도를 보여 준다', async () => {
    server.use(
      http.post('/api/v1/database-manager/workspaces/:w/connections/:c/objects', () => fail('CONNECTION_UNREACHABLE', 502)),
    )
    renderBrowser()

    expect(await screen.findByRole('button', { name: /다시 시도/ })).toBeVisible()
  })
})

describe('데이터 브라우저 — 데이터 탭', () => {
  it('객체를 고르면 행을 보여 준다 — NULL·빈 문자열·잘린 값·이진 값을 구분한다', async () => {
    renderBrowser()
    await userEvent.click(await screen.findByRole('button', { name: /^orders/ }))

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(6) // 머리 1 + 5행
    // 1행: memo NULL / 2행: memo 빈 문자열(빈 칸) / 3행: 잘린 값 / 4행: 이진 값
    // (첫 칸은 행 작업 — id·status·memo·receipt는 1~4번 칸이다)
    expect(within(rows[1]).getAllByRole('cell')[3]).toHaveTextContent('NULL')
    expect(within(rows[2]).getAllByRole('cell')[3]).toBeEmptyDOMElement()
    expect(within(rows[3]).getAllByRole('cell')[3]).toHaveTextContent('긴 메모의 앞부분…')
    expect(within(rows[4]).getAllByRole('cell')[4]).toHaveTextContent('이진 2,048바이트')
    // 아래 줄 — 표시 행 수와 추정 행 수(정확한 수는 세기 전)
    expect(screen.getByText('5행 표시')).toBeVisible()
    expect(screen.getByText('약 128,400행')).toBeVisible()
  })

  it('머리글을 누르면 정렬한다 — 오름차순 → 내림차순 → 정렬 없음', async () => {
    renderBrowser('/workspaces/101/connections/302/data?object=orders')
    await screen.findByRole('table')
    const header = () => screen.getByRole('button', { name: 'status 기준 정렬' })

    await userEvent.click(header())
    await waitFor(() => expect(idsInTable()).toEqual(['5', '1', '2', '4', '3'])) // CANCELLED, PAID×3, READY
    expect(screen.getByRole('columnheader', { name: /status/ })).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(header())
    await waitFor(() => expect(idsInTable()).toEqual(['3', '4', '2', '1', '5']))
    expect(screen.getByRole('columnheader', { name: /status/ })).toHaveAttribute('aria-sort', 'descending')

    await userEvent.click(header())
    await waitFor(() => expect(idsInTable()).toEqual(['1', '2', '3', '4', '5']))
  })

  it('조건은 [적용]을 눌러야 서버로 간다', async () => {
    const queries: RowsQuery[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/objects/orders/rows')) void request.clone().json().then((body) => queries.push(body as RowsQuery))
    })
    renderBrowser('/workspaces/101/connections/302/data?object=orders')
    await screen.findByRole('table')

    await userEvent.click(screen.getByRole('button', { name: '조건 추가' }))
    await userEvent.selectOptions(screen.getByLabelText('컬럼'), 'status')
    await userEvent.type(screen.getByLabelText('값'), 'PAID')
    // 값을 치는 동안에는 요청이 나가지 않는다
    expect(queries.filter((query) => query.filters.length > 0)).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: '적용' }))
    await waitFor(() => expect(idsInTable()).toEqual(['1', '2', '4']))
    expect(queries.at(-1)).toMatchObject({ page: 1, filters: [{ column: 'status', op: 'EQ', value: 'PAID' }] })

    // 값이 필요 없는 연산자 — 값 칸이 사라지고 조건만 간다
    await userEvent.selectOptions(screen.getByLabelText('컬럼'), 'memo')
    await userEvent.selectOptions(screen.getByLabelText('연산자'), 'IS_NULL')
    expect(screen.queryByLabelText('값')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '적용' }))
    await waitFor(() => expect(idsInTable()).toEqual(['1']))
    expect(queries.at(-1)?.filters).toEqual([{ column: 'memo', op: 'IS_NULL' }])

    await userEvent.click(screen.getByRole('button', { name: '초기화' }))
    await waitFor(() => expect(idsInTable()).toHaveLength(5))
    server.events.removeAllListeners()
  })

  it('정확한 수는 눌렀을 때만 센다', async () => {
    renderBrowser('/workspaces/101/connections/302/data?object=orders')
    await screen.findByRole('table')
    expect(screen.queryByTestId('exact-count')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '정확한 수 세기' }))

    expect(await screen.findByTestId('exact-count')).toHaveTextContent('총 128,431행')
  })

  it('다음 페이지가 있을 때만 [다음]이 켜진다', async () => {
    server.use(
      http.post('/api/v1/database-manager/workspaces/:w/connections/:c/objects/:o/rows', async ({ request }) => {
        const query = (await request.json()) as RowsQuery
        return HttpResponse.json(
          ok({
            response: {
              columns: [{ name: 'id', typeName: 'BIGINT', category: 'integer', nullable: false, primaryKey: true }],
              rows: [[String(query.page)]],
              page: query.page,
              size: query.size,
              hasNext: query.page < 2,
              truncated: false,
              elapsedMs: 3,
            },
          }),
        )
      }),
    )
    renderBrowser('/workspaces/101/connections/302/data?object=orders')
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '다음' }))

    await waitFor(() => expect(idsInTable()).toEqual(['2']))
    expect(screen.getByText('2쪽')).toBeVisible()
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '이전' })).toBeEnabled()
  })

  it('제한 시간 초과는 조건을 좁히라고 안내하고, 데이터베이스가 거부한 문구는 그대로 보여 준다', async () => {
    server.use(
      http.post('/api/v1/database-manager/workspaces/:w/connections/:c/objects/:o/rows', () => fail('QUERY_TIMEOUT', 504)),
    )
    renderBrowser('/workspaces/101/connections/302/data?object=orders')
    expect(await screen.findByText('8초 안에 끝나지 않아 취소했습니다. 조건을 좁혀 보세요.')).toBeVisible()

    server.use(
      http.post('/api/v1/database-manager/workspaces/:w/connections/:c/objects/:o/rows', () =>
        HttpResponse.json(
          { header: { isSuccessful: false, resultCode: 'QUERY_FAILED', resultMessage: 'permission denied for table orders' } },
          { status: 409 },
        ),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: /다시 시도/ }))
    expect(await screen.findByText(/permission denied for table orders/)).toBeVisible()
  })

  it('편집할 수 없는 객체는 이유를 한 줄로 알린다', async () => {
    server.use(
      http.post('/api/v1/database-manager/workspaces/:w/connections/:c/objects/:o/rows', () =>
        HttpResponse.json(ok({ response: { columns: [], rows: [], page: 1, size: 100, hasNext: false, truncated: false, elapsedMs: 1 } })),
      ),
    )
    renderBrowser('/workspaces/101/connections/302/data?object=paid_orders')
    expect(await screen.findByText('뷰는 편집할 수 없습니다')).toBeVisible()
    expect(await screen.findByText('행이 없습니다')).toBeVisible()
  })
})

describe('데이터 브라우저 — 구조 탭·권한', () => {
  it('구조 탭은 컬럼·인덱스·외래 키를 읽기 전용으로 보여 준다', async () => {
    renderBrowser('/workspaces/101/connections/302/data?object=orders')
    await userEvent.click(await screen.findByRole('tab', { name: '구조' }))

    const columns = await screen.findByRole('region', { name: '컬럼' })
    expect(within(columns).getByText('VARCHAR(20)')).toBeVisible()
    expect(within(columns).getByText('자동 증가')).toBeVisible()
    expect(within(columns).getByLabelText('기본 키')).toBeVisible()
    expect(screen.getByText('idx_orders_status')).toBeVisible()
    expect(screen.getByText(/\(user_id\) → users \(id\)/)).toBeVisible()
    expect(screen.getByText(/ERD에서 고친 뒤 마이그레이션 DDL로 반영하세요/)).toBeVisible()
    // 구조를 고치는 버튼은 없다
    expect(screen.queryByRole('button', { name: /수정|삭제|추가/ })).not.toBeInTheDocument()
    // 탭은 주소에 남는다
    expect(screen.getByRole('tab', { name: '구조' })).toHaveAttribute('aria-selected', 'true')
  })

  it('편집자 미만은 API를 부르지 않고 권한 안내만 본다', async () => {
    let called = false
    server.use(
      http.post('/api/v1/database-manager/workspaces/:w/connections/:c/objects', () => {
        called = true
        return fail('PERMISSION_DENIED', 403)
      }),
    )
    // 워크스페이스 999는 내 워크스페이스 목록에 없다 — 역할을 알 수 없으니 쓸 수 없다
    renderBrowser('/workspaces/999/connections/302/data')

    expect(await screen.findByText('데이터를 볼 권한이 없습니다')).toBeVisible()
    fireEvent.focus(window)
    expect(called).toBe(false)
  })
})

describe('데이터 브라우저 — SQL 탭', () => {
  const SQL_ROUTE = '/workspaces/101/connections/302/data?tab=sql'

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('객체를 고르지 않아도 SQL 탭을 쓸 수 있다 — 읽기 문장은 바로 실행하고 결과를 표로 보여 준다', async () => {
    renderBrowser(SQL_ROUTE)
    const input = await screen.findByLabelText('SQL 입력')
    expect(screen.getByRole('button', { name: '실행' })).toBeDisabled()

    await userEvent.type(input, 'SELECT * FROM orders')
    await userEvent.click(screen.getByRole('button', { name: '실행' }))

    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('2행 표시')).toBeVisible()
    // 콘솔 결과는 정렬 버튼이 없다(서버에 다시 묻지 않는다)
    expect(screen.queryByRole('button', { name: 'status 기준 정렬' })).not.toBeInTheDocument()
  })

  it('문장이 여러 개면 커서가 놓인 문장만 보낸다 — Ctrl+Enter로 실행한다', async () => {
    const sent: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/queries')) void request.clone().json().then((body) => sent.push((body as { sql: string }).sql))
    })
    renderBrowser(SQL_ROUTE)
    const input = (await screen.findByLabelText('SQL 입력')) as HTMLTextAreaElement

    fireEvent.change(input, { target: { value: 'SELECT 1;\nSELECT 2 FROM orders;' } })
    input.setSelectionRange(3, 3)
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    await screen.findByRole('table')
    expect(sent).toEqual(['SELECT 1'])
    server.events.removeAllListeners()
  })

  it('쓰기 문장은 확인을 거쳐 실행한다 — 취소하면 실행하지 않는다', async () => {
    const confirmedFlags: boolean[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/queries')) {
        void request.clone().json().then((body) => confirmedFlags.push((body as { confirmed: boolean }).confirmed))
      }
    })
    renderBrowser(SQL_ROUTE)
    await userEvent.type(await screen.findByLabelText('SQL 입력'), "UPDATE orders SET status = 'PAID'")
    await userEvent.click(screen.getByRole('button', { name: '실행' }))

    // 확인 다이얼로그 — 종류·대상 커넥션·문장·되돌릴 수 없다는 문구
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('데이터를 바꾸는 문장을 실행할까요?')).toBeVisible()
    expect(within(dialog).getByText('대상 커넥션: 개발 MySQL')).toBeVisible()
    expect(within(dialog).getByText("UPDATE orders SET status = 'PAID'")).toBeVisible()
    expect(within(dialog).getByText('실행하면 되돌릴 수 없습니다.')).toBeVisible()

    // 취소 — 확인한 요청은 나가지 않았다
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(confirmedFlags).toEqual([false])

    // 다시 실행 → 확인
    await userEvent.click(screen.getByRole('button', { name: '실행' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '실행' }))

    expect(await screen.findByText('3행이 바뀌었습니다')).toBeVisible()
    expect(confirmedFlags).toEqual([false, false, true])
    server.events.removeAllListeners()
  })

  it('구조 문장이 성공하면 ERD와 달라졌을 수 있다고 알리고 객체 목록을 다시 읽는다', async () => {
    let objectCalls = 0
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/objects')) objectCalls++
    })
    renderBrowser(SQL_ROUTE)
    await screen.findByRole('button', { name: /^orders/ })
    const before = objectCalls

    await userEvent.type(await screen.findByLabelText('SQL 입력'), 'CREATE TABLE scratch (id INT)')
    await userEvent.click(screen.getByRole('button', { name: '실행' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('구조를 바꾸는 문장을 실행할까요?')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: '실행' }))

    expect(await screen.findByText(/DB 동기화로 문서에 반영하세요/)).toBeVisible()
    await waitFor(() => expect(objectCalls).toBeGreaterThan(before))
    server.events.removeAllListeners()
  })

  it('데이터베이스가 거부한 문장은 그 문구를 그대로 보여 준다', async () => {
    renderBrowser(SQL_ROUTE)
    await userEvent.type(await screen.findByLabelText('SQL 입력'), 'SELECT * FROM no_such_table')
    await userEvent.click(screen.getByRole('button', { name: '실행' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('데이터베이스가 문장을 거부했습니다')
    expect(alert).toHaveTextContent("Table 'members.no_such_table' doesn't exist")
    expect(alert).toHaveTextContent('SQLSTATE 42S02')
  })

  it('여러 문장·지원하지 않는 문장은 서버 판정 문구로 안내한다', async () => {
    server.use(
      http.post('/api/v1/database-manager/workspaces/:w/connections/:c/queries', () => fail('UNSUPPORTED_STATEMENT', 400)),
    )
    renderBrowser(SQL_ROUTE)
    await userEvent.type(await screen.findByLabelText('SQL 입력'), 'BEGIN')
    await userEvent.click(screen.getByRole('button', { name: '실행' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('이 콘솔에서는 그 문장을 실행하지 않습니다')
  })

  it('실행 이력은 이 브라우저에 남고, 고르면 입력 칸에 다시 들어온다', async () => {
    renderBrowser(SQL_ROUTE)
    const input = await screen.findByLabelText('SQL 입력')
    await userEvent.type(input, 'SELECT * FROM orders')
    await userEvent.click(screen.getByRole('button', { name: '실행' }))
    await screen.findByRole('table')

    expect(JSON.parse(window.localStorage.getItem('crowfoot.database.sql-history.302') ?? '[]')).toMatchObject([
      { sql: 'SELECT * FROM orders', ok: true },
    ])
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: '이력 1' }))
    await userEvent.click(within(screen.getByRole('list', { name: '실행 이력' })).getByRole('button'))

    expect(input).toHaveValue('SELECT * FROM orders')
  })
})

describe('데이터 브라우저 — 행 편집', () => {
  const ORDERS = '/workspaces/101/connections/302/data?object=orders'
  const CHANGES = '/api/v1/database-manager/workspaces/:w/connections/:c/objects/:o/changes'

  /** id로 표의 행을 찾는다(첫 칸은 행 작업, 둘째 칸이 id) */
  function rowOf(id: string): HTMLElement {
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((candidate) => within(candidate).queryAllByRole('cell')[1]?.textContent === id)
    if (!row) throw new Error(`행을 찾지 못했다: ${id}`)
    return row
  }

  /** 적용 요청의 본문을 모은다 */
  function captureChanges() {
    const bodies: { changes: unknown[] }[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/changes')) void request.clone().json().then((body) => bodies.push(body as { changes: unknown[] }))
    })
    return bodies
  }

  it('셀을 고치고 행을 추가·삭제해도 [적용] 전에는 서버에 가지 않는다 — 적용하면 한 번에 보낸다', async () => {
    const bodies = captureChanges()
    renderBrowser(ORDERS)
    await screen.findByRole('table')

    // 수정 — 두 번 눌러 편집, Enter로 담는다
    await userEvent.dblClick(within(rowOf('1')).getAllByRole('cell')[2])
    const input = screen.getByLabelText('status 편집')
    await userEvent.clear(input)
    await userEvent.type(input, 'DONE{Enter}')
    expect(within(rowOf('1')).getAllByRole('cell')[2]).toHaveTextContent('DONE')
    expect(within(rowOf('1')).getAllByRole('cell')[2]).toHaveAttribute('data-changed', 'true')

    // NULL로 설정 — 4번 주문의 memo
    await userEvent.dblClick(within(rowOf('4')).getAllByRole('cell')[3])
    await userEvent.click(screen.getByRole('button', { name: 'NULL' }))
    expect(within(rowOf('4')).getAllByRole('cell')[3]).toHaveTextContent('NULL')

    // 삭제 표시 — 5번 주문
    await userEvent.click(within(rowOf('5')).getByRole('button', { name: '행 삭제' }))
    // 추가 — 채운 칸만 보낸다
    await userEvent.click(screen.getByRole('button', { name: '행 추가' }))
    await userEvent.type(screen.getByLabelText('새 행의 status'), 'NEW')

    expect(screen.getByText('변경 4건')).toBeVisible()
    expect(screen.getByText('추가 1 · 수정 2 · 삭제 1')).toBeVisible()
    expect(bodies).toHaveLength(0)

    // 적용 — 확인 다이얼로그가 요약과 삭제 경고를 보여 준다
    await userEvent.click(screen.getByRole('button', { name: '적용' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('변경 4건을 적용할까요?')).toBeVisible()
    expect(within(dialog).getByText('대상: 개발 MySQL / orders')).toBeVisible()
    expect(within(dialog).getByText('1행을 삭제합니다. 적용하면 되돌릴 수 없습니다.')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: '적용' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].changes).toEqual([
      { op: 'DELETE', key: { id: '5' } },
      { op: 'UPDATE', key: { id: '1' }, values: { status: 'DONE' }, original: { status: 'PAID' } },
      { op: 'UPDATE', key: { id: '4' }, values: { memo: null }, original: { memo: '선물 포장' } },
      { op: 'INSERT', values: { status: 'NEW' } },
    ])
    // 성공하면 모아 둔 변경이 비워진다
    await waitFor(() => expect(screen.queryByText(/^변경 \d+건$/)).not.toBeInTheDocument())
    server.events.removeAllListeners()
  })

  it('Esc는 편집을 취소하고, 원래 값으로 되돌리면 변경이 사라진다 — [되돌리기]는 전부 버린다', async () => {
    renderBrowser(ORDERS)
    await screen.findByRole('table')

    await userEvent.dblClick(within(rowOf('1')).getAllByRole('cell')[2])
    await userEvent.type(screen.getByLabelText('status 편집'), 'X{Escape}')
    expect(screen.queryByText(/^변경 \d+건$/)).not.toBeInTheDocument()

    await userEvent.dblClick(within(rowOf('1')).getAllByRole('cell')[2])
    await userEvent.type(screen.getByLabelText('status 편집'), 'X{Enter}')
    expect(screen.getByText('변경 1건')).toBeVisible()
    await userEvent.dblClick(within(rowOf('1')).getAllByRole('cell')[2])
    const input = screen.getByLabelText('status 편집')
    await userEvent.clear(input)
    await userEvent.type(input, 'PAID{Enter}')
    expect(screen.queryByText(/^변경 \d+건$/)).not.toBeInTheDocument()

    await userEvent.click(within(rowOf('2')).getByRole('button', { name: '행 삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(screen.queryByText(/^변경 \d+건$/)).not.toBeInTheDocument()
    expect(within(rowOf('2')).getByRole('button', { name: '행 삭제' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('적용이 실패하면 변경은 화면에 남고, 실패한 행에 데이터베이스 문구가 붙는다', async () => {
    server.use(
      http.post(CHANGES, () =>
        HttpResponse.json(
          {
            header: { isSuccessful: false, resultCode: 'ROW_CHANGE_FAILED', resultMessage: '데이터베이스가 변경을 거부했습니다' },
            errors: [{ field: 'changes[1]', code: 'ROW_CHANGE_FAILED', message: "Column 'status' cannot be null" }],
          },
          { status: 409 },
        ),
      ),
    )
    renderBrowser(ORDERS)
    await screen.findByRole('table')
    await userEvent.click(within(rowOf('5')).getByRole('button', { name: '행 삭제' }))
    await userEvent.dblClick(within(rowOf('2')).getAllByRole('cell')[2])
    await userEvent.type(screen.getByLabelText('status 편집'), '!{Enter}')

    await userEvent.click(screen.getByRole('button', { name: '적용' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '적용' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('적용하지 못했습니다. 변경은 전부 되돌렸습니다.')
    // 변경은 그대로 — 두 번째 변경(2번 주문 수정)의 행에 문구가 붙는다
    expect(screen.getByText('변경 2건')).toBeVisible()
    expect(rowOf('2')).toHaveAttribute('title', "Column 'status' cannot be null")
    expect(rowOf('5')).not.toHaveAttribute('title')
  })

  it('잘린 값은 눌러서 통째로 읽고, 고친 값은 전체 문자열을 편집 전 값과 함께 담는다', async () => {
    const bodies = captureChanges()
    renderBrowser(ORDERS)
    await screen.findByRole('table')

    await userEvent.click(within(rowOf('3')).getByRole('button', { name: 'memo 전체 값 보기' }))
    const dialog = await screen.findByRole('dialog')
    const textarea = await within(dialog).findByRole('textbox', { name: 'memo 값' })
    expect((textarea as HTMLTextAreaElement).value).toContain('그리고 이어지는 뒷부분')
    expect(within(dialog).getByRole('button', { name: '변경에 담기' })).toBeDisabled()

    await userEvent.type(textarea, ' 끝')
    await userEvent.click(within(dialog).getByRole('button', { name: '변경에 담기' }))
    expect(screen.getByText('변경 1건')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: '적용' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '적용' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    const full = '긴 메모의 앞부분' + ' 그리고 이어지는 뒷부분'.repeat(3)
    expect(bodies[0].changes).toEqual([
      { op: 'UPDATE', key: { id: '3' }, values: { memo: `${full} 끝` }, original: { memo: full } },
    ])
    server.events.removeAllListeners()
  })

  it('적용하지 않은 변경이 있으면 다른 객체로 옮기기 전에 묻는다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderBrowser(ORDERS)
    await screen.findByRole('table')
    await userEvent.click(within(rowOf('1')).getByRole('button', { name: '행 삭제' }))

    await userEvent.click(screen.getByRole('button', { name: /^users/ }))
    expect(confirmSpy).toHaveBeenCalledWith('적용하지 않은 변경이 있습니다. 버릴까요?')
    // 취소 — 그대로 orders의 변경이 남아 있다
    expect(screen.getByText('변경 1건')).toBeVisible()

    confirmSpy.mockReturnValue(true)
    await userEvent.click(screen.getByRole('tab', { name: 'SQL' }))
    expect(await screen.findByLabelText('SQL 입력')).toBeVisible()
    confirmSpy.mockRestore()
  })

  it('뷰와 기본 키 없는 테이블에는 편집 동작이 없다', async () => {
    server.use(
      http.post('/api/v1/database-manager/workspaces/:w/connections/:c/objects/:o/rows', () =>
        HttpResponse.json(
          ok({
            response: {
              columns: [{ name: 'message', typeName: 'VARCHAR(100)', category: 'character', nullable: true, primaryKey: false }],
              rows: [['hello']],
              page: 1, size: 100, hasNext: false, truncated: false, elapsedMs: 1,
            },
          }),
        ),
      ),
    )
    renderBrowser('/workspaces/101/connections/302/data?object=order_logs')
    await screen.findByRole('table')

    expect(screen.getByText('기본 키가 없는 테이블은 편집할 수 없습니다')).toBeVisible()
    expect(screen.queryByRole('button', { name: '행 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '행 삭제' })).not.toBeInTheDocument()
    await userEvent.dblClick(screen.getByText('hello'))
    expect(screen.queryByLabelText('message 편집')).not.toBeInTheDocument()
  })
})

describe('데이터 브라우저 — ERD 논리명', () => {
  const base = emptyContent()
  const content = serializeContent({
    ...base,
    model: {
      ...base.model,
      tables: [
        createTable('orders', {
          logicalName: '주문',
          columns: [
            createColumn({ physicalName: 'id', logicalName: '주문 번호', dataType: 'BIGINT' }),
            createColumn({ physicalName: 'STATUS', logicalName: '상태' }),
            createColumn({ physicalName: 'memo', logicalName: 'memo', dataType: 'TEXT' }),
          ],
        }),
      ],
    },
  })
  const summary = (modelId: string, sourceConnectionId: string | null) => ({
    modelId, workspaceId: '101', name: `문서 ${modelId}`, description: null, databaseType: 'mysql', sourceConnectionId,
    version: 3, createdBy: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  })
  /** 문서 목록과 상세를 정한다 — 상세는 요청된 id를 기록한다 */
  function useModels(models: ReturnType<typeof summary>[]) {
    const requested: string[] = []
    server.use(
      http.get('/api/v1/core/workspaces/101/models', () =>
        HttpResponse.json(ok({ responses: models, totalCount: models.length, page: 1, size: 100, totalPages: 1 })),
      ),
      http.get('/api/v1/core/workspaces/101/models/:modelId', ({ params }) => {
        requested.push(String(params.modelId))
        const found = models.find((model) => model.modelId === params.modelId)
        return found
          ? HttpResponse.json(ok({ response: { ...found, content } }))
          : HttpResponse.json({ header: { isSuccessful: false, resultCode: 'MODEL_NOT_FOUND', resultMessage: 'x' } }, { status: 404 })
      }),
    )
    return requested
  }
  const header = (name: string) => within(screen.getByRole('table')).getByRole('columnheader', { name: new RegExp(`^${name}`) })

  it('이 커넥션을 원천으로 하는 문서가 하나면 컬럼 머리에 논리명을 함께 보여 준다 — 물리명과 같은 논리명은 뺀다', async () => {
    useModels([summary('700', '302'), summary('701', null)])
    renderBrowser('/workspaces/101/connections/302/data?object=orders')
    await screen.findByRole('table')

    await waitFor(() => expect(header('id')).toHaveTextContent('주문 번호'))
    // 대소문자가 달라도 같은 컬럼이다
    expect(header('status')).toHaveTextContent('상태')
    expect(header('memo').textContent).toBe('memoTEXT')
  })

  it('원천 문서가 둘 이상이면 고를 수 없으니 보여 주지 않는다 — 주소에 문서가 있으면 그 문서를 쓴다', async () => {
    const requested = useModels([summary('700', '302'), summary('702', '302')])
    const first = renderBrowser('/workspaces/101/connections/302/data?object=orders')
    await screen.findByRole('table')
    await waitFor(() => expect(header('id')).toBeVisible())
    expect(requested).toEqual([])
    expect(header('id')).not.toHaveTextContent('주문 번호')
    first.unmount()

    renderBrowser('/workspaces/101/connections/302/data?object=orders&model=702')
    await screen.findByRole('table')
    await waitFor(() => expect(header('id')).toHaveTextContent('주문 번호'))
    expect(requested).toEqual(['702'])
  })

  it('주소의 문서가 다른 커넥션의 문서면 쓰지 않는다', async () => {
    useModels([summary('703', '999')])
    renderBrowser('/workspaces/101/connections/302/data?object=orders&model=703')
    await screen.findByRole('table')
    await waitFor(() => expect(header('id')).toBeVisible())
    expect(header('id')).not.toHaveTextContent('주문 번호')
  })
})

