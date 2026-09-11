/**
 * S-09 사용자 관리 화면 테스트 (frontend-testing.md B1 — 4상태)
 *
 * given: /core/admin/users 응답을 MSW로 정의 (08-core/05-account.md Section 2.1)
 * when: 화면 렌더
 * then: 로딩(스켈레톤)·에러(재시도)·빈(문구)·목록(행·배지·총 개수) 상태 검증
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fail, fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { AdminUsersPage } from '@/pages/admin/users'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderAdminUsers() {
  return renderWithProviders(<Route path="/admin/users" element={<AdminUsersPage />} />, {
    route: '/admin/users',
  })
}

describe('사용자 관리 화면', () => {
  it('renders user rows with badges, provider identifier and total count', async () => {
    renderAdminUsers()

    // then: fixtures의 사용자 3건 — 이메일 링크·관리자 배지·상태 배지·식별자·총 개수
    expect(await screen.findByText('kim@example.com')).toBeVisible()
    expect(screen.getByText('부트스트랩 관리자')).toBeVisible()
    expect(screen.getByText('총 3개')).toBeVisible()
    expect(screen.getAllByText('관리자').length).toBeGreaterThanOrEqual(2) // 테이블 헤더 + admin 배지
    expect(screen.getByText('탈퇴')).toBeVisible()
    expect(screen.getAllByText('활동')).toHaveLength(2) // 정상 사용자 — 초록 배지
    expect(screen.getByText('48239157')).toBeVisible() // 제공자 식별자(providerUserId) 병기
    expect(screen.getAllByText('—')).toHaveLength(1) // 이메일 미제공(GitHub 기본 scope) — 부트스트랩 관리자
    expect(screen.getAllByRole('link', { name: /상세 보기/ })).toHaveLength(3) // 행마다 상세 진입 버튼
  })

  it('shows skeletons while loading', () => {
    server.use(http.get('/api/v1/core/admin/users', () => new Promise<never>(() => {})))

    renderAdminUsers()

    // then: 테이블 스켈레톤 — 아직 데이터 없음
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText('kim@example.com')).not.toBeInTheDocument()
  })

  it('shows the error state with retry on failure', async () => {
    server.use(http.get('/api/v1/core/admin/users', () => fail('PERMISSION_DENIED', 403)))

    renderAdminUsers()

    // then: 에러 문구 + 재시도 버튼
    const retry = await screen.findByRole('button', { name: /다시 시도/ })
    expect(retry).toBeVisible()

    // when: 재시도 — 복구
    server.use(http.get('/api/v1/core/admin/users', () => HttpResponse.json(ok(fixtures.adminUsers))))
    await userEvent.click(retry)

    // then
    expect(await screen.findByText('kim@example.com')).toBeVisible()
  })

  it('shows the empty state when there are no users', async () => {
    server.use(
      http.get('/api/v1/core/admin/users', () =>
        HttpResponse.json(ok({ page: 1, size: 20, totalPages: 0, totalCount: 0, responses: [] })),
      ),
    )

    renderAdminUsers()

    // then: 빈 문구 (키워드 없는 전체 조회)
    expect(await screen.findByText('가입된 사용자가 없습니다.')).toBeVisible()
  })
})
