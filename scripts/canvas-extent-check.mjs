// 캔버스 팬 한계 검증 — 최외곽 객체(테이블·메모) 사방 좌표에서 CANVAS_MARGIN(800px)까지만
// 팬·드래그가 갈 수 있는지. ① 팬 바깥 시도 ② 한계 밖 저장 뷰포인트 복원 클램프 ③ 노드 드래그 한계
// ④ 미니맵 — 지점 클릭으로 그 지점을 화면 중심으로 이동, 드래그 팬은 릴리스 후 점프 없음.
import { chromium } from '@playwright/test'

/** 검증 문서 — 테이블 2개(A (0,0)·B (1000,700)) + 메모(400,-300, 폭 240) */
const content = {
  schemaVersion: 1,
  model: {
    tables: [
      {
        id: 'ta', logicalName: '회원', physicalName: 'member', comment: null,
        columns: [
          { id: 'ta-c1', logicalName: '식별자', physicalName: 'id', dataType: 'BIGINT', length: null, precision: null, scale: null, nullable: false, defaultValue: null, autoIncrement: true, comment: null },
        ],
        primaryKey: { name: 'member_pk', columnIds: ['ta-c1'] }, uniques: [], indexes: [],
      },
      {
        id: 'tb', logicalName: '주문', physicalName: 'orders', comment: null,
        columns: [
          { id: 'tb-c1', logicalName: '식별자', physicalName: 'id', dataType: 'BIGINT', length: null, precision: null, scale: null, nullable: false, defaultValue: null, autoIncrement: true, comment: null },
          { id: 'tb-c2', logicalName: '회원', physicalName: 'member_id', dataType: 'BIGINT', length: null, precision: null, scale: null, nullable: false, defaultValue: null, autoIncrement: false, comment: null },
        ],
        primaryKey: { name: 'orders_pk', columnIds: ['tb-c1'] }, uniques: [], indexes: [],
      },
    ],
    relationships: [],
  },
  diagram: {
    nodes: { ta: { x: 0, y: 0, width: null }, tb: { x: 1000, y: 700, width: null } },
    notes: [{ id: 'n1', x: 400, y: -300, width: 240, text: '메모', title: '', color: 'yellow', linkedTableId: null }],
    viewport: null,
  },
}
const MARGIN = 800
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
    modelId: '3', workspaceId: '7', name: '한계 검증', description: null,
    databaseType: 'MYSQL', content: JSON.stringify(content), version: 1,
    createdAt: '2026-09-17T00:00:00Z', updatedAt: '2026-09-17T00:00:00Z', createdBy: { userId: '2', name: '검증' },
  },
})
await page.route('**/api/v1/core/workspaces/7/models/3/content', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 1, updatedAt: '2026-09-17T00:00:00Z' } })) }))

/** 뷰포트 transform(tx,ty,zoom)과 캔버스 화면 크기 — RF 컨테이너(.react-flow) 실측 */
const readViewport = () =>
  page.evaluate(() => {
    const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform)
    const rect = document.querySelector('.react-flow').getBoundingClientRect()
    return { tx: m.e, ty: m.f, zoom: m.a, width: rect.width, height: rect.height }
  })

/** 콘텐츠 AABB — 노드 DOM transform(플로우 좌표) + offsetWidth/Height */
const readBounds = () =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.react-flow__node')].map((n) => {
      const t = new DOMMatrixReadOnly(getComputedStyle(n).transform)
      return { x: t.e, y: t.f, w: n.offsetWidth, h: n.offsetHeight }
    })
    return {
      minX: Math.min(...boxes.map((b) => b.x)),
      minY: Math.min(...boxes.map((b) => b.y)),
      maxX: Math.max(...boxes.map((b) => b.x + b.w)),
      maxY: Math.max(...boxes.map((b) => b.y + b.h)),
      count: boxes.length,
    }
  })

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

const bounds = await readBounds()
check('문서 수화', bounds.count === 3, `노드 ${bounds.count}개 · AABB ${JSON.stringify(bounds)}`)

/* ① 노드 드래그 한계 — 첫 진입(fit 상태·노드 보임)에 테이블 A를 오른쪽 멀리로 던져도
   콘텐츠 오른쪽 끝+800px에서 멈춘다 */
const dragNode = async (selector, dx, dy) => {
  const box = await page.locator(selector).boundingBox()
  // 헤더 중앙은 인라인 입력창(nodrag)이라 드래그가 안 걸린다 — 왼쪽 모서리로 잡는다
  const cx = box.x + 6
  const cy = box.y + 10
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(cx + (dx * i) / 10, cy + (dy * i) / 10, { steps: 4 })
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
}
await dragNode('[data-id="ta"]', 2600, 0)
const nodeA = await page.evaluate(() => {
  const n = document.querySelector('.react-flow__node[data-id="ta"]')
  const t = new DOMMatrixReadOnly(getComputedStyle(n).transform)
  return { x: t.e, w: n.offsetWidth }
})
check(
  '노드 드래그 — 실제로 이동하며 콘텐츠 오른쪽 끝+800px에서 클램프',
  nodeA.x > 0 && nodeA.x <= bounds.maxX + MARGIN - nodeA.w + 1,
  `A 이동 후 x ${nodeA.x.toFixed(0)} — 이동함 + ${bounds.maxX + MARGIN - nodeA.w} 이하 (끝 ${bounds.maxX} + 여유 ${MARGIN} - 폭 ${nodeA.w})`,
)

/** 팬 드래그 — 화면 중심에서 (dx,dy)로 반복 드래그 */
const pan = async (dx, dy, times = 6) => {
  const pane = await page.locator('.react-flow__pane').boundingBox()
  const cx = pane.x + pane.width / 2
  const cy = pane.y + pane.height / 2
  for (let i = 0; i < times; i += 1) {
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + dx, cy + dy, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(300)
}

/* ② 팬 한계 — 왼쪽(뷰 오른쪽 끝)·오른쪽(뷰 왼쪽 끝)·위·아래로 세게 팬 (드래그로 늘어난 AABB 재측정) */
const panned = await readBounds()
await pan(-700, 0)
let vp = await readViewport()
let visibleRight = -vp.tx / vp.zoom + vp.width / vp.zoom
check('팬 — 콘텐츠 오른쪽 끝+800px에서 멈춤', visibleRight <= panned.maxX + MARGIN + 1, `보이는 오른쪽 끝 ${visibleRight.toFixed(0)} ≤ ${panned.maxX + MARGIN}`)

await pan(700, 0)
vp = await readViewport()
let visibleLeft = -vp.tx / vp.zoom
// 왼쪽 한계는 세션 high-water mark — 진입 당시 콘텐츠 minX(드래그 전 bounds.minX=0)에서
// 800px 여유까지였던 한계는, 노드를 오른쪽으로 옮겨 콘텐츠 minX가 줄어도 그대로 유지된다.
// 한계가 콘텐츠를 따라 줄면 지금 보고 있는 뷰가 클램프되며 화면이 뚝 끌려오는 스냅이 생긴다.
check(
  '팬 — 왼쪽 한계는 세션 폭 유지(콘텐츠가 준 뒤에도 줄지 않는다)',
  visibleLeft >= bounds.minX - MARGIN - 1,
  `보이는 왼쪽 끝 ${visibleLeft.toFixed(0)} ≥ 세션 한계 ${bounds.minX - MARGIN}`,
)

await pan(0, -700)
vp = await readViewport()
let visibleBottom = -vp.ty / vp.zoom + vp.height / vp.zoom
check('팬 — 콘텐츠 아래 끝+800px에서 멈춤', visibleBottom <= panned.maxY + MARGIN + 1, `보이는 아래 끝 ${visibleBottom.toFixed(0)} ≤ ${panned.maxY + MARGIN}`)

await pan(0, 700)
vp = await readViewport()
let visibleTop = -vp.ty / vp.zoom
check('팬 — 콘텐츠 위 끝-800px에서 멈춤', visibleTop >= panned.minY - MARGIN - 1, `보이는 위 끝 ${visibleTop.toFixed(0)} ≥ ${panned.minY - MARGIN}`)

/* ③ 한계 밖 저장 뷰포인트 — 재진입 시 한계 안으로 클램프되어 돌아온다 */
await page.evaluate(() => window.localStorage.setItem('crowfoot.editor.viewport.3', JSON.stringify({ x: -50000, y: -50000, zoom: 1 })))
await page.goto('http://localhost:8080/workspaces/7/models/3')
await page.waitForSelector('.react-flow__node', { timeout: 30_000 })
await page.waitForTimeout(800)
const reentered = await readBounds()
vp = await readViewport()
const restoredLeft = -vp.tx / vp.zoom
const restoredTop = -vp.ty / vp.zoom
check(
  '저장 뷰포인트 복원 — 한계 밖(-50000)이면 한계 안으로 클램프',
  vp.tx > -50000 && restoredLeft >= reentered.minX - MARGIN - 1 && restoredTop >= reentered.minY - MARGIN - 1,
  `복원 translate(${vp.tx.toFixed(0)}, ${vp.ty.toFixed(0)}) · 보이는 왼쪽 ${restoredLeft.toFixed(0)}·위 ${restoredTop.toFixed(0)}`,
)

/* ④ 미니맵 — 플로우 좌표 → 미니맵 픽셀 변환(viewBox 역매핑). 축척(미니맵 1px = 플로우 몇 px)도 함께 */
const minimapPoint = async (flowX, flowY) => {
  const { rect, vb } = await page.evaluate(() => {
    const svg = document.querySelector('.react-flow__minimap-svg')
    return { rect: svg.getBoundingClientRect().toJSON(), vb: svg.getAttribute('viewBox').split(' ').map(Number) }
  })
  const scale = vb[2] / rect.width
  return { x: rect.x + ((flowX - vb[0]) / vb[2]) * rect.width, y: rect.y + ((flowY - vb[1]) / vb[3]) * rect.height, scale }
}

/* 클릭 — 테이블 B 중심을 클릭하면 화면 중심이 B 중심으로 온다.
   허용오차는 미니맵 1px(클릭 좌표 반올림)에 해당하는 플로우 좌표 */
const bCenter = await page.evaluate(() => {
  const n = document.querySelector('.react-flow__node[data-id="tb"]')
  const t = new DOMMatrixReadOnly(getComputedStyle(n).transform)
  return { x: t.e + n.offsetWidth / 2, y: t.f + n.offsetHeight / 2 }
})
const clickPt = await minimapPoint(bCenter.x, bCenter.y)
await page.mouse.click(clickPt.x, clickPt.y)
await page.waitForTimeout(500)   // setViewport 이동(200ms) 완료 대기
vp = await readViewport()
const center = { x: (-vp.tx + vp.width / 2) / vp.zoom, y: (-vp.ty + vp.height / 2) / vp.zoom }
check(
  '미니맵 클릭 — 클릭한 지점(B 중심)이 화면 중심으로 이동',
  Math.abs(center.x - bCenter.x) <= clickPt.scale + 1 && Math.abs(center.y - bCenter.y) <= clickPt.scale + 1,
  `화면 중심 (${center.x.toFixed(0)}, ${center.y.toFixed(0)}) · B 중심 (${bCenter.x.toFixed(0)}, ${bCenter.y.toFixed(0)}) · 허용 ${clickPt.scale.toFixed(0)}px`,
)

/* 드래그 팬은 그대로 — 릴리스 뒤 클릭 점프(200ms 점프 애니메이션)가 없어야 한다 */
const before = await readViewport()
const mm = await page.locator('.react-flow__minimap-svg').boundingBox()
await page.mouse.move(mm.x + mm.width / 2, mm.y + mm.height / 2)
await page.mouse.down()
await page.mouse.move(mm.x + mm.width / 2 - 120, mm.y + mm.height / 2 - 60, { steps: 8 })
await page.mouse.up()
const released = await readViewport()
await page.waitForTimeout(400)
const settled = await readViewport()
check(
  '미니맵 드래그 — 팬은 동작(translate 변화)하고 릴리스 후 점프 없음',
  (released.tx !== before.tx || released.ty !== before.ty) && Math.abs(settled.tx - released.tx) <= 1 && Math.abs(settled.ty - released.ty) <= 1,
  `translate (${before.tx.toFixed(0)},${before.ty.toFixed(0)}) → (${released.tx.toFixed(0)},${released.ty.toFixed(0)}) → (${settled.tx.toFixed(0)},${settled.ty.toFixed(0)})`,
)

await browser.close()
console.log(failed === 0 ? '\n전체 통과' : `\n${failed}건 실패`)
process.exit(failed === 0 ? 0 : 1)
