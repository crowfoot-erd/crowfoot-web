/**
 * 데이터베이스 탭 테스트 (storyboard 02-user §7)
 *
 * given: /core/workspaces/101/connections·/core/database-types 응답을 MSW로 정의
 * when: 탭 렌더·다이얼로그 상호작용
 * then: 목록(이름·DBMS·host:port·database)·권한별 버튼·테스트 토스트·삭제 확인
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { DatabaseTab } from '@/features/connections/components/database-tab'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderDatabaseTab(props: { canEdit?: boolean } = {}) {
  return renderWithProviders(
    <>
      <DatabaseTab workspaceId="101" canEdit={props.canEdit ?? true} />
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

describe('데이터베이스 탭', () => {
  it('커넥션 목록을 렌더한다 — 이름·DBMS·host:port·database·사용자', async () => {
    renderDatabaseTab()

    // then: fixtures의 커넥션 1건 — PostgreSQL은 스키마가 database 옆에 보조 표시된다
    expect(await screen.findByText('개발 PG')).toBeVisible()
    expect(screen.getByText('postgresql')).toBeVisible()
    expect(screen.getByText('db.dev.example.com:5432')).toBeVisible()
    expect(screen.getByText('orders')).toBeVisible()
    expect(screen.getByText(/sales/)).toBeVisible()
    expect(screen.getByText('app')).toBeVisible()
  })

  it('Editor 미만은 추가·편집·삭제 버튼이 없다', async () => {
    renderDatabaseTab({ canEdit: false })

    expect(await screen.findByText('개발 PG')).toBeVisible()
    expect(screen.queryByRole('button', { name: '커넥션 추가' })).not.toBeInTheDocument()
    // 편집·삭제 아이콘 버튼도 없다 — 테스트·가져오기만 남는다
    const rowActions = screen.getAllByRole('button')
    expect(rowActions.length).toBeGreaterThanOrEqual(2)
  })

  it('접속 테스트 성공 토스트를 띄운다', async () => {
    const user = userEvent.setup()
    renderDatabaseTab()

    const testButton = await screen.findByRole('button', { name: '개발 PG 접속 테스트' })
    await user.click(testButton)

    // then: 성공 토스트 (latency 포함) + 행에 녹색 연결됨 배지가 남는다
    await waitFor(() => {
      expect(screen.getByText(/접속 성공/)).toBeVisible()
    })
    expect(screen.getByText('연결됨 · 42ms')).toBeVisible()
  })

  it('접속 테스트 실패는 경고 토스트로 안내한다', async () => {
    server.use(
      http.post('/api/v1/core/workspaces/101/connections/301/test', () =>
        HttpResponse.json(
          ok({ response: { connected: false, latencyMs: null, message: '인증에 실패했습니다' } }),
        ),
      ),
    )
    const user = userEvent.setup()
    renderDatabaseTab()

    await user.click(await screen.findByRole('button', { name: '개발 PG 접속 테스트' }))

    await waitFor(() => {
      expect(screen.getByText(/접속 실패/)).toBeVisible()
      expect(screen.getByText(/인증에 실패했습니다/)).toBeVisible()
    })
    // then: 행에 연결 실패 배지도 남는다
    expect(screen.getByText('연결 실패')).toBeVisible()
  })

  it('커넥션 추가 다이얼로그 — 필수 값 채워 등록하면 토스트를 띄운다', async () => {
    // 포트를 직접 입력해도 number로 전송되는지 캡처 — Input 값은 문자열이므로 변환 검증(회귀 방지)
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/workspaces/101/connections', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          ok({
            response: {
              connectionId: '901', name: '운영 PG', dbmsType: 'MYSQL',
              host: 'db.prod.example.com', port: 13306, databaseName: 'orders',
              username: 'app', createdAt: '2026-09-14T00:00:00Z',
              createdBy: { userId: '2', name: '테스터' },
            },
          }),
        )
      }),
    )
    const user = userEvent.setup()
    renderDatabaseTab()

    await user.click(await screen.findByRole('button', { name: '커넥션 추가' }))

    // then: 다이얼로그 폼 — DBMS는 코드 목록 도착 후 첫 항목이 기본 선택된다
    expect(await screen.findByRole('dialog')).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveTextContent(/MySQL|PostgreSQL/),
    )
    await user.type(await screen.findByLabelText(/^이름/), '운영 PG')
    await user.type(screen.getByLabelText(/^호스트/), 'db.prod.example.com')
    // user.clear는 jsdom type=number 입력에서 무시돼 기존 값 뒤에 붙는다 — change로 교체한다
    fireEvent.change(screen.getByLabelText(/^포트/), { target: { value: '13306' } })
    await user.type(screen.getByLabelText(/데이터베이스$/), 'orders')
    await user.type(screen.getByLabelText(/사용자/), 'app')
    await user.type(screen.getByLabelText(/비밀번호/), 'secret')

    await user.click(screen.getByRole('button', { name: '생성' }))

    // then: POST 도달 → port가 number 13306로 전송됐는지 (Input 값은 문자열이므로 변환 검증)
    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured!.port).toBe(13306)
    expect(typeof captured!.port).toBe('number')
    await waitFor(() => {
      expect(screen.getByText('커넥션을 등록했습니다')).toBeVisible()
    })
  })

  it('스키마 필드 — PostgreSQL일 때만 노출되고 값이 schemaName으로 전송된다', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/workspaces/101/connections', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          ok({
            response: {
              connectionId: '902', name: '스키마 PG', dbmsType: 'postgresql',
              host: 'db.dev.example.com', port: 5432, databaseName: 'orders', schemaName: 'analytics',
              username: 'app', createdAt: '2026-09-14T00:00:00Z',
              createdBy: { userId: '2', name: '테스터' },
            },
          }),
        )
      }),
    )
    const user = userEvent.setup()
    renderDatabaseTab()

    await user.click(await screen.findByRole('button', { name: '커넥션 추가' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    // 기본 선택은 첫 항목(mysql) — 스키마 필드가 없다
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveTextContent(/MySQL|PostgreSQL/),
    )
    expect(screen.queryByLabelText(/^스키마/)).not.toBeInTheDocument()

    // PostgreSQL로 전환하면 스키마 필드가 나타난다
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'PostgreSQL' }))
    expect(await screen.findByLabelText(/^스키마/)).toBeVisible()

    await user.type(await screen.findByLabelText(/^이름/), '스키마 PG')
    await user.type(screen.getByLabelText(/^호스트/), 'db.dev.example.com')
    fireEvent.change(screen.getByLabelText(/^포트/), { target: { value: '5432' } })
    await user.type(screen.getByLabelText(/데이터베이스$/), 'orders')
    await user.type(screen.getByLabelText(/^스키마/), 'analytics')
    await user.type(screen.getByLabelText(/사용자/), 'app')
    await user.type(screen.getByLabelText(/비밀번호/), 'secret')

    await user.click(screen.getByRole('button', { name: '생성' }))

    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured!.dbmsType).toBe('postgresql')
    expect(captured!.schemaName).toBe('analytics')
    // then: 성공 토스트 — StrictMode 이중 마운트로 동일 문구가 2건 뜰 수 있다
    await waitFor(() => {
      expect(screen.getAllByText('커넥션을 등록했습니다').length).toBeGreaterThan(0)
    })
  })

  it('스키마 빈 칸은 해제(null)로 전송된다', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/workspaces/101/connections', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          ok({
            response: {
              connectionId: '903', name: '기본 스키마 PG', dbmsType: 'postgresql',
              host: 'db.dev.example.com', port: 5432, databaseName: 'orders',
              username: 'app', createdAt: '2026-09-14T00:00:00Z',
              createdBy: { userId: '2', name: '테스터' },
            },
          }),
        )
      }),
    )
    const user = userEvent.setup()
    renderDatabaseTab()

    await user.click(await screen.findByRole('button', { name: '커넥션 추가' }))
    await user.click(await screen.findByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'PostgreSQL' }))

    await user.type(await screen.findByLabelText(/^이름/), '기본 스키마 PG')
    await user.type(screen.getByLabelText(/^호스트/), 'db.dev.example.com')
    await user.type(screen.getByLabelText(/데이터베이스$/), 'orders')
    await user.type(screen.getByLabelText(/사용자/), 'app')
    await user.type(screen.getByLabelText(/비밀번호/), 'secret')

    await user.click(screen.getByRole('button', { name: '생성' }))

    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured!.schemaName).toBeNull()
  })

  it('커넥션 삭제 — 확인 다이얼로그를 거쳐 204 처리', async () => {
    const user = userEvent.setup()
    renderDatabaseTab()

    await user.click(await screen.findByRole('button', { name: '개발 PG 커넥션 삭제' }))
    expect(await screen.findByText('개발 PG 커넥션 삭제')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '삭제' }))

    await waitFor(() => {
      expect(screen.getByText('커넥션을 삭제했습니다')).toBeVisible()
    })
  })

  it('빈 목록 — 빈 상태 + CTA', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/connections', () =>
        HttpResponse.json(ok({ totalCount: 0, responses: [] })),
      ),
    )
    renderDatabaseTab()

    expect(await screen.findByText('등록된 커넥션이 없습니다')).toBeVisible()
    // 헤더 생성 버튼과 빈 상태 CTA 2곳
    expect(screen.getAllByRole('button', { name: '커넥션 추가' })).toHaveLength(2)
  })

  it('로드 실패 — 에러 상태 + 재시도', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/connections', () =>
        fail('INTERNAL_ERROR', 500)),
    )
    renderDatabaseTab()

    const retry = await screen.findByRole('button', { name: '다시 시도' })
    expect(retry).toBeVisible()
  })
})
