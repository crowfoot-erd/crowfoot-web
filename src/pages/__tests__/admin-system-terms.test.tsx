/**
 * 시스템 사전 관리 화면 테스트 (08-core/01 §4.5)
 *
 * given: /core/admin/system-terms 응답은 MSW fixtures(fixtures.systemTerms 5건)
 * when: 화면 렌더·검색·다이얼로그 등록·편집·삭제
 * then: 다국어 라벨 표시·검색·라벨 0개 zod 검증·POST 본문·편집 프리필·DELETE 대상
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { AdminSystemTermsPage } from '@/pages/admin/system-terms'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderAdminSystemTerms() {
  return renderWithProviders(
    <Route
      path="/admin/system-terms"
      element={
        <>
          <AdminSystemTermsPage />
          <Toaster />
        </>
      }
    />,
    { route: '/admin/system-terms' },
  )
}

describe('시스템 사전 관리 화면', () => {
  it('용어 목록을 렌더한다 — 토큰·다국어 라벨(UI 언어 1행 + 나머지 언어 보조)·타입·수정일', async () => {
    renderAdminSystemTerms()

    const email = await screen.findByTestId('system-term-row-email')
    // ko 라벨이 기본 행, en 라벨은 보조 표기된다
    expect(within(email).getByText('이메일')).toBeVisible()
    expect(within(email).getByText('en: Email')).toBeVisible()
    expect(within(email).getByText('VARCHAR(100)')).toBeVisible()

    expect(screen.getByTestId('system-term-row-user')).toBeVisible()
    expect(screen.getByTestId('system-term-row-yn')).toBeVisible() // ko 단일 항목
    expect(screen.getByTestId('system-term-row-zipcode')).toBeVisible()
  })

  it('검색 — 토큰·모든 언어 라벨로 좁혀진다(en 라벨로도 찾는다)', async () => {
    const user = userEvent.setup()
    renderAdminSystemTerms()
    await screen.findByTestId('system-term-row-email')

    await user.type(screen.getByLabelText('토큰·라벨 검색'), 'Email')
    expect(screen.getByTestId('system-term-row-email')).toBeVisible()
    expect(screen.queryByTestId('system-term-row-user')).toBeNull()

    await user.clear(screen.getByLabelText('토큰·라벨 검색'))
    await user.type(screen.getByLabelText('토큰·라벨 검색'), 'user')
    expect(screen.getByTestId('system-term-row-user')).toBeVisible()
    expect(screen.queryByTestId('system-term-row-email')).toBeNull()
  })

  it('용어 등록 — 라벨을 채운 언어만 맵으로 POST된다(빈 타입은 null)', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/admin/system-terms', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          ok({ response: { termId: '506', term: 'email_addr', labels: { ko: '이메일 주소' }, type: null, updatedAt: '2026-09-24T00:00:00Z' } }),
        )
      }),
    )
    const user = userEvent.setup()
    renderAdminSystemTerms()

    await user.click(await screen.findByRole('button', { name: '용어 등록' }))
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText('토큰'), 'email_addr')
    await user.type(within(dialog).getByLabelText('한국어'), '이메일 주소')
    // en·ja·zh는 비워 둔다 — 최소 1개 언어면 성립
    await user.click(within(dialog).getByRole('button', { name: '생성' }))

    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured).toMatchObject({
      term: 'email_addr',
      labels: { ko: '이메일 주소' }, // 채운 언어만
      type: null,
    })
    await waitFor(() => {
      expect(screen.getByText('용어를 등록했습니다.')).toBeVisible()
    })
  })

  it('용어 등록 검증 — 라벨이 1개도 없으면 zod 안내로 막고 전송하지 않는다', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/admin/system-terms', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok({ response: {} }))
      }),
    )
    const user = userEvent.setup()
    renderAdminSystemTerms()

    await user.click(await screen.findByRole('button', { name: '용어 등록' }))
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText('토큰'), 'email_addr')
    await user.click(within(dialog).getByRole('button', { name: '생성' }))

    expect(
      within(dialog).getByText('라벨을 1개 이상 입력하세요'),
    ).toBeVisible()
    expect(captured).toBeNull() // 검증 실패로 POST되지 않는다

    // 토큰 공백도 막는다
    await user.clear(within(dialog).getByLabelText('토큰'))
    await user.type(within(dialog).getByLabelText('토큰'), 'email addr')
    await user.click(within(dialog).getByRole('button', { name: '생성' }))
    expect(within(dialog).getByText('토큰에 공백을 쓸 수 없습니다')).toBeVisible()
    expect(captured).toBeNull()
  })

  it('편집 — 기존 라벨 맵·타입이 프리필되고, 같은 토큰 재등록으로 덮어쓴다', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/admin/system-terms', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok({ response: {} }))
      }),
    )
    const user = userEvent.setup()
    renderAdminSystemTerms()

    await user.click(await screen.findByRole('button', { name: '수정 — email' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText('토큰')).toHaveValue('email')
    await waitFor(() => expect(within(dialog).getByLabelText('한국어')).toHaveValue('이메일'))
    expect(within(dialog).getByLabelText('English')).toHaveValue('Email')
    expect(within(dialog).getByLabelText('타입')).toHaveValue('VARCHAR(100)')

    await user.clear(within(dialog).getByLabelText('한국어'))
    await user.type(within(dialog).getByLabelText('한국어'), '이메일 주소')
    await user.click(within(dialog).getByRole('button', { name: '저장' }))

    await waitFor(() => expect(captured).not.toBeNull())
    expect(captured).toMatchObject({
      term: 'email',
      labels: { ko: '이메일 주소', en: 'Email' },
      type: 'VARCHAR(100)',
    })
    await waitFor(() => {
      expect(screen.getByText('용어를 변경했습니다.')).toBeVisible()
    })
  })

  it('삭제 — 확인 다이얼로그를 거쳐 DELETE한다(전 워크스페이스 즉시 반영 안내)', async () => {
    const deletes: string[] = []
    server.use(
      http.delete('/api/v1/core/admin/system-terms/:termId', ({ params }) => {
        deletes.push(String(params.termId))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderAdminSystemTerms()

    await user.click(await screen.findByRole('button', { name: '삭제 — email' }))

    expect(screen.getByText("'email' 용어 삭제")).toBeVisible()
    expect(
      screen.getByText(/전체 워크스페이스에 즉시 반영됩니다/),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(deletes).toEqual(['501'])) // fixtures.systemTerms의 email termId
    await waitFor(() => {
      expect(screen.getByText('용어를 삭제했습니다.')).toBeVisible()
    })
  })

  it('빈 목록 — 빈 상태 안내와 등록 버튼', async () => {
    server.use(
      http.get('/api/v1/core/admin/system-terms', () =>
        HttpResponse.json(ok({ totalCount: 0, responses: [] })),
      ),
    )
    renderAdminSystemTerms()

    expect(await screen.findByText('등록된 용어가 없습니다')).toBeVisible()
    // 헤더·빈 상태 두 곳에 등록 버튼이 있다
    expect(screen.getAllByRole('button', { name: '용어 등록' })).toHaveLength(2)
  })
})
