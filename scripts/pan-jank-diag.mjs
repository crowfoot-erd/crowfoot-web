// #131 팬(빈 배경 드래그) 끊김 진단 — 스트레스 문서(100테이블)에서 컬링 활성 상태(기본 줌)로 팬하며
// fps·노드 마운트/언마운트 수·롱태스크를 잰다. 미니링 off A/B로 미니맵 비용도 분리한다.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const content = readFileSync('/tmp/model2.json', 'utf8')
const envelope = (body) => ({ header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }, ...body })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext()).newPage()
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && !t.includes('favicon')) console.log('[console.error]', t.slice(0, 200))
})

const route = (pattern, body) =>
  page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(body)) }))

await page.addInitScript(() => window.localStorage.setItem('crowfoot.lang', 'ko'))
route('**/api/v1/auth/oauth2/github/token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/auth/refresh-token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/core/accounts/me', { response: { userId: '2', email: 'a@b.c', name: '진단', providers: ['github'], admin: false, createdAt: '2026-01-01T00:00:00Z' } })
route('**/api/v1/core/accounts/me/workspaces', { totalCount: 1, responses: [{ workspaceId: '7', name: '진단', description: null, isDefault: false, myRole: 'EDITOR', memberCount: 1 }] })
route('**/api/v1/core/workspaces/7/models/2/version', { response: { version: 16, updatedAt: '2026-09-14T00:00:00Z' } })
route('**/api/v1/core/workspaces/7/models/2', {
  response: {
    modelId: '2', workspaceId: '7', name: '스트레스 100테이블', description: null,
    databaseType: 'MYSQL', content, version: 16,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z', createdBy: { userId: '2', name: '진단' },
  },
})
await page.route('**/api/v1/core/workspaces/7/models/2/content', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 17, updatedAt: '2026-09-14T00:00:00Z' } })) }))

/* 측정 인프라 — fps·롱태스크·노드 마운트/언마운트 카운터 */
await page.addInitScript(() => {
  window.__diag = { frames: 0, start: 0, running: false, mounts: 0, unmounts: 0, longTasks: 0, longMs: 0 }
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__diag.longTasks++
      window.__diag.longMs += e.duration
    }
  }).observe({ entryTypes: ['longtask'] })
  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) if (n.nodeType === 1) window.__diag.mounts++
      for (const n of m.removedNodes) if (n.nodeType === 1) window.__diag.unmounts++
    }
  })
  const attach = () => {
    const host = document.querySelector('.react-flow__nodes')
    if (host) observer.observe(host, { childList: true })
    else requestAnimationFrame(attach)
  }
  attach()
  window.__diagReset = () => {
    const d = window.__diag
    d.frames = 0; d.start = performance.now(); d.running = true
    d.mounts = 0; d.unmounts = 0; d.longTasks = 0; d.longMs = 0
    const loop = () => {
      if (!window.__diag.running) return
      window.__diag.frames++
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }
  window.__diagStop = () => {
    const d = window.__diag
    const ms = performance.now() - d.start
    d.running = false
    return { fps: Math.round((d.frames / ms) * 1000), frames: d.frames, ms: Math.round(ms), mounts: d.mounts, unmounts: d.unmounts, longTasks: d.longTasks, longMs: Math.round(d.longMs) }
  }
})

/* 진입 */
await page.goto('http://localhost:8080/login')
await page.evaluate(() => window.sessionStorage.setItem('oauth.provider', 'github'))
await page.goto('http://localhost:8080/auth/callback?code=e2e-code&state=e2e-state')
await page.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 10_000 })
await page.goto('http://localhost:8080/workspaces/7/models/2')
await page.waitForSelector('.react-flow__node', { timeout: 30_000 })
await page.waitForTimeout(2000) // 라우팅·크기 보고 안정화

const nodeCount = () => page.locator('.react-flow__node').count()
const zoom = () => page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a)

console.log(`[초기] 렌더 노드 ${await nodeCount()}개 (컬링 활성) · zoom ${await zoom()}`)

/** 팬 시나리오 — 빈 배경 드래그로 viewport를 dx 이동 */
const pan = async (label, dxTotal, steps = 30) => {
  await page.mouse.move(900, 500)
  await page.mouse.down()
  await page.evaluate(() => window.__diagReset())
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(900 - (dxTotal * i) / steps, 500 + Math.cos(i / 4) * 30)
    await page.waitForTimeout(33)
  }
  const r = await page.evaluate(() => window.__diagStop())
  await page.mouse.up()
  await page.waitForTimeout(1200) // 컬링 후속 처리 안정화
  console.log(`[팬 ${label}] ${r.fps}fps · mounts ${r.mounts} / unmounts ${r.unmounts} · 롱태스크 ${r.longTasks}건 ${r.longMs}ms · 렌더 노드 ${await nodeCount()}개`)
  return r
}

/* A. 기본 상태(컬링·미니맵 on) — 문서 밀집 구간을 지나는 팬 */
await pan('기본(미니맵on)', 2500)

/* B. 미니맵 숨김 — 미니맵 리렌더 비용 분리 */
await page.evaluate(() => { document.querySelector('.react-flow__minimap')?.remove() })
await pan('미니맵off', -2500)

/* C. 컬링도 강제 해제(전부 렌더) 후 팬 — 마운트 체인 비용 분리 */
await page.locator('.react-flow__pane').hover()
for (let i = 0; i < 15; i++) await page.mouse.wheel(0, 400) // 줌아웃 → 전부 렌더
await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length >= 100, null, { timeout: 30_000 })
await page.waitForTimeout(1500)
console.log(`[줌아웃] 렌더 노드 ${await nodeCount()}개 · zoom ${await zoom()}`)
await pan('전체렌더(컬링사실상해제)', 2500)

await page.screenshot({ path: '/tmp/pan-jank.png' })
await browser.close()
