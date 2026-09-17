// 테이블 색 지정 검증 — 프리셋 10색 템플릿(node/color, 정보 다이얼로그 스와치).
// ① 문서에 지정된 색(ta=sky) 렌더 — 헤더 밴드 틴트·미니맵 fill ② 색 없는 레거시(tb)는 기본 렌더
// ③ 정보 다이얼로그 스와치 11개(기본+10색), 현재 색 표시 ④ 스와치 클릭 즉시 반영(밴드·미니맵)
// ⑤ undo 원복 ⑥ 자동저장 페이로드에 색이 실린다.
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
        columns: [column('tb-c1', 'id')],
        primaryKey: { name: 'orders_pk', columnIds: ['tb-c1'] }, uniques: [], indexes: [],
      },
    ],
    relationships: [],
  },
  diagram: {
    // ta는 문서에 색이 지정돼 있고, tb는 색 없는 레거시 — 수화 시 default로 정규화된다
    nodes: { ta: { x: 0, y: 0, width: null, color: 'sky' }, tb: { x: 600, y: 0, width: null } },
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
    modelId: '3', workspaceId: '7', name: '테이블 색 검증', description: null,
    databaseType: 'MYSQL', content: JSON.stringify(content), version: 1,
    createdAt: '2026-09-17T00:00:00Z', updatedAt: '2026-09-17T00:00:00Z', createdBy: { userId: '2', name: '검증' },
  },
})
/* 콘텐츠 엔드포인트 — PUT(자동저장, 2s 디바운스)은 바디를 캡처하고, 나머지는 목응답 */
let savedBody = null
await page.route('**/api/v1/core/workspaces/7/models/3/content', (r) => {
  if (r.request().method() === 'PUT') savedBody = r.request().postDataJSON()
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 2, updatedAt: '2026-09-17T00:00:00Z' } })) })
})

/** 노드 헤더 밴드 배경색 — 노드 래퍼 안쪽 컴포넌트 루트의 자식 .rounded-t-md(논리명 밴드) */
const bandBg = (nodeId) =>
  page.evaluate((id) => {
    const band = document.querySelector(`.react-flow__node[data-id="${id}"] div.rounded-t-md`)
    return band ? getComputedStyle(band).backgroundColor : null
  }, nodeId)

/** 미니맵 노드 fill — RF는 rect에 style.fill로 색을 넣는다. x 좌표 순으로 식별(ta 왼쪽, tb 오른쪽).
 *  기본색 노드는 fill이 비어 있다('') */
const minimapFills = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.react-flow__minimap-svg .react-flow__minimap-node')]
      .map((n) => ({ x: Number(n.getAttribute('x')), fill: n.style.fill || null }))
      .sort((a, b) => a.x - b.x)
      .map((n) => n.fill))

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

/* ① 문서 지정색(ta=sky) 렌더 — 밴드가 기본(tb)과 다르고 미니맵 fill가 원색 */
const taBg = await bandBg('ta')
const tbBg = await bandBg('tb')
const [taFill, tbFill] = await minimapFills()
check('문서 지정색 — ta(sky) 밴드가 기본(tb)과 다른 색', taBg !== tbBg && taBg !== null, `ta ${taBg} · tb ${tbBg}`)
check('문서 지정색 — ta 미니맵 fill = #0ea5e9(sky)', taFill === 'rgb(14, 165, 233)', `fill ${taFill}`)

/* ② 색 없는 레거시(tb) — 기본 렌더(미니맵 기본색·밴드 기본 틴트)로 깨지지 않는다 */
check('레거시 노드 — 색 없는 문서도 기본 렌더(미니맵 기본 fill)', tbFill !== '#0ea5e9', `fill ${tbFill}`)

/* ③ 정보 다이얼로그 — 스와치 11개(기본+10색), 현재 색(default) 표시 */
await page.locator('.react-flow__node[data-id="tb"] button[aria-label="테이블 정보"]').click()
await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
const swatches = await page.locator('[role="dialog"] [role="group"] button').all()
const pressedDefault = await swatches[0].getAttribute('aria-pressed')
check('정보 다이얼로그 — 스와치 11개(기본+10색) · 현재 색 표시', swatches.length === 11 && pressedDefault === 'true', `스와치 ${swatches.length}개 · 기본 pressed=${pressedDefault}`)

/* ④ 스와치 클릭(amber, 4번째) 즉시 반영 — 다이얼로그가 열린 채 밴드·미니맵이 변한다 */
await swatches[3].click()
await page.waitForTimeout(300)
const tbBgAmber = await bandBg('tb')
const [, tbFillAmber] = await minimapFills()
const pressedAmber = await swatches[3].getAttribute('aria-pressed')
check('스와치 클릭 — 즉시 밴드 색 반영', tbBgAmber !== tbBg, `${tbBg} → ${tbBgAmber}`)
check('스와치 클릭 — 미니맵 fill = #f59e0b(amber)', tbFillAmber === 'rgb(245, 158, 11)', `fill ${tbFillAmber}`)
check('스와치 클릭 — 선택 표시 이동', pressedAmber === 'true', `pressed=${pressedAmber}`)

/* ⑤ 자동저장 페이로드 — 색이 문서에 실린다(diagram.nodes.tb.color) */
await page.waitForTimeout(3000) // 2s 디바운스 + 여유
const savedColor = savedBody ? JSON.parse(savedBody.content).diagram.nodes.tb?.color : null
check('자동저장 — PUT 콘텐츠에 tb 색(amber) 포함', savedColor === 'amber', `saved color ${savedColor}`)

/* ⑥ undo 원복 — 밴드·미니맵이 기본으로 돌아온다. 다이얼로그를 닫고 선택을 풀어야
   기준(초기 측정)과 같은 상태(기본색 미선택 밴드 bg-primary/15)로 비교된다 */
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await page.keyboard.press('Meta+z')
const paneBox = await page.locator('.react-flow__pane').boundingBox()
// 좌하단 — 우하단은 미니맵이 있어 클릭이 뷰포트 이동이 된다
await page.mouse.click(paneBox.x + 60, paneBox.y + paneBox.height - 60)
await page.waitForTimeout(300)
const tbBgUndo = await bandBg('tb')
const [, tbFillUndo] = await minimapFills()
check('undo — 밴드·미니맵 원복', tbBgUndo === tbBg && tbFillUndo !== 'rgb(245, 158, 11)', `밴드 ${tbBgUndo === tbBg ? '원복' : `${tbBg} → ${tbBgUndo}`} · fill ${tbFillUndo}`)

/* ⑦ 축소(줌아웃) 라벨 판 — 색 테이블(ta)의 라벨 판이 기본(tb) 회색 판과 다른 틴트로 그려진다.
   다이얼로그가 닫힌 뒤여야 휠 줌이 캔버스에 닿는다(모달이 포인터를 삼킨다) */
const readZoom = () =>
  page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a)
await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2)
for (let i = 0; i < 60 && (await readZoom()) >= 0.45; i += 1) {
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(40)
}
await page.waitForTimeout(400)
const plateBg = (nodeId) =>
  page.evaluate((id) => {
    const plate = document.querySelector(`.react-flow__node[data-id="${id}"] [data-compact-table] > div`)
    return plate ? getComputedStyle(plate).backgroundColor : null
  }, nodeId)
const taPlate = await plateBg('ta')
const tbPlate = await plateBg('tb')
check('축소 라벨 판 — 색 테이블 판이 기본 판과 다른 틴트', taPlate !== tbPlate && taPlate !== null, `ta ${taPlate} · tb ${tbPlate}`)

await browser.close()
console.log(failed === 0 ? '\n전체 통과' : `\n${failed}건 실패`)
process.exit(failed === 0 ? 0 : 1)
