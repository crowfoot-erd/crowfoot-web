// 축소(줌아웃) 렌더 검증 — 배율이 임계(TABLE_COMPACT_ZOOM=0.5)보다 작아지면 테이블 노드는
// 노드 상단에 논리명·물리명 두 줄 라벨 판을 헤더처럼 붙이고 아래 상세는 반투명 베일로 흐린다.
// ① 임계 아래 진입 — 라벨 표시·상단 플러시·안쪽 padding ② 판 = #e5e5e5 불투명·베일 반투명
// ③ 클릭은 라벨 레이어가 받는다(뒤로 새지 않음) ④ 겹침 클릭 — 앞 테이블만 선택(뒤 객체
// 오선택 방지) ⑤ 라벨 화면 크기 유지(플로우 폰트 × 배율 ≈ 13px) ⑥ 노드 footprint(폭·높이·위치)
// 불변 — 팬 한계·미니맵·엣지 앵커가 흔들리지 않는다 ⑦ 임계 위 복귀 — 원래 인라인 편집 렌더 복원.
import { chromium } from '@playwright/test'

/** 검증 문서 — 테이블 2개가 일부러 겹치게 둔다(회원/member 3컬럼 · 주문/orders 2컬럼, tb가
 *  ta 위쪽 오른쪽을 덮는다) + 메모 1개 — 겹침 클릭 오선택 검증용 */
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
        primaryKey: { name: 'member_pk', columnIds: ['ta-c1'] }, uniques: [], indexes: [],
      },
      {
        id: 'tb', logicalName: '주문', physicalName: 'orders', comment: null,
        columns: [column('tb-c1', 'id'), column('tb-c2', 'member_id', '회원')],
        primaryKey: { name: 'orders_pk', columnIds: ['tb-c1'] }, uniques: [], indexes: [],
      },
    ],
    relationships: [],
  },
  diagram: {
    nodes: { ta: { x: 0, y: 0, width: null }, tb: { x: 200, y: 120, width: null } },
    notes: [{ id: 'n1', x: 300, y: -200, width: 240, text: '메모', title: '', color: 'yellow', linkedTableId: null }],
    viewport: null,
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
    modelId: '3', workspaceId: '7', name: '축소 렌더 검증', description: null,
    databaseType: 'MYSQL', content: JSON.stringify(content), version: 1,
    createdAt: '2026-09-17T00:00:00Z', updatedAt: '2026-09-17T00:00:00Z', createdBy: { userId: '2', name: '검증' },
  },
})
await page.route('**/api/v1/core/workspaces/7/models/3/content', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 1, updatedAt: '2026-09-17T00:00:00Z' } })) }))

/** 뷰포트 — RF viewport transform에서 translate·zoom (플로우→화면: 화면 = 플로우 × zoom + t) */
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

/* ④ 복원 비교용 — 임계 위(정상 렌더) 상태 캡처: footprint·상세 input 노출 */
await wheelZoom(0.75, 'in')
await page.waitForTimeout(300)
const detailZoom = (await readViewport()).zoom
const before = await readNodes()
const headerVisibleBefore = await page.evaluate(() => {
  const input = document.querySelector('.react-flow__node[data-id="ta"] input')
  return input !== null && getComputedStyle(input.closest('.nodrag')).visibility === 'visible'
})
check(`진입 줌(${detailZoom.toFixed(2)}) ≥ 임계(0.5) — 정상 렌더 확인`, detailZoom >= 0.55 && headerVisibleBefore && (await page.locator('[data-compact-table]').count()) === 0)

/* ① 임계 아래로 줌아웃 — 상단 플러시 라벨 판(#ccc 불투명) + 아래 반투명 베일, 클릭은 아래로 통과 */
const compactZoom = await wheelZoom(0.42, 'out')
await page.waitForTimeout(300)
const compact = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.react-flow__node')]
  const labels = [...document.querySelectorAll('[data-compact-table]')]
  const ta = document.querySelector('.react-flow__node[data-id="ta"]')
  const overlay = ta?.querySelector('[data-compact-table]') ?? null
  const plate = overlay?.querySelector(':scope > div') ?? null
  const veil = ta?.querySelector('[data-compact-veil]') ?? null
  const labelEl = plate?.querySelector('div') ?? null
  // 클릭 차단 — 라벨 레이어가 직접 받는다(판·베일 어디를 찍어도 이 노드로, 뒤·아래로 새지 않음)
  const insideLabel = (x, y) => document.elementFromPoint(x, y)?.closest('[data-compact-table]') !== null
  const plateRect = plate?.getBoundingClientRect()
  const veilRect = veil?.getBoundingClientRect()
  const hitPlate = plateRect ? insideLabel(plateRect.x + plateRect.width / 2, plateRect.y + plateRect.height / 2) : false
  const hitVeil = veilRect ? insideLabel(veilRect.x + veilRect.width / 2, veilRect.y + veilRect.height / 2) : false
  // 배경 알파 — rgba(...,a)·color(... / a%) 모양만 알파로, 그 외(rgb 등)는 1(불투명)
  const alphaOf = (s) => {
    if (!s) return -1
    const m = s.match(/^rgba\([^)]*,\s*([\d.]+%?)\s*\)$/) ?? s.match(/\/\s*([\d.]+%?)\s*\)/)
    if (!m) return 1
    const v = parseFloat(m[1])
    return v > 1 ? v / 100 : v
  }
  const plateStyle = plate ? getComputedStyle(plate) : null
  const veilStyle = veil ? getComputedStyle(veil) : null
  const plateRgb = (plateStyle?.backgroundColor.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  return {
    nodeCount: nodes.length,
    labelCount: labels.length,
    taText: overlay?.textContent ?? '',
    plateAlpha: alphaOf(plateStyle?.backgroundColor),
    veilAlpha: alphaOf(veilStyle?.backgroundColor),
    // #e5e5e5(229,229,229) — #ccc보다 연한 밝은 회색
    plateGray: plateRgb.length === 3 && plateRgb[0] === plateRgb[1] && plateRgb[1] === plateRgb[2] && plateRgb[0] >= 220,
    platePaddingPx: plateStyle ? parseFloat(plateStyle.paddingTop) : 0,
    plateFlushTop:
      overlay && ta ? Math.abs(overlay.getBoundingClientRect().top - ta.getBoundingClientRect().top) <= 1 : false,
    clicksStayOnLabel: hitPlate && hitVeil,
    logicalFontPx: labelEl ? parseFloat(getComputedStyle(labelEl).fontSize) : 0,
  }
})
check(
  '줌아웃 진입 — 두 테이블 모두 라벨 표시·노드 상단 플러시·안쪽 padding',
  compactZoom < 0.5 && compact.nodeCount === 3 && compact.labelCount === 2 && compact.plateFlushTop && compact.platePaddingPx >= 6,
  `줌 ${compactZoom.toFixed(2)} · 라벨 ${compact.labelCount}개 · 상단 플러시 · 판 안쪽 padding ${compact.platePaddingPx}px`,
)
check(
  '판 = 연한 회색(#e5e5e5) 불투명·아래 베일 반투명',
  compact.plateGray && compact.plateAlpha >= 0.99 && compact.veilAlpha >= 0.5 && compact.veilAlpha <= 0.9,
  `판 α ${compact.plateAlpha} · 베일 α ${compact.veilAlpha}`,
)
check(
  '클릭은 라벨 레이어가 받는다 — 뒤·아래로 새지 않는다',
  compact.clicksStayOnLabel,
  '판·베일 지점 모두 라벨 레이어 히트',
)

/* ④ 겹침 클릭 — tb(앞)가 ta(뒤)를 덮은 상태에서 겹침 영역(라벨 판 아래 베일)을 클릭하면
   앞 테이블(tb)만 선택된다 — 반투명 베일이라도 뒤 객체(ta)가 오선택되지 않는다.
   클릭 좌표는 뷰포트 행렬(컨테이너 원점 기준) 대신 tb 실측 rect에서 배율만 곱해 잡는다 */
const vpCompact = await readViewport()
const tbRect = await page.evaluate(() => document.querySelector('.react-flow__node[data-id="tb"]').getBoundingClientRect().toJSON())
// tb 원점(플로우 200,120) 기준 로컬 (60,115) → 플로우 (260,235) — tb 베일 ∩ ta 상체
const overlapClick = { x: tbRect.x + 60 * vpCompact.zoom, y: tbRect.y + 115 * vpCompact.zoom }
await page.mouse.click(overlapClick.x, overlapClick.y)
await page.waitForTimeout(250)
const selection = await page.evaluate(() => ({
  tb: document.querySelector('.react-flow__node[data-id="tb"]')?.classList.contains('selected') ?? false,
  ta: document.querySelector('.react-flow__node[data-id="ta"]')?.classList.contains('selected') ?? false,
}))
check(
  '겹침 클릭 — 앞 테이블(tb)만 선택, 뒤(ta) 오선택 없음',
  selection.tb && !selection.ta,
  `tb selected=${selection.tb} · ta selected=${selection.ta} · 클릭 지점(플로우 260,235 — tb 베일/판 ∩ ta 상체)`,
)
check(
  '라벨 내용 — 논리명·물리명 함께 표시',
  compact.taText.includes('회원') && compact.taText.includes('member'),
  `"${compact.taText.trim()}"`,
)

/* ② 라벨 화면 크기 유지 — 플로우 폰트 × 배율 ≈ 목표(13px) */
const labelScreenPx = compact.logicalFontPx * compactZoom
check(
  '라벨 화면 크기 — 목표 13px 유지(하한 배율 0.3)',
  Math.abs(labelScreenPx - Math.min(13, 13 * compactZoom / Math.max(compactZoom, 0.3))) < 0.5 || Math.abs(labelScreenPx - 13) < 0.5,
  `플로우 폰트 ${compact.logicalFontPx.toFixed(1)}px × 줌 ${compactZoom.toFixed(2)} = 화면 ${labelScreenPx.toFixed(1)}px`,
)

/* ③ footprint 불변 — 노드 폭·높이·위치가 축소 렌더 전후로 같다(extent·미니맵·엣지 앵커 불변) */
const after = await readNodes()
const sameFootprint = Object.keys(before).every((key) =>
  Math.abs(before[key].x - after[key].x) <= 1 &&
  Math.abs(before[key].y - after[key].y) <= 1 &&
  before[key].w === after[key].w &&
  before[key].h === after[key].h,
)
check(
  'footprint 불변 — 노드 위치·폭·높이 동일(팬 한계 계산이 흔들리지 않는다)',
  sameFootprint,
  Object.keys(before).map((key) => `${key} ${before[key].w}×${before[key].h}→${after[key].w}×${after[key].h}`).join(' · '),
)

/* ④ 임계 위 복귀 — 라벨 사라지고 원래 렌더(헤더 input 편집)로 돌아온다 */
const restoredZoom = await wheelZoom(0.75, 'in')
await page.waitForTimeout(300)
const restored = await page.evaluate(() => {
  const input = document.querySelector('.react-flow__node[data-id="ta"] input')
  return {
    labelCount: document.querySelectorAll('[data-compact-table]').length,
    headerVisibility: input ? getComputedStyle(input.closest('.nodrag')).visibility : 'none',
  }
})
check(
  '줌인 복귀 — 라벨 제거·상세 복원',
  restoredZoom > 0.5 && restored.labelCount === 0 && restored.headerVisibility === 'visible',
  `줌 ${restoredZoom.toFixed(2)} · 라벨 ${restored.labelCount}개 · 헤더 input visibility ${restored.headerVisibility}`,
)

await browser.close()
console.log(failed === 0 ? '\n전체 통과' : `\n${failed}건 실패`)
process.exit(failed === 0 ? 0 : 1)
