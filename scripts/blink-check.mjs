// #blink 첫 로드 깜빡임 실측 — 에디터 진입 프레임을 기록해
// ① 빈 캔버스가 먼저 페인트되고 노드가 나중에 투척되는지(프레임별 노드 수)
// ② zoom 1 → fit 점프가 보이는지(프레임별 viewport zoom)
// 시나리오 A: 기록·content 뷰포인트 없음(전체 맞춤 — 추정 → 보정) / B: localStorage 기록 복원
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const raw = readFileSync('/tmp/model2.json', 'utf8')
const envelope = (body) => ({ header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }, ...body })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext()).newPage()

const route = (pattern, body) =>
  page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(body)) }))

// 프레임 기록기 — 첫 페인트부터 rAF마다 노드 수·zoom을 남긴다
await page.addInitScript(() => {
  window.__frames = []
  const tick = () => {
    const vp = document.querySelector('.react-flow__viewport')
    let zoom = null
    if (vp) {
      const transform = getComputedStyle(vp).transform
      if (transform && transform !== 'none') zoom = new DOMMatrixReadOnly(transform).a
    }
    window.__frames.push({ t: Math.round(performance.now()), nodes: document.querySelectorAll('.react-flow__node').length, zoom })
    if (window.__frames.length < 900) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
await page.addInitScript(() => window.localStorage.setItem('crowfoot.lang', 'ko'))
route('**/api/v1/auth/oauth2/github/token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/auth/refresh-token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/core/accounts/me', { response: { userId: '2', email: 'a@b.c', name: '검증', providers: ['github'], admin: false, createdAt: '2026-01-01T00:00:00Z' } })
route('**/api/v1/core/accounts/me/workspaces', { totalCount: 1, responses: [{ workspaceId: '7', name: '검증', description: null, isDefault: false, myRole: 'EDITOR', memberCount: 1 }] })
route('**/api/v1/core/workspaces/7/models/2/version', { response: { version: 16, updatedAt: '2026-09-14T00:00:00Z' } })
route('**/api/v1/core/workspaces/7/models/2', {
  response: {
    modelId: '2', workspaceId: '7', name: '스트레스', description: null,
    databaseType: 'MYSQL', content: raw, version: 16,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z', createdBy: { userId: '2', name: '검증' },
  },
})
await page.route('**/api/v1/core/workspaces/7/models/2/content', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 17, updatedAt: '2026-09-14T00:00:00Z' } })) }))

/* 시나리오 A — 기록·content 뷰포인트 전부 제거한 첫 오픈(전체 맞춤) */
await page.goto('http://localhost:8080/login')
await page.evaluate(() => {
  window.sessionStorage.setItem('oauth.provider', 'github')
  window.localStorage.removeItem('crowfoot.editor.viewport.2')
})
// content의 diagram.viewport도 지운다 — 라우트가 이미 고정 JSON이라 여기선 원문 유지, 대신 이 시나리오는 문서가 viewport를 안 가질 때만 성립
const parsed = JSON.parse(raw)
const noViewport = JSON.stringify({ ...parsed, diagram: { ...parsed.diagram, viewport: null } })
await page.unroute('**/api/v1/core/workspaces/7/models/2')
route('**/api/v1/core/workspaces/7/models/2', {
  response: {
    modelId: '2', workspaceId: '7', name: '스트레스', description: null,
    databaseType: 'MYSQL', content: noViewport, version: 16,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z', createdBy: { userId: '2', name: '검증' },
  },
})
await page.goto('http://localhost:8080/auth/callback?code=e2e-code&state=e2e-state')
await page.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 10_000 })
await page.goto('http://localhost:8080/workspaces/7/models/2')
await page.waitForSelector('.react-flow__node', { timeout: 30_000 })
await page.waitForTimeout(1200) // fit 보정·안정화 대기

const framesA = await page.evaluate(() => window.__frames)
const firstPaint = framesA.find((f) => f.nodes > 0)
const emptyPainted = framesA.some((f) => f.t < (firstPaint?.t ?? Infinity) && f.zoom !== null)
const zooms = framesA.filter((f) => f.zoom !== null).map((f) => f.zoom)
const firstZoom = zooms[0]
const lastZoom = zooms[zooms.length - 1]
const maxJump = zooms.reduce((m, z, i) => (i > 0 ? Math.max(m, Math.abs(z - zooms[i - 1])) : m), 0)
console.log(`[A 첫 오픈 — 전체 맞춤] 첫 노드 프레임 t=${firstPaint?.t}ms nodes=${firstPaint?.nodes}`)
console.log(`  빈 캔버스 페인트(노드 0인 채 viewport 그림): ${emptyPainted ? '✗ 있음' : '✓ 없음'}`)
console.log(`  zoom 첫=${firstZoom?.toFixed(3)} 최종=${lastZoom?.toFixed(3)} 프레임간 최대 점프=${maxJump.toFixed(4)}`)
console.log(`  최종 노드 수=${framesA[framesA.length - 1].nodes}`)

/* 시나리오 B — localStorage 기록 복원(줌 바꾼 뒤 재진입) */
const zoomedTarget = 1.8
await page.evaluate((z) => window.localStorage.setItem('crowfoot.editor.viewport.2', JSON.stringify({ x: -400, y: 120, zoom: z })), zoomedTarget)
await page.goto('http://localhost:8080/workspaces/7/models/2')
await page.waitForSelector('.react-flow__node', { timeout: 30_000 })
await page.waitForTimeout(800)
const framesB = await page.evaluate(() => window.__frames)
const zoomsB = framesB.filter((f) => f.zoom !== null).map((f) => f.zoom)
const firstZoomB = zoomsB[0]
const stableB = zoomsB[zoomsB.length - 1]
const maxJumpB = zoomsB.reduce((m, z, i) => (i > 0 ? Math.max(m, Math.abs(z - zoomsB[i - 1])) : m), 0)
const firstNodeB = framesB.find((f) => f.nodes > 0)
const emptyB = framesB.some((f) => f.t < (firstNodeB?.t ?? Infinity) && f.zoom !== null)
console.log(`[B 기록 복원] 첫 노드 프레임 t=${firstNodeB?.t}ms · 빈 캔버스 페인트 ${emptyB ? '✗ 있음' : '✓ 없음'}`)
console.log(`  zoom 첫=${firstZoomB?.toFixed(3)} 최종=${stableB?.toFixed(3)} (기대 ≈ ${zoomedTarget}) 프레임간 최대 점프=${maxJumpB.toFixed(4)}`)

await browser.close()
