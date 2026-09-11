/**
 * MSW 핸들러 = 실행 가능한 API 명세 (frontend-testing.md — 계약 변경 시 이 파일을 함께 갱신)
 *
 * 기본(성공) 시나리오만 정의 — 개별 테스트는 server.use()로 실패 응답을 덧씌운다.
 * 데이터는 메모리 상수(불변) — 뮤테이션 후 상태 변화를 검증하는 테스트는
 * 핸들러를 재정의해 사용한다.
 */
import { HttpResponse, http } from 'msw'

import type { ApiEnvelope } from '@/api/types'

const BASE = ''

function ok(data: Partial<ApiEnvelope>): ApiEnvelope {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...data,
  }
}

export function fail(resultCode: string, status: number, errors?: ApiEnvelope['errors']) {
  return HttpResponse.json(
    { header: { isSuccessful: false, resultCode, resultMessage: resultCode }, ...(errors ? { errors } : {}) },
    { status },
  )
}

/* ---------- 공통 픽스처 (테스트에서 재사용) ---------- */

export const fixtures = {
  me: {
    userId: '2',
    email: 'bootstrap@example.com',
    name: '부트스트랩 관리자',
    providers: ['github'],
    admin: true,
    createdAt: '2026-01-02T00:00:00Z',
  },
  providers: { totalCount: 1, responses: [{ code: 'github', displayName: 'GitHub' }] },
  myWorkspaces: {
    totalCount: 2,
    responses: [
      {
        workspaceId: '101',
        name: '개인 ERD',
        description: null,
        isDefault: false,
        myRole: 'OWNER',
        memberCount: 1,
      },
      {
        workspaceId: '102',
        name: '결제팀 공용',
        description: '결제 도메인 ERD',
        isDefault: false,
        myRole: 'EDITOR',
        memberCount: 4,
      },
    ],
  },
  databaseTypes: {
    totalCount: 2,
    responses: [
      { code: 'mysql', displayName: 'MySQL' },
      { code: 'postgresql', displayName: 'PostgreSQL' },
    ],
  },
  models: {
    totalCount: 2,
    responses: [
      {
        modelId: '501',
        workspaceId: '101',
        name: '주문 서비스 ERD',
        description: '결제 도메인 1차',
        databaseType: 'postgresql',
        canvasWidth: 1920,
        canvasHeight: 1080,
        version: 3,
        createdBy: { userId: '2', name: '부트스트랩 관리자' },
        createdAt: '2026-09-05T10:00:00Z',
        updatedAt: '2026-09-10T08:30:00Z',
      },
      {
        modelId: '502',
        workspaceId: '101',
        name: '회원 서비스 ERD',
        description: null,
        databaseType: 'mysql',
        canvasWidth: 1280,
        canvasHeight: 720,
        version: 1,
        createdBy: { userId: '3', name: 'kim' },
        createdAt: '2026-09-08T02:00:00Z',
        updatedAt: '2026-09-08T02:00:00Z',
      },
    ],
  },
  teams: {
    totalCount: 2,
    responses: [
      {
        teamId: '201',
        name: '결제 플랫폼팀',
        description: null,
        isOwner: true,
        ownerUserId: '2',
        memberCount: 2,
        createdAt: '2026-01-03T00:00:00Z',
      },
      {
        teamId: '202',
        name: '검색 인프라팀',
        description: null,
        isOwner: false,
        ownerUserId: '5',
        memberCount: 4,
        createdAt: '2026-01-08T00:00:00Z',
      },
    ],
  },
  adminDatabaseTypes: {
    totalCount: 2,
    responses: [
      { code: 'mysql', displayName: 'MySQL', isActive: true },
      { code: 'postgresql', displayName: 'PostgreSQL', isActive: true },
    ],
  },
  adminUsers: {
    page: 1,
    size: 20,
    totalPages: 1,
    totalCount: 3,
    responses: [
      {
        userId: '2',
        email: null,
        name: '부트스트랩 관리자',
        identities: [{ provider: 'github', providerUserId: '48239157' }],
        admin: true,
        withdrawnAt: null,
        createdAt: '2026-01-02T00:00:00Z',
      },
      {
        userId: '5',
        email: 'kim@example.com',
        name: '김철수',
        identities: [
          { provider: 'github', providerUserId: '777001' },
          { provider: 'google', providerUserId: '200412' },
        ],
        admin: false,
        withdrawnAt: null,
        createdAt: '2026-01-05T00:00:00Z',
      },
      {
        userId: '6',
        email: 'old@example.com',
        name: '탈퇴한 사용자',
        identities: [{ provider: 'github', providerUserId: '300951' }],
        admin: false,
        withdrawnAt: '2026-02-10T00:00:00Z',
        createdAt: '2026-01-10T00:00:00Z',
      },
    ],
  },
  adminAuditLogs: {
    page: 1,
    size: 20,
    totalPages: 1,
    totalCount: 3,
    responses: [
      {
        id: '118',
        createdAt: '2026-09-12T01:03:00Z',
        actorUserId: '2',
        actorName: '부트스트랩 관리자',
        actorEmail: null,
        action: 'ROLE_UPDATED',
        targetType: 'ROLE',
        targetId: '2',
        detail: { roleName: 'ADMIN' },
        ip: '203.0.113.10',
      },
      {
        id: '117',
        createdAt: '2026-09-12T00:58:00Z',
        actorUserId: null,
        actorName: null,
        actorEmail: null,
        action: 'USER_LOGGED_IN',
        targetType: 'USER',
        targetId: '5',
        detail: { provider: 'github' },
        ip: null,
      },
      {
        id: '116',
        createdAt: '2026-09-12T00:40:00Z',
        actorUserId: '2',
        actorName: '부트스트랩 관리자',
        actorEmail: null,
        action: 'SESSION_REVOKED_BY_ADMIN',
        targetType: 'SESSION',
        targetId: '00000000-0000-0000-0000-000000000001',
        detail: { userId: '6' },
        ip: '203.0.113.10',
      },
    ],
  },
  adminSessions: {
    page: 1,
    size: 20,
    totalPages: 1,
    totalCount: 1,
    responses: [
      {
        sid: '00000000-0000-0000-0000-000000000001',
        createdAt: '2026-01-05T09:00:00Z',
        lastUsedAt: '2026-01-05T12:30:00Z',
        ip: '203.0.113.10',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0.0.0',
      },
    ],
  },
  adminProviders: {
    totalCount: 2,
    responses: [
      { code: 'github', displayName: 'GitHub', isActive: true },
      { code: 'google', displayName: 'Google', isActive: true },
    ],
  },
  adminRoles: {
    totalCount: 4,
    responses: [
      { code: 'OWNER', displayName: '소유자', level: 40 },
      { code: 'EDITOR', displayName: '편집자', level: 30 },
      { code: 'COMMENTER', displayName: '댓글 작성자', level: 20 },
      { code: 'VIEWER', displayName: '조회자', level: 10 },
    ],
  },
}

/* ---------- auth ---------- */

export const handlers = [
  // 공개 — 로그인 버튼 목록
  http.get(`${BASE}/api/v1/core/providers`, () => HttpResponse.json(ok(fixtures.providers))),

  // OAuth 인가 코드 교환
  http.post(`${BASE}/api/v1/auth/oauth2/:provider/token`, () =>
    HttpResponse.json(
      ok({
        response: { accessToken: 'test-access-token', tokenType: 'Bearer', expiresIn: 3600 },
      }),
    ),
  ),

  // Refresh — 쿠키 존재 가정 하 성공
  http.post(`${BASE}/api/v1/auth/refresh-token`, () =>
    HttpResponse.json(
      ok({ response: { accessToken: 'test-refreshed-token', tokenType: 'Bearer', expiresIn: 3600 } }),
    ),
  ),

  // 로그아웃
  http.post(`${BASE}/api/v1/auth/logout`, () => new HttpResponse(null, { status: 204 })),

  /* ---------- core ---------- */

  http.get(`${BASE}/api/v1/core/accounts/me`, () => HttpResponse.json(ok({ response: fixtures.me }))),

  http.get(`${BASE}/api/v1/core/accounts/me/workspaces`, () =>
    HttpResponse.json(ok(fixtures.myWorkspaces)),
  ),

  // 내 팀 목록 — ownedOnly=true면 isOwner 행만
  http.get(`${BASE}/api/v1/core/teams`, ({ request }) => {
    const ownedOnly = new URL(request.url).searchParams.get('ownedOnly') === 'true'
    const matched = ownedOnly
      ? fixtures.teams.responses.filter((team) => team.isOwner)
      : fixtures.teams.responses
    return HttpResponse.json(ok({ totalCount: matched.length, responses: matched }))
  }),

  // 데이터베이스 종류 코드(활성만) — 모델 생성 다이얼로그 드롭다운
  http.get(`${BASE}/api/v1/core/database-types`, () =>
    HttpResponse.json(ok(fixtures.databaseTypes)),
  ),

  // 모델 목록 — keyword는 이름·설명 부분 일치
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/models`, ({ request }) => {
    const keyword = new URL(request.url).searchParams.get('keyword')?.toLowerCase() ?? ''
    const matched = fixtures.models.responses.filter(
      (model) =>
        !keyword ||
        model.name.toLowerCase().includes(keyword) ||
        (model.description ?? '').toLowerCase().includes(keyword),
    )
    return HttpResponse.json(ok({ page: 1, size: 100, totalPages: 1, totalCount: matched.length, responses: matched }))
  }),

  // 모델 상세(1.3) — content 포함 전체, 없으면 404
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId`, ({ params }) => {
    const matched = fixtures.models.responses.find((model) => model.modelId === params.modelId)
    if (!matched) return fail('MODEL_NOT_FOUND', 404)
    return HttpResponse.json(
      ok({ response: { ...matched, content: '{"tables":[],"relationships":[]}' } }),
    )
  }),

  // 모델 생성 — 이름 중복 409, 응답은 생성 리소스(content 포함)
  http.post(`${BASE}/api/v1/core/workspaces/:workspaceId/models`, async ({ request }) => {
    const body = (await request.json()) as { name?: string; databaseType?: string }
    if (fixtures.models.responses.some((model) => model.name === body.name)) {
      return fail('DUPLICATED_NAME', 409)
    }
    return HttpResponse.json(
      ok({
        response: {
          modelId: String(500 + fixtures.models.responses.length + 1),
          workspaceId: '101',
          name: body.name,
          description: null,
          databaseType: body.databaseType,
          canvasWidth: 1920,
          canvasHeight: 1080,
          content: '{"tables":[],"relationships":[]}',
          version: 0,
          createdBy: { userId: '2', name: '부트스트랩 관리자' },
          createdAt: '2026-09-12T00:00:00Z',
          updatedAt: '2026-09-12T00:00:00Z',
        },
      }),
      { status: 201 },
    )
  }),

  // 모델 메타 변경 — 이름·설명, 갱신된 메타 반환(픽스처 불변 유지)
  http.patch(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId`, async ({ request }) => {
    const body = (await request.json()) as { name?: string; description?: string | null }
    const matched = fixtures.models.responses[0]
    return HttpResponse.json(
      ok({
        response: {
          ...matched,
          name: body.name ?? matched.name,
          description: body.description !== undefined ? body.description : matched.description,
        },
      }),
    )
  }),

  // 모델 삭제 — 204
  http.delete(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId`, () =>
    new HttpResponse(null, { status: 204 }),
  ),

  /* ---------- core admin (08-core/05-account.md Section 2) ---------- */

  // 사용자 목록 — keyword는 이름·이메일 부분 일치(대소문자 무시)로 반영
  http.get(`${BASE}/api/v1/core/admin/users`, ({ request }) => {
    const keyword = new URL(request.url).searchParams.get('keyword')?.toLowerCase() ?? ''
    const matched = fixtures.adminUsers.responses.filter(
      (user) =>
        !keyword ||
        user.name.toLowerCase().includes(keyword) ||
        (user.email ?? '').toLowerCase().includes(keyword),
    )
    return HttpResponse.json(
      ok({
        page: 1,
        size: 20,
        totalPages: 1,
        totalCount: matched.length,
        responses: matched,
      }),
    )
  }),

  // 사용자 상세 — 없는 userId는 404(존재 은닉)
  http.get(`${BASE}/api/v1/core/admin/users/:userId`, ({ params }) => {
    const user = fixtures.adminUsers.responses.find((row) => row.userId === params.userId)
    return user
      ? HttpResponse.json(ok({ response: user }))
      : fail('RESOURCE_NOT_FOUND', 404)
  }),

  // 활성 세션 목록 — 대상 사용자와 무관하게 항상 같은 페이지
  http.get(`${BASE}/api/v1/core/admin/sessions`, () =>
    HttpResponse.json(ok(fixtures.adminSessions)),
  ),

  // 세션 폐기 — 성공 204 (이미 종료된 sid는 개별 테스트가 server.use로 404를 덧씌운다)
  http.delete(`${BASE}/api/v1/core/admin/sessions/:sid`, () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // 관리자 — 데이터베이스 종류 코드
  http.get(`${BASE}/api/v1/core/admin/database-types`, () =>
    HttpResponse.json(ok(fixtures.adminDatabaseTypes)),
  ),

  http.patch(`${BASE}/api/v1/core/admin/database-types`, async ({ request }) => {
    const body = (await request.json()) as { code: string; displayName?: string; isActive?: boolean }
    const matched = fixtures.adminDatabaseTypes.responses.find((type) => type.code === body.code)
    if (!matched) return fail('RESOURCE_NOT_FOUND', 404)
    if (body.displayName !== undefined) matched.displayName = body.displayName
    if (body.isActive !== undefined) matched.isActive = body.isActive
    return HttpResponse.json(ok({ response: matched }))
  }),

  http.get(`${BASE}/api/v1/core/admin/providers`, () =>
    HttpResponse.json(ok(fixtures.adminProviders)),
  ),

  // 제공자 수정 — 수정된 행 1건 반환
  http.patch(`${BASE}/api/v1/core/admin/providers`, async ({ request }) => {
    const body = (await request.json()) as { code: string; displayName?: string; isActive?: boolean }
    const provider = fixtures.adminProviders.responses.find((row) => row.code === body.code)
    return provider
      ? HttpResponse.json(
          ok({
            response: {
              ...provider,
              ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
              ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
            },
          }),
        )
      : fail('RESOURCE_NOT_FOUND', 404)
  }),

  http.get(`${BASE}/api/v1/core/admin/roles`, () => HttpResponse.json(ok(fixtures.adminRoles))),

  // 역할 수정 — 표시명만, 수정된 행 1건 반환
  // 감사 로그 — keyword는 주체(이름·이메일) 부분 일치, action은 정확 일치. 시스템 행은 keyword 있으면 제외
  http.get(`${BASE}/api/v1/core/admin/audit-logs`, ({ request }) => {
    const params = new URL(request.url).searchParams
    const keyword = params.get('keyword')?.toLowerCase() ?? ''
    const action = params.get('action') ?? ''
    const matched = fixtures.adminAuditLogs.responses.filter(
      (log) =>
        (!action || log.action === action) &&
        (!keyword ||
          (log.actorName ?? '').toLowerCase().includes(keyword) ||
          (log.actorEmail ?? '').toLowerCase().includes(keyword)),
    )
    return HttpResponse.json(
      ok({
        page: 1,
        size: 20,
        totalPages: 1,
        totalCount: matched.length,
        responses: matched,
      }),
    )
  }),

  http.patch(`${BASE}/api/v1/core/admin/roles`, async ({ request }) => {
    const body = (await request.json()) as { code: string; displayName?: string }
    const role = fixtures.adminRoles.responses.find((row) => row.code === body.code)
    return role
      ? HttpResponse.json(
          ok({
            response: {
              ...role,
              ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
            },
          }),
        )
      : fail('RESOURCE_NOT_FOUND', 404)
  }),
]
