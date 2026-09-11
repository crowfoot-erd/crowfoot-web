/**
 * S-13 감사 로그 화면 테스트 (frontend-testing.md B1 — 4상태)
 *
 * given: /core/admin/audit-logs 응답을 MSW로 정의 (08-core/05-account.md Section 2.7)
 * when: 화면 렌더
 * then: 로딩(스켈레톤)·에러(재시도)·빈(문구)·목록(주체·시스템 행·대상·상세) 상태 검증
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fail, fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { AdminAuditLogsPage } from '@/pages/admin/audit-logs'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderAuditLogs() {
  return renderWithProviders(<Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />, {
    route: '/admin/audit-logs',
  })
}

describe('감사 로그 화면', () => {
  it('renders rows with actor, system row, target and parsed detail', async () => {
    renderAuditLogs()

    // then: fixtures의 3건 — 최신순(ROLE_UPDATED 먼저)·시스템 행·파싱된 detail k=v
    expect(await screen.findByText('ROLE_UPDATED')).toBeVisible()
    expect(screen.getByText('총 3개')).toBeVisible()
    expect(screen.getByText('시스템')).toBeVisible() // actorUserId null 행
    expect(screen.getAllByText('부트스트랩 관리자')).toHaveLength(2) // 주체가 있는 2행
    expect(screen.getByText('ROLE/2')).toBeVisible()
    expect(screen.getByText('roleName=ADMIN')).toBeVisible()
    expect(screen.getByText('provider=github')).toBeVisible()
  })

  it('shows skeletons while loading', () => {
    server.use(http.get('/api/v1/core/admin/audit-logs', () => new Promise<never>(() => {})))

    renderAuditLogs()

    // then: 테이블 스켈레톤 — 아직 데이터 없음
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText('ROLE_UPDATED')).not.toBeInTheDocument()
  })

  it('shows the error state with retry on failure', async () => {
    server.use(http.get('/api/v1/core/admin/audit-logs', () => fail('PERMISSION_DENIED', 403)))

    renderAuditLogs()

    // then: 에러 문구 + 재시도 버튼
    const retry = await screen.findByRole('button', { name: /다시 시도/ })
    expect(retry).toBeVisible()

    // when: 재시도 — 복구
    server.use(http.get('/api/v1/core/admin/audit-logs', () => HttpResponse.json(ok(fixtures.adminAuditLogs))))
    await userEvent.click(retry)

    // then
    expect(await screen.findByText('ROLE_UPDATED')).toBeVisible()
  })

  it('shows the empty state when there are no logs', async () => {
    server.use(
      http.get('/api/v1/core/admin/audit-logs', () =>
        HttpResponse.json(ok({ page: 1, size: 20, totalPages: 0, totalCount: 0, responses: [] })),
      ),
    )

    renderAuditLogs()

    // then: 빈 문구 (필터 없는 전체 조회)
    expect(await screen.findByText('기록된 감사 로그가 없습니다.')).toBeVisible()
  })
})
