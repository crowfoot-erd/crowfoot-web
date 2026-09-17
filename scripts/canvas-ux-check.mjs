// 캔버스 UX 검증 — ① 빈 캔버스 더블클릭 줌 방지 ② 관계 밴드(관계 설정 영역) 존재
// ③ 관계 점(source 핸들)은 보이지만 ④ 점에서 드래그해도 선그리기(연결 시작)가 되지 않는다
// ⑤ 밴드 클릭 → 관계 시작 피커 오버레이가 열린다(관계 생성 UI 진입은 유지).
// 점·밴드는 그대로 두고 '점에 마우스를 올려 선을 그리는' 상호작용만 끊는 것이 스펙.
import { chromium } from '@playwright/test'

const column = (id, physicalName) => ({
  id, logicalName: '식별자', physicalName, dataType: 'BIGINT', length: null, precision: null, scale: null,
  nullable: false, defaultValue: null, autoIncrement: false, comment: null,
})
const content = {
  schemaVersion: 1,
  model: {
    tables: [
      {
        id: 'ta', logicalName: '회원', physicalName: 'member', comment: null,
        columns: [column('ta-c1', 'id')],
        primaryKey: { name: 'member_pk', columnIds: ['ta-c1'] }, uniques: [], indexes: [],
      },
      {
        id: 'tb', logicalName: '주문', physicalName: 'orders', comment: null,
        columns: [column('tb-c1', 'id'), column('tb-c2', 'member_id')],
        primaryKey: { name: 'orders_pk', columnIds: ['tb-c1'] }, uniques: [], indexes: [],
      },
    ],
    relationships: [],
  },
  diagram: {
    nodes: { ta: { x: 0, y: 0, width: null }, tb: { x: 600, y: 0, width: null } },
    notes: [], viewport: null,
  },
}
const envelope = (body) => ({ header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }, ...body })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()

const route = (pattern, body) =>
  page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(body)) }))

await page.addInitScript(() => window.localStorage.setItem('crowfoot.lang', 'ko'))
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE:', m.text().slice(0, 200)))
page.on('response', (r) => {
  if (r.url().includes('/api/') && r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0, 120))
})
route('**/api/v1/auth/oauth2/github/token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/auth/refresh-token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/core/accounts/me', { response: { userId: '2', email: 'a@b.c', name: '검증', providers: ['github'], admin: false, createdAt: '2026-01-01T00:00:00Z' } })
route('**/api/v1/core/accounts/me/workspaces', { totalCount: 1, responses: [{ workspaceId: '7', name: '검증', description: null, isDefault: false, myRole: 'EDITOR', memberCount: 1 }] })
route('**/api/v1/core/workspaces/7/models/3/version', { response: { version: 1, updatedAt: '2026-09-17T00:00:00Z' } })
route('**/api/v1/core/workspaces/7/models/3', {
  response: {
    modelId: '3', workspaceId: '7', name: '캔버스 UX 검증', description: null,
    databaseType: 'MYSQL', content: JSON.stringify(content), version: 1,
    createdAt: '2026-09-17T00:00:00Z', updatedAt: '2026-09-17T00:00:00Z', createdBy: { userId: '2', name: '검증' },
  },
})
await page.route('**/api/v1/core/workspaces/7/models/3/content', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 1, updatedAt: '2026-09-17T00:00:00Z' } })) }))

const readZoom = () =>
  page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a)

const edgeCount = () =>
  page.evaluate(() => document.querySelectorAll('.react-flow__edge').length)

let failed = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`)
  if (!ok) failed += 1
}

/* 진입 */
await page.goto('http://localhost:8080/login')
await page.evaluate(() => window.sessionStorage.setItem('oauth.provider', 'github'))
await page.goto('http://localhost:8080/auth/callback?code=e2e-code&state=e2e-state')
await page.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 10_000 })
await page.goto('http://localhost:8080/workspaces/7/models/3')
await page.waitForSelector('.react-flow__node', { timeout: 30_000 })
await page.waitForTimeout(800)

/* ① 관계 밴드 — 테이블당 4면(관계 설정 영역), 클릭으로 피커가 열린다 */
const bands = await page.evaluate(() => {
  const out = {}
  for (const id of ['ta', 'tb']) {
    out[id] = [...document.querySelectorAll(`.react-flow__node[data-id="${id}"] [data-relation-band]`)].map((b) => b.dataset.relationBand)
  }
  return out
})
const sidesOk = (arr) => ['top', 'bottom', 'left', 'right'].every((s) => arr.includes(s)) && arr.length === 4
check('관계 밴드 — 테이블당 4면(top/bottom/left/right) 존재', sidesOk(bands.ta) && sidesOk(bands.tb), `ta [${bands.ta}] · tb [${bands.tb}]`)

/* ② 관계 점(source 핸들) — 보인다: 불투명 배경·12px 크기 */
const handleInfo = await page.evaluate(() => {
  const hs = [...document.querySelectorAll('.react-flow__node[data-id="ta"] .react-flow__handle.source')]
  return hs.map((h) => {
    const cs = getComputedStyle(h)
    return { size: Math.round(Math.min(h.offsetWidth, h.offsetHeight)), opacity: cs.opacity, bg: cs.backgroundColor }
  })
})
check(
  '관계 점 — 테이블당 4개 보임(불투명 배경 · 12px)',
  handleInfo.length === 4 && handleInfo.every((h) => h.size >= 10 && Number(h.opacity) > 0.5 && h.bg !== 'rgba(0, 0, 0, 0)'),
  `${handleInfo.length}개 · ${handleInfo.map((h) => `${h.size}px/${h.opacity}/${h.bg}`).join(' · ')}`,
)

/* ③ 점에서 드래그 — 선그리기(연결 시작) 차단: 연결선 미생성 · 관계 미생성 */
const beforeEdges = await edgeCount()
const handleBox = await page.locator('.react-flow__node[data-id="ta"] .react-flow__handle-right.source').boundingBox()
const tbBox = await page.locator('.react-flow__node[data-id="tb"]').boundingBox()
let connectionLineDuringDrag = 0
await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
await page.mouse.down()
for (let i = 1; i <= 10; i += 1) {
  await page.mouse.move(
    handleBox.x + ((tbBox.x + tbBox.width / 2 - handleBox.x) * i) / 10,
    handleBox.y + ((tbBox.y + tbBox.height / 2 - handleBox.y) * i) / 10,
    { steps: 2 },
  )
  if (i === 5) connectionLineDuringDrag = await page.evaluate(() => document.querySelectorAll('.react-flow__connectionline').length)
}
await page.mouse.up()
await page.waitForTimeout(400)
const afterEdges = await edgeCount()
check(
  '점 드래그 — 연결선 안 나타나고 관계도 생기지 않는다',
  connectionLineDuringDrag === 0 && afterEdges === beforeEdges,
  `드래그 중 연결선 ${connectionLineDuringDrag}개 · 엣지 ${beforeEdges} → ${afterEdges}`,
)

/* ④ 밴드 클릭 — 관계 시작 피커 오버레이가 열리고, 취소하면 아무 일도 없다 */
const taBand = await page.locator('.react-flow__node[data-id="ta"] [data-relation-band="right"]').boundingBox()
await page.mouse.click(taBand.x + taBand.width / 2, taBand.y + taBand.height / 2)
await page.waitForTimeout(300)
const pickerVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
const pickerClosed = !(await page.locator('[role="dialog"]').isVisible().catch(() => false))
check(
  '밴드 클릭 — 관계 시작 피커 열림 → Esc 취소',
  pickerVisible && pickerClosed && (await edgeCount()) === beforeEdges,
  `피커 ${pickerVisible ? '열림' : '안 열림'} → ${pickerClosed ? '닫힘' : '잔존'} · 엣지 ${await edgeCount()}`,
)

/* ⑤ 빈 캔버스 더블클릭 — 줌이 변하지 않는다 */
const zoomBefore = await readZoom()
const pane = await page.locator('.react-flow__pane').boundingBox()
await page.mouse.dblclick(pane.x + 80, pane.y + pane.height - 80)
await page.waitForTimeout(300)
const zoomAfter = await readZoom()
check('빈 캔버스 더블클릭 — 줌 불변(더블클릭 확대 방지)', Math.abs(zoomAfter - zoomBefore) < 0.001, `zoom ${zoomBefore.toFixed(3)} → ${zoomAfter.toFixed(3)}`)

await browser.close()
console.log(failed === 0 ? '\n전체 통과' : `\n${failed}건 실패`)
process.exit(failed === 0 ? 0 : 1)
