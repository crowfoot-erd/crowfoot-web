// 랜딩 히어로 이미지 캡처 — 에디터 화면을 4개 언어 × 라이트·다크로 찍어 public/landing/에 webp로 뽑는다.
// 사용: node scripts/capture-landing-hero.mjs (로컬 웹 8080 기동 후. BASE_URL 환경변수로 덮어쓴다)
// 원천 문서: 04-front/storyboard/00-common.md §3.10 — 산출 webp만 커밋한다.
//
// API는 전부 가짜 응답으로 채운다(로그인·문서 조회·저장). 로컬 스택은 운영과 같은 DB를 쓰므로
// 실제 서버에는 아무 요청도 보내지 않는다 — 목록에 없는 API 요청과 협업 소켓은 끊는다.
// 에디터 도구 모음이나 캔버스 모양이 바뀐 릴리스에서는 이 스크립트를 다시 돌려 이미지를 갱신한다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8080'
const OUT_DIR = resolve(here, '../public/landing')
const WS = '1'
const MODEL = '1'
const LANGS = ['ko', 'en', 'ja', 'zh']
const THEMES = ['light', 'dark']
/** 캡처 크기 — 랜딩 본문 폭(max-w-5xl = 1024px)의 2배가 되도록 1440×860 @1.42 ≈ 2045×1221 */
const VIEWPORT = { width: 1440, height: 860 }
const SCALE = 1.42
/** 처음 보이는 구도 — 문서에 저장된 뷰포인트로 준다(에디터가 열 때 복원한다).
 *  72%면 여섯 테이블이 겹치지 않고 다 들어오고 컬럼 글자도 읽힌다(미니맵과도 겹치지 않는다) */
const DOC_VIEWPORT = { x: 100, y: 30, zoom: 0.72 }

/** 언어별 문구 — 문서 이름, 테이블 논리명, 그룹 이름 */
const TEXT = {
  ko: { model: '온라인 쇼핑몰 ERD', user: '사용자', users: '회원', products: '상품', orders: '주문', order_items: '주문 상품', payments: '결제', reviews: '리뷰', member: '회원', catalog: '상품', order: '주문' },
  en: { model: 'Online Store ERD', user: 'User', users: 'Users', products: 'Products', orders: 'Orders', order_items: 'Order items', payments: 'Payments', reviews: 'Reviews', member: 'Members', catalog: 'Catalog', order: 'Orders' },
  ja: { model: 'オンラインストア ERD', user: 'ユーザー', users: '会員', products: '商品', orders: '注文', order_items: '注文商品', payments: '決済', reviews: 'レビュー', member: '会員', catalog: '商品', order: '注文' },
  zh: { model: '在线商城 ERD', user: '用户', users: '会员', products: '商品', orders: '订单', order_items: '订单商品', payments: '支付', reviews: '评价', member: '会员', catalog: '商品', order: '订单' },
}

const col = (table, name, dataType, opts = {}) => ({
  id: `${table}.${name}`,
  logicalName: name,
  physicalName: name,
  dataType,
  length: opts.length ?? null,
  precision: opts.precision ?? null,
  scale: opts.scale ?? null,
  nullable: opts.nullable ?? false,
  defaultValue: null,
  autoIncrement: opts.ai ?? false,
  comment: null,
})

const table = (name, logicalName, columns, extra = {}) => ({
  id: `t_${name}`,
  logicalName,
  physicalName: name,
  comment: null,
  columns,
  primaryKey: { name: `${name}_pk`, columnIds: [`${name}.id`] },
  uniques: extra.uniques ?? [],
  indexes: extra.indexes ?? [],
})

const fkIndex = (name, column) => ({
  id: `idx_${name}_${column}`,
  name: `idx_${name}_${column}`,
  columns: [{ columnId: `${name}.${column}`, order: 'ASC' }],
})

const rel = (parent, child, column) => ({
  id: `rel_${parent}_${child}_${column}`,
  name: `${parent} → ${child}`,
  parentTableId: `t_${parent}`,
  childTableId: `t_${child}`,
  type: 'ONE_TO_MANY',
  identifying: false,
  parentMultiplicity: 'EXACTLY_ONE',
  childMultiplicity: 'ZERO_OR_MORE',
  fkName: `fk_${child}_${column}`,
  columnMappings: [{ parentColumnId: `${parent}.id`, childColumnId: `${child}.${column}` }],
  onDelete: 'NO_ACTION',
  onUpdate: 'NO_ACTION',
  sourceHandle: null,
  targetHandle: null,
})

/** 예시 문서 — 온라인 쇼핑몰(테이블 6개·관계 6개·그룹 3개). 위치는 손으로 잡았다 */
function content(text) {
  const tables = [
    table('users', text.users, [
      col('users', 'id', 'BIGINT', { ai: true }),
      col('users', 'email', 'VARCHAR', { length: 191 }),
      col('users', 'name', 'VARCHAR', { length: 50 }),
      col('users', 'created_at', 'DATETIME'),
    ], { uniques: [{ id: 'uk_users_email', name: 'uk_users_email', columnIds: ['users.email'] }] }),
    table('orders', text.orders, [
      col('orders', 'id', 'BIGINT', { ai: true }),
      col('orders', 'user_id', 'BIGINT'),
      col('orders', 'status', 'VARCHAR', { length: 20 }),
      col('orders', 'total_amount', 'DECIMAL', { precision: 12, scale: 2 }),
      col('orders', 'ordered_at', 'DATETIME'),
    ], { indexes: [fkIndex('orders', 'user_id')] }),
    table('payments', text.payments, [
      col('payments', 'id', 'BIGINT', { ai: true }),
      col('payments', 'order_id', 'BIGINT'),
      col('payments', 'method', 'VARCHAR', { length: 20 }),
      col('payments', 'amount', 'DECIMAL', { precision: 12, scale: 2 }),
      col('payments', 'paid_at', 'DATETIME', { nullable: true }),
    ], { indexes: [fkIndex('payments', 'order_id')] }),
    table('reviews', text.reviews, [
      col('reviews', 'id', 'BIGINT', { ai: true }),
      col('reviews', 'user_id', 'BIGINT'),
      col('reviews', 'product_id', 'BIGINT'),
      col('reviews', 'rating', 'SMALLINT'),
      col('reviews', 'content', 'TEXT', { nullable: true }),
    ], { indexes: [fkIndex('reviews', 'user_id'), fkIndex('reviews', 'product_id')] }),
    table('order_items', text.order_items, [
      col('order_items', 'id', 'BIGINT', { ai: true }),
      col('order_items', 'order_id', 'BIGINT'),
      col('order_items', 'product_id', 'BIGINT'),
      col('order_items', 'quantity', 'INT'),
      col('order_items', 'unit_price', 'DECIMAL', { precision: 12, scale: 2 }),
    ], { indexes: [fkIndex('order_items', 'order_id'), fkIndex('order_items', 'product_id')] }),
    table('products', text.products, [
      col('products', 'id', 'BIGINT', { ai: true }),
      col('products', 'name', 'VARCHAR', { length: 200 }),
      col('products', 'price', 'DECIMAL', { precision: 12, scale: 2 }),
      col('products', 'stock', 'INT'),
    ]),
  ]
  const relationships = [
    rel('users', 'orders', 'user_id'),
    rel('orders', 'payments', 'order_id'),
    rel('orders', 'order_items', 'order_id'),
    rel('products', 'order_items', 'product_id'),
    rel('users', 'reviews', 'user_id'),
    rel('products', 'reviews', 'product_id'),
  ]
  const at = (x, y, color) => ({ x, y, width: null, color })
  return {
    schemaVersion: 1,
    model: { tables, relationships },
    diagram: {
      nodes: {
        t_users: at(0, 0, 'blue'),
        t_orders: at(470, 0, 'orange'),
        t_payments: at(940, 0, 'orange'),
        t_reviews: at(0, 410, 'green'),
        t_order_items: at(470, 410, 'orange'),
        t_products: at(940, 410, 'green'),
      },
      notes: [],
      areas: [
        { id: 'a_member', name: text.member, description: '', color: 'blue', tableIds: ['t_users'] },
        { id: 'a_order', name: text.order, description: '', color: 'orange', tableIds: ['t_orders', 't_order_items', 't_payments'] },
        { id: 'a_catalog', name: text.catalog, description: '', color: 'green', tableIds: ['t_products', 't_reviews'] },
      ],
      viewport: DOC_VIEWPORT,
    },
  }
}

const envelope = (body) => ({ header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }, ...body })
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** 가짜 응답 — 목록에 없는 API는 끊고 경고를 남긴다(실제 서버로 새지 않게) */
async function mock(page, lang) {
  const text = TEXT[lang]
  const unmatched = new Set()
  // 경로 접두로 좁힌다 — '**/api/**'는 개발 서버의 소스 모듈(/src/api/…)까지 잡아 앱이 뜨지 않는다
  await page.route(/\/api\/v1\//, (route) => {
    unmatched.add(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort()
  })
  // 협업 소켓 — 서버에 연결하지 않고 그 자리에서 받기만 한다
  await page.routeWebSocket(/\/ws(\/|\?|$)/, () => {})
  await page.route('**/api/v1/core/metrics/visit', (route) => route.fulfill({ status: 204, body: '' }))
  await page.route('**/api/v1/core/database-types', (route) =>
    json(route, envelope({ responses: [{ code: 'mysql', displayName: 'MySQL' }, { code: 'postgresql', displayName: 'PostgreSQL' }] })),
  )
  await page.route('**/api/v1/auth/refresh-token', (route) =>
    json(route, envelope({ response: { accessToken: 'capture-token', tokenType: 'Bearer', expiresIn: 3600 } })),
  )
  await page.route('**/api/v1/core/accounts/me', (route) =>
    json(route, envelope({ response: { userId: '1', email: 'user@example.com', name: text.user, locale: null, providers: ['github'], admin: false, createdAt: '2026-01-02T00:00:00Z' } })),
  )
  // 편집 권한은 내 워크스페이스 목록의 역할에서 나온다 — 소유자로 준다(없으면 읽기 전용 배지가 찍힌다)
  await page.route('**/api/v1/core/accounts/me/workspaces**', (route) =>
    json(route, envelope({ responses: [{ workspaceId: WS, name: 'shop', description: null, isDefault: false, myRole: 'OWNER', memberCount: 3 }] })),
  )
  await page.route('**/api/v1/core/notifications**', (route) =>
    new URL(route.request().url()).pathname.endsWith('/unread-count')
      ? json(route, envelope({ response: 0 }))
      : json(route, envelope({ responses: [], page: 1, size: 20, totalCount: 0, totalPages: 0 })),
  )
  const saved = JSON.stringify(content(text))
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}`, (route) =>
    json(route, envelope({
      response: {
        modelId: MODEL, workspaceId: WS, name: text.model, description: null, databaseType: 'mysql', sourceConnectionId: null,
        version: 12, createdBy: { userId: '1', name: text.user }, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z',
        content: saved,
      },
    })),
  )
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}/version`, (route) =>
    json(route, envelope({ response: { version: 12, updatedAt: '2026-09-30T00:00:00Z' } })),
  )
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}/validation-runs`, (route) => route.fulfill({ status: 204, body: '' }))
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}/content`, (route) =>
    json(route, envelope({ response: { version: 12, updatedAt: '2026-09-30T00:00:00Z' } })),
  )
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}/feedback`, (route) =>
    json(route, envelope({ response: { reactionCount: 0, reacted: false, comments: [] } })),
  )
  await page.route(`**/api/v1/core/workspaces/${WS}/terms**`, (route) => json(route, envelope({ responses: [] })))
  await page.route(`**/api/v1/core/workspaces/${WS}`, (route) =>
    json(route, envelope({ response: { workspaceId: WS, name: 'shop', description: null, isDefault: false, memberCount: 3, myRole: 'OWNER', createdBy: { userId: '1', name: text.user }, createdAt: '2026-09-01T00:00:00Z' } })),
  )
  return unmatched
}

/** PNG → webp — 로컬에 인코더가 없어 브라우저 캔버스로 바꾼다 */
async function toWebp(page, png) {
  const dataUrl = await page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d').drawImage(image, 0, 0)
    return canvas.toDataURL('image/webp', 0.86)
  }, png.toString('base64'))
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

mkdirSync(OUT_DIR, { recursive: true })
// channel 'chrome': 번들 chromium은 macOS 13 미지원 — 시스템 Chrome 사용(generate-og-image.mjs와 동일 근거)
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const lang of LANGS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, colorScheme: theme })
      const page = await context.newPage()
      await page.addInitScript(
        ([l, t]) => {
          window.localStorage.setItem('crowfoot.lang', l)
          window.localStorage.setItem('crowfoot.theme', t)
          window.localStorage.setItem('crowfoot.editor.explorer-open', 'true')
        },
        [lang, theme],
      )
      const unmatched = await mock(page, lang)
      await page.goto(`${BASE_URL}/workspaces/${WS}/models/${MODEL}`, { waitUntil: 'domcontentloaded' })
      await page
        .waitForFunction(() => document.querySelectorAll('.react-flow__node').length >= 6, { timeout: 20_000 })
        .catch(async (cause) => {
          // 에디터가 뜨지 않았다 — 원인을 볼 수 있게 화면과 끊긴 요청을 남기고 실패시킨다
          if (process.env.DEBUG_SHOT) await page.screenshot({ path: process.env.DEBUG_SHOT })
          throw new Error(`capture-landing-hero: 에디터가 뜨지 않음(${lang}/${theme}) — 끊긴 요청: ${[...unmatched].join(', ') || '없음'}`, { cause })
        })
      // 편집 가능 상태(공유 버튼)까지 기다린다 — 권한 조회 전에는 읽기 전용으로 뜬다
      await page.locator('button:has(svg.lucide-share-2)').first().waitFor({ timeout: 10_000 })
      await page.waitForTimeout(900) // 관계선 라우팅·폰트 안정화 여유
      const png = await page.screenshot()
      const out = `${OUT_DIR}/editor-${lang}-${theme}.webp`
      const webp = await toWebp(page, png)
      writeFileSync(out, webp)
      console.log(`capture-landing-hero: ${out.replace(resolve(here, '..'), '')} ${(webp.length / 1024).toFixed(0)}KB`)
      if (unmatched.size > 0) console.warn(`capture-landing-hero: 가짜 응답이 없는 요청(끊음) — ${[...unmatched].join(', ')}`)
      await context.close()
    }
  }
} finally {
  await browser.close()
}
