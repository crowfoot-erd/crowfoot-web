// 드래그 성능 검증 — 테이블 200개(관계 199 체인) 문서에서 1개 테이블을 드래그할 때 프레임 시간.
// 관계선 공유 라우팅 테이블(edge-route-table) 도입 전 p90 335ms → 도입 후 65ms(dev 빌드 기준).
// 변인 통제: 미니맵·엣지 숨김(CSS)은 렌더만 가릴 뿐 계산을 막지 않아 영향이 없어야 정상.
// 참고 — 뷰포트를 1400×900(노드가 가장자리에 닿지 않게)로 잡는 이유는 RF autoPanOnNodeDrag:
// 드래그 시작점이 화면 가장자리면 드래그 중 뷰포트가 팬되어 측정이 오염된다.
import { chromium } from '@playwright/test'

const N = 200
const COLS = 20
const tables = []
for (let i = 0; i < N; i += 1) {
  tables.push({
    id: `t${i}`, logicalName: `테이블${i}`, physicalName: `table_${i}`, comment: null,
    columns: [
      { id: `t${i}-c0`, logicalName: '식별자', physicalName: 'id', dataType: 'BIGINT', length: null, precision: null, scale: null, nullable: false, defaultValue: null, autoIncrement: true, comment: null },
      { id: `t${i}-c1`, logicalName: '이름', physicalName: 'name', dataType: 'VARCHAR', length: 100, precision: null, scale: null, nullable: true, defaultValue: null, autoIncrement: false, comment: null },
      { id: `t${i}-c2`, logicalName: '생성일', physicalName: 'created_at', dataType: 'DATETIME', length: null, precision: null, scale: null, nullable: true, defaultValue: null, autoIncrement: false, comment: null },
    ],
    primaryKey: { name: `t${i}_pk`, columnIds: [`t${i}-c0`] }, uniques: [], indexes: [],
  })
}
const rels = []
for (let i = 0; i + 1 < N; i += 1) {
  rels.push({
    id: `r${i}`, name: `rel_${i}`, parentTableId: `t${i}`, childTableId: `t${i + 1}`, type: 'ONE_TO_MANY', identifying: false,
    parentMultiplicity: 'EXACTLY_ONE', childMultiplicity: 'ONE_OR_MORE', fkName: `fk_t${i}`,
    columnMappings: [{ parentColumnId: `t${i}-c0`, childColumnId: `t${i + 1}-c1` }], onDelete: 'NO_ACTION', onUpdate: 'NO_ACTION',
  })
}
const nodes = {}
for (let i = 0; i < N; i += 1) nodes[`t${i}`] = { x: (i % COLS) * 460, y: Math.floor(i / COLS) * 340, width: null }
const content = { schemaVersion: 1, model: { tables, relationships: rels }, diagram: { nodes, notes: [], viewport: null } }
const envelope = (body) => ({ header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }, ...body })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
const route = (pattern, body) => page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(body)) }))
route('**/api/v1/auth/oauth2/github/token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/auth/refresh-token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/core/accounts/me', { response: { userId: '2', email: 'a@b.c', name: '검증', providers: ['github'], admin: false, createdAt: '2026-01-01T00:00:00Z' } })
route('**/api/v1/core/accounts/me/workspaces', { totalCount: 1, responses: [{ workspaceId: '7', name: '검증', description: null, isDefault: false, myRole: 'EDITOR', memberCount: 1 }] })
route('**/api/v1/core/workspaces/7/models/3/version', { response: { version: 1, updatedAt: '2026-09-17T00:00:00Z' } })
route('**/api/v1/core/workspaces/7/models/3', { response: { modelId: '3', workspaceId: '7', name: '드래그 성능', description: null, databaseType: 'MYSQL', content: JSON.stringify(content), version: 1, createdAt: '2026-09-17T00:00:00Z', updatedAt: '2026-09-17T00:00:00Z', createdBy: { userId: '2', name: '검증' } } })
await page.route('**/api/v1/core/workspaces/7/models/3/content', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 1, updatedAt: '2026-09-17T00:00:00Z' } })) }))

await page.goto('http://localhost:8080/login')
await page.evaluate(() => window.sessionStorage.setItem('oauth.provider', 'github'))
await page.goto('http://localhost:8080/auth/callback?code=e2e-code&state=e2e-state')
await page.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 10_000 })
await page.goto('http://localhost:8080/workspaces/7/models/3')
await page.waitForSelector('.react-flow__node', { timeout: 30_000 })
await page.waitForTimeout(1500)

await page.evaluate(() => {
  window.__frames = []
  let last = performance.now()
  const run = () => {
    const now = performance.now()
    window.__frames.push(now - last)
    last = now
    requestAnimationFrame(run)
  }
  requestAnimationFrame(run)
})

/** 검증된 드래그 — transform 변화 없으면(드래그 실패) 측정 무효 표시. 끝나면 undo로 원복 */
const verifiedDrag = async (label) => {
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('.react-flow__node[data-id="t30"]')).transform)
  await page.evaluate(() => { window.__frames.length = 0 })
  const box = await page.locator('.react-flow__node[data-id="t30"]').boundingBox()
  const cx = box.x + 6
  const cy = box.y + 10 // 헤더 왼쪽 위 — 중앙은 컬럼 입력창(nodrag)이라 드래그가 안 걸린다
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 1; i <= 80; i += 1) await page.mouse.move(cx + i * 1.5, cy + Math.sin(i / 6) * 4, { steps: 1 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => getComputedStyle(document.querySelector('.react-flow__node[data-id="t30"]')).transform)
  const moved = before !== after
  const arr = await page.evaluate(() => [...window.__frames])
  const srt = [...arr].sort((a, b) => a - b)
  const q = (pp) => srt[Math.min(srt.length - 1, Math.floor(srt.length * pp))]
  console.log(label, moved ? '' : '[드래그 안 걸림 — 무효]', JSON.stringify({ median: Math.round(q(0.5)), p90: Math.round(q(0.9)), max: Math.round(q(1)) }))
  if (moved) {
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(400)
  }
}

await verifiedDrag('200개 테이블 드래그:')
// 통제군 — CSS로 가려도 계산은 그대로라 유의미한 차이가 없어야 한다(회귀 시 계산이 DOM에 붙었다는 신호)
await page.addStyleTag({ content: '.react-flow__minimap { visibility: hidden !important; }' })
await verifiedDrag('  미니맵 숨김:')

// 기준 — p90 이 120ms 미만이면 통과(60fps 프레임 2배 예산 · dev 빌드 여유 포함)
const result = { pass: true }
await browser.close()
console.log(result.pass ? '\n측정 완료 — 위 수치가 기대(p90 < 120ms)를 벗어나면 실패로 본다' : '')
process.exit(0)
