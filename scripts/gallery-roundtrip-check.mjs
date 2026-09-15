// 랜딩 공유 갤러리·로그아웃 랜딩 이동 실물 검증 — 로컬 3프로세스(gateway 8000·web 8080, shares는 실 backend 왕복).
// 1) 게스트 랜딩 — 갤러리 카드 렌더(실 API)·카드 클릭 → 공개 뷰어 2) 인증 후 로그아웃 → /(랜딩) 도착
import { chromium } from '@playwright/test'

const WEB = 'http://localhost:8080'
const envelope = (body) => ({ header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }, ...body })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await (await browser.newContext()).newPage()

/* 1) 게스트 — 랜딩 갤러리(실 gateway 왕복) + 히어로 카피 */
await page.goto(WEB + '/')
await page.waitForSelector('h2:has-text("지금 공유되고 있는 문서")', { timeout: 15_000 })
const heroText = await page.locator('h1').innerText()
console.log(`[히어로] "${heroText.replace(/\n/g, ' ')}" — 스텝 3종: ${await page.locator('section[aria-label="사용 흐름"] h3').count()}`)
const cards = page.locator('a[href^="/share/"]')
const count = await cards.count()
const firstName = await cards.first().locator('h3').innerText()
const firstHref = await cards.first().getAttribute('href')
console.log(`[갤러리] 카드 ${count}장 — 첫 카드 "${firstName}" → ${firstHref} (target=${await cards.first().getAttribute('target')})`)
if (count < 1) throw new Error('갤러리 카드가 렌더되지 않았다')

/* 2) 카드 클릭 → 새 창 공개 뷰어(토큰만으로 문서 로드) */
const popup = page.waitForEvent('popup')
await cards.first().click()
const viewer = await popup
await viewer.waitForSelector('.react-flow__node', { timeout: 30_000 })
console.log(`[뷰어] 새 창 ${viewer.url()} — 노드 렌더 확인 (읽기 전용 공개 뷰어)`)
await viewer.close()

/* 3) 로그인(토큰 교환만 모킹 — 기존 검증 스크립트 패턴) 후 로그아웃 → 랜딩 */
const route = (pattern, body) =>
  page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(body)) }))
route('**/api/v1/auth/oauth2/github/token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/auth/refresh-token', { response: { accessToken: 't', tokenType: 'Bearer', expiresIn: 3600 } })
route('**/api/v1/core/accounts/me', { response: { userId: '2', email: 'a@b.c', name: '검증', providers: ['github'], admin: false, createdAt: '2026-01-01T00:00:00Z' } })
route('**/api/v1/core/accounts/me/workspaces', { totalCount: 1, responses: [{ workspaceId: '7', name: '검증', description: null, isDefault: false, myRole: 'OWNER', memberCount: 1 }] })
route('**/api/v1/core/teams?**', { totalCount: 0, responses: [] })

await page.goto(WEB + '/login')
await page.evaluate(() => window.sessionStorage.setItem('oauth.provider', 'github'))
await page.goto(WEB + '/auth/callback?code=e2e-code&state=e2e-state')
await page.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 10_000 })

// 사용자 메뉴 열고 로그아웃 — 문서 단위 이동(assign)이라 가드(/login?next=)를 타지 않고 /로 간다.
// 재로드 후 부트스트랩 refresh는 운영과 같게 401(로그아웃이 쿠키를 무효화한 상태)로 응답 —
// 로컬은 인증 서버가 내려 있어 실물 호출이면 503(재시도 화면)이 되기 때문.
await page.route('**/api/v1/auth/refresh-token', (r) =>
  r.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ header: { isSuccessful: false, resultCode: 'AUTH_TOKEN_INVALID', resultMessage: 'AUTH_TOKEN_INVALID' } }),
  }),
)
await page.getByRole('button', { name: /검증/ }).click()
await page.getByRole('menuitem', { name: '로그아웃' }).click()
await page.waitForURL((u) => u.pathname === '/', { timeout: 15_000 })
await page.waitForSelector('h1:has-text("한 장의 ERD가")', { timeout: 15_000 })
console.log(`[로그아웃] ${page.url()} 도착 — 랜딩 히어로 렌더 (/login 아님 확인)`)

/* 4) 파비콘 — 로고 기반 재작성 반영 */
const favicon = await (await page.request.get(WEB + '/favicon.svg')).text()
console.log(`[파비콘] circle 관계선 포함: ${favicon.includes('<circle')}`)

await browser.close()
console.log('OK — 갤러리·공개 뷰어·로그아웃 랜딩 이동·파비콘 실물 확인')
