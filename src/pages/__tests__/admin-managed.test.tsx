/**
 * 매니지드 DB 인스턴스 관리 화면 테스트 (08-core/07 §3.2~3.4)
 *
 * given: /core/admin/managed-instances 응답을 MSW로 정의
 * when: 화면 렌더·인라인 편집·다이얼로그 등록·삭제
 * then: 목록(표시명·엔드포인트·발급 수)·활성 토글·한도 변경·삭제 409 안내·등록 전송 값
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { AdminManagedPage } from '@/pages/admin/managed'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderAdminManaged() {
  return renderWithProviders(
    <Route
      path="/admin/managed"
      element={
        <>
          <AdminManagedPage />
          <Toaster />
        </>
      }
    />,
    { route: '/admin/managed' },
  )
}

describe('매니지드 인스턴스 관리 화면', () => {
  it('인스턴스 목록을 렌더한다 — 표시명·엔드포인트·DBMS·발급 수·활성', async () => {
    renderAdminManaged()

    // 표시명은 readonly 박스로 표시된다(편집은 다이얼로그)
    expect(await screen.findByText('s3.java21.net:8000')).toBeVisible()
    expect(screen.getByText('Academy PG')).toBeVisible()
    expect(screen.getByText(/crowfoot · postgresql/)).toBeVisible()
    expect(screen.getByText('1')).toBeVisible() // 발급 수 배지
    expect(screen.getByRole('switch', { name: /Academy PG/ })).toBeChecked()

    // MySQL 행 — database 생략 인스턴스는 "자동"으로 표시된다
    expect(screen.getByText('s4.java21.net:13306')).toBeVisible()
    expect(screen.getByText(/root · mysql/)).toBeVisible()
    expect(screen.getByText(/\/ 자동/)).toBeVisible()
  })

  it('발급 한도 — 지정값(기본 5)이 폼에 뜨고 바꾸면 PATCH된다', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.patch('/api/v1/core/admin/managed-instances/issue-limit', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok({ response: { limit: 3 } }))
      }),
    )
    const user = userEvent.setup()
    renderAdminManaged()

    // 조회값(기본 5)이 인라인 폼에 뜬다
    const input = await screen.findByLabelText('사용자당 발급 한도')
    await waitFor(() => expect(input).toHaveValue(5))

    await user.clear(input)
    await user.type(input, '3')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured).toMatchObject({ limit: 3 })
    await waitFor(() => {
      expect(screen.getByText('발급 한도를 3개로 지정했습니다.')).toBeVisible()
    })
  })

  it('활성 토글 — 즉시 PATCH로 isActive를 전송한다', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.patch('/api/v1/core/admin/managed-instances/401', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          ok({ response: { instanceId: '401', isActive: false } }),
        )
      }),
    )
    const user = userEvent.setup()
    renderAdminManaged()

    await user.click(await screen.findByRole('switch', { name: /Academy PG/ }))

    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured!.isActive).toBe(false)
    await waitFor(() => {
      expect(screen.getByText('저장했습니다.')).toBeVisible()
    })
  })

  it('삭제 — 발급이 남아 있으면 409 안내 문구로 떨어뜨린다', async () => {
    server.use(
      http.delete('/api/v1/core/admin/managed-instances/401', () =>
        fail('MANAGED_INSTANCE_IN_USE', 409)),
    )
    const user = userEvent.setup()
    renderAdminManaged()

    await user.click(await screen.findByRole('button', { name: 'Academy PG 인스턴스 삭제' }))
    await user.click(await screen.findByRole('button', { name: '삭제' }))

    await waitFor(() => {
      expect(screen.getByText(/발급이 남아 있는 인스턴스는 삭제할 수 없습니다/)).toBeVisible()
    })
  })

  it('인스턴스 등록 — 폼을 채우면 자격과 함께 POST된다(기본 DBMS postgresql)', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/admin/managed-instances', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok({ response: { instanceId: '402' } }))
      }),
    )
    const user = userEvent.setup()
    renderAdminManaged()

    await user.click(await screen.findByRole('button', { name: '인스턴스 등록' }))
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText(/^표시명/), 'Academy PG 2')
    await user.type(within(dialog).getByLabelText(/^호스트/), 'db2.example.com')
    fireEvent.change(within(dialog).getByLabelText(/^포트/), { target: { value: '5432' } })
    await user.type(within(dialog).getByLabelText(/데이터베이스/), 'crowfoot')
    await user.type(within(dialog).getByLabelText('사용자'), 'crowfoot')
    await user.type(within(dialog).getByLabelText('비밀번호'), 'secret')

    await user.click(within(dialog).getByRole('button', { name: '생성' }))

    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured).toMatchObject({
      displayName: 'Academy PG 2',
      dbmsType: 'postgresql',
      host: 'db2.example.com',
      port: 5432,
      databaseName: 'crowfoot',
      username: 'crowfoot',
      password: 'secret',
    })
    await waitFor(() => {
      expect(screen.getByText('인스턴스를 등록했습니다.')).toBeVisible()
    })
  })

  it('인스턴스 등록(MySQL) — DBMS를 고르면 포트가 3306으로 바뀌고 database 생략이 null로 전송된다', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/admin/managed-instances', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok({ response: { instanceId: '404' } }))
      }),
    )
    const user = userEvent.setup()
    renderAdminManaged()

    await user.click(await screen.findByRole('button', { name: '인스턴스 등록' }))
    const dialog = await screen.findByRole('dialog')

    // DBMS 드롭다운 — 표시명은 코드 테이블(database-types) 것
    const trigger = within(dialog).getByRole('combobox', { name: 'DBMS' })
    expect(trigger).toHaveTextContent('PostgreSQL')
    fireEvent.pointerDown(trigger, { button: 0 })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('option', { name: 'MySQL' }))

    // DBMS 전환으로 포트가 기본값(5432 → 3306)으로 맞춰진다
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/^포트/)).toHaveValue(3306),
    )

    await user.type(within(dialog).getByLabelText(/^표시명/), 'Academy MySQL 2')
    await user.type(within(dialog).getByLabelText(/^호스트/), 's4.java21.net')
    // 데이터베이스는 비워 둔다 — MySQL은 발급 시 database를 만든다
    await user.type(within(dialog).getByLabelText('사용자'), 'root')
    await user.type(within(dialog).getByLabelText('비밀번호'), 'secret')

    await user.click(within(dialog).getByRole('button', { name: '생성' }))

    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured).toMatchObject({
      displayName: 'Academy MySQL 2',
      dbmsType: 'mysql',
      host: 's4.java21.net',
      port: 3306,
      databaseName: null,
      username: 'root',
      password: 'secret',
    })
  })

  it('연결 테스트 — 저장된 자격으로 SELECT 1 결과를 토스트로 보고한다(실패도 200 계약)', async () => {
    server.use(
      http.post('/api/v1/core/admin/managed-instances/401/test', () =>
        HttpResponse.json(
          ok({ response: { connected: false, latencyMs: 0, message: '접속이 거부되었습니다' } }),
        ),
      ),
      http.post('/api/v1/core/admin/managed-instances/403/test', () =>
        HttpResponse.json(
          ok({ response: { connected: true, latencyMs: 41, message: null } }),
        ),
      ),
    )
    const user = userEvent.setup()
    renderAdminManaged()

    // 실패 — 계약 응답의 분류 문구가 에러 토스트로 뜬다
    await user.click(await screen.findByRole('button', { name: 'Academy PG 연결 테스트' }))
    await waitFor(() => {
      expect(screen.getByText('접속이 거부되었습니다')).toBeVisible()
    })

    // 성공 — 지연(ms)까지 성공 토스트로 뜬다
    await user.click(screen.getByRole('button', { name: 'Academy MySQL 연결 테스트' }))
    await waitFor(() => {
      expect(screen.getByText('정상 연결됐습니다 (41ms)')).toBeVisible()
    })
  })

  it('빈 목록 — 빈 상태 안내', async () => {
    server.use(
      http.get('/api/v1/core/admin/managed-instances', () =>
        HttpResponse.json(ok({ totalCount: 0, responses: [] })),
      ),
    )
    renderAdminManaged()

    expect(await screen.findByText('등록된 인스턴스가 없습니다')).toBeVisible()
  })
})
