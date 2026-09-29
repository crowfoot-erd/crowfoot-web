/**
 * v1.25 릴리스 노트용 스크린샷 (로컬 전용 — 커밋하지 않는다, CI testMatch에 걸리지 않게).
 * 릴리스마다 이 파일을 해당 버전 시나리오로 다시 쓴다(v1.23 알림에 이어).
 *
 * 실행: npx playwright test e2e/_screenshots.spec.ts
 * 산출: /tmp/crowfoot-v1.24-shots/*.png (dsf=2 요소 캡처) → 마지막 스테이징 패스에서
 *       webp(q82)로 변환한다(인코더가 로컬에 없어 Playwright 이중 패스).
 *
 * v1.23 규칙 계승 — 확대 캡처(deployment.md §4): 전체 화면이 아니라 필요한 부분(요소)만.
 * 요소 단위 locator.screenshot이 원칙. **에디터 캔버스 장면은 촬영 전 자동배치를 실행해
 * 정렬된 상태에서 찍는다**(2026-09-28 확정) — 이번 판은 배치가 주제라 모드 선택 자체가 그 실행이다.
 *
 * v1.25 6장면:
 * ① 배치 모드 드롭다운 — 계층형/허브 중심/하이브리드 3종 라디오
 * ② 허브 중심 배치 결과 캔버스 — members 허브 방사형
 * ③ 하이브리드 배치 결과 캔버스 — 링 + 빈 공간 분산
 * ④ 드래그 중 관계선 실시간 재경로 — 마우스를 누른 채 찍는다(드롭 전 라이브 경로)
 * ⑤ 템플릿 갤러리 카드 — 각 템플릿 원문 언어 그대로(ko/en/ja/zh 혼합)
 * ⑥ 커뮤니티 사이드바 — 알림 메뉴 신설
 *
 * 부팅·목킹은 v1.22/v1.23 판 교훈 그대로: 미매칭 API 로깅, 빈 목록으로 조용히,
 * feedback 목킹(401 방지 — 전역 로그인 다이얼로그가 캔버스를 덮는다).
 */
import { mkdirSync } from 'node:fs'
import { test, type Page } from '@playwright/test'

const OUT = '/tmp/crowfoot-v1.24-shots'
mkdirSync(OUT, { recursive: true })

export const WS = '34'
export const MODEL = '999'

const envelope = (body: object) => ({
  header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
  ...body,
})

/* ---------- 픽스처: 온라인 서점 ERD(v1.25 확장판 — 허브 방사형이 드러나도록 9테이블·11관계·2그룹·2노트) ---------- */

const col = (table: string, name: string, logical: string, dataType: string, opts: Partial<Record<'length' | 'precision' | 'scale', number>> & { nullable?: boolean; ai?: boolean } = {}) => ({
  id: `${table}.${name}`,
  logicalName: logical,
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

const TABLES = [
  {
    id: 't_members', logicalName: '회원', physicalName: 'members', comment: null,
    columns: [col('members', 'id', '회원ID', 'BIGINT', { ai: true }), col('members', 'email', '이메일', 'VARCHAR', { length: 100 }), col('members', 'nickname', '닉네임', 'VARCHAR', { length: 50 }), col('members', 'created_at', '가입일시', 'TIMESTAMP', { nullable: true })],
    primaryKey: { name: 'members_pkey', columnIds: ['members.id'] },
    uniques: [{ id: 'uk_members_0', name: 'uk_members_email', columnIds: ['members.email'] }],
    indexes: [],
  },
  {
    id: 't_boards', logicalName: '게시판', physicalName: 'boards', comment: null,
    columns: [col('boards', 'id', '게시판ID', 'BIGINT', { ai: true }), col('boards', 'member_id', '소유자ID', 'BIGINT'), col('boards', 'title', '게시판명', 'VARCHAR', { length: 100 })],
    primaryKey: { name: 'boards_pkey', columnIds: ['boards.id'] },
    uniques: [],
    indexes: [{ id: 'idx_boards_0', name: 'idx_boards_member_id', columns: [{ columnId: 'boards.member_id', order: 'ASC' }] }],
  },
  {
    id: 't_books', logicalName: '게시글', physicalName: 'books', comment: null,
    columns: [col('books', 'id', '게시글ID', 'BIGINT', { ai: true }), col('books', 'board_id', '게시판ID', 'BIGINT'), col('books', 'member_id', '작성자ID', 'BIGINT'), col('books', 'title', '제목', 'VARCHAR', { length: 200 }), col('books', 'view_count', '조회수', 'INT', { nullable: true })],
    primaryKey: { name: 'books_pkey', columnIds: ['books.id'] },
    uniques: [],
    indexes: [{ id: 'idx_books_0', name: 'idx_books_member_id', columns: [{ columnId: 'books.member_id', order: 'ASC' }] }],
  },
  {
    id: 't_reviews', logicalName: '리뷰', physicalName: 'reviews', comment: null,
    columns: [col('reviews', 'id', '리뷰ID', 'BIGINT', { ai: true }), col('reviews', 'member_id', '작성자ID', 'BIGINT'), col('reviews', 'book_id', '게시글ID', 'BIGINT'), col('reviews', 'rating', '평점', 'INT'), col('reviews', 'body', '본문', 'VARCHAR', { length: 500, nullable: true })],
    primaryKey: { name: 'reviews_pkey', columnIds: ['reviews.id'] },
    uniques: [],
    indexes: [{ id: 'idx_reviews_0', name: 'idx_reviews_member_id', columns: [{ columnId: 'reviews.member_id', order: 'ASC' }] }],
  },
  {
    id: 't_orders', logicalName: '주문', physicalName: 'orders', comment: null,
    columns: [col('orders', 'id', '주문ID', 'BIGINT', { ai: true }), col('orders', 'member_id', '주문자ID', 'BIGINT'), col('orders', 'coupon_id', '쿠폰ID', 'BIGINT', { nullable: true }), col('orders', 'delivery_id', '배송지ID', 'BIGINT'), col('orders', 'status', '주문상태', 'VARCHAR', { length: 20 }), col('orders', 'ordered_at', '주문일시', 'TIMESTAMP', { nullable: true })],
    primaryKey: { name: 'orders_pkey', columnIds: ['orders.id'] },
    uniques: [],
    indexes: [{ id: 'idx_orders_0', name: 'idx_orders_member_id', columns: [{ columnId: 'orders.member_id', order: 'ASC' }] }],
  },
  {
    id: 't_order_items', logicalName: '주문상품', physicalName: 'order_items', comment: null,
    columns: [col('order_items', 'id', '주문상품ID', 'BIGINT', { ai: true }), col('order_items', 'order_id', '주문ID', 'BIGINT'), col('order_items', 'book_id', '게시글ID', 'BIGINT'), col('order_items', 'quantity', '수량', 'INT')],
    primaryKey: { name: 'order_items_pkey', columnIds: ['order_items.id'] },
    uniques: [],
    indexes: [{ id: 'idx_order_items_0', name: 'idx_order_items_order_id', columns: [{ columnId: 'order_items.order_id', order: 'ASC' }] }],
  },
  {
    id: 't_payments', logicalName: '결제', physicalName: 'payments', comment: null,
    columns: [col('payments', 'id', '결제ID', 'BIGINT', { ai: true }), col('payments', 'order_id', '주문ID', 'BIGINT'), col('payments', 'amount', '결제금액', 'DECIMAL', { precision: 10, scale: 2 }), col('payments', 'paid_at', '결제일시', 'TIMESTAMP', { nullable: true })],
    primaryKey: { name: 'payments_pkey', columnIds: ['payments.id'] },
    uniques: [{ id: 'uk_payments_0', name: 'uk_payments_order_id', columnIds: ['payments.order_id'] }],
    indexes: [],
  },
  {
    id: 't_coupons', logicalName: '쿠폰', physicalName: 'coupons', comment: null,
    columns: [col('coupons', 'id', '쿠폰ID', 'BIGINT', { ai: true }), col('coupons', 'code', '쿠폰코드', 'VARCHAR', { length: 30 }), col('coupons', 'discount_rate', '할인율', 'INT', { nullable: true })],
    primaryKey: { name: 'coupons_pkey', columnIds: ['coupons.id'] },
    uniques: [{ id: 'uk_coupons_0', name: 'uk_coupons_code', columnIds: ['coupons.code'] }],
    indexes: [],
  },
  {
    id: 't_delivery', logicalName: '배송지', physicalName: 'delivery_addresses', comment: null,
    columns: [col('delivery_addresses', 'id', '배송지ID', 'BIGINT', { ai: true }), col('delivery_addresses', 'member_id', '회원ID', 'BIGINT'), col('delivery_addresses', 'address', '주소', 'VARCHAR', { length: 200 })],
    primaryKey: { name: 'delivery_addresses_pkey', columnIds: ['delivery_addresses.id'] },
    uniques: [],
    indexes: [{ id: 'idx_delivery_0', name: 'idx_delivery_member_id', columns: [{ columnId: 'delivery_addresses.member_id', order: 'ASC' }] }],
  },
]

const rel = (id: string, name: string, parent: string, child: string, parentCol: string, childCol: string, type: 'ONE_TO_ONE' | 'ONE_TO_MANY') => ({
  id,
  name,
  parentTableId: parent,
  childTableId: child,
  type,
  identifying: false,
  parentMultiplicity: 'EXACTLY_ONE',
  childMultiplicity: type === 'ONE_TO_ONE' ? 'EXACTLY_ONE' : 'ZERO_OR_MORE',
  fkName: `fk_${child.split('t_')[1]}_${childCol.split('.')[1]}`,
  columnMappings: [{ parentColumnId: parentCol, childColumnId: childCol }],
  onDelete: 'NO_ACTION',
  onUpdate: 'NO_ACTION',
  sourceHandle: null,
  targetHandle: null,
})

const RELATIONSHIPS = [
  rel('rel_members_boards', '회원의 게시판 소유', 't_members', 't_boards', 'members.id', 'boards.member_id', 'ONE_TO_MANY'),
  rel('rel_boards_books', '게시판의 게시글', 't_boards', 't_books', 'boards.id', 'books.board_id', 'ONE_TO_MANY'),
  rel('rel_members_books', '회원의 게시글 작성', 't_members', 't_books', 'members.id', 'books.member_id', 'ONE_TO_MANY'),
  rel('rel_members_reviews', '회원의 리뷰 작성', 't_members', 't_reviews', 'members.id', 'reviews.member_id', 'ONE_TO_MANY'),
  rel('rel_books_reviews', '게시글의 리뷰', 't_books', 't_reviews', 'books.id', 'reviews.book_id', 'ONE_TO_MANY'),
  rel('rel_members_orders', '회원의 주문', 't_members', 't_orders', 'members.id', 'orders.member_id', 'ONE_TO_MANY'),
  rel('rel_orders_items', '주문의 주문상품', 't_orders', 't_order_items', 'orders.id', 'order_items.order_id', 'ONE_TO_MANY'),
  rel('rel_books_items', '게시글의 주문상품', 't_books', 't_order_items', 'books.id', 'order_items.book_id', 'ONE_TO_MANY'),
  rel('rel_orders_payments', '주문의 결제', 't_orders', 't_payments', 'orders.id', 'payments.order_id', 'ONE_TO_ONE'),
  rel('rel_coupons_orders', '쿠폰의 주문', 't_coupons', 't_orders', 'coupons.id', 'orders.coupon_id', 'ONE_TO_MANY'),
  rel('rel_delivery_orders', '배송지의 주문', 't_delivery', 't_orders', 'delivery_addresses.id', 'orders.delivery_id', 'ONE_TO_MANY'),
]

// 그룹 색이 멤버 렌더 색을 고정한다(content-schema areaSchema) — 노드 색을 그룹 색과 맞춘다
const NODES: Record<string, { x: number; y: number; width: null; color: string }> = {
  t_members: { x: 60, y: 300, width: null, color: 'blue' },
  t_boards: { x: 440, y: 80, width: null, color: 'blue' },
  t_books: { x: 820, y: 80, width: null, color: 'blue' },
  t_reviews: { x: 820, y: 420, width: null, color: 'blue' },
  t_orders: { x: 440, y: 620, width: null, color: 'green' },
  t_order_items: { x: 820, y: 620, width: null, color: 'green' },
  t_payments: { x: 1200, y: 500, width: null, color: 'green' },
  t_coupons: { x: 60, y: 620, width: null, color: 'green' },
  t_delivery: { x: 1200, y: 760, width: null, color: 'green' },
}

const NOTES = [
  { id: 'note_member', x: 0, y: 0, width: 240, title: '회원 허브', text: '회원(members)이 게시판·게시글·리뷰·주문을 잇는 허브다 — 허브 중심 배치에서 원점에 놓인다.', color: 'yellow', linkedTableId: 't_members' },
  { id: 'note_order', x: 0, y: 0, width: 240, title: '주문 클러스터', text: '주문은 주문상품·결제를 거느리고 쿠폰·배송지를 참조한다.', color: 'pink', linkedTableId: 't_orders' },
]

const AREAS = [
  { id: 'area_content', name: '회원·콘텐츠', description: '회원이 만들고 소비하는 콘텐츠 도메인', color: 'blue', tableIds: ['t_members', 't_boards', 't_books', 't_reviews'] },
  { id: 'area_order', name: '주문·결제', description: '주문 from 주문상품·결제·쿠폰·배송지', color: 'green', tableIds: ['t_orders', 't_order_items', 't_payments', 't_coupons', 't_delivery'] },
]

export const FIXTURE_CONTENT = {
  schemaVersion: 1,
  model: { tables: TABLES, relationships: RELATIONSHIPS },
  diagram: { nodes: NODES, notes: NOTES, areas: AREAS, viewport: null },
}

/* ---------- 알림 픽스처 — 받는 사람 = 부트스트랩 관리자(문서 오너) 시점 (v1.22 판 승계) ---------- */

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

const NOTIFICATION_ROWS = [
  { id: '511', type: 'COMMENT_CREATED', actorUserId: '9', actorDisplayName: '지나가는DBA', modelId: MODEL, modelName: '온라인 서점 ERD', workspaceId: WS, read: false, createdAt: hoursAgo(3) },
  { id: '510', type: 'REACTION_ADDED', actorUserId: '12', actorDisplayName: 'erd_lover', modelId: MODEL, modelName: '온라인 서점 ERD', workspaceId: WS, read: false, createdAt: hoursAgo(5) },
  { id: '509', type: 'OWNER_REPLIED', actorUserId: '31', actorDisplayName: 'doskim', modelId: '777', modelName: '정산 배치 ERD', workspaceId: WS, read: false, createdAt: hoursAgo(26) },
  { id: '508', type: 'COMMENT_CREATED', actorUserId: null, actorDisplayName: '방문자', modelId: '777', modelName: '정산 배치 ERD', workspaceId: WS, read: true, createdAt: daysAgo(2) },
  { id: '507', type: 'REACTION_ADDED', actorUserId: '8', actorDisplayName: 'marco', modelId: '777', modelName: '정산 배치 ERD', workspaceId: WS, read: true, createdAt: daysAgo(3) },
  { id: '506', type: 'COMMENT_CREATED', actorUserId: '15', actorDisplayName: 'hyerin', modelId: MODEL, modelName: '온라인 서점 ERD', workspaceId: WS, read: true, createdAt: daysAgo(4) },
  { id: '505', type: 'OWNER_REPLIED', actorUserId: '31', actorDisplayName: 'doskim', modelId: '777', modelName: '정산 배치 ERD', workspaceId: WS, read: true, createdAt: daysAgo(6) },
  { id: '504', type: 'REACTION_ADDED', actorUserId: '20', actorDisplayName: 'db.ninja', modelId: MODEL, modelName: '온라인 서점 ERD', workspaceId: WS, read: true, createdAt: daysAgo(8) },
]

async function mockNotifications(page: Page) {
  await page.route('**/api/v1/core/notifications**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/unread-count')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({ response: NOTIFICATION_ROWS.filter((r) => !r.read).length })),
      })
    }
    const size = Number(url.searchParams.get('size') ?? '20')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          responses: NOTIFICATION_ROWS,
          page: 1,
          size,
          totalCount: NOTIFICATION_ROWS.length,
          totalPages: 1,
        }),
      ),
    })
  })
}

/* ---------- 템플릿 픽스처 — 각 문서의 발행 언어 그대로(§3 정책: 원문 노출) ---------- */

const TEMPLATES = [
  { modelId: '79', name: '쇼핑몰 주문 ERD', description: '회원·상품·주문·결제를 담는 커머스 기본형입니다.', databaseType: 'mysql', updatedAt: '2026-09-02T00:00:00Z' },
  { modelId: '80', name: 'Library Management System', description: 'A compact schema for books, members, loans and overdue fines.', databaseType: 'postgresql', updatedAt: '2026-09-05T00:00:00Z' },
  { modelId: '82', name: 'Recettes de cuisine', description: 'Recettes, ingrédients et menus pour un site de gastronomie.', databaseType: 'mysql', updatedAt: '2026-09-08T00:00:00Z' },
  { modelId: '83', name: '図書館貸出管理', description: '蔵書・会員・貸出・延滞金を管理するコンパクトな構成です。', databaseType: 'postgresql', updatedAt: '2026-09-11T00:00:00Z' },
  { modelId: '84', name: '项目缺陷跟踪', description: '用于团队协作的问题、迭代与里程碑跟踪模型。', databaseType: 'mysql', updatedAt: '2026-09-14T00:00:00Z' },
  { modelId: '85', name: '인사 급여 ERD', description: '직원·부서·급여 명세를 다루는 인사 기본형입니다.', databaseType: 'oracle', updatedAt: '2026-09-17T00:00:00Z' },
]

/* ---------- 공통 목킹 (v1.22 판 승계) ---------- */

export async function mockBoot(page: Page) {
  await page.route('**/api/**', (route) => {
    console.log(`[unmatched ${route.request().method()}]`, route.request().url())
    return route.continue()
  })
  await page.route('**/collab/**', (route) => {
    console.log(`[unmatched-collab ${route.request().method()}]`, route.request().url())
    return route.continue()
  })
  await page.addInitScript(() => {
    window.localStorage.setItem('crowfoot.lang', 'ko')
  })
  await page.route('**/api/v1/core/metrics/visit', (route) => route.fulfill({ status: 204, body: '' }))
  const emptyList = (route: { fulfill: (o: object) => Promise<unknown> }) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ responses: [] })) })
  await page.route('**/api/v1/core/database-types', emptyList)
  await page.route(`**/api/v1/core/workspaces/${WS}/connections**`, emptyList)

  const tokenOk = (route: { fulfill: (o: object) => Promise<unknown> }) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({ response: { accessToken: 'token-2', tokenType: 'Bearer', expiresIn: 3600 } })),
    })
  await page.route('**/api/v1/auth/oauth2/github/token', (route) => tokenOk(route))
  await page.route('**/api/v1/auth/refresh-token', (route) => tokenOk(route))
  await page.route('**/api/v1/core/accounts/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          response: {
            userId: '2',
            email: 'bootstrap@example.com',
            name: '부트스트랩 관리자',
            locale: null,
            providers: ['github'],
            admin: true,
            createdAt: '2026-01-02T00:00:00Z',
          },
        }),
      ),
    }),
  )
  await page.route(`**/api/v1/core/accounts/me/workspaces**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          responses: [{ workspaceId: WS, name: 'open-erd', description: null, myRole: 'OWNER' }],
        }),
      ),
    }),
  )
  await mockNotifications(page)
}

/** 에디터 문서 부팅 목킹 — 장면 ①~④ 공통 (v1.22 판 ③에서 그대로) */
export async function mockEditorModel(page: Page) {
  const saved = { content: JSON.stringify(FIXTURE_CONTENT), version: 3 }
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          response: {
            modelId: MODEL,
            workspaceId: WS,
            name: '온라인 서점 ERD',
            description: '주문·결제 도메인 예시 문서',
            databaseType: 'mysql',
            sourceConnectionId: null,
            version: 3,
            createdBy: { userId: '2', name: '부트스트랩 관리자' },
            createdAt: '2026-09-01T00:00:00Z',
            updatedAt: '2026-09-27T00:00:00Z',
            content: saved.content,
          },
        }),
      ),
    }),
  )
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}/version`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { version: 3, updatedAt: '2026-09-27T00:00:00Z' } })) }),
  )
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}/validation-runs`, (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}/content`, (route) => {
    const body = route.request().postDataJSON() as { content?: string }
    if (typeof body?.content === 'string') saved.content = body.content
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({ response: { version: saved.version, updatedAt: '2026-09-27T00:00:00Z' } })),
    })
  })
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}/feedback`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ response: { reactionCount: 5, reacted: false, comments: [] } })) }),
  )
  await page.route(`**/api/v1/core/workspaces/${WS}/terms**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ responses: [] })) }),
  )
}

/** 캔버스 요소 전체(.react-flow)는 빈 영역까지 담는다 — 렌더된 노드 전체의 합집 bbox로
 *  클립을 좁혀 찍는다(deployment.md §4 "맥락이 필요하면 클립으로 좁게"). */
async function nodeClip(page: Page, pad = 48) {
  const clip = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('.react-flow__node')].map((el) => el.getBoundingClientRect())
    if (!rects.length) return null
    const x1 = Math.min(...rects.map((r) => r.left))
    const y1 = Math.min(...rects.map((r) => r.top))
    const x2 = Math.max(...rects.map((r) => r.right))
    const y2 = Math.max(...rects.map((r) => r.bottom))
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
  })
  if (!clip) throw new Error('클립 대상 노드 없음')
  return { x: Math.max(0, clip.x - pad), y: Math.max(0, clip.y - pad), width: clip.width + pad * 2, height: clip.height + pad * 2 }
}

test('v1.25 6장면 + webp 스테이징', async ({ browser }) => {
  test.setTimeout(180_000)

  /* ①~④ 에디터 — 한 세션에서: 드롭다운 → 허브 배치 → 하이브리드 배치 → 드래그 중 재경로 */
  {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await mockBoot(page)
    await mockEditorModel(page)
    await page.goto(`/workspaces/${WS}/models/${MODEL}`)
    await page.waitForSelector('.react-flow__node')
    await page.waitForTimeout(4500) // 폭 측정 자동저장 사이클 통과 — 캔버스 안착

    // ① 배치 모드 드롭다운 (캐럿 aria-label '배치 모드')
    await page.getByRole('button', { name: '배치 모드' }).click()
    await page.getByRole('menuitemradio', { name: '허브 중심 배치' }).waitFor()
    await page.waitForTimeout(300)
    await page.locator('[data-slot="dropdown-menu-content"]').screenshot({ path: `${OUT}/layout-modes.png` })
    await page.keyboard.press('Escape')

    // ② 허브 중심 배치 실행 (모드 선택 = 즉시 실행)
    await page.getByRole('button', { name: '배치 모드' }).click()
    await page.getByRole('menuitemradio', { name: '허브 중심 배치' }).click()
    await page.waitForTimeout(1200) // 배치 적용 + 노트 재배치
    await page.screenshot({ path: `${OUT}/hub-layout.png`, clip: await nodeClip(page) })

    // ③ 하이브리드 배치 실행
    await page.getByRole('button', { name: '배치 모드' }).click()
    await page.getByRole('menuitemradio', { name: '하이브리드 배치' }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/hybrid-layout.png`, clip: await nodeClip(page) })

    // ④ 드래그 중 관계선 실시간 재경로 — members 허브를 누른 채 옮기고, 드롭 전에 찍는다
    const hub = page.locator('.react-flow__node').filter({ hasText: '회원' }).first()
    const box = await hub.boundingBox()
    if (!box) throw new Error('허브 노드 없음')
    await page.mouse.move(box.x + box.width / 2, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 320, box.y + 210, { steps: 24 })
    await page.waitForTimeout(350) // 마지막 프레임 라이브 재경로 정착 — 버튼은 계속 누른 상태
    await page.screenshot({ path: `${OUT}/drag-live.png`, clip: await nodeClip(page) })
    await page.mouse.up()
    await context.close()
  }

  /* ⑤ 템플릿 갤러리 — 각 템플릿 원문 언어 그대로 */
  {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await mockBoot(page)
    await page.route('**/api/v1/core/templates', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope({ responses: TEMPLATES, totalCount: TEMPLATES.length })) }),
    )
    await page.route(`**/api/v1/core/workspaces/${WS}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({ response: { workspaceId: WS, name: 'open-erd', description: '예제·검증용 워크스페이스', isDefault: false, memberCount: 2, createdBy: { userId: '2', name: '부트스트랩 관리자' }, createdAt: '2026-06-01T00:00:00Z' } })),
      }),
    )
    await page.route(`**/api/v1/core/workspaces/${WS}/models**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({ responses: [{ modelId: MODEL, workspaceId: WS, name: '온라인 서점 ERD', description: '주문·결제 도메인 예시 문서', databaseType: 'mysql', sourceConnectionId: null, version: 3, createdBy: { userId: '2', name: '부트스트랩 관리자' }, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z' }], page: 1, size: 20, totalCount: 1, totalPages: 1 })),
      }),
    )
    await page.goto(`/workspaces/${WS}`)
    await page.getByText('온라인 서점 ERD').first().waitFor()
    await page.getByRole('button', { name: '템플릿으로 시작' }).click()
    await page.getByText('Library Management System').waitFor()
    await page.waitForTimeout(500)
    await page.locator('[data-slot="dialog-content"]').screenshot({ path: `${OUT}/template-cards.png` })
    await context.close()
  }

  /* ⑥ 커뮤니티 사이드바 — 알림 메뉴가 추가된 좌측 내비 */
  {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await mockBoot(page)
    await page.goto('/community/notifications')
    await page.getByText('총 8개').waitFor()
    await page.waitForTimeout(500)
    await page.locator('aside').first().screenshot({ path: `${OUT}/community-sidebar.png` })
    await context.close()
  }

  /* 스테이징 — dsf=2 요소 PNG을 실제 폭(최대 1400px) webp(q82)로 (v1.23 판과 동일) */
  {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
    const page = await context.newPage()
    for (const name of ['layout-modes', 'hub-layout', 'hybrid-layout', 'drag-live', 'template-cards', 'community-sidebar']) {
      await page.goto(`file:///tmp/crowfoot-v1.24-shots/${name}.png`)
      const img = page.locator('img')
      await img.waitFor()
      await img.evaluate((el) => {
        const img = el as HTMLImageElement
        img.style.width = `${Math.min(img.naturalWidth, 1400)}px` // 축소만 — 확대는 하지 않는다
        img.style.height = 'auto'
        img.style.display = 'block'
      })
      await page.waitForTimeout(200)
      await img.screenshot({ path: `${OUT}/${name}.webp`, type: 'webp', quality: 82 })
    }
    await context.close()
  }
})
