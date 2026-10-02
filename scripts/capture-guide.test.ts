/**
 * 사용 가이드 스크린샷 촬영 — 4개 언어 × 장면 (public/guide-assets/{lang}/*.webp)
 *
 * 사용: 로컬 웹(8080)을 띄운 뒤
 *   GUIDE_CAPTURE=1 pnpm vitest run scripts/capture-guide.test.ts
 *   (일부만: GUIDE_LANGS=ko GUIDE_ONLY=dashboard,editor-overview)
 * 평소 테스트 실행에서는 건너뛴다(GUIDE_CAPTURE가 없으면 skip).
 *
 * 실제 서버에는 요청을 보내지 않는다. 브라우저의 API 호출을 가로채 이 프로세스의 MSW(테스트용 가짜 서버 —
 * src/api/mocks)가 답하게 한다. 로컬 스택은 운영과 같은 DB를 쓰기 때문이다. 화면의 데이터는 모두 지어낸 값이다.
 * vitest로 돌리는 이유: MSW 핸들러와 문서 모델 함수(@/ 별칭의 TS 모듈)를 그대로 쓰기 위해서다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { describe, it } from 'vitest'

import { fixtures } from '@/api/mocks/handlers'
import { applyChanges, createArea, createColumn, createTable, type ErdChange } from '@/features/editor/model/changes'
import { emptyContent, serializeContent } from '@/features/editor/model/content-io'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { buildRelationship } from '@/features/editor/model/relationship'

const here = dirname(fileURLToPath(import.meta.url))
// (BASE_URL은 Vite가 '/'로 채운다 — 다른 이름을 쓴다)
const BASE_URL = process.env.GUIDE_BASE_URL ?? 'http://127.0.0.1:8080'
const OUT_ROOT = resolve(here, '../public/guide-assets')
const LANGS = (process.env.GUIDE_LANGS ?? 'ko,en,ja,zh').split(',') as Lang[]
const ONLY = process.env.GUIDE_ONLY ? new Set(process.env.GUIDE_ONLY.split(',')) : null
/** 실패한 장면과 가짜 응답이 없는 요청을 적는 보고서 */
const REPORT = process.env.GUIDE_REPORT ?? resolve(here, '../guide-capture-report.txt')

type Lang = 'ko' | 'en' | 'ja' | 'zh'
type Json = Record<string, unknown>

const WS = '101'
const MODEL = '501'
const HEADER = { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }
const ok = (body: Json) => ({ header: HEADER, ...body })

/** 화면 문구 — 언어별 번역 파일에서 읽는다(선택자와 예시 데이터에 쓴다) */
function translator(lang: Lang) {
  const bundle = JSON.parse(readFileSync(resolve(here, `../src/lib/i18n/${lang}.json`), 'utf-8')) as Json
  return (key: string, vars: Record<string, string | number> = {}) => {
    let node: unknown = bundle
    for (const part of key.split('.')) node = (node as Json | undefined)?.[part]
    if (typeof node !== 'string') throw new Error(`번역 키 없음: ${key} (${lang})`)
    return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''))
  }
}

/** 예시 데이터의 언어별 이름 */
const NAMES: Record<Lang, Record<string, string>> = {
  ko: { user: '김개발', model: '온라인 쇼핑몰 ERD', workspace: '쇼핑몰 개발', users: '회원', products: '상품', orders: '주문', order_items: '주문 상품', payments: '결제', reviews: '리뷰', member: '회원', catalog: '상품', order: '주문', email: '이메일', amount: '금액', createdAt: '생성 일시', id: '번호', name: '이름', status: '상태', memo: '결제 금액은 부가세 포함입니다.' },
  en: { user: 'Alex Kim', model: 'Online Store ERD', workspace: 'Store Dev', users: 'Users', products: 'Products', orders: 'Orders', order_items: 'Order items', payments: 'Payments', reviews: 'Reviews', member: 'Members', catalog: 'Catalog', order: 'Orders', email: 'Email', amount: 'Amount', createdAt: 'Created at', id: 'ID', name: 'Name', status: 'Status', memo: 'Amounts include VAT.' },
  ja: { user: 'キム・ゲバル', model: 'オンラインストア ERD', workspace: 'ストア開発', users: '会員', products: '商品', orders: '注文', order_items: '注文商品', payments: '決済', reviews: 'レビュー', member: '会員', catalog: '商品', order: '注文', email: 'メール', amount: '金額', createdAt: '作成日時', id: '番号', name: '名前', status: '状態', memo: '金額は税込みです。' },
  zh: { user: '金开发', model: '在线商城 ERD', workspace: '商城开发', users: '会员', products: '商品', orders: '订单', order_items: '订单商品', payments: '支付', reviews: '评价', member: '会员', catalog: '商品', order: '订单', email: '邮箱', amount: '金额', createdAt: '创建时间', id: '编号', name: '名称', status: '状态', memo: '金额含税。' },
}

/** 예시 도메인 타입 */
function domainTypes(lang: Lang, versions: { amount?: number } = {}) {
  const n = NAMES[lang]
  const base = { workspaceId: WS, length: null, precision: null, scale: null, defaultValue: null, description: null, version: 1, updatedAt: '2026-10-02T00:00:00Z' }
  return [
    { ...base, domainTypeId: '11', name: n.email, dataType: 'VARCHAR', length: 191, nullable: false },
    { ...base, domainTypeId: '12', name: n.amount, dataType: 'DECIMAL', precision: 15, scale: 2, nullable: false, defaultValue: '0', version: versions.amount ?? 1 },
    { ...base, domainTypeId: '13', name: n.createdAt, dataType: 'DATETIME', nullable: false },
  ]
}

/** 예시 사전 — 단어(타입 없음)와 용어(도메인 타입을 가리킴) */
function terms(lang: Lang) {
  const n = NAMES[lang]
  const row = (term: string, label: string, domainTypeId: string | null = null) => ({ termId: term, workspaceId: WS, term, label, types: null, domainTypeId, updatedAt: '2026-10-02T00:00:00Z' })
  return [
    row('amount', n.amount),
    row('created_at', n.createdAt, '13'),
    row('email', n.email),
    row('id', n.id),
    row('order', n.order),
    row('total_amount', `${n.order} ${n.amount}`, '12'),
    row('user', n.member),
    row('user_email', `${n.member} ${n.email}`, '11'),
  ]
}

/** 예시 요구사항 — [제목, 내용]. 도메인(그룹)별 기능 요구사항 넷과 공통 요구사항 하나 */
const REQUIREMENTS: Record<Lang, [string, string][]> = {
  ko: [
    ['이메일로 가입하고 로그인한다', '이메일은 중복될 수 없다. 가입한 시각을 남긴다.'],
    ['상품을 장바구니 없이 바로 주문한다', '주문 한 건에 상품을 여러 개 담는다. 주문할 때의 단가를 남긴다.'],
    ['주문을 여러 수단으로 나누어 결제한다', '한 주문에 결제가 여러 건 붙는다. 결제마다 수단과 금액을 남긴다.'],
    ['구매한 상품에 리뷰를 남긴다', '평점은 1~5점이다.'],
    ['모든 테이블에 생성 시각을 둔다', '감사와 정렬에 쓴다.'],
  ],
  en: [
    ['Sign up and sign in with email', 'Emails must be unique. Keep the sign-up time.'],
    ['Order products directly without a cart', 'One order holds several products. Keep the unit price at order time.'],
    ['Split an order across payment methods', 'One order has several payments. Each keeps its method and amount.'],
    ['Leave a review on a purchased product', 'Ratings range from 1 to 5.'],
    ['Every table keeps its creation time', 'Used for auditing and sorting.'],
  ],
  ja: [
    ['メールで登録してログインする', 'メールは重複できない。登録日時を残す。'],
    ['カートなしで商品を直接注文する', '1件の注文に複数の商品を入れる。注文時の単価を残す。'],
    ['注文を複数の手段に分けて決済する', '1件の注文に複数の決済が付く。決済ごとに手段と金額を残す。'],
    ['購入した商品にレビューを残す', '評価は1〜5点。'],
    ['すべてのテーブルに作成日時を置く', '監査と並べ替えに使う。'],
  ],
  zh: [
    ['用邮箱注册并登录', '邮箱不能重复。保留注册时间。'],
    ['不经购物车直接下单', '一笔订单包含多个商品。保留下单时的单价。'],
    ['一笔订单用多种方式支付', '一笔订单有多笔支付。每笔保留方式和金额。'],
    ['对已购商品留下评价', '评分为 1 到 5 分。'],
    ['所有表都保留创建时间', '用于审计和排序。'],
  ],
}

/** 예시 문서 — 온라인 쇼핑몰(테이블 6·관계 6·그룹 3·메모 1·요구사항 5). 도메인 타입을 쓰는 컬럼이 있다 */
function shopDocument(lang: Lang, options: { amountVersion?: number; flawed?: boolean; note?: boolean } = {}): EditorDocument {
  const n = NAMES[lang]
  const col = (table: string, name: string, dataType: string, extra: Partial<Parameters<typeof createColumn>[0] & object> = {}) =>
    createColumn({ id: `${table}.${name}`, physicalName: name, logicalName: name, dataType, nullable: false, ...extra })
  const pk = (table: string) => col(table, 'id', 'BIGINT', { autoIncrement: true, logicalName: n.id })
  const emailLink = { id: '11', name: n.email, version: 1, overrides: [] as string[] }
  const amountLink = { id: '12', name: n.amount, version: options.amountVersion ?? 1, overrides: [] as string[] }
  const createdLink = { id: '13', name: n.createdAt, version: 1, overrides: [] as string[] }
  const table = (name: string, columns: ReturnType<typeof col>[]) =>
    createTable(name, { id: `t_${name}`, logicalName: n[name], columns, primaryKey: { name: `${name}_pk`, columnIds: [`${name}.id`] } })
  const tables = [
    table('users', [pk('users'), col('users', 'email', 'VARCHAR', { length: 191, logicalName: n.email, domain: emailLink }), col('users', 'name', 'VARCHAR', { length: 50, logicalName: n.name }), col('users', 'created_at', 'DATETIME', { logicalName: n.createdAt, domain: createdLink })]),
    table('orders', [pk('orders'), col('orders', 'status', 'VARCHAR', { length: 20, logicalName: n.status }), col('orders', 'total_amount', 'DECIMAL', { precision: options.amountVersion ? 12 : 15, scale: 2, logicalName: `${n.order} ${n.amount}`, defaultValue: options.amountVersion ? null : '0', domain: amountLink }), col('orders', 'ordered_at', 'DATETIME')]),
    table('payments', [pk('payments'), col('payments', 'method', 'VARCHAR', { length: 20 }), col('payments', 'amount', 'DECIMAL', { precision: options.amountVersion ? 12 : 15, scale: 2, logicalName: n.amount, defaultValue: options.amountVersion ? null : '0', domain: amountLink }), col('payments', 'paid_at', 'DATETIME', { nullable: true })]),
    table('products', [pk('products'), col('products', 'name', 'VARCHAR', { length: 100, logicalName: n.name }), col('products', 'price', 'DECIMAL', { precision: 12, scale: 2 }), col('products', 'stock', 'INT')]),
    table('order_items', [pk('order_items'), col('order_items', 'quantity', 'INT'), col('order_items', 'unit_price', 'DECIMAL', { precision: 12, scale: 2 })]),
    table('reviews', [pk('reviews'), col('reviews', 'rating', 'SMALLINT'), col('reviews', 'content', 'TEXT', { nullable: true })]),
  ]
  // 검증 장면 — 규칙에 걸리는 테이블(기본 키 없음, 예약어 이름, 길이 없는 VARCHAR, 같은 이름의 컬럼)
  if (options.flawed) {
    tables.push(
      createTable('order', {
        id: 't_flawed',
        columns: [col('flawed', 'select', 'VARCHAR'), col('flawed', 'memo', 'VARCHAR', { length: 100 }), { ...col('flawed', 'memo2', 'TEXT'), physicalName: 'memo' }],
      }),
    )
  }
  const positions: Record<string, { x: number; y: number }> = {
    users: { x: 60, y: 60 }, orders: { x: 640, y: 60 }, payments: { x: 1220, y: 60 },
    reviews: { x: 60, y: 520 }, order_items: { x: 640, y: 520 }, products: { x: 1220, y: 520 }, order: { x: 1220, y: 930 },
  }
  const base = emptyContent()
  let doc: EditorDocument = { model: base.model, diagram: base.diagram }
  doc = applyChanges(doc, tables.map((t): ErdChange => ({ type: 'table/create', table: t, position: positions[t.physicalName] })), 'postgresql')
  const relate = (parent: string, child: string) => {
    const built = buildRelationship({
      parentTable: doc.model.tables.find((t) => t.physicalName === parent)!,
      childTable: doc.model.tables.find((t) => t.physicalName === child)!,
      type: 'ONE_TO_MANY', identifying: false, parentMultiplicity: 'EXACTLY_ONE', childMultiplicity: 'ZERO_OR_MORE',
    })
    if (!built.ok) throw new Error('관계 생성 실패')
    doc = applyChanges(doc, [{ type: 'relationship/create', relationship: { ...built.relationship, id: `rel_${parent}_${child}` }, fkColumns: built.fkColumns }], 'postgresql')
  }
  relate('users', 'orders'); relate('orders', 'payments'); relate('orders', 'order_items'); relate('products', 'order_items'); relate('users', 'reviews'); relate('products', 'reviews')
  doc = applyChanges(doc, [
    { type: 'area/create', area: createArea(n.member, { id: 'a_member', color: 'blue', tableIds: ['t_users'] }) },
    { type: 'area/create', area: createArea(n.order, { id: 'a_order', color: 'orange', tableIds: ['t_orders', 't_order_items', 't_payments'] }) },
    { type: 'area/create', area: createArea(n.catalog, { id: 'a_catalog', color: 'green', tableIds: ['t_products', 't_reviews'] }) },
  ])
  // 요구사항 — 반영됨 셋, 반영 대기 하나(내용이 바뀐 뒤 아직 반영하지 않았다), 공통 하나
  const requirement = (index: number, extra: { areaId?: string | null; scope?: 'tables' | 'document'; revision?: number; appliedRevision?: number; tableIds?: string[] }) => ({
    id: `req_${index + 1}`,
    code: `REQ-00${index + 1}`,
    areaId: null,
    scope: 'tables' as const,
    title: REQUIREMENTS[lang][index][0],
    description: REQUIREMENTS[lang][index][1],
    status: 'confirmed' as const,
    revision: 1,
    appliedRevision: 1,
    tableIds: [] as string[],
    ...extra,
  })
  doc = applyChanges(doc, [
    { type: 'requirement/create', requirement: requirement(0, { areaId: 'a_member', tableIds: ['t_users'] }) },
    { type: 'requirement/create', requirement: requirement(1, { areaId: 'a_order', tableIds: ['t_orders', 't_order_items', 't_products'] }) },
    { type: 'requirement/create', requirement: requirement(2, { areaId: 'a_order', revision: 2, appliedRevision: 1, tableIds: ['t_payments'] }) },
    { type: 'requirement/create', requirement: requirement(3, { areaId: 'a_catalog', tableIds: ['t_reviews'] }) },
    { type: 'requirement/create', requirement: requirement(4, { scope: 'document' }) },
  ])
  // 메모 장면 — 결제 테이블에 붙인 메모. 화면을 메모 쪽으로 옮겨 둔다
  if (options.note) {
    doc = applyChanges(doc, [{ type: 'note/create', note: { id: 'n_memo', x: 1820, y: 90, width: 320, text: n.memo, title: n.amount, color: 'yellow', linkedTableId: 't_payments' } }])
    return { ...doc, diagram: { ...doc.diagram, viewport: { x: -1120, y: 10, zoom: 1 } } }
  }
  return { ...doc, diagram: { ...doc.diagram, viewport: { x: 70, y: 20, zoom: 0.7 } } }
}

/** 시스템 사전 — 예시 문서의 컬럼 이름 조각을 덮는다(논리명 자동 추론 장면) */
const SYSTEM_TERMS: [string, string, string, string, string][] = [
  ['amount', '금액', 'Amount', '金額', '金额'], ['at', '일시', 'At', '日時', '时间'], ['content', '내용', 'Content', '内容', '内容'],
  ['email', '이메일', 'Email', 'メール', '邮箱'], ['id', 'ID', 'ID', 'ID', 'ID'], ['method', '수단', 'Method', '方法', '方式'],
  ['name', '이름', 'Name', '名前', '名称'], ['ordered', '주문', 'Ordered', '注文', '下单'], ['paid', '결제', 'Paid', '決済', '支付'],
  ['price', '가격', 'Price', '価格', '价格'], ['quantity', '수량', 'Quantity', '数量', '数量'], ['rating', '평점', 'Rating', '評価', '评分'],
  ['status', '상태', 'Status', '状態', '状态'], ['stock', '재고', 'Stock', '在庫', '库存'], ['unit', '단위', 'Unit', '単位', '单位'],
  ['user', '사용자', 'User', 'ユーザー', '用户'],
]

/** 가짜 서버의 예시 값 가운데 예시 문서와 맞춰야 하는 것을 바꾼다 */
function alignFixtures(lang: Lang) {
  fixtures.systemTerms.responses = SYSTEM_TERMS.map(([term, ko, en, ja, zh], index) => ({
    termId: String(600 + index), term, labels: { ko, en, ja, zh }, types: term === 'id' ? { mysql: 'BIGINT', postgresql: 'BIGINT' } : null, updatedAt: '2026-09-24T00:00:00Z',
  })) as typeof fixtures.systemTerms.responses
  fixtures.systemTerms.totalCount = SYSTEM_TERMS.length
  fixtures.ddl.sql = [
    `-- ${NAMES[lang].model} — PostgreSQL DDL`,
    '',
    'CREATE TABLE users (',
    '    id BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY,',
    '    email VARCHAR(191) NOT NULL,',
    '    name VARCHAR(50) NOT NULL,',
    '    created_at TIMESTAMP NOT NULL,',
    '    CONSTRAINT users_pk PRIMARY KEY (id)',
    ');',
    '',
    'CREATE TABLE orders (',
    '    id BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY,',
    '    users_id BIGINT NOT NULL,',
    '    status VARCHAR(20) NOT NULL,',
    "    total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,",
    '    ordered_at TIMESTAMP NOT NULL,',
    '    CONSTRAINT orders_pk PRIMARY KEY (id)',
    ');',
    '',
    'ALTER TABLE orders',
    '    ADD CONSTRAINT fk_orders_users FOREIGN KEY (users_id) REFERENCES users (id);',
    '',
    'CREATE INDEX idx_orders_users_id ON orders (users_id);',
    '',
    `COMMENT ON TABLE orders IS '${NAMES[lang].orders}';`,
    `COMMENT ON COLUMN orders.total_amount IS '${NAMES[lang].order} ${NAMES[lang].amount}';`,
  ].join('\n')
  fixtures.ddl.tableCount = 6
  fixtures.ddl.relationshipCount = 6
}

/** 가짜 서버의 예시 글(한국어)을 화면 언어로 옮기는 표 — scripts/capture-guide.dict.json({ 한국어: { en, ja, zh } }) */
const DICT = JSON.parse(readFileSync(resolve(here, 'capture-guide.dict.json'), 'utf-8')) as Record<string, Record<string, string>>
const DICT_KEYS = Object.keys(DICT).sort((a, b) => b.length - a.length)
/** 표에 없는 한국어 글 — GUIDE_COLLECT를 주면 보고서 옆 파일로 남긴다 */
const untranslated = new Set<string>()

/** 응답 본문의 예시 글을 화면 언어로 바꾼다(긴 글부터). ko는 그대로 */
function localize(lang: Lang, body: string): string {
  if (lang === 'ko') {
    if (process.env.GUIDE_COLLECT) for (const found of body.match(/"(?:[^"\\]|\\.)*[가-힣](?:[^"\\]|\\.)*"/g) ?? []) untranslated.add(found.slice(1, -1))
    return body
  }
  let text = body
  for (const key of DICT_KEYS) if (text.includes(key)) text = text.split(key).join(DICT[key][lang] ?? key)
  return text
}

interface Session {
  lang: Lang
  t: ReturnType<typeof translator>
  context: BrowserContext
  page: Page
  /** 주소(경로 끝부분 일치) → 응답. 가짜 서버보다 먼저 본다 */
  overrides: Map<string, (method: string, body: string | null) => { status?: number; json: Json } | null>
  missing: Set<string>
  shot: (name: string, options?: { clip?: { x: number; y: number; width: number; height: number }; locator?: ReturnType<Page['locator']> }) => Promise<void>
}

async function openSession(browser: Browser, lang: Lang, viewport: { width: number; height: number }, guest = false): Promise<Session> {
  const t = translator(lang)
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: lang })
  await context.addInitScript(
    ([l]) => {
      // 장면마다 같은 상태에서 시작한다 — 앞 장면이 연 패널, 고른 배치 방향, 남긴 임시 저장본을 지운다
      // (창을 처음 열 때 한 번만 — 장면 안에서 주소를 옮길 때는 지우지 않는다)
      if (window.sessionStorage.getItem('guide-capture') === null) {
        window.localStorage.clear()
        window.sessionStorage.setItem('guide-capture', '1')
      }
      window.localStorage.setItem('crowfoot.lang', l)
      window.localStorage.setItem('crowfoot.theme', 'light')
      window.localStorage.setItem('crowfoot.editor.explorer-open', 'false')
    },
    [lang],
  )
  const overrides: Session['overrides'] = new Map()
  const missing = new Set<string>()
  const origin = window.location.origin
  await context.routeWebSocket(/\/ws(\/|\?|$)/, () => {})
  await context.route(/\/api\/v1\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    for (const [suffix, respond] of overrides) {
      if (!url.pathname.endsWith(suffix)) continue
      const result = respond(method, request.postData())
      if (result) {
        await route.fulfill({ status: result.status ?? 200, contentType: 'application/json', body: localize(lang, JSON.stringify(result.json)) })
        return
      }
    }
    try {
      const response = await fetch(`${origin}${url.pathname}${url.search}`, {
        method,
        headers: Object.fromEntries(Object.entries(request.headers()).filter(([key]) => !['host', 'content-length', 'connection', 'accept-encoding'].includes(key))),
        body: method === 'GET' || method === 'HEAD' ? undefined : (request.postData() ?? undefined),
      })
      const contentType = response.headers.get('content-type') ?? 'application/json'
      const raw = Buffer.from(await response.arrayBuffer())
      const body = contentType.includes('json') ? localize(lang, raw.toString('utf-8')) : raw
      await route.fulfill({ status: response.status, contentType, body })
    } catch {
      missing.add(`${method} ${url.pathname}`)
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ header: { isSuccessful: false, resultCode: 'NOT_FOUND', resultMessage: 'no mock' } }) })
    }
  })
  const n = NAMES[lang]
  // 공통 덮어쓰기 — 예시 사용자·워크스페이스 이름, 방문 집계
  overrides.set('/core/metrics/visit', () => ({ status: 200, json: ok({}) }))
  if (guest) overrides.set('/auth/refresh-token', () => ({ status: 401, json: { header: { isSuccessful: false, resultCode: 'UNAUTHORIZED', resultMessage: 'guest' } } }))
  overrides.set('/core/accounts/me', (method) =>
    method === 'GET' ? { json: ok({ response: { userId: '2', email: 'dev@example.com', name: n.user, locale: lang, providers: ['github'], admin: true, createdAt: '2026-01-02T00:00:00Z' } }) } : null,
  )
  const outDir = resolve(OUT_ROOT, lang)
  mkdirSync(outDir, { recursive: true })
  const session = { lang, t, context, page: await context.newPage(), overrides, missing } as Session
  session.shot = async (name, options = {}) => {
    const page = session.page
    const png = options.locator ? await options.locator.screenshot() : await page.screenshot(options.clip ? { clip: options.clip } : {})
    // PNG → webp(브라우저 캔버스) — 축소만, 최대 폭 1400px
    const dataUrl = await page.evaluate(async (base64) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const scale = Math.min(1, 1400 / image.naturalWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.naturalWidth * scale)
      canvas.height = Math.round(image.naturalHeight * scale)
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/webp', 0.8)
    }, png.toString('base64'))
    writeFileSync(resolve(outDir, `${name}.webp`), Buffer.from(dataUrl.split(',')[1], 'base64'))
  }
  return session
}

type Scene = { name: string; run: (s: Session) => Promise<void> }

const goto = async (s: Session, path: string, settle = 1200) => {
  await s.page.goto(`${BASE_URL}${s.lang === 'ko' ? '' : `/${s.lang}`}${path}`, { waitUntil: 'domcontentloaded' })
  await s.page.waitForTimeout(settle)
}

type Box = { x: number; y: number; width: number; height: number }

/** 여러 영역을 함께 담는 촬영 범위 */
function union(page: Page, boxes: (Box | null)[], pad = 16): Box {
  const found = boxes.filter((box): box is Box => box !== null)
  const size = page.viewportSize()!
  const x = Math.max(0, Math.min(...found.map((box) => box.x)) - pad)
  const y = Math.max(0, Math.min(...found.map((box) => box.y)) - pad)
  const right = Math.min(size.width, Math.max(...found.map((box) => box.x + box.width)) + pad)
  const bottom = Math.min(size.height, Math.max(...found.map((box) => box.y + box.height)) + pad)
  return { x, y, width: right - x, height: bottom - y }
}

const dialog = (s: Session) => s.page.getByRole('dialog').last()
const button = (s: Session, key: string, vars: Record<string, string | number> = {}) =>
  s.page.getByRole('button', { name: s.t(key, vars), exact: true }).first()

/** 드롭다운을 열고 버튼과 메뉴를 함께 찍는다. 버튼 위치는 열기 전에 잰다(메뉴가 열리면 바깥은 보조 기술에서 가려진다) */
async function shotMenu(s: Session, name: string, trigger: ReturnType<Page['locator']>, extra: Box | null = null) {
  const triggerBox = await trigger.boundingBox()
  await trigger.click()
  const menu = s.page.getByRole('menu').last()
  await menu.waitFor()
  await s.page.waitForTimeout(300)
  await s.shot(name, { clip: union(s.page, [triggerBox, await menu.boundingBox(), extra], 20) })
  await s.page.keyboard.press('Escape')
  await s.page.waitForTimeout(200)
}

/** 앱 화면 장면(1120×700) */
const APP_SCENES: Scene[] = [
  { name: 'dashboard', run: async (s) => { await goto(s, '/dashboard'); await s.shot('dashboard') } },
  {
    name: 'shell-menus',
    run: async (s) => {
      await goto(s, '/dashboard')
      await s.shot('shell-header', { clip: { x: 0, y: 0, width: s.page.viewportSize()!.width, height: 57 } })
      await shotMenu(s, 'shell-user-menu', s.page.getByRole('button', { name: new RegExp(NAMES[s.lang].user) }).first())
      await s.page.getByRole('button', { name: new RegExp(s.t('shell.notifications.bell')) }).first().click()
      await s.page.waitForTimeout(700)
      await s.shot('shell-notifications', { clip: { x: s.page.viewportSize()!.width - 520, y: 0, width: 520, height: 440 } })
    },
  },
  {
    name: 'workspace-create',
    run: async (s) => {
      await goto(s, '/workspaces')
      await button(s, 'shell.sidebar.newWorkspace').click()
      await dialog(s).waitFor()
      await s.shot('workspace-create', { locator: dialog(s) })
    },
  },
  { name: 'workspace-erd', run: async (s) => { await goto(s, `/workspaces/${WS}`); await s.shot('workspace-erd') } },
  {
    name: 'document-dialogs',
    run: async (s) => {
      for (const [name, key] of [['document-create', 'model.list.newDocument'], ['document-sql-import', 'sqlImport.openButton'], ['document-reverse', 'reverse.openButton'], ['document-template', 'model.templates.openButton']] as const) {
        await goto(s, `/workspaces/${WS}`)
        await button(s, key).click()
        await dialog(s).waitFor()
        await s.page.waitForTimeout(700)
        await s.shot(name, { locator: dialog(s) })
      }
    },
  },
  {
    name: 'document-row-menu',
    run: async (s) => {
      await goto(s, `/workspaces/${WS}`)
      const row = s.page.locator('tbody tr').first()
      await shotMenu(s, 'document-row-menu', row.getByRole('button').last(), await row.boundingBox())
    },
  },
  { name: 'workspace-database', run: async (s) => { await goto(s, `/workspaces/${WS}?tab=database`); await s.shot('workspace-database') } },
  {
    name: 'connection-dialog',
    run: async (s) => {
      await goto(s, `/workspaces/${WS}?tab=database`)
      await button(s, 'connection.list.newConnection').click()
      await dialog(s).waitFor()
      await s.shot('connection-dialog', { locator: dialog(s) })
    },
  },
  { name: 'workspace-members', run: async (s) => { await goto(s, `/workspaces/${WS}?tab=members`); await s.shot('workspace-members') } },
  {
    name: 'member-add',
    run: async (s) => {
      await goto(s, `/workspaces/${WS}?tab=members`)
      await button(s, 'workspace.members.addButton').click()
      await dialog(s).waitFor()
      await s.shot('member-add', { locator: dialog(s) })
    },
  },
  { name: 'workspace-mcp', run: async (s) => { await goto(s, `/workspaces/${WS}?tab=mcp`); await s.page.getByTestId('mcp-token-row').first().waitFor(); await s.shot('workspace-mcp') } },
  {
    name: 'mcp-issue',
    run: async (s) => {
      await goto(s, `/workspaces/${WS}?tab=mcp`)
      await s.page.getByTestId('mcp-issue-button').click()
      await dialog(s).waitFor()
      await dialog(s).locator('#mcp-token-name').fill('Claude Code')
      await s.page.waitForTimeout(300)
      await s.shot('mcp-issue', { locator: dialog(s) })
      await dialog(s).getByRole('button', { name: s.t('workspace.mcp.issueConfirm'), exact: true }).click()
      await s.page.getByTestId('mcp-issued-dialog').waitFor()
      await s.page.waitForTimeout(400)
      await s.shot('mcp-issued', { locator: s.page.getByTestId('mcp-issued-dialog') })
    },
  },
  { name: 'workspace-overview', run: async (s) => { await goto(s, `/workspaces/${WS}?tab=overview`); await s.shot('workspace-overview') } },
  { name: 'workspace-settings', run: async (s) => { await goto(s, `/workspaces/${WS}?tab=settings`); await s.shot('workspace-settings') } },
  { name: 'team-detail', run: async (s) => { await goto(s, '/teams/201'); await s.shot('team-detail') } },
  { name: 'community-release-notes', run: async (s) => { await goto(s, '/community/release-notes'); await s.shot('community-release-notes') } },
  { name: 'community-feedback', run: async (s) => { await goto(s, '/community/feedback'); await s.shot('community-feedback') } },
  { name: 'community-notifications', run: async (s) => { await goto(s, '/community/notifications'); await s.shot('community-notifications') } },
  { name: 'community-my-comments', run: async (s) => { await goto(s, '/community/my-comments'); await s.shot('community-my-comments') } },
  { name: 'admin-users', run: async (s) => { await goto(s, '/admin/users'); await s.shot('admin-users') } },
]

const EDITOR_PATH = `/workspaces/${WS}/models/${MODEL}`
const openEditor = async (s: Session) => {
  await goto(s, EDITOR_PATH, 0)
  await s.page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length >= 6, { timeout: 20_000 })
  await s.page.waitForTimeout(1300)
}
const node = (s: Session, table: string) => s.page.locator(`.react-flow__node[data-id="t_${table}"]`)
const columnInput = (s: Session, table: string, column: string) =>
  node(s, table).getByLabel(`${s.t('model.editor.table.columnName')} — ${column}`, { exact: true })
/** 「도구」 메뉴의 항목을 누른다 */
const openTool = async (s: Session, key: string) => {
  await button(s, 'model.editor.toolbar.tools').click()
  await s.page.getByRole('menuitem', { name: s.t(key), exact: true }).click()
}

/** 에디터 장면(1440×860) */
const EDITOR_SCENES: Scene[] = [
  {
    name: 'editor-overview',
    run: async (s) => {
      await openEditor(s)
      await s.shot('editor-overview')
      await s.shot('editor-toolbar', { clip: { x: 0, y: 0, width: 1440, height: 106 } })
    },
  },
  {
    name: 'editor-menus',
    run: async (s) => {
      await openEditor(s)
      await shotMenu(s, 'editor-menu-tools', button(s, 'model.editor.toolbar.tools'))
      await shotMenu(s, 'editor-menu-export', button(s, 'model.editor.toolbar.export'))
      await shotMenu(s, 'editor-menu-view', button(s, 'model.editor.toolbar.view'))
      await shotMenu(s, 'editor-menu-layout', button(s, 'model.editor.toolbar.autoLayoutMode'))
    },
  },
  {
    name: 'editor-explorer',
    run: async (s) => {
      await openEditor(s)
      await button(s, 'model.editor.explorer.toggle').click()
      await s.page.waitForTimeout(600)
      await s.shot('editor-explorer', { clip: { x: 0, y: 106, width: 300, height: 700 } })
    },
  },
  { name: 'editor-table', run: async (s) => { await openEditor(s); await s.shot('editor-table', { locator: node(s, 'orders') }) } },
  {
    name: 'editor-column-info',
    run: async (s) => {
      await openEditor(s)
      await columnInput(s, 'orders', 'status').dblclick()
      await dialog(s).waitFor()
      await s.page.waitForTimeout(300)
      await s.shot('editor-column-info', { locator: dialog(s) })
    },
  },
  {
    name: 'editor-context-menus',
    run: async (s) => {
      await openEditor(s)
      // 빈 영역 — 테이블이 없는 오른쪽 아래
      await s.page.mouse.click(1380, 800, { button: 'right' })
      const menu = s.page.getByRole('menu').last()
      await menu.waitFor()
      await s.shot('editor-context-canvas', { locator: menu })
      await s.page.keyboard.press('Escape')
      const box = (await node(s, 'orders').boundingBox())!
      // 테이블 이름 줄의 오른쪽 끝 — 메뉴가 테이블을 덜 가린다
      const at = { x: box.x + box.width - 60, y: box.y + 38 }
      await s.page.mouse.click(at.x, at.y, { button: 'right' })
      await menu.waitFor()
      await s.page.waitForTimeout(200)
      await s.shot('editor-context-table', { clip: union(s.page, [box, await menu.boundingBox()], 16) })
      await s.page.getByRole('menuitem', { name: s.t('model.editor.contextMenu.tableInfo'), exact: true }).click()
      await dialog(s).waitFor()
      await s.shot('editor-table-info', { locator: dialog(s) })
      await s.page.keyboard.press('Escape')
      await s.page.waitForTimeout(500)
      await s.page.mouse.click(at.x, at.y, { button: 'right' })
      await menu.waitFor()
      await s.page.getByRole('menuitem', { name: s.t('model.editor.contextMenu.editGroup'), exact: true }).click()
      await dialog(s).waitFor()
      await s.shot('editor-group-dialog', { locator: dialog(s) })
    },
  },
  {
    name: 'editor-key-dialog',
    run: async (s) => {
      await openEditor(s)
      await node(s, 'orders').getByRole('button', { name: s.t('model.editor.key.addIndex') }).click()
      await dialog(s).waitFor()
      await s.shot('editor-key-dialog', { locator: dialog(s) })
    },
  },
  {
    name: 'editor-relationship',
    run: async (s) => {
      await openEditor(s)
      const edge = s.page.locator('.react-flow__edge[data-id="rel_users_orders"]')
      const mid = await edge.locator('path').first().evaluate((el) => {
        const path = el as SVGPathElement
        const point = path.getPointAtLength(path.getTotalLength() / 2)
        const matrix = path.getScreenCTM()!
        return { x: point.x * matrix.a + matrix.e, y: point.y * matrix.d + matrix.f }
      })
      await s.page.mouse.click(mid.x, mid.y, { button: 'right' })
      const menu = s.page.getByRole('menu').last()
      await menu.waitFor()
      await s.shot('editor-context-relationship', { locator: menu })
      await s.page.getByRole('menuitem', { name: s.t('model.editor.contextMenu.editRelationship'), exact: true }).click()
      await dialog(s).waitFor()
      await s.page.waitForTimeout(300)
      await s.shot('editor-relationship-dialog', { locator: dialog(s) })
      // 컬럼 매핑 — 자식 컬럼을 다른 컬럼으로 고른 모습(타입이 달라 안내가 뜬다)
      await dialog(s).locator('select').first().selectOption({ index: 1 })
      await s.page.waitForTimeout(300)
      await s.shot('editor-relationship-mapping', { locator: dialog(s).getByTestId('relationship-mapping') })
    },
  },
  {
    name: 'editor-relation-picker',
    run: async (s) => {
      await openEditor(s)
      const handle = node(s, 'products').locator('.react-flow__handle').first()
      await handle.click({ force: true })
      const picker = s.page.getByRole('dialog', { name: s.t('model.editor.relation.startMenu') })
      await picker.waitFor()
      await s.page.waitForTimeout(400)
      await s.shot('editor-relation-picker', { locator: picker })
    },
  },
  {
    name: 'editor-note',
    run: async (s) => {
      s.overrides.set(`/models/${MODEL}`, (method) => (method === 'GET' ? { json: ok({ response: modelResponse(s.lang, shopDocument(s.lang, { note: true })) }) } : null))
      try {
        await goto(s, EDITOR_PATH, 0)
        const note = s.page.locator('.react-flow__node-note').first()
        await note.waitFor()
        await s.page.waitForTimeout(1300)
        await s.shot('editor-note', { clip: union(s.page, [await node(s, 'payments').boundingBox(), await note.boundingBox()], 20) })
      } finally {
        installEditorOverrides(s)
      }
    },
  },
  {
    name: 'standard-panel',
    run: async (s) => {
      await openEditor(s)
      await button(s, 'model.editor.termDictionary.toggle').click()
      const panel = s.page.getByTestId('term-dictionary-panel')
      await panel.getByTestId('term-row-user_email').waitFor()
      await s.page.waitForTimeout(400)
      await s.shot('standard-terms', { locator: panel })
      await panel.getByTestId('term-row-user_email').click()
      await dialog(s).waitFor()
      await s.page.waitForTimeout(500)
      await s.shot('standard-term-dialog', { locator: dialog(s) })
      await s.page.keyboard.press('Escape')
      await panel.getByRole('tab', { name: s.t('model.editor.domainType.menu') }).click()
      await panel.getByTestId('domain-type-list').waitFor()
      await s.page.waitForTimeout(400)
      await s.shot('standard-domain-types', { locator: panel })
      await panel.getByRole('button', { name: s.t('model.editor.domainType.add'), exact: true }).click()
      await dialog(s).waitFor()
      await s.shot('standard-domain-dialog', { locator: dialog(s) })
      await s.page.keyboard.press('Escape')
      await panel.getByRole('tab', { name: s.t('model.editor.termDictionary.tabSystem') }).click()
      await s.page.waitForTimeout(900)
      await s.shot('standard-system', { locator: panel })
    },
  },
  {
    name: 'standard-suggest',
    run: async (s) => {
      await openEditor(s)
      const input = columnInput(s, 'users', 'name')
      await input.click()
      await s.page.keyboard.press('ControlOrMeta+A')
      await s.page.keyboard.type('user_em', { delay: 30 })
      const list = s.page.getByRole('listbox').last()
      await list.waitFor()
      await s.page.waitForTimeout(400)
      await s.shot('standard-suggest', { clip: union(s.page, [await node(s, 'users').boundingBox(), await list.boundingBox()], 16) })
    },
  },
  {
    name: 'standard-column',
    run: async (s) => {
      await openEditor(s)
      await columnInput(s, 'users', 'name').dblclick()
      await dialog(s).waitFor()
      // (선택 칸이 label 안에 있어 접근성 이름에 선택지 글자가 섞인다 — label 글자로 찾는다)
      await dialog(s).locator('label', { hasText: s.t('model.editor.domainType.label') }).locator('select').selectOption('11')
      await dialog(s).getByLabel(s.t('model.editor.columnInfo.length'), { exact: true }).fill('320')
      await s.page.waitForTimeout(300)
      await s.shot('standard-column', { locator: dialog(s) })
    },
  },
  {
    name: 'standard-propagation',
    run: async (s) => {
      // 금액 도메인 타입이 버전 3이 됐고, 문서의 컬럼은 버전 2에 맞춰져 있다
      s.overrides.set('/domain-types', (method) => (method === 'GET' ? { json: ok({ responses: domainTypes(s.lang, { amount: 3 }), totalCount: 3 }) } : null))
      s.overrides.set(`/models/${MODEL}`, (method) => (method === 'GET' ? { json: ok({ response: modelResponse(s.lang, shopDocument(s.lang, { amountVersion: 2 })) }) } : null))
      try {
        await openEditor(s)
        const banner = s.page.getByRole('status').filter({ hasText: s.t('model.editor.domainType.banner.review') }).first()
        await banner.waitFor()
        await s.shot('standard-banner', { clip: union(s.page, [await banner.boundingBox()], 24) })
        await banner.getByRole('button', { name: s.t('model.editor.domainType.banner.review') }).click()
        await dialog(s).waitFor()
        await s.page.waitForTimeout(300)
        await s.shot('standard-propagation', { locator: dialog(s) })
      } finally {
        installEditorOverrides(s)
      }
    },
  },
  {
    name: 'editor-tools-dialogs',
    run: async (s) => {
      for (const [name, key] of [['editor-logical-names', 'model.editor.toolbar.logicalNames'], ['editor-sync', 'model.editor.toolbar.sync'], ['editor-convert', 'model.editor.toolbar.dbmsConvert'], ['editor-history', 'model.editor.toolbar.history']] as const) {
        await openEditor(s)
        await openTool(s, key)
        await dialog(s).waitFor()
        await s.page.waitForTimeout(1200)
        await s.shot(name, { locator: dialog(s) })
      }
    },
  },
  {
    name: 'editor-sql',
    run: async (s) => {
      await openEditor(s)
      await button(s, 'model.editor.toolbar.ddl').click()
      await dialog(s).waitFor()
      await s.page.waitForTimeout(1200)
      await s.shot('editor-sql', { locator: dialog(s) })
      await dialog(s).getByRole('button', { name: s.t('model.editor.deploy.button'), exact: true }).click()
      await s.page.waitForTimeout(900)
      await s.shot('editor-deploy', { locator: dialog(s) })
    },
  },
  {
    name: 'editor-requirements',
    run: async (s) => {
      await openEditor(s)
      await s.page.getByRole('tab', { name: s.t('shareViewer.tab.requirements') }).click()
      const panel = s.page.getByTestId('requirements-panel')
      await panel.waitFor()
      // 반영 대기 항목을 펼친다 — 내용, 연결된 테이블, "반영함으로 표시"가 보인다
      await panel.locator('[data-testid="requirement-row"][data-state="PENDING"] > button').click()
      await s.page.waitForTimeout(500)
      await s.shot('editor-requirements')
      await panel.getByTestId('requirement-edit').click()
      await dialog(s).waitFor()
      await s.page.waitForTimeout(400)
      await s.shot('editor-requirement-dialog', { locator: dialog(s) })
    },
  },
  {
    name: 'editor-validation',
    run: async (s) => {
      s.overrides.set(`/models/${MODEL}`, (method) => (method === 'GET' ? { json: ok({ response: modelResponse(s.lang, shopDocument(s.lang, { flawed: true })) }) } : null))
      try {
        await goto(s, EDITOR_PATH, 0)
        await s.page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length >= 7, { timeout: 20_000 })
        await s.page.waitForTimeout(1300)
        await button(s, 'model.validation.toggle').click()
        await s.page.waitForTimeout(900)
        await s.shot('editor-validation', { clip: { x: 0, y: 64, width: 900, height: 600 } })
      } finally {
        installEditorOverrides(s)
      }
    },
  },
  {
    name: 'editor-share',
    run: async (s) => {
      await openEditor(s)
      await button(s, 'model.editor.toolbar.share').click()
      await dialog(s).waitFor()
      await s.page.waitForTimeout(900)
      await s.shot('editor-share', { locator: dialog(s) })
    },
  },
  {
    name: 'editor-shortcuts',
    run: async (s) => {
      await openEditor(s)
      await s.page.getByRole('button', { name: s.t('model.editor.shortcuts.open') }).first().click()
      await dialog(s).waitFor()
      await s.shot('editor-shortcuts', { locator: dialog(s) })
    },
  },
]

const BROWSER_PATH = `/workspaces/${WS}/connections/302/data`
/** 데이터 브라우저 장면(1200×720) */
const BROWSER_SCENES: Scene[] = [
  {
    name: 'data-tab',
    run: async (s) => {
      await goto(s, `${BROWSER_PATH}?object=orders`)
      await s.page.locator('table').waitFor()
      await s.shot('data-tab')
    },
  },
  {
    name: 'data-edit',
    run: async (s) => {
      await goto(s, `${BROWSER_PATH}?object=orders`)
      await s.page.locator('table').waitFor()
      const rows = s.page.locator('tbody tr')
      await rows.nth(0).locator('td').nth(2).dblclick()
      await s.page.keyboard.press('ControlOrMeta+A')
      await s.page.keyboard.type('SHIPPED')
      await s.page.keyboard.press('Enter')
      await rows.nth(4).getByRole('button', { name: s.t('database.edit.deleteRow') }).click()
      await button(s, 'database.edit.addRow').click()
      await s.page.waitForTimeout(300)
      await s.shot('data-edit')
      await button(s, 'database.edit.apply').click()
      await dialog(s).waitFor()
      await s.shot('data-apply-confirm', { locator: dialog(s) })
    },
  },
  {
    name: 'data-structure',
    run: async (s) => {
      await goto(s, `${BROWSER_PATH}?object=orders&tab=structure`)
      await s.page.waitForTimeout(600)
      await s.shot('data-structure')
    },
  },
  {
    name: 'data-sql',
    run: async (s) => {
      await goto(s, `${BROWSER_PATH}?tab=sql`)
      await s.page.locator('.cm-content').click()
      await s.page.keyboard.type("SELECT status, COUNT(*) AS orders\nFROM orders\nWHERE ordered_at >= '2026-09-01'\nGROUP BY status;", { delay: 4 })
      await s.page.keyboard.press('Escape')
      await button(s, 'database.sql.run').click()
      await s.page.locator('table').waitFor()
      await s.page.waitForTimeout(400)
      await s.shot('data-sql')
    },
  },
]

/** 공개 화면 장면 — 로그인하지 않은 상태 */
const GUEST_SCENES: Scene[] = [
  { name: 'login', run: async (s) => { await goto(s, '/login'); await s.shot('login', { clip: { x: 260, y: 150, width: 600, height: 380 } }) } },
]

/** 예시 문서의 상세 응답 */
function modelResponse(lang: Lang, doc: EditorDocument) {
  return {
    modelId: MODEL, workspaceId: WS, name: NAMES[lang].model, description: null, databaseType: 'postgresql', sourceConnectionId: '301',
    version: 12, createdBy: { userId: '2', name: NAMES[lang].user }, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z',
    content: serializeContent({ schemaVersion: 1, model: doc.model, diagram: doc.diagram }),
  }
}

/** 에디터 공통 덮어쓰기 — 예시 문서, 도메인 타입, 사전 */
function installEditorOverrides(s: Session) {
  s.overrides.set(`/models/${MODEL}`, (method) => (method === 'GET' ? { json: ok({ response: modelResponse(s.lang, shopDocument(s.lang)) }) } : null))
  s.overrides.set('/domain-types', (method) => (method === 'GET' ? { json: ok({ responses: domainTypes(s.lang), totalCount: 3 }) } : null))
  s.overrides.set(`/workspaces/${WS}/terms`, (method) => (method === 'GET' ? { json: ok({ responses: terms(s.lang), totalCount: 8 }) } : null))
}

/** 앱 화면 공통 덮어쓰기 — 기본 가짜 서버에 없는 상세 응답 */
function installAppOverrides(s: Session) {
  const n = NAMES[s.lang]
  s.overrides.set(`/core/workspaces/${WS}`, (method) =>
    method === 'GET'
      ? { json: ok({ response: { workspaceId: WS, name: '개인 ERD', description: null, isDefault: false, memberCount: 1, createdBy: { userId: '2', name: n.user }, createdAt: '2026-01-02T00:00:00Z' } }) }
      : null,
  )
  s.overrides.set(`/core/workspaces/${WS}/memberships`, (method) =>
    method === 'GET'
      ? {
          json: ok({
            totalCount: 3,
            responses: [
              { membershipId: '1', granteeType: 'USER', user: { userId: '2', name: n.user, email: 'dev@example.com' }, team: null, role: 'OWNER', grantedBy: null, grantedAt: '2026-01-02T00:00:00Z' },
              { membershipId: '2', granteeType: 'USER', user: { userId: '5', name: 'Lee', email: 'lee@example.com' }, team: null, role: 'EDITOR', grantedBy: { userId: '2', name: n.user }, grantedAt: '2026-02-11T00:00:00Z' },
              { membershipId: '3', granteeType: 'TEAM', user: null, team: { teamId: '201', name: 'Platform', memberCount: 2 }, role: 'VIEWER', grantedBy: { userId: '2', name: n.user }, grantedAt: '2026-03-05T00:00:00Z' },
            ],
          }),
        }
      : null,
  )
  s.overrides.set('/core/teams/201', (method) =>
    method === 'GET'
      ? { json: ok({ response: { teamId: '201', name: '결제 플랫폼팀', description: null, isOwner: true, ownerUserId: '2', memberCount: 2, createdAt: '2026-01-03T00:00:00Z', myRole: 'OWNER' } }) }
      : null,
  )
  s.overrides.set('/core/teams/201/members', (method) =>
    method === 'GET'
      ? {
          json: ok({
            totalCount: 2,
            responses: [
              { userId: '2', name: n.user, email: 'dev@example.com', teamRole: 'OWNER', addedBy: null, addedAt: '2026-01-03T00:00:00Z' },
              { userId: '5', name: 'Lee', email: 'lee@example.com', teamRole: 'MEMBER', addedBy: { userId: '2', name: n.user }, addedAt: '2026-02-11T00:00:00Z' },
            ],
          }),
        }
      : null,
  )
}

describe.skipIf(!process.env.GUIDE_CAPTURE)('사용 가이드 스크린샷', () => {
  it('촬영', async () => {
    const browser = await chromium.launch({ channel: 'chrome' })
    const report: string[] = []
    const groups: { scenes: Scene[]; viewport: { width: number; height: number }; guest?: boolean; setup: (s: Session) => void }[] = [
      { scenes: GUEST_SCENES, viewport: { width: 1120, height: 700 }, guest: true, setup: () => {} },
      { scenes: APP_SCENES, viewport: { width: 1120, height: 700 }, setup: installAppOverrides },
      { scenes: EDITOR_SCENES, viewport: { width: 1440, height: 860 }, setup: (s) => { installAppOverrides(s); installEditorOverrides(s) } },
      { scenes: BROWSER_SCENES, viewport: { width: 1200, height: 720 }, setup: installAppOverrides },
    ]
    try {
      for (const lang of LANGS) {
        alignFixtures(lang)
        for (const group of groups) {
          const wanted = group.scenes.filter((scene) => !ONLY || ONLY.has(scene.name))
          if (wanted.length === 0) continue
          const s = await openSession(browser, lang, group.viewport, group.guest)
          group.setup(s)
          for (const scene of wanted) {
            try {
              await scene.run(s)
            } catch (error) {
              report.push(`[${lang}] ${scene.name} 실패: ${String(error).split('\n').slice(0, 4).join(' / ')}`)
              // 실패한 순간의 화면 — 보고서 옆에 둔다
              await s.page.screenshot({ path: resolve(dirname(REPORT), `fail-${lang}-${scene.name}.png`) }).catch(() => {})
            }
            // 장면마다 새 창에서 시작한다 — 고친 문서의 이탈 확인이나 열어 둔 메뉴가 다음 장면에 남지 않는다
            await s.page.close().catch(() => {})
            s.page = await s.context.newPage()
          }
          if (s.missing.size > 0) report.push(`[${lang}] 가짜 응답 없음: ${[...s.missing].join(' | ')}`)
          await s.context.close()
        }
      }
    } finally {
      await browser.close()
      writeFileSync(REPORT, report.join('\n') || '모든 장면 성공')
      if (process.env.GUIDE_COLLECT) writeFileSync(resolve(dirname(REPORT), 'strings.json'), JSON.stringify([...untranslated].filter((text) => !(text in DICT)).sort(), null, 1))
    }
  }, 3_600_000)
})
