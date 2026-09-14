/**
 * 협업 2차 실측 (05-editor/03-collaboration.md) — API는 route 인터셉션으로 목킹,
 * WebSocket(/ws → crowfoot-collab 8083)만 실물로 둔다.
 *
 * 두 브라우저 컨텍스트(앨리스·밥)가 같은 문서 룸에 들어가
 * presence 칩 · 저장 푸시 즉시 동기화(폴링 5초 아님) · 연결 해제 정리를 확인한다.
 */
import { expect, test, type Page } from '@playwright/test'

import { createColumn, createTable } from '../src/features/editor/model/changes'
import { serializeContent } from '../src/features/editor/model/content-io'

const envelope = (body: object) => ({
  header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
  ...body,
})

/** 문서 본문 — 테이블 1개(physicalName). 폴링 없는 즉시 동기화를 이름 교체로 검증한다 */
function contentOf(tableName: string): string {
  const table = createTable(tableName, {
    columns: [createColumn({ physicalName: 'id', dataType: 'BIGINT', nullable: false })],
  })
  return serializeContent({
    schemaVersion: 1,
    model: { tables: [table], relationships: [] },
    diagram: { nodes: { [table.id]: { x: 80, y: 80, width: null } }, notes: [], viewport: null },
  })
}

function modelOf(version: number, content: string) {
  return {
    modelId: '501',
    workspaceId: '101',
    name: '협업 검증 문서',
    description: null,
    databaseType: 'COMMON',
    content,
    version,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-14T00:00:00Z',
    createdBy: { userId: '2', name: '앨리스' },
  }
}

/** 서버의 공유 상태 재현 — 앨리스의 PUT 저장이 밥의 상세 응답에도 반영된다 */
function serverState() {
  return { savedVersion: 0 }
}

/** API 목킹 + 문서 열기 — remoteSaved=true면 이후 상세 재조회를 새 버전·새 본문으로 바꾼다 */
async function openEditor(
  page: Page,
  userId: string,
  name: string,
  options: { remoteSaved?: boolean; server?: ReturnType<typeof serverState> } = {},
) {
  const server = options.server ?? serverState()
  await page.addInitScript(() => window.localStorage.setItem('crowfoot.lang', 'ko'))
  await page.route('**/api/v1/auth/oauth2/github/token', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({ response: { accessToken: `token-${userId}`, tokenType: 'Bearer', expiresIn: 3600 } }),
      ),
    }),
  )
  // 문서 직행이 풀 리로드라 메모리 access가 소실된다 — refresh(쿠키)로 재수립하게 access를 돌려준다
  await page.route('**/api/v1/auth/refresh-token', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({ response: { accessToken: `token-${userId}`, tokenType: 'Bearer', expiresIn: 3600 } }),
      ),
    }),
  )
  await page.route('**/api/v1/core/accounts/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          response: {
            userId,
            email: `${userId}@example.com`,
            name,
            providers: ['github'],
            admin: false,
            createdAt: '2026-01-01T00:00:00Z',
          },
        }),
      ),
    }),
  )
  await page.route('**/api/v1/core/accounts/me/workspaces', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          totalCount: 1,
          responses: [
            { workspaceId: '101', name: '협업 워크스페이스', description: null, isDefault: false, myRole: 'EDITOR', memberCount: 2 },
          ],
        }),
      ),
    }),
  )

  let saved = false
  await page.route('**/api/v1/core/workspaces/101/models/501/version', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({ response: { version: server.savedVersion || 5, updatedAt: '2026-09-14T00:00:00Z' } })),
    }),
  )
  await page.route('**/api/v1/core/workspaces/101/models/501/content', async (route) => {
    server.savedVersion = 6 // PUT 저장 — 서버 문서가 새 버전으로(양쪽 페이지가 공유)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({ response: { modelId: '501', version: 6 } })),
    })
  })
  await page.route('**/api/v1/core/workspaces/101/models/501', (route) =>
    route.fulfill({
      contentType: 'application/json',
      // remoteSaved: 밥은 앨리스의 저장 푸시 이후 상세를 새 본문(remote_saved_table)으로 받는다
      body: JSON.stringify(
        envelope({
          response: modelOf(
            server.savedVersion && options.remoteSaved ? 6 : 5,
            server.savedVersion && options.remoteSaved ? contentOf('remote_saved_table') : contentOf('orders'),
          ),
        }),
      ),
    }),
  )

  // 로그인 세션 수립 후 문서 직행 — 콜백의 토큰 교환·리다이렉트가 끝나야 이동한다(경합 방지)
  await page.goto('/login')
  await page.evaluate(() => window.sessionStorage.setItem('oauth.provider', 'github'))
  await page.goto('/auth/callback?code=e2e-code&state=e2e-state')
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/callback'), { timeout: 10_000 })
  await page.goto('/workspaces/101/models/501')
}

test.describe('협업 2차 — 실시간 채널(실물 WebSocket)', () => {
  test('두 사용자 presence · 저장 푸시 즉시 동기화 · 연결 해제 정리', async ({ browser }) => {
    test.setTimeout(60_000)
    const aliceContext = await browser.newContext()
    const bobContext = await browser.newContext()
    const alice = await aliceContext.newPage()
    const bob = await bobContext.newPage()
    const server = serverState() // 문서 서버 — 두 페이지가 같은 상태를 본다

    // ---------- 앨리스 입장 — 자기 presence 칩 1명 ----------
    await openEditor(alice, '2', '앨리스', { server })
    await expect(alice.getByTestId('presence-chip')).toBeVisible({ timeout: 10_000 })
    await expect(alice.getByTestId('presence-chip')).toHaveAttribute('aria-label', /앨리스/)

    // ---------- 밥 입장 — 앨리스 칩에 2명(아바타 2개) ----------
    await openEditor(bob, '3', '밥', { remoteSaved: true, server })
    await expect(bob.getByTestId('presence-chip')).toBeVisible({ timeout: 10_000 })
    await expect(alice.getByTestId('presence-chip').locator('span')).toHaveCount(2, { timeout: 10_000 })

    // ---------- 밥이 원격 문서를 따라가는 상태 확인(초기 본문) ----------
    await expect(bob.getByLabel('테이블 물리명')).toHaveValue('orders', { timeout: 10_000 })

    // ---------- 앨리스 편집(엔터티 추가) 후 저장 → PUT 6 → 푸시 → 밥 즉시 동기화 ----------
    await alice.locator('.react-flow').click({ button: 'right' })
    await alice.getByText('엔터티 생성').click()
    await expect(alice.getByRole('button', { name: '저장' })).toBeEnabled()
    await alice.getByRole('button', { name: '저장' }).click()
    await expect(alice.getByText('v6', { exact: true })).toBeVisible({ timeout: 5_000 }) // 저장 확정

    // 물리명은 인라인 input 값 — 저장 푸시 → 상세 재조회 → 문서 교체로 값이 바뀐다(폴링 5초 대기 없이)
    const startedAt = Date.now()
    await expect(bob.getByLabel('테이블 물리명')).toHaveValue('remote_saved_table', { timeout: 4_000 })
    const elapsed = Date.now() - startedAt
    expect(elapsed).toBeLessThan(4_000) // 폴링 주기(5s) 이전 — WebSocket 푸시 경로 검증

    // ---------- 밥 탭 닫기 → 앨리스 칩 1명 복귀 ----------
    await bobContext.close()
    await expect(alice.getByTestId('presence-chip').locator('span')).toHaveCount(1, { timeout: 10_000 })

    await aliceContext.close()
  })
})
