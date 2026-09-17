// 메모 겹침 해소 + 연관 지정 검증 — 메모는 테이블·다른 메모와 포개지지 않는다(메모가 물러난다).
// ① 겹쳐 저장된 문서 로드 — 테이블 마운트 크기 보고가 겹침 해소를 트리거해 메모가 밀려난다
// ② 빈 캔버스 우클릭 메모 생성 — 클릭 지점이 테이블과 겹치면 비어 있는 곳에 만든다
// ③ 메모를 메모 위로 드래그 — 드롭과 같은 커밋에서 분리된다
// ④ 테이블 위 드롭 = 연관 지정 제스처 — 배지 표시 + 원위치 복귀.
//    테이블에 이미 연관 메모(n1)가 붙어 있어도 새 메모가 같은 테이블에 연결된다(다중 연관).
// ⑤ 연관 테이블 삭제 → 새 테이블 생성 → 새 메모 드래그 연결 — 삭제 후에도 연결이 된다.
// 뷰포트를 크게 잡는 이유 — RF autoPanOnNodeDrag(기본 켜짐): 드래그 시작점이 화면 가장자리면
// 드래그 중 뷰포트가 팬되어 좌표 계산이 어긋난다. 노드가 가장자리에 닿지 않게 한다.
import { chromium } from '@playwright/test'

/** 검증 문서 — ta(340×253)와 메모 n1(100,60)이 일부러 겹치게, n1은 ta에 연관으로 저장되어 있다 */
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
        columns: [column('ta-c1', 'id'), column('ta-c2', 'name'), column('ta-c3', 'email')],
        primaryKey: { name: 'member_pk', columnIds: ['ta-c1'] }, uniques: [], indexes: [],
      },
    ],
    relationships: [],
  },
  diagram: {
    nodes: { ta: { x: 0, y: 0, width: null } },
    notes: [{ id: 'n1', x: 100, y: 60, width: 240, text: '겹친 메모', title: '', color: 'yellow', linkedTableId: 'ta' }],
    viewport: null,
  },
}
const envelope = (body) => ({ header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }, ...body })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1600 } })).newPage()

const route = (pattern, body) =>
  page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(body)) }))

await page.addInitScript(() => window.localStorage.setItem('crowfoot.lang', 'ko'))
page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('DBG')) && console.log('CONSOLE:', m.text().slice(0, 400)))
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
    modelId: '3', workspaceId: '7', name: '메모 겹침 검증', description: null,
    databaseType: 'MYSQL', content: JSON.stringify(content), version: 1,
    createdAt: '2026-09-17T00:00:00Z', updatedAt: '2026-09-17T00:00:00Z', createdBy: { userId: '2', name: '검증' },
  },
})
await page.route('**/api/v1/core/workspaces/7/models/3/content', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 1, updatedAt: '2026-09-17T00:00:00Z' } })) }))

const readViewport = () =>
  page.evaluate(() => {
    const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform)
    return { tx: m.e, ty: m.f, zoom: m.a }
  })

/** 객체 사각형 — 노드 transform(플로우 좌표) + offsetWidth/Height */
const readRects = () =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.react-flow__node')].map((n) => {
        const t = new DOMMatrixReadOnly(getComputedStyle(n).transform)
        return [n.dataset.id, { x: t.e, y: t.f, w: n.offsetWidth, h: n.offsetHeight }]
      }),
    ),
  )

/** 플로우 좌표 → 화면 좌표 (pane 원점 + 뷰포트 변환) */
const toScreen = async (fx, fy) => {
  const vp = await readViewport()
  const pane = await page.locator('.react-flow__pane').boundingBox()
  return { x: pane.x + vp.tx + fx * vp.zoom, y: pane.y + vp.ty + fy * vp.zoom }
}

/** 두 사각형이 각각 15px 부풀렸을 때도 겹치지 않으면 '분리'로 본다(간격 32의 절반가량 확보) */
const separated = (a, b) =>
  !(a.x < b.x + b.w + 15 && b.x < a.x + a.w + 15 && a.y < b.y + b.h + 15 && b.y < a.y + a.h + 15)

/** 메모를 잡아(밴드 왼쪽 위 그립) 노드 **중심**이 화면 목표에 오도록 드래그한다 */
const dragNoteCenterTo = async (noteId, targetScreen) => {
  const box = await page.locator(`.react-flow__node[data-id="${noteId}"]`).boundingBox()
  const cx = box.x + 6
  const cy = box.y + 10 // textarea는 nodrag — 밴드(헤더) 왼쪽 위로 잡는다
  const tx = targetScreen.x - (box.width / 2 - 6)
  const ty = targetScreen.y - (box.height / 2 - 10)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(cx + ((tx - cx) * i) / 10, cy + ((ty - cy) * i) / 10, { steps: 4 })
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)
}

const noteText = (noteId) =>
  page.evaluate((id) => document.querySelector(`.react-flow__node[data-id="${id}"]`)?.textContent ?? '', noteId)

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
await page.waitForTimeout(1000)

/* ① 겹쳐 저장된 문서 — 로드 즉시 메모가 밀려나 테이블과 분리된다 */
const rects1 = await readRects()
check(
  '겹쳐 저장된 메모(n1) — 로드 시 테이블과 분리(간격 확보)',
  separated(rects1.ta, rects1.n1),
  `ta ${Math.round(rects1.ta.x)},${Math.round(rects1.ta.y)} ${rects1.ta.w}×${rects1.ta.h} · n1 ${Math.round(rects1.n1.x)},${Math.round(rects1.n1.y)} ${rects1.n1.w}×${rects1.n1.h}`,
)

/* ② 빈 캔버스 우클릭 메모 생성 — 테이블 왼쪽 100px 지점(메모 폭 360이 겹치는 자리)에서 만들어도 비어 있는 곳에 */
const createAt = await toScreen(-100, 40)
await page.mouse.click(createAt.x, createAt.y, { button: 'right' })
await page.getByRole('menuitem', { name: '메모 생성' }).click()
await page.waitForTimeout(600)
const rects2 = await readRects()
const noteB = Object.keys(rects2).find((id) => id !== 'ta' && id !== 'n1')
check(
  '우클릭 메모 생성 — 클릭 지점이 테이블과 겹치면 비어 있는 곳에 생성',
  Boolean(noteB) && separated(rects2.ta, rects2[noteB]) && separated(rects2.n1, rects2[noteB]),
  noteB
    ? `새 메모 @ ${Math.round(rects2[noteB].x)},${Math.round(rects2[noteB].y)} — 테이블·n1 모두와 분리`
    : '새 메모가 생기지 않았다',
)

/* ③ 새 메모를 n1 위로 드래그 — 드롭 커밋에서 곧바로 분리된다 */
const n1Center = await page.locator('.react-flow__node[data-id="n1"]').boundingBox()
await dragNoteCenterTo(noteB, { x: n1Center.x + n1Center.width / 2, y: n1Center.y + n1Center.height / 2 })
const rects3 = await readRects()
check(
  '메모를 메모 위로 드래그 — 드롭과 같은 커밋에서 분리',
  separated(rects3.n1, rects3[noteB]) && separated(rects3.ta, rects3[noteB]),
  `n1 ${Math.round(rects3.n1.x)},${Math.round(rects3.n1.y)} · 새 메모 ${Math.round(rects3[noteB].x)},${Math.round(rects3[noteB].y)}`,
)

/* ④ 새 메모를 테이블 위로 드래그 — 연관 지정 제스처: 배지 표시 + 원위치 복귀(드래그 전 위치).
   테이블에 이미 연관 메모(n1)가 있어도 새 메모도 연결된다 */
const beforeDrop = (await readRects())[noteB]
const taCenter = await page.locator('.react-flow__node[data-id="ta"]').boundingBox()
await dragNoteCenterTo(noteB, { x: taCenter.x + taCenter.width / 2, y: taCenter.y + taCenter.height / 2 })
const afterDrop = (await readRects())[noteB]
check(
  '테이블 위 드롭 — 연관 배지(member) 표시 + 원위치 복귀 · 기존 연관 메모가 있어도 다중 연결',
  (await noteText(noteB)).includes('member') &&
    Math.abs(afterDrop.x - beforeDrop.x) <= 1 &&
    Math.abs(afterDrop.y - beforeDrop.y) <= 1,
  `배지 ${(await noteText(noteB)).includes('member')} · 위치 ${Math.round(beforeDrop.x)},${Math.round(beforeDrop.y)} → ${Math.round(afterDrop.x)},${Math.round(afterDrop.y)}`,
)

/* ⑤ 연관 테이블 삭제 → 같은 자리 새 테이블 → 새 메모 드래그 — 연결이 되어야 한다 */
// 헤더(밴드)를 클릭해 선택 — 중앙은 컬럼 물리명 input이라 포커스가 input으로 가면 Delete가 먹지 않는다
const taHeader = await page.locator('.react-flow__node[data-id="ta"]').boundingBox()
await page.mouse.click(taHeader.x + 8, taHeader.y + 12)
await page.waitForTimeout(200)
await page.keyboard.press('Delete')
await page.waitForTimeout(400)
const afterDelete = await readRects()
check('테이블 삭제 — 노드가 사라지고 메모 2개만 남는다(메모는 보존)', !afterDelete.ta && Object.keys(afterDelete).length === 2, Object.keys(afterDelete).join(','))

const createTableAt = await toScreen(0, 0)
await page.mouse.click(createTableAt.x, createTableAt.y, { button: 'right' })
await page.getByRole('menuitem', { name: '엔터티 생성' }).click()
await page.waitForTimeout(600)
const withNewTable = await readRects()
const newTableId = Object.keys(withNewTable).find((id) => id !== 'n1' && id !== noteB)
check('새 테이블 생성 — 같은 자리(0,0)에 만들어진다', Boolean(newTableId), newTableId ?? '생성 안 됨')

const createNoteAt = await toScreen(700, 0)
await page.mouse.click(createNoteAt.x, createNoteAt.y, { button: 'right' })
await page.getByRole('menuitem', { name: '메모 생성' }).click()
await page.waitForTimeout(600)
const rects5 = await readRects()
const noteC = Object.keys(rects5).find((id) => id !== newTableId && id !== 'n1' && id !== noteB)
check('새 메모 생성(⑤용)', Boolean(noteC), noteC ?? '생성 안 됨')

const newTableBox = await page.locator(`.react-flow__node[data-id="${newTableId}"]`).boundingBox()
await dragNoteCenterTo(noteC, { x: newTableBox.x + newTableBox.width / 2, y: newTableBox.y + newTableBox.height / 2 })
const noteCText = await noteText(noteC)
const tablePhysical = newTableId
  ? await page.evaluate((id) => document.querySelector(`.react-flow__node[data-id="${id}"]`)?.textContent ?? '', newTableId)
  : ''
check(
  '삭제 후 재생성 테이블에 새 메모 드래그 — 연결된다(배지 = 새 테이블 물리명)',
  Boolean(newTableId) && noteCText.includes((tablePhysical.match(/table_\d+/) ?? [''])[0]),
  `배지 텍스트에 물리명 포함: ${noteCText.includes((tablePhysical.match(/table_\d+/) ?? [''])[0])}`,
)

await browser.close()
console.log(failed === 0 ? '\n전체 통과' : `\n${failed}건 실패`)
process.exit(failed === 0 ? 0 : 1)
