// #137 뷰포인트 기억 검증 — 줌을 바꾸고 재진입하면 마지막 화면이 유지되는지.
// 1회차 진입(기록 없음) → 줌인 → 새로고침 재진입 → 줌 비교. localStorage 키도 확인.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const content = readFileSync('/tmp/model2.json', 'utf8')
const envelope = (body) => ({ header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }, ...body })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext()).newPage()

const route = (pattern, body) =>
  page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(body)) }))

await page.addInitScript(() => window.localStorage.setItem('crowfoot.lang', 'ko'))
route('**/api/v1/auth/oauth2/github/token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/auth/refresh-token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/core/accounts/me', { response: { userId: '2', email: 'a@b.c', name: '검증', providers: ['github'], admin: false, createdAt: '2026-01-01T00:00:00Z' } })
route('**/api/v1/core/accounts/me/workspaces', { totalCount: 1, responses: [{ workspaceId: '7', name: '검증', description: null, isDefault: false, myRole: 'EDITOR', memberCount: 1 }] })
route('**/api/v1/core/workspaces/7/models/2/version', { response: { version: 16, updatedAt: '2026-09-14T00:00:00Z' } })
route('**/api/v1/core/workspaces/7/models/2', {
  response: {
    modelId: '2', workspaceId: '7', name: '스트레스', description: null,
    databaseType: 'MYSQL', content, version: 16,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z', createdBy: { userId: '2', name: '검증' },
  },
})
await page.route('**/api/v1/core/workspaces/7/models/2/content', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 17, updatedAt: '2026-09-14T00:00:00Z' } })) }))

const zoom = () => page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a)

const enter = async () => {
  await page.goto('http://localhost:8080/workspaces/7/models/2')
  await page.waitForSelector('.react-flow__node', { timeout: 30_000 })
  await page.waitForTimeout(800)
}

/* 1회차 — 첫 진입(기록 없음): 저장된 content 뷰포인트(0.165) 복원 */
await page.goto('http://localhost:8080/login')
await page.evaluate(() => window.sessionStorage.setItem('oauth.provider', 'github'))
await page.goto('http://localhost:8080/auth/callback?code=e2e-code&state=e2e-state')
await page.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 10_000 })
await enter()
const firstZoom = await zoom()
console.log(`[1회차] 첫 진입 zoom ${firstZoom.toFixed(3)} (content 저장 뷰포인트 0.165 복원)`)

/* 줌인 — wheel 여러 번 (0.165 → 1 근처) */
await page.locator('.react-flow__pane').hover()
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, -240)
  await page.waitForTimeout(120) // move-end가 기록을 남긴 뒤 다음 휠
}
await page.waitForTimeout(500)
const zoomedZoom = await zoom()
const stored = await page.evaluate(() => localStorage.getItem('crowfoot.editor.viewport.2'))
console.log(`[줌인] zoom ${zoomedZoom.toFixed(3)} · localStorage 기록 ${stored ?? '(없음)'}`)

/* 2회차 — 재진입: 마지막 화면 유지 확인 */
await enter()
const secondZoom = await zoom()
console.log(`[2회차] 재진입 zoom ${secondZoom.toFixed(3)} — 기대 ≈ ${zoomedZoom.toFixed(3)}`)
console.log(Math.abs(secondZoom - zoomedZoom) < 0.05 ? '✓ 마지막 화면 유지' : `✗ 유지 안 됨 (차이 ${Math.abs(secondZoom - zoomedZoom).toFixed(3)})`)

await browser.close()
