/**
 * E2E 스모크 1본 (frontend-testing.md E)
 *
 * 로그인(콜백 자동 교환) → 대시보드 → 워크스페이스 생성 직행 —
 * API는 전부 route 인터셉션으로 목킹한다 (실물 GitHub 승인은 수동 검증 H 단계).
 */
import { expect, test, type Page } from '@playwright/test'

const envelope = (body: object) => ({
  header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
  ...body,
})

/** 인증 완료 상태로 진입 — sessionStorage에 provider를 심고 콜백 경로로 직접 들어간다 */
async function loginViaCallback(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/oauth2/github/token', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({ response: { accessToken: 'e2e-access-token', tokenType: 'Bearer', expiresIn: 3600 } }),
      ),
    }),
  )
  await page.goto('/login')
  await page.evaluate(() => {
    window.sessionStorage.setItem('oauth.provider', 'github')
  })
  await page.goto('/auth/callback?code=e2e-code&state=e2e-state')
}

test.describe('스모크 — 로그인 → 대시보드 → 워크스페이스 생성', () => {
  test('full user journey with mocked APIs', async ({ page }) => {
    // 문구 기대값 기준 언어 ko 고정 (감지 우선순위 1위 localStorage)
    await page.addInitScript(() => window.localStorage.setItem('crowfoot.lang', 'ko'))

    // ---------- 공개 API ----------
    await page.route('**/api/v1/core/providers', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({ totalCount: 1, responses: [{ code: 'github', displayName: 'GitHub' }] })),
      }),
    )

    // ---------- 인증 후 API ----------
    await page.route('**/api/v1/core/accounts/me', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            response: {
              userId: '2',
              email: 'bootstrap@example.com',
              name: '부트스트랩 관리자',
              providers: ['github'],
              admin: true,
              createdAt: '2026-01-02T00:00:00Z',
            },
          }),
        ),
      }),
    )

    const myWorkspaces = { totalCount: 0, responses: [] }
    await page.route('**/api/v1/core/accounts/me/workspaces', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(myWorkspaces)),
      }),
    )

    await page.route('**/api/v1/core/teams', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({ totalCount: 0, responses: [] })),
      }),
    )

    // 생성 → 201 + 본문(워크스페이스) → 목록에 반영
    let created = false
    await page.route('**/api/v1/core/workspaces', async (route) => {
      if (route.request().method() === 'POST') {
        created = true
        myWorkspaces.totalCount = 1
        myWorkspaces.responses = [
          {
            workspaceId: '301',
            name: '주문 서비스 ERD',
            description: null,
            isDefault: false,
            myRole: 'OWNER',
            memberCount: 1,
          },
        ]
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(
            envelope({ response: myWorkspaces.responses[0] }),
          ),
        })
      } else {
        await route.continue()
      }
    })

    await page.route('**/api/v1/core/workspaces/301', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            response: {
              workspaceId: '301',
              name: '주문 서비스 ERD',
              description: null,
              isDefault: false,
              memberCount: 1,
              createdBy: { userId: '2', name: '부트스트랩 관리자' },
              createdAt: '2026-01-10T00:00:00Z',
            },
          }),
        ),
      }),
    )

    await page.route('**/api/v1/core/workspaces/301/memberships', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({ totalCount: 0, responses: [] })),
      }),
    )

    // ---------- 로그인 ----------
    await loginViaCallback(page)

    // 대시보드 진입 — 인사·요약
    await expect(page.getByRole('heading', { name: /부트스트랩 관리자/ })).toBeVisible({ timeout: 10_000 })

    // ---------- 워크스페이스 생성 (다이얼로그) ----------
    await page.getByRole('button', { name: '새 워크스페이스' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // 이름 없이 제출 → 검증 메시지
    await dialog.getByRole('button', { name: '생성' }).click()
    await expect(dialog.getByText('이름을 입력해 주세요.')).toBeVisible()

    // 이름 입력 → 생성 → 상세 직행
    await dialog.getByLabel('이름').fill('주문 서비스 ERD')
    await dialog.getByRole('button', { name: '생성' }).click()

    await expect(page).toHaveURL(/\/workspaces\/301$/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: '주문 서비스 ERD' })).toBeVisible()
    expect(created).toBe(true)

    // 사이드바에도 새 워크스페이스가 뜬다 (me/workspaces 재조회)
    await expect(page.getByRole('link', { name: /주문 서비스 ERD/ }).first()).toBeVisible()
  })
})
