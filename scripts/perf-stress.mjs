// #78 성능 검증 — 스트레스 문서(모델 2: 테이블 100·관계 30·content 185KB)로 에디터 성능 실측.
// 측정: 수화-렌더 시간·드래그/팬/줌 fps·자동 배치(elkjs) 소요·자동 저장(debounce PUT).
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const content = readFileSync('/tmp/model2.json', 'utf8')
const envelope = (body) => ({
  header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
  ...body,
})

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext()).newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)) })

let putBytes = 0
let putCount = 0
const route = (pattern, body) =>
  page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(body)) }))

await page.addInitScript(() => window.localStorage.setItem('crowfoot.lang', 'ko'))
route('**/api/v1/auth/oauth2/github/token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/auth/refresh-token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/core/accounts/me', { response: { userId: '2', email: 'a@b.c', name: '성능측정', providers: ['github'], admin: false, createdAt: '2026-01-01T00:00:00Z' } })
route('**/api/v1/core/accounts/me/workspaces', { totalCount: 1, responses: [{ workspaceId: '7', name: '성능', description: null, isDefault: false, myRole: 'EDITOR', memberCount: 1 }] })
route('**/api/v1/core/workspaces/7/models/2/version', { response: { version: 16, updatedAt: '2026-09-14T00:00:00Z' } })
route('**/api/v1/core/workspaces/7/models/2', {
  response: {
    modelId: '2', workspaceId: '7', name: '스트레스 100테이블', description: null,
    databaseType: 'MYSQL', content, version: 16,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z', createdBy: { userId: '2', name: '성능측정' },
  },
})
// 자동 저장 PUT — 바디 크기 기록(vite 프록시로 실물에 안 나가게 가로챈다)
await page.route('**/api/v1/core/workspaces/7/models/2/content', async (route2) => {
  const method = route2.request().method()
  if (method === 'PUT') {
    putCount++
    putBytes = route2.request().postData()?.length ?? 0
    await route2.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 16 + putCount, updatedAt: '2026-09-14T00:00:00Z' } })) })
  } else {
    await route2.continue()
  }
})

// fps 미터 — rAF 프레임 수로 측정
await page.addInitScript(() => {
  window.__fpsMeter = { frames: 0, start: 0, running: false }
})
const startMeter = () =>
  page.evaluate(() => {
    const m = window.__fpsMeter
    m.frames = 0
    m.start = performance.now()
    m.running = true
    const loop = () => {
      if (!window.__fpsMeter.running) return
      window.__fpsMeter.frames++
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
const stopMeter = () =>
  page.evaluate(() => {
    const m = window.__fpsMeter
    const ms = performance.now() - m.start
    m.running = false
    return { fps: Math.round((m.frames / ms) * 1000), frames: m.frames, ms: Math.round(ms) }
  })

/* ---------- 1. 진입-렌더 시간 ---------- */
const t0 = Date.now()
await page.goto('http://localhost:8080/login')
await page.evaluate(() => window.sessionStorage.setItem('oauth.provider', 'github'))
await page.goto('http://localhost:8080/auth/callback?code=e2e-code&state=e2e-state')
await page.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 10_000 })
const tNav = Date.now()
await page.goto('http://localhost:8080/workspaces/7/models/2')
await page.waitForSelector('.react-flow__node', { timeout: 30_000 })
const tFirstNode = Date.now()
await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length >= 70, null, { timeout: 60_000 })
const tAllNodes = Date.now()
await page.waitForTimeout(1500) // 엣지 라우팅·안정화
const culledCount = await page.locator('.react-flow__node').count()
console.log(`[1] 진입→첫 노드 ${tFirstNode - tNav}ms · 뷰포트 내 노드 완료 ${tAllNodes - tNav}ms · 안정화 포함 ${Date.now() - tNav}ms`)

/* ---------- 1b. 줌아웃해 100노드 전체 렌더 (컬링 해제 상태로 측정) ---------- */
await page.locator('.react-flow__pane').hover()
for (let i = 0; i < 15; i++) await page.mouse.wheel(0, 400)
await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length >= 100, null, { timeout: 30_000 })
await page.waitForTimeout(1500)
const edges = await page.locator('.erd-relationship').count()
const edgePaths = await page.locator('.react-flow__edge-path').count()
console.log(`[1b] 줌아웃 후 노드 DOM ${(await page.locator('.react-flow__node').count())}개(100 전부 렌더) · 관계 엣지 ${edges}개(edge-path ${edgePaths})`)

/* ---------- 2. 노드 드래그 fps ---------- */
const firstNode = page.locator('.react-flow__node').first()
const box = await firstNode.boundingBox()
const startX = box.x + 40
const startY = box.y + 10 // 헤더 밴드
await page.mouse.move(startX, startY)
await page.mouse.down()
await startMeter()
for (let i = 0; i <= 40; i++) {
  await page.mouse.move(startX + i * 12, startY + Math.sin(i / 3) * 60)
  await page.waitForTimeout(35)
}
const dragFps = await stopMeter()
await page.mouse.up()
console.log(`[2] 드래그 ${dragFps.fps}fps (${dragFps.frames}프레임/${dragFps.ms}ms) — 드래그 중 라우팅 재계산 포함`)

/* ---------- 3. 팬 fps (빈 캔버스 드래그) ---------- */
await page.waitForTimeout(600)
await page.mouse.move(900, 500)
await page.mouse.down()
await startMeter()
for (let i = 0; i <= 30; i++) {
  await page.mouse.move(900 - i * 15, 500 + Math.cos(i / 4) * 40)
  await page.waitForTimeout(40)
}
const panFps = await stopMeter()
await page.mouse.up()
console.log(`[3] 팬 ${panFps.fps}fps (${panFps.frames}프레임/${panFps.ms}ms)`)

/* ---------- 4. 줌 fps (wheel) ---------- */
await page.locator('.react-flow__pane').hover()
await startMeter()
for (let i = 0; i < 25; i++) {
  await page.mouse.wheel(0, i % 2 ? 120 : -120) // 인-아웃 반복
  await page.waitForTimeout(40)
}
const zoomFps = await stopMeter()
console.log(`[4] 줌 ${zoomFps.fps}fps (${zoomFps.frames}프레임/${zoomFps.ms}ms)`)

/* ---------- 5. 자동 배치(elkjs) 소요 ---------- */
const autoLayoutBtn = page.getByRole('button', { name: /자동\s?배치/ })
if (await autoLayoutBtn.count()) {
  const tStart = Date.now()
  await autoLayoutBtn.click()
  // disabled(실행 중) → 재활성화되면 완료
  await page.waitForFunction(
    () => {
      const btns = [...document.querySelectorAll('button')]
      const b = btns.find((x) => (x.getAttribute('aria-label') || '').includes('배치'))
      return b && !b.disabled && !b.getAttribute('aria-disabled') && performance.now() > 0
    },
    null,
    { timeout: 90_000 },
  )
  // 클릭 직후 disabled가 늦게 걸릴 수 있어, 클릭 시각 이후 "disabled 되었다가 해제" 대신 경과만 잰다:
  console.log(`[5] 자동 배치(ELK 100테이블) 버튼 재활성화까지 ${Date.now() - tStart}ms`)
  await page.waitForTimeout(2000)
  const nodesAfter = await page.locator('.react-flow__node').count()
  console.log(`    배치 후 노드 DOM ${nodesAfter}개`)
} else {
  console.log('[5] 자동 배치 버튼을 못 찾음 — 스크린샷으로 확인 필요')
}

/* ---------- 6. 자동 저장(debounce 2s) PUT ---------- */
// 5번에서 배치가 노드 이동 커밋을 만들었으니 debounce 후 PUT이 나간다
await page.waitForTimeout(4500)
console.log(`[6] 자동 저장 PUT ${putCount}회 · 마지막 바디 ${Math.round(putBytes / 1024)}KB`)

await page.screenshot({ path: '/tmp/perf-stress.png' })
await browser.close()
