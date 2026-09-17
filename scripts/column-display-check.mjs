// 컬럼 표시 모드(보기 옵션) 검증 — "키만 (PK·FK)"를 고르면 일반 컬럼 행을 접고 PK·FK만 남는다.
// ① 진입(전체) — 일반·PK·FK 행·컬럼 추가 버튼 ② '키만' 전환 — 일반 행 소실, PK·FK 잔존
// ③ 컬럼 추가 버튼 소실(이 모드에선 새 컬럼이 안 보이므로) ④ UK 행은 키 영역이라 유지
// ⑤ 노드 높이 감소·폭 불변(측정 미러는 전체 컬럼을 재 모드 전환에 폭이 흔들리지 않는다)
// ⑥ '전체 컬럼' 복귀 — 행·버튼·높이 원복 ⑦ 키 모드 + 줌아웃 축소 렌더 동시 동작.
import { chromium } from '@playwright/test'

/** 검증 문서 — ta: PK 1 + 일반 2(name·email) + UK 1, tb: PK 1 + FK 1(관계 ta→tb) */
const column = (id, physicalName, logicalName = '식별자') => ({
  id, logicalName, physicalName, dataType: 'BIGINT', length: null, precision: null, scale: null,
  nullable: false, defaultValue: null, autoIncrement: id.endsWith('c1'), comment: null,
})
const content = {
  schemaVersion: 1,
  model: {
    tables: [
      {
        id: 'ta', logicalName: '회원', physicalName: 'member', comment: null,
        columns: [column('ta-c1', 'id'), column('ta-c2', 'name', '이름'), column('ta-c3', 'email', '이메일')],
        primaryKey: { name: 'member_pk', columnIds: ['ta-c1'] },
        uniques: [{ id: 'ta-u1', name: 'uk_member_email', columnIds: ['ta-c3'] }],
        indexes: [],
      },
      {
        id: 'tb', logicalName: '주문', physicalName: 'orders', comment: null,
        columns: [column('tb-c1', 'id'), column('tb-c2', 'member_id', '회원')],
        primaryKey: { name: 'orders_pk', columnIds: ['tb-c1'] }, uniques: [], indexes: [],
      },
    ],
    relationships: [
      {
        id: 'r1', name: '회원_주문', parentTableId: 'ta', childTableId: 'tb', type: 'ONE_TO_MANY',
        identifying: false, parentMultiplicity: 'EXACTLY_ONE', childMultiplicity: 'ZERO_OR_MORE',
        fkName: 'fk_orders_member', columnMappings: [{ parentColumnId: 'ta-c1', childColumnId: 'tb-c2' }],
        onDelete: 'NO_ACTION', onUpdate: 'NO_ACTION',
      },
    ],
  },
  diagram: {
    nodes: { ta: { x: 0, y: 0, width: null }, tb: { x: 420, y: 260, width: null } },
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
    modelId: '3', workspaceId: '7', name: '컬럼 표시 모드 검증', description: null,
    databaseType: 'MYSQL', content: JSON.stringify(content), version: 1,
    createdAt: '2026-09-17T00:00:00Z', updatedAt: '2026-09-17T00:00:00Z', createdBy: { userId: '2', name: '검증' },
  },
})
await page.route('**/api/v1/core/workspaces/7/models/3/content', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 1, updatedAt: '2026-09-17T00:00:00Z' } })) }))

/** 뷰포트 — RF viewport transform에서 zoom */
const readViewport = () =>
  page.evaluate(() => {
    const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform)
    return { tx: m.e, ty: m.f, zoom: m.a }
  })

/** 노드 footprint — 노드별 transform(플로우 좌표) + offsetWidth/Height */
const readNodes = () =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.react-flow__node')].map((n) => {
        const t = new DOMMatrixReadOnly(getComputedStyle(n).transform)
        return [n.dataset.id, { x: t.e, y: t.f, w: n.offsetWidth, h: n.offsetHeight }]
      }),
    ),
  )

/** 영역별 컬럼 행 수·컬럼 추가 버튼 수·UK 행 노출 */
const readColumnState = () =>
  page.evaluate(() => ({
    pk: document.querySelectorAll('.react-flow__node [data-zone="pk"]').length,
    fk: document.querySelectorAll('.react-flow__node [data-zone="fk"]').length,
    general: document.querySelectorAll('.react-flow__node [data-zone="general"]').length,
    addButtons: [...document.querySelectorAll('.react-flow__node button')]
      .filter((b) => b.textContent.trim() === '컬럼 추가').length,
    ukVisible: document.querySelector('.react-flow__node[data-id="ta"]')?.textContent.includes('uk_member_email') ?? false,
  }))

/** 휠로 목표 배율까지 줌 — RF 기본(wheel = 줌). 바깥은 deltaY 양수, 안쪽은 음수 */
const wheelZoom = async (target, direction, max = 60) => {
  const pane = await page.locator('.react-flow__pane').boundingBox()
  const cx = pane.x + pane.width / 2
  const cy = pane.y + pane.height / 2
  let zoom = (await readViewport()).zoom
  for (let i = 0; i < max && (direction === 'out' ? zoom >= target : zoom <= target); i += 1) {
    await page.mouse.move(cx, cy)
    await page.mouse.wheel(0, direction === 'out' ? 200 : -200)
    await page.waitForTimeout(60)
    zoom = (await readViewport()).zoom
  }
  return zoom
}

/** 보기 메뉴에서 컬럼 표시 모드 선택 */
const setColumnMode = async (label) => {
  await page.getByRole('button', { name: '보기', exact: true }).click()
  await page.getByRole('menuitemradio', { name: label, exact: true }).click()
  await page.waitForTimeout(300)
}

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

/* ① 전체 모드(기본) — 일반 2(ta name·email)·PK 2(ta·tb id)·FK 1(tb member_id)·추가 버튼 2 */
const all = await readColumnState()
const allNodes = await readNodes()
check(
  '진입(전체 모드) — 일반·PK·FK 행과 컬럼 추가 버튼 모두 표시',
  all.general === 2 && all.pk === 2 && all.fk === 1 && all.addButtons === 2 && all.ukVisible,
  `일반 ${all.general} · PK ${all.pk} · FK ${all.fk} · 버튼 ${all.addButtons} · UK ${all.ukVisible}`,
)

/* ②③④ '키만 (PK·FK)' — 일반 행 소실, PK·FK·UK 유지, 추가 버튼 소실 */
await setColumnMode('키만 (PK·FK)')
const keys = await readColumnState()
const keysNodes = await readNodes()
check(
  "'키만' 전환 — 일반 컬럼 행만 접힌다(PK·FK·UK는 유지), 컬럼 추가 버튼 소실",
  keys.general === 0 && keys.pk === 2 && keys.fk === 1 && keys.addButtons === 0 && keys.ukVisible,
  `일반 ${keys.general} · PK ${keys.pk} · FK ${keys.fk} · 버튼 ${keys.addButtons} · UK ${keys.ukVisible}`,
)

/* ⑤ 높이 감소·폭 불변 — 미러는 전체 컬럼을 재므로 폭이 모드 전환에 흔들리지 않는다.
   ta는 일반 2행(94px)+추가 버튼(24px)이 접히고, tb는 일반 컬럼이 없어 버튼(24px)만 줄어든다 */
const shrunk = keysNodes.ta.h < allNodes.ta.h - 40 && keysNodes.tb.h < allNodes.tb.h - 20
const widthStable = keysNodes.ta.w === allNodes.ta.w && keysNodes.tb.w === allNodes.tb.w
check(
  '노드 높이 감소·폭 불변(측정 미러가 전체 컬럼 폭 유지)',
  shrunk && widthStable,
  `ta ${allNodes.ta.w}×${allNodes.ta.h}→${keysNodes.ta.w}×${keysNodes.ta.h} · tb ${allNodes.tb.w}×${allNodes.tb.h}→${keysNodes.tb.w}×${keysNodes.tb.h}`,
)

/* ⑦ 키 모드 + 줌아웃 — 축소 렌더 라벨과 동시 동작 */
const compactZoom = await wheelZoom(0.42, 'out')
await page.waitForTimeout(300)
const compactLabels = await page.locator('[data-compact-table]').count()
check(
  '키만 보기 + 축소 렌더 동시 동작 — 라벨 판 표시',
  compactZoom < 0.5 && compactLabels === 2,
  `줌 ${compactZoom.toFixed(2)} · 라벨 ${compactLabels}개`,
)
await wheelZoom(0.75, 'in')
await page.waitForTimeout(300)

/* ⑥ '전체 컬럼' 복귀 — 행·버튼·높이 원복 */
await setColumnMode('전체 컬럼')
const restored = await readColumnState()
const restoredNodes = await readNodes()
check(
  "'전체 컬럼' 복귀 — 일반 행·추가 버튼·높이 원복",
  restored.general === 2 && restored.pk === 2 && restored.fk === 1 && restored.addButtons === 2 &&
    restoredNodes.ta.h === allNodes.ta.h && restoredNodes.tb.h === allNodes.tb.h && restoredNodes.ta.w === allNodes.ta.w,
  `ta ${restoredNodes.ta.w}×${restoredNodes.ta.h} (원본 ${allNodes.ta.w}×${allNodes.ta.h}) · 일반 ${restored.general} · 버튼 ${restored.addButtons}`,
)

await browser.close()
console.log(failed === 0 ? '\n전체 통과' : `\n${failed}건 실패`)
process.exit(failed === 0 ? 0 : 1)
