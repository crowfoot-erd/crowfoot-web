/**
 * MSW 핸들러 = 실행 가능한 API 명세 (frontend-testing.md — 계약 변경 시 이 파일을 함께 갱신)
 *
 * 기본(성공) 시나리오만 정의 — 개별 테스트는 server.use()로 실패 응답을 덧씌운다.
 * 데이터는 메모리 상수(불변) — 뮤테이션 후 상태 변화를 검증하는 테스트는
 * 핸들러를 재정의해 사용한다.
 * 예외 — 문서 저장(§1.5)·버전 기록(§1.11)은 런타임 상태를 진행시킨다(연속 저장·메모·복원
 * 시나리오가 가능하다). setup afterEach의 resetModelContentState()가 테스트마다 되돌린다.
 */
import { HttpResponse, http } from 'msw'

import type { ApiEnvelope } from '@/api/types'
import { emptyContent, serializeContent } from '@/features/editor/model/content-io'
import { createColumn, createTable, newId } from '@/features/editor/model/changes'
import { buildRelationship } from '@/features/editor/model/relationship'

/** 빈 Canonical 문서 v1 — 상세·생성 응답의 content 초기값 (08-core/02-model.md §1.5.1) */
const EMPTY_CONTENT = serializeContent(emptyContent())

/** DB 동기화 픽스처 한 쌍 — 문서(사용자 편집 상태) vs 스키마 조회(DB 현재 상태).
 *  문서 측: users 강조색·연결된 메모·문서 전용 컬럼 grade·바꾼 논리명.
 *  DB 측 드리프트: grade 삭제·email 길이 320·orders.memo 추가·amount 정밀도 (12,2)·
 *  status 기본값 'CREATED'·FK onDelete CASCADE·신규 products 테이블.
 *  DB 컬럼 논리명은 물리명과 같게 둔다(리버스 조립 규칙 — 코멘트 없음). */
function buildSyncPair() {
  // -- 문서 측 (리버스 후 사용자가 편집한 상태)
  const docUserId = createColumn({ physicalName: 'id', logicalName: '사용자ID', dataType: 'BIGINT', nullable: false, autoIncrement: true })
  const docEmail = createColumn({ physicalName: 'email', logicalName: '이메일', dataType: 'VARCHAR', length: 255, nullable: false })
  const docGrade = createColumn({ physicalName: 'grade', logicalName: '등급', dataType: 'VARCHAR', length: 10 }) // 문서 전용 — DB에 없음
  const docUsers = createTable('users', {
    logicalName: '사용자',
    columns: [docUserId, docEmail, docGrade],
    primaryKey: { name: 'users_pkey', columnIds: [docUserId.id] },
    uniques: [{ id: newId(), name: 'uk_users_email', columnIds: [docEmail.id] }],
  })
  const docOrderId = createColumn({ physicalName: 'id', dataType: 'BIGINT', nullable: false, autoIncrement: true })
  const docStatus = createColumn({ physicalName: 'status', dataType: 'VARCHAR', length: 20, nullable: false, defaultValue: 'PENDING' })
  const docAmount = createColumn({ physicalName: 'amount', dataType: 'NUMERIC', precision: 10, scale: 2 })
  const docOrders = createTable('orders', {
    logicalName: '주문',
    columns: [docOrderId, docStatus, docAmount],
    primaryKey: { name: 'orders_pkey', columnIds: [docOrderId.id] },
  })
  const docRel = buildRelationship({
    parentTable: docUsers,
    childTable: docOrders,
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'ZERO_OR_ONE',
    childMultiplicity: 'ZERO_OR_MORE',
    onDelete: 'NO_ACTION',
    onUpdate: 'NO_ACTION',
  })
  if (!docRel.ok) throw new Error('sync fixture: 문서 측 users PK가 없습니다')
  docOrders.columns.push(...docRel.fkColumns)
  const documentContent = serializeContent({
    schemaVersion: 1,
    model: { tables: [docUsers, docOrders], relationships: [docRel.relationship] },
    diagram: {
      nodes: {
        [docUsers.id]: { x: 80, y: 120, width: null, color: 'violet' },
        [docOrders.id]: { x: 520, y: 160, width: null, color: 'default' },
      },
      notes: [
        {
          id: newId(),
          x: 80,
          y: 480,
          width: 220,
          text: '회원 등급은 문서에서만 관리',
          title: '메모',
          color: 'yellow',
          linkedTableId: docUsers.id,
        },
      ],
      viewport: null,
    },
  })

  // -- DB 측 (스키마 조회가 조립한 현재 상태)
  const dbUserId = createColumn({ physicalName: 'id', logicalName: 'id', dataType: 'BIGINT', nullable: false, autoIncrement: true })
  const dbEmail = createColumn({ physicalName: 'email', logicalName: 'email', dataType: 'VARCHAR', length: 320, nullable: false })
  const dbUsers = createTable('users', {
    logicalName: 'users',
    columns: [dbUserId, dbEmail],
    primaryKey: { name: 'users_pkey', columnIds: [dbUserId.id] },
    uniques: [{ id: newId(), name: 'uk_users_email', columnIds: [dbEmail.id] }],
  })
  const dbOrderId = createColumn({ physicalName: 'id', logicalName: 'id', dataType: 'BIGINT', nullable: false, autoIncrement: true })
  const dbStatus = createColumn({ physicalName: 'status', logicalName: 'status', dataType: 'VARCHAR', length: 20, nullable: false, defaultValue: 'CREATED' })
  const dbAmount = createColumn({ physicalName: 'amount', logicalName: 'amount', dataType: 'NUMERIC', precision: 12, scale: 2 })
  const dbMemo = createColumn({ physicalName: 'memo', logicalName: 'memo', dataType: 'VARCHAR', length: 200 })
  const dbOrders = createTable('orders', {
    logicalName: 'orders',
    columns: [dbOrderId, dbStatus, dbAmount, dbMemo],
    primaryKey: { name: 'orders_pkey', columnIds: [dbOrderId.id] },
  })
  const dbRel = buildRelationship({
    parentTable: dbUsers,
    childTable: dbOrders,
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'ZERO_OR_ONE',
    childMultiplicity: 'ZERO_OR_MORE',
    onDelete: 'CASCADE',
    onUpdate: 'NO_ACTION',
  })
  if (!dbRel.ok) throw new Error('sync fixture: DB 측 users PK가 없습니다')
  // DB 측 FK 컬럼은 코멘트가 없다 — 논리명=물리명(조립 규칙). 빌더가 부모 논리명을 복사하므로 덮어쓴다
  for (const fk of dbRel.fkColumns) fk.logicalName = fk.physicalName
  dbOrders.columns.push(...dbRel.fkColumns)
  const dbProductId = createColumn({ physicalName: 'id', logicalName: 'id', dataType: 'BIGINT', nullable: false, autoIncrement: true })
  const dbProductName = createColumn({ physicalName: 'name', logicalName: 'name', dataType: 'VARCHAR', length: 100, nullable: false })
  const dbProductPrice = createColumn({ physicalName: 'price', logicalName: 'price', dataType: 'NUMERIC', precision: 10, scale: 2 })
  const dbProducts = createTable('products', {
    logicalName: 'products',
    columns: [dbProductId, dbProductName, dbProductPrice],
    primaryKey: { name: 'products_pkey', columnIds: [dbProductId.id] },
  })
  const schemaContent = serializeContent({
    schemaVersion: 1,
    model: { tables: [dbUsers, dbOrders, dbProducts], relationships: [dbRel.relationship] },
    diagram: { nodes: {}, notes: [], viewport: null },
  })

  return {
    documentContent,
    syncSchema: { content: schemaContent, tableCount: 3, relationshipCount: 1, skipped: [] },
  }
}

const SYNC_PAIR = buildSyncPair()

const BASE = ''

/** 저장 성공 응답의 updatedAt(§1.5·§1.11 공통) — 목업 고정 시각 */
const SAVED_AT = '2026-09-12T06:00:00Z'

/** §1.9 버전 경량 조회의 초기 updatedAt — 저장이 일어나면 SAVED_AT로 진행된다 */
const INITIAL_SEEN_AT = '2026-09-14T05:00:00Z'

/** 버전 기록 스냅샷 1행(§1.11) — 목록 응답은 content를 뗀 나머지 필드만 내린다 */
interface VersionRow {
  version: number
  /** 자동 변경 요약 JSON 원문 — null은 직접 생성 v0(요약 없음) */
  changeSummary: string | null
  memo: string | null
  createdBy: { userId: string; name: string } | null
  createdAt: string
  content: string
}

/** 버전 기록 픽스처 — 501(리버스 문서, v0~v3)·502(직접 생성, v0~v1).
 *  changeSummary는 웹 계약(doc-diff)과 특수형(리버스 created·복원 restoredFrom)의
 *  실제 모양새를 담는다 — memo는 요약과 달리 사용자 자유 메모. */
function buildVersionRows(): Record<string, VersionRow[]> {
  const admin = { userId: '2', name: '부트스트랩 관리자' }
  const kim = { userId: '3', name: 'kim' }
  return {
    '501': [
      {
        version: 0,
        changeSummary: '{"created":true,"tables":2,"relationships":1}',
        memo: null,
        createdBy: admin,
        createdAt: '2026-09-05T10:00:00Z',
        content: SYNC_PAIR.documentContent,
      },
      {
        version: 1,
        changeSummary: JSON.stringify({
          items: [
            { kind: 'column', action: 'add', table: 'users', name: 'grade', detail: 'VARCHAR(10)' },
            { kind: 'note', action: 'add', table: '', name: '배포 전 확인', detail: '' },
          ],
          layoutOnly: false,
          truncated: false,
        }),
        memo: '등급 컬럼 추가',
        createdBy: admin,
        createdAt: '2026-09-08T02:00:00Z',
        content: SYNC_PAIR.documentContent,
      },
      {
        version: 2,
        changeSummary: JSON.stringify({
          items: [{ kind: 'note', action: 'move', table: '', name: '배포 전 확인', detail: 'x, y' }],
          layoutOnly: true,
          truncated: false,
        }),
        memo: null,
        createdBy: kim,
        createdAt: '2026-09-09T05:00:00Z',
        content: SYNC_PAIR.documentContent,
      },
      {
        version: 3,
        changeSummary: '{"restoredFrom":1}',
        memo: null,
        createdBy: admin,
        createdAt: '2026-09-10T08:30:00Z',
        content: SYNC_PAIR.documentContent,
      },
    ],
    '502': [
      {
        version: 0,
        changeSummary: null,
        memo: null,
        createdBy: kim,
        createdAt: '2026-09-08T02:00:00Z',
        content: EMPTY_CONTENT,
      },
      {
        version: 1,
        changeSummary: JSON.stringify({
          items: [{ kind: 'table', action: 'add', table: 'member', name: 'member', detail: 'columns 3' }],
          layoutOnly: false,
          truncated: false,
        }),
        memo: null,
        createdBy: kim,
        createdAt: '2026-09-08T03:00:00Z',
        content: EMPTY_CONTENT,
      },
    ],
  }
}

/** 문서별 저장 진행 상태 — PUT 저장·복원이 version·content를 진행시킨다.
 *  지연 초기화(픽스처 version·빈 본문)라 바꾼 테스트가 없으면 픽스처 그대로다. */
interface ContentState {
  version: number
  content: string
  updatedAt: string
}

const contentStates = new Map<string, ContentState>()

function contentStateOf(model: { modelId: string; version: number }): ContentState {
  let state = contentStates.get(model.modelId)
  if (!state) {
    state = { version: model.version, content: EMPTY_CONTENT, updatedAt: INITIAL_SEEN_AT }
    contentStates.set(model.modelId, state)
  }
  return state
}

/** 저장(§1.5)·복원(§1.11) 성공이 버전 기록에 스냅샷을 append 한다 — 서버 트랜잭션 계약 */
function appendSnapshot(modelId: string, version: number, changeSummary: string | null, content: string): void {
  ;(fixtures.versions[modelId] ??= []).push({
    version,
    changeSummary,
    memo: null,
    createdBy: { userId: '2', name: '부트스트랩 관리자' },
    createdAt: SAVED_AT,
    content,
  })
}

/** 저장 진행 상태·버전 기록을 픽스처 기준으로 되돌린다 — setup afterEach가 호출(테스트 격리) */
export function resetModelContentState(): void {
  contentStates.clear()
  fixtures.versions = buildVersionRows()
}

export function ok(data: Partial<ApiEnvelope>): ApiEnvelope {
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
  /** DDL 생성 응답(1.7) — 방언 조립은 core-api 담당, 목업은 고정 스크립트 */
  ddl: {
    sql: [
      '-- 주문 서비스 ERD — PostgreSQL DDL',
      '',
      'CREATE TABLE member (',
      '    id BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY,',
      '    email VARCHAR(255) NOT NULL,',
      '    CONSTRAINT pk_member PRIMARY KEY (id)',
      ');',
    ].join('\n'),
    warnings: [] as { code: string; message: string }[],
    tableCount: 1,
    relationshipCount: 0,
  },
  /** 배포 응답(1.8) — 전체 성공 기본값. 부분 실패는 server.use()로 덧씌운다 */
  deploy: {
    executedCount: 2,
    failedCount: 0,
    statements: [
      {
        sql: 'CREATE TABLE member (\n    id BIGINT NOT NULL,\n    email VARCHAR(255) NOT NULL\n);',
        ok: true,
        error: null,
      },
      {
        sql: 'ALTER TABLE orders ADD CONSTRAINT fk_orders_member FOREIGN KEY (member_id) REFERENCES member (id);',
        ok: true,
        error: null,
      },
    ],
    warnings: [] as { code: string; message: string }[],
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
        sourceConnectionId: '301', // 리버스 생성 문서 — DB 동기화 버튼 노출
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
        sourceConnectionId: null, // 직접 생성 문서 — 동기화 버튼 없음
        version: 1,
        createdBy: { userId: '3', name: 'kim' },
        createdAt: '2026-09-08T02:00:00Z',
        updatedAt: '2026-09-08T02:00:00Z',
      },
    ],
  },
  /** 공유 링크(§1.10) — 기간 있는 링크 1개 + 무제한 링크 1개 */
  shares: {
    totalCount: 2,
    responses: [
      {
        shareId: '901',
        shareToken: 'Sh4reT0ken0fM0del501aaaa',
        startsAt: '2026-09-01T00:00:00Z',
        endsAt: '2026-10-01T00:00:00Z',
        createdAt: '2026-09-10T00:00:00Z',
      },
      {
        shareId: '902',
        shareToken: 'UnL1mitedT0ken0fM0del501bbb',
        startsAt: null,
        endsAt: null,
        createdAt: '2026-09-11T00:00:00Z',
      },
    ],
  },
  /** 공개 공유 문서(§1.10) — 인증 없는 조회 응답 */
  sharedDocument: {
    modelName: '주문 서비스 ERD',
    description: '결제 도메인 1차',
    databaseType: 'postgresql',
    version: 3,
    content: EMPTY_CONTENT,
    startsAt: null,
    endsAt: null,
  },
  /** 공유 갤러리 목록(§1.10.5) — 인증 없는 랜딩 갤러리 응답 (토큰은 위 shares fixture의 활성 링크) */
  sharedGallery: {
    totalCount: 1,
    responses: [
      {
        shareToken: 'Sh4reT0ken0fM0del501aaaa',
        modelName: '주문 서비스 ERD',
        description: '결제 도메인 1차',
        databaseType: 'postgresql',
        updatedAt: '2026-09-15T00:00:00Z',
        sharedAt: '2026-09-10T00:00:00Z',
      },
    ],
  },
  connections: {
    totalCount: 1,
    responses: [
      {
        connectionId: '301',
        workspaceId: '101',
        name: '개발 PG',
        dbmsType: 'postgresql',
        host: 'db.dev.example.com',
        port: 5432,
        databaseName: 'orders',
        schemaName: 'sales',
        username: 'app',
        createdBy: { userId: '2', name: '부트스트랩 관리자' },
        createdAt: '2026-09-10T00:00:00Z',
      },
    ],
  },
  /** DB 동기화(§3.7) — 문서 측 content(테스트가 스토어 수화에 쓴다) + 스키마 조회 응답(DB 측) */
  sync: SYNC_PAIR,
  /** 버전 기록 스냅샷(§1.11) — memo PATCH·복원·저장 append가 진행시키는 가변 상태.
   *  resetModelContentState()가 원본 모양으로 되돌린다 */
  versions: buildVersionRows(),
  /** 매니지드 루트 인스턴스 (08-core/07) — PostgreSQL·MySQL. MySQL은 database 생략(발급 시 생성).
   *  PG(401)는 노출 주소 분리 실측용, MySQL(403)은 publicHost null 폴백 커버 */
  managedInstances: {
    totalCount: 2,
    responses: [
      {
        instanceId: '401',
        displayName: 'Academy PG',
        dbmsType: 'postgresql',
        host: 's3.java21.net',
        publicHost: 'db.crowfoot.java21.net',
        port: 8000,
        databaseName: 'crowfoot',
        username: 'crowfoot',
        isActive: true,
        issuedCount: 1,
        createdBy: { userId: '1', name: '시스템 관리자' },
        createdAt: '2026-09-13T00:00:00Z',
      },
      {
        instanceId: '403',
        displayName: 'Academy MySQL',
        dbmsType: 'mysql',
        host: 's4.java21.net',
        publicHost: null,
        port: 13306,
        databaseName: null,
        username: 'root',
        isActive: true,
        issuedCount: 0,
        createdBy: { userId: '1', name: '시스템 관리자' },
        createdAt: '2026-09-14T00:00:00Z',
      },
    ],
  },
  /** 발급 목록 + 요청자 기준 한도 요약 — me(2)가 발급한 cf_u2_d1 1건 */
  managedDatabases: {
    totalCount: 1,
    responses: [
      {
        databaseId: '31',
        instanceId: '401',
        instanceDisplayName: 'Academy PG',
        schemaName: 'cf_u2_d1',
        workspaceId: '101',
        connectionId: '302',
        connectionName: 'Academy PG #1',
        createdBy: { userId: '2', name: '부트스트랩 관리자' },
        createdAt: '2026-09-13T01:00:00Z',
      },
    ],
    limitSummary: [
      { instanceId: '401', displayName: 'Academy PG', isActive: true, limit: 5, used: 1, remaining: 4 },
    ],
  },
  /** 발급 한도(관리자 지정, 워크스페이스 내 사용자당) — PATCH 핸들러가 이 값을 바꾼다 */
  managedIssueLimit: { limit: 5 },
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
  /** 커뮤니티 게시글 — RELEASE_NOTE(관리자=me 작성) 2 + FEEDBACK(kim 작성) 2, id 역순=최신순 */
  communityPosts: {
    totalCount: 4,
    responses: [
      {
        postId: '902',
        board: 'RELEASE_NOTE',
        title: 'v1.4.0 — 커뮤니티 게시판',
        author: { userId: '2', name: '부트스트랩 관리자' },
        commentCount: 0,
        createdAt: '2026-09-16T10:00:00Z',
        updatedAt: '2026-09-16T10:00:00Z',
      },
      {
        postId: '901',
        board: 'RELEASE_NOTE',
        title: 'v1.3.0 — 관리형 데이터베이스',
        author: { userId: '2', name: '부트스트랩 관리자' },
        commentCount: 0,
        createdAt: '2026-09-10T09:00:00Z',
        updatedAt: '2026-09-10T09:00:00Z',
      },
      {
        postId: '802',
        board: 'FEEDBACK',
        title: 'ERD 내보내기 포맷 제안',
        author: { userId: '3', name: 'kim' },
        commentCount: 2,
        createdAt: '2026-09-15T14:00:00Z',
        updatedAt: '2026-09-15T14:00:00Z',
      },
      {
        postId: '801',
        board: 'FEEDBACK',
        title: '편집기 버그 신고',
        author: { userId: '3', name: 'kim' },
        commentCount: 1,
        createdAt: '2026-09-12T11:00:00Z',
        updatedAt: '2026-09-12T11:00:00Z',
      },
    ],
  },
  /** 대시보드 통합 최근글 — 게시판 무관 최신 5건(id desc) */
  recentCommunityPosts: {
    totalCount: 4,
    responses: [
      {
        postId: '902',
        board: 'RELEASE_NOTE',
        title: 'v1.4.0 — 커뮤니티 게시판',
        author: { userId: '2', name: '부트스트랩 관리자' },
        commentCount: 0,
        createdAt: '2026-09-16T10:00:00Z',
      },
      {
        postId: '802',
        board: 'FEEDBACK',
        title: 'ERD 내보내기 포맷 제안',
        author: { userId: '3', name: 'kim' },
        commentCount: 2,
        createdAt: '2026-09-15T14:00:00Z',
      },
      {
        postId: '801',
        board: 'FEEDBACK',
        title: '편집기 버그 신고',
        author: { userId: '3', name: 'kim' },
        commentCount: 1,
        createdAt: '2026-09-12T11:00:00Z',
      },
      {
        postId: '901',
        board: 'RELEASE_NOTE',
        title: 'v1.3.0 — 관리형 데이터베이스',
        author: { userId: '2', name: '부트스트랩 관리자' },
        commentCount: 0,
        createdAt: '2026-09-10T09:00:00Z',
      },
    ],
  },
  /** 코멘트 — FEEDBACK 802번 글 2건(오래된 순). RELEASE_NOTE 901/902는 코멘트 없음 */
  communityComments: {
    totalCount: 2,
    responses: [
      {
        commentId: '851',
        postId: '802',
        content: '좋은 제안입니다. PostgreSQL 우선 지원을 검토하겠습니다.',
        author: { userId: '2', name: '부트스트랩 관리자' },
        createdAt: '2026-09-15T15:00:00Z',
        updatedAt: '2026-09-15T15:00:00Z',
      },
      {
        commentId: '852',
        postId: '802',
        content: '저도 필요한 기능이에요.',
        author: { userId: '3', name: 'kim' },
        createdAt: '2026-09-16T08:00:00Z',
        updatedAt: '2026-09-16T08:00:00Z',
      },
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

  // 모델 상세(1.3) — content 포함 전체, 없으면 404. 본문·버전은 저장 진행 상태를 따른다
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId`, ({ params }) => {
    const matched = fixtures.models.responses.find((model) => model.modelId === params.modelId)
    if (!matched) return fail('MODEL_NOT_FOUND', 404)
    const state = contentStateOf(matched)
    return HttpResponse.json(
      ok({ response: { ...matched, content: state.content, version: state.version } }),
    )
  }),

  // 버전 경량 조회(1.9 협업 폴링) — content 없이 version·updatedAt만
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/version`, ({ params }) => {
    const matched = fixtures.models.responses.find((model) => model.modelId === params.modelId)
    if (!matched) return fail('MODEL_NOT_FOUND', 404)
    const state = contentStateOf(matched)
    return HttpResponse.json(
      ok({ response: { version: state.version, updatedAt: state.updatedAt } }),
    )
  }),

  // 버전 기록 목록(§1.11) — 최신순 페이징, 행은 content 없는 요약(memo·자동 요약 포함)
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/versions`, ({ params, request }) => {
    const matched = fixtures.models.responses.find((model) => model.modelId === params.modelId)
    if (!matched) return fail('MODEL_NOT_FOUND', 404)
    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size')) || 20))
    const rows = [...(fixtures.versions[matched.modelId] ?? [])].sort((a, b) => b.version - a.version)
    const slice = rows.slice((page - 1) * size, page * size)
    return HttpResponse.json(
      ok({
        page,
        size,
        totalPages: Math.max(1, Math.ceil(rows.length / size)),
        totalCount: rows.length,
        responses: slice.map((row) => ({
          version: row.version,
          changeSummary: row.changeSummary,
          memo: row.memo,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
        })),
      }),
    )
  }),

  // 버전 상세(§1.11) — 해당 시점 content 전문, 없는 버전은 404
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/versions/:version`, ({ params }) => {
    const matched = fixtures.models.responses.find((model) => model.modelId === params.modelId)
    if (!matched) return fail('MODEL_NOT_FOUND', 404)
    const version = Number(params.version)
    const row = (fixtures.versions[matched.modelId] ?? []).find((entry) => entry.version === version)
    if (!row) return fail('MODEL_VERSION_NOT_FOUND', 404)
    return HttpResponse.json(
      ok({
        response: {
          version: row.version,
          content: row.content,
          changeSummary: row.changeSummary,
          memo: row.memo,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
        },
      }),
    )
  }),

  // 버전 메모 편집(§1.11) — memo null은 삭제, 생략은 변경 없음, 빈 문자열·501자 이상은 400
  http.patch(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/versions/:version/memo`, async ({ params, request }) => {
    const matched = fixtures.models.responses.find((model) => model.modelId === params.modelId)
    if (!matched) return fail('MODEL_NOT_FOUND', 404)
    const version = Number(params.version)
    const row = (fixtures.versions[matched.modelId] ?? []).find((entry) => entry.version === version)
    if (!row) return fail('MODEL_VERSION_NOT_FOUND', 404)
    const body = (await request.json().catch(() => ({}))) as { memo?: string | null }
    if ('memo' in body) {
      if (body.memo === null) {
        row.memo = null // 명시적 null — 삭제
      } else {
        if (typeof body.memo !== 'string' || body.memo.trim().length === 0 || body.memo.length > 500) {
          return fail('INVALID_REQUEST', 400)
        }
        row.memo = body.memo
      }
    }
    return HttpResponse.json(
      ok({
        response: {
          version: row.version,
          changeSummary: row.changeSummary,
          memo: row.memo,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
        },
      }),
    )
  }),

  // 버전 복원(§1.11) — 과거 content를 새 버전으로 저장(과거는 불변), restoredFrom 스냅샷 기록
  http.post(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/versions/:version/restore`, async ({ params, request }) => {
    const matched = fixtures.models.responses.find((model) => model.modelId === params.modelId)
    if (!matched) return fail('MODEL_NOT_FOUND', 404)
    const version = Number(params.version)
    const row = (fixtures.versions[matched.modelId] ?? []).find((entry) => entry.version === version)
    if (!row) return fail('MODEL_VERSION_NOT_FOUND', 404)
    const body = (await request.json().catch(() => ({}))) as { baseVersion?: unknown }
    if (typeof body.baseVersion !== 'number' || body.baseVersion < 0) return fail('INVALID_REQUEST', 400)
    const state = contentStateOf(matched)
    if (body.baseVersion !== state.version) return fail('VERSION_CONFLICT', 409)
    state.version += 1
    state.content = row.content
    state.updatedAt = SAVED_AT
    appendSnapshot(matched.modelId, state.version, `{"restoredFrom":${row.version}}`, row.content)
    return HttpResponse.json(ok({ response: { version: state.version, updatedAt: SAVED_AT } }))
  }),

  // 공유 링크 목록(§1.10) — 최근 발급순
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/shares`, () => {
    return HttpResponse.json(ok(fixtures.shares))
  }),

  // 공유 링크 발급(§1.10) — 무제한/기간 지정
  http.post(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/shares`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { startsAt?: string | null; endsAt?: string | null }
    return HttpResponse.json(
      ok({
        response: {
          shareId: String(900 + fixtures.shares.responses.length + 1),
          shareToken: `NewT0ken00000000000000${fixtures.shares.responses.length}`,
          startsAt: body.startsAt ?? null,
          endsAt: body.endsAt ?? null,
          createdAt: '2026-09-15T00:00:00Z',
        },
      }),
      { status: 201 },
    )
  }),

  // 공유 링크 철회(§1.10) — 204
  http.delete(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/shares/:shareId`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // 공유 문서 공개 조회(§1.10) — 인증 없음. expired 토큰은 410, 그 외 없는 토큰은 404
  http.get(`${BASE}/api/v1/core/shares/:token`, ({ params }) => {
    if (params.token === 'expired0000000000000000') return fail('SHARE_INACTIVE', 410)
    if (!fixtures.shares.responses.some((share) => share.shareToken === params.token)) {
      return fail('SHARE_NOT_FOUND', 404)
    }
    return HttpResponse.json(ok({ response: fixtures.sharedDocument }))
  }),

  // 공유 갤러리 목록(§1.10.5) — 인증 없음. 랜딩 페이지가 현재 공유 중인 문서를 나열
  http.get(`${BASE}/api/v1/core/shares`, () => HttpResponse.json(ok(fixtures.sharedGallery))),

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
          sourceConnectionId: null,
          content: EMPTY_CONTENT,
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

  // 문서 본체 저장(1.5) — baseVersion 불일치 409. 성공하면 version을 진행하고
  // 버전 기록에 스냅샷을 append 한다(§1.11 계약 — 연속 저장 시나리오가 가능)
  http.put(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/content`, async ({ params, request }) => {
    const matched = fixtures.models.responses.find((model) => model.modelId === params.modelId)
    if (!matched) return fail('MODEL_NOT_FOUND', 404)
    const body = (await request.json()) as { baseVersion?: unknown; content?: unknown; changeSummary?: unknown }
    if (typeof body.baseVersion !== 'number' || typeof body.content !== 'string' || body.content.length === 0) {
      return fail('INVALID_REQUEST', 400)
    }
    // changeSummary 가드(§1.5) — 문자열이 아니거나 64KB 초과면 400
    if (body.changeSummary != null && (typeof body.changeSummary !== 'string' || body.changeSummary.length > 64 * 1024)) {
      return fail('INVALID_REQUEST', 400)
    }
    const state = contentStateOf(matched)
    if (body.baseVersion !== state.version) return fail('VERSION_CONFLICT', 409)
    state.version += 1
    state.content = body.content
    state.updatedAt = SAVED_AT
    appendSnapshot(matched.modelId, state.version, (body.changeSummary as string | undefined) ?? null, body.content)
    return HttpResponse.json(ok({ response: { version: state.version, updatedAt: SAVED_AT } }))
  }),

  // DDL 스크립트 생성(1.7) — 경고 분기가 필요한 테스트는 server.use()로 덧씌운다
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/ddl`, ({ params }) => {
    const matched = fixtures.models.responses.find((model) => model.modelId === params.modelId)
    if (!matched) return fail('MODEL_NOT_FOUND', 404)
    return HttpResponse.json(ok({ response: fixtures.ddl }))
  }),

  // 포워드 엔지니어링 배포(1.8) — 부분 실패 리포트가 필요한 테스트는 server.use()로 덧씌운다
  http.post(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId/deploy`, async ({ request }) => {
    const body = (await request.json()) as { connectionId?: string }
    const matched = fixtures.connections.responses.find(
      (connection) => connection.connectionId === body.connectionId,
    )
    if (!matched) return fail('CONNECTION_NOT_FOUND', 404)
    return HttpResponse.json(ok({ response: fixtures.deploy }))
  }),

  // 모델 삭제 — 204
  http.delete(`${BASE}/api/v1/core/workspaces/:workspaceId/models/:modelId`, () =>
    new HttpResponse(null, { status: 204 }),
  ),

  /* ---------- DB 커넥션 (08-core/06-connection.md §3) ---------- */

  // 커넥션 목록 — 비밀번호는 내려오지 않는다
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/connections`, () =>
    HttpResponse.json(ok(fixtures.connections)),
  ),

  // 커넥션 등록 — 응답에 비밀번호 없음
  http.post(`${BASE}/api/v1/core/workspaces/:workspaceId/connections`, async ({ request }) => {
    const body = (await request.json()) as { name?: string; dbmsType?: string }
    if (!body.name || !body.dbmsType) return fail('INVALID_REQUEST', 400)
    return HttpResponse.json(
      ok({
        response: {
          connectionId: String(600 + fixtures.connections.responses.length + 1),
          workspaceId: '101',
          name: body.name,
          dbmsType: body.dbmsType,
          host: 'db.dev.example.com',
          port: 5432,
          databaseName: 'orders',
          username: 'app',
          createdBy: { userId: '2', name: '부트스트랩 관리자' },
          createdAt: '2026-09-12T00:00:00Z',
        },
      }),
      { status: 201 },
    )
  }),

  // 커넥션 변경 — 변경분 반영(픽스처 불변 유지)
  http.patch(`${BASE}/api/v1/core/workspaces/:workspaceId/connections/:connectionId`, async ({ request, params }) => {
    const matched = fixtures.connections.responses.find(
      (connection) => connection.connectionId === params.connectionId,
    )
    if (!matched) return fail('CONNECTION_NOT_FOUND', 404)
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(
      ok({ response: { ...matched, ...(body.password ? {} : body) } }),
    )
  }),

  // 커넥션 삭제 — 204
  http.delete(`${BASE}/api/v1/core/workspaces/:workspaceId/connections/:connectionId`, () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // 접속 테스트 — 성공 계약(connected/latencyMs). 실패 시나리오는 server.use()로
  http.post(`${BASE}/api/v1/core/workspaces/:workspaceId/connections/:connectionId/test`, () =>
    HttpResponse.json(ok({ response: { connected: true, latencyMs: 42, message: null } })),
  ),

  // 리버스 엔지니어링 — 신규 문서(빈 캔버스 content) + 요약. 실패는 server.use()로
  http.post(
    `${BASE}/api/v1/core/workspaces/:workspaceId/connections/:connectionId/reverse-engineering`,
    async ({ request, params }) => {
      const matched = fixtures.connections.responses.find(
        (connection) => connection.connectionId === params.connectionId,
      )
      if (!matched) return fail('CONNECTION_NOT_FOUND', 404)
      const body = (await request.json().catch(() => ({}))) as {
        modelName?: string
        description?: string
      }
      const name = body.modelName || `${matched.name} ERD`
      if (fixtures.models.responses.some((model) => model.name === name)) {
        return fail('DUPLICATED_NAME', 409)
      }
      return HttpResponse.json(
        ok({
          response: {
            model: {
              modelId: String(700 + fixtures.models.responses.length + 1),
              workspaceId: '101',
              name,
              description: body.description ?? null,
              databaseType: matched.dbmsType,
              sourceConnectionId: matched.connectionId, // 리버스 생성 — 원천 커넥션 기억
              content: EMPTY_CONTENT,
              version: 0,
              createdBy: { userId: '2', name: '부트스트랩 관리자' },
              createdAt: '2026-09-12T00:00:00Z',
              updatedAt: '2026-09-12T00:00:00Z',
            },
            tableCount: 2,
            relationshipCount: 1,
            skipped: [],
          },
        }),
        { status: 201 },
      )
    },
  ),

  // 스키마 조회(§3.7 문서 동기화 원천) — 리버스와 같은 규칙으로 조립된 content만 내린다(문서 생성 없음)
  http.post(`${BASE}/api/v1/core/workspaces/:workspaceId/connections/:connectionId/schema`, ({ params }) => {
    const matched = fixtures.connections.responses.find(
      (connection) => connection.connectionId === params.connectionId,
    )
    if (!matched) return fail('CONNECTION_NOT_FOUND', 404)
    return HttpResponse.json(ok({ response: fixtures.sync.syncSchema }))
  }),

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

  /* ---------- core managed (08-core/07-managed-database.md) ---------- */

  // 관리자 — 인스턴스 목록
  http.get(`${BASE}/api/v1/core/admin/managed-instances`, () =>
    HttpResponse.json(ok(fixtures.managedInstances)),
  ),

  // 관리자 — 발급 한도(워크스페이스 내 사용자당). :instanceId 핸들러보다 먼저 등록해 우선 매칭시킨다
  http.get(`${BASE}/api/v1/core/admin/managed-instances/issue-limit`, () =>
    HttpResponse.json(ok({ response: fixtures.managedIssueLimit })),
  ),
  http.patch(`${BASE}/api/v1/core/admin/managed-instances/issue-limit`, async ({ request }) => {
    const body = (await request.json()) as { limit?: number }
    fixtures.managedIssueLimit.limit = body.limit ?? 5
    return HttpResponse.json(ok({ response: fixtures.managedIssueLimit }))
  }),

  // 관리자 — 인스턴스 등록(자격 검증은 서버 담당, 목업은 성공만) — 201. 제출 값 반영
  http.post(`${BASE}/api/v1/core/admin/managed-instances`, async ({ request }) => {
    const body = (await request.json()) as {
      displayName?: string
      dbmsType?: string
      host?: string
      publicHost?: string | null
      port?: number
      databaseName?: string | null
      username?: string
    }
    return HttpResponse.json(
      ok({
        response: {
          instanceId: '402',
          displayName: body.displayName ?? '',
          dbmsType: body.dbmsType ?? 'postgresql',
          host: body.host ?? 'db.example.com',
          publicHost: body.publicHost ?? null,
          port: body.port ?? 5432,
          databaseName: body.databaseName ?? null,
          username: body.username ?? 'crowfoot',
          isActive: true,
          issuedCount: 0,
          createdBy: { userId: '1', name: '시스템 관리자' },
          createdAt: '2026-09-14T00:00:00Z',
        },
      }),
      { status: 201 },
    )
  }),

  // 관리자 — 인스턴스 변경 — 수정된 행 1건 반환
  http.patch(`${BASE}/api/v1/core/admin/managed-instances/:instanceId`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>
    const matched = fixtures.managedInstances.responses.find(
      (row) => row.instanceId === params.instanceId,
    )
    if (!matched) return fail('MANAGED_INSTANCE_NOT_FOUND', 404)
    Object.assign(matched, body)
    return HttpResponse.json(ok({ response: matched }))
  }),

  // 관리자 — 인스턴스 접속 테스트 — 실패도 200 계약(개별 테스트가 덧씌운다)
  http.post(`${BASE}/api/v1/core/admin/managed-instances/:instanceId/test`, () =>
    HttpResponse.json(
      ok({ response: { connected: true, latencyMs: 41, message: null } }),
    ),
  ),

  // 관리자 — 인스턴스 삭제 — 성공 204 (발급 존재 시 409는 개별 테스트가 덧씌운다)
  http.delete(`${BASE}/api/v1/core/admin/managed-instances/:instanceId`, () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // 사용자 — 발급 목록 + 한도 요약
  http.get(`${BASE}/api/v1/core/workspaces/:workspaceId/managed-databases`, () =>
    HttpResponse.json(ok(fixtures.managedDatabases)),
  ),

  // 사용자 — 발급 — 201 + 발급 상세(스키마·자동 등록 커넥션)
  http.post(`${BASE}/api/v1/core/workspaces/:workspaceId/managed-databases`, async ({ request }) => {
    const body = (request.headers.get('content-length') !== '0'
      ? ((await request.json().catch(() => ({}))) as { instanceId?: string })
      : {}) as { instanceId?: string }
    if (body.instanceId && body.instanceId !== '401') {
      return fail('MANAGED_INSTANCE_NOT_FOUND', 404)
    }
    return HttpResponse.json(
      ok({
        response: {
          databaseId: '32',
          instanceId: '401',
          instanceDisplayName: 'Academy PG',
          schemaName: 'cf_u2_d2',
          workspaceId: '101',
          connectionId: '303',
          connectionName: 'Academy PG #2',
          createdBy: { userId: '2', name: '부트스트랩 관리자' },
          createdAt: '2026-09-14T00:00:00Z',
        },
      }),
      { status: 201 },
    )
  }),

  // 사용자 — 철회 — 성공 204
  http.delete(`${BASE}/api/v1/core/workspaces/:workspaceId/managed-databases/:databaseId`, () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // 사용자 — 발급 접속 정보(본인 발급만) — 발급 31(Academy PG)에 대한 PG 매핑 자격.
  // 자격은 전용 계정(계정명 = 스키마명)이다 — 인스턴스 루트 자격은 노출되지 않는다.
  // host는 노출 주소(publicHost ?? host)다 — 인스턴스 401의 publicHost가 내려간다
  http.get(
    `${BASE}/api/v1/core/workspaces/:workspaceId/managed-databases/:databaseId/credential`,
    ({ params }) => {
      if (params.databaseId !== '31') {
        return fail('MANAGED_DATABASE_NOT_FOUND', 404)
      }
      return HttpResponse.json(
        ok({
          response: {
            databaseId: '31',
            instanceDisplayName: 'Academy PG',
            dbmsType: 'postgresql',
            host: 'db.crowfoot.java21.net',
            port: 8000,
            databaseName: 'crowfoot',
            schemaName: 'cf_u2_d1',
            username: 'cf_u2_d1',
            password: 'Xk9!vQ2mZR7#pLw4nTaE',
          },
        }),
      )
    },
  ),

  /* ---------- 커뮤니티 (08-core/08-community.md) ---------- */

  // 게시글 목록 — board 필수 필터 + keyword(제목 대소문자 무시) + 오프셋 페이징
  http.get(`${BASE}/api/v1/core/community/posts`, ({ request }) => {
    const url = new URL(request.url)
    const board = url.searchParams.get('board')
    const keyword = (url.searchParams.get('keyword') ?? '').trim().toLowerCase()
    if (board !== 'RELEASE_NOTE' && board !== 'FEEDBACK') {
      return fail('INVALID_REQUEST', 400)
    }
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size') ?? '20') || 20))

    const filtered = fixtures.communityPosts.responses
      .filter((post) => post.board === board)
      .filter((post) => keyword === '' || post.title.toLowerCase().includes(keyword))
    const start = (page - 1) * size
    const sliced = filtered.slice(start, start + size)

    return HttpResponse.json(
      ok({
        responses: sliced,
        totalCount: filtered.length,
        page,
        size,
        totalPages: Math.max(1, Math.ceil(filtered.length / size)),
      }),
    )
  }),

  // 통합 최근글 — 대시보드 위젯(게시판 무관 id desc). /posts/:postId보다 먼저 등록
  http.get(`${BASE}/api/v1/core/community/posts/recent`, ({ request }) => {
    const url = new URL(request.url)
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') ?? '5') || 5))
    return HttpResponse.json(
      ok({
        responses: fixtures.recentCommunityPosts.responses.slice(0, limit),
        totalCount: Math.min(fixtures.recentCommunityPosts.responses.length, limit),
      }),
    )
  }),

  // 공개 최근 릴리스 노트 — 무인증(랜딩 위젯). RELEASE_NOTE만, DB 단계 필터 계약 반영
  http.get(`${BASE}/api/v1/core/community/release-notes/recent`, ({ request }) => {
    const url = new URL(request.url)
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') ?? '5') || 5))
    const releaseNotes = fixtures.communityPosts.responses
      .filter((post) => post.board === 'RELEASE_NOTE')
      .map(({ postId, board, title, author, commentCount, createdAt }) => ({
        postId,
        board,
        title,
        author,
        commentCount,
        createdAt,
      }))
    return HttpResponse.json(
      ok({
        responses: releaseNotes.slice(0, limit),
        totalCount: Math.min(releaseNotes.length, limit),
      }),
    )
  }),

  // 공개 릴리스 노트 상세 — 무인증. RELEASE_NOTE가 아니면(802 등) 존재 은닉 404
  http.get(`${BASE}/api/v1/core/community/release-notes/:postId`, ({ params }) => {
    const summary = fixtures.communityPosts.responses.find(
      (post) => post.board === 'RELEASE_NOTE' && post.postId === params.postId,
    )
    if (!summary) return fail('COMMUNITY_POST_NOT_FOUND', 404)
    return HttpResponse.json(
      ok({
        response: {
          postId: summary.postId,
          board: summary.board,
          title: summary.title,
          content:
            '# 개요\n\n이번 릴리스의 주요 변경 사항입니다.\n\n| 항목 | 내용 |\n| --- | --- |\n| 기능 | 커뮤니티 |\n\n- 릴리스 노트는 관리자가 작성합니다',
          author: summary.author,
          createdAt: summary.createdAt,
          updatedAt: summary.updatedAt,
        },
      }),
    )
  }),

  // 게시글 상세 — content(마크다운) 포함. 999는 존재하지 않는 글(404 계약)
  http.get(`${BASE}/api/v1/core/community/posts/:postId`, ({ params }) => {
    const summary = fixtures.communityPosts.responses.find((post) => post.postId === params.postId)
    if (!summary) return fail('COMMUNITY_POST_NOT_FOUND', 404)
    return HttpResponse.json(
      ok({
        response: {
          postId: summary.postId,
          board: summary.board,
          title: summary.title,
          content:
            summary.postId === '802'
              ? '## 제안 배경\n\nERD 내보내기에 **PostgreSQL** 포맷이 필요합니다.\n\n- 현재 MySQL만 지원\n- 스키마 검증 통과'
              : '# 개요\n\n이번 릴리스의 주요 변경 사항입니다.\n\n| 항목 | 내용 |\n| --- | --- |\n| 기능 | 커뮤니티 |\n\n- 릴리스 노트는 관리자가 작성합니다',
          author: summary.author,
          createdAt: summary.createdAt,
          updatedAt: summary.updatedAt,
        },
      }),
    )
  }),

  // 게시글 생성 — 201 + Location(외부 URI) + 상세 본문
  http.post(`${BASE}/api/v1/core/community/posts`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      board?: string
      title?: string
      content?: string
    }
    if (body.board !== 'RELEASE_NOTE' && body.board !== 'FEEDBACK') {
      return fail('INVALID_REQUEST', 400)
    }
    if (!body.title?.trim() || !body.content?.trim()) {
      return fail('VALIDATION_ERROR', 400, [{ field: 'title', code: 'NotBlank', message: 'must not be blank' }])
    }
    const postId = String(1000 + fixtures.communityPosts.responses.length)
    return HttpResponse.json(
      ok({
        response: {
          postId,
          board: body.board,
          title: body.title,
          content: body.content,
          author: { userId: '2', name: '부트스트랩 관리자' },
          createdAt: '2026-09-17T00:00:00Z',
          updatedAt: '2026-09-17T00:00:00Z',
        },
      }),
      { status: 201, headers: { Location: `/api/v1/core/community/posts/${postId}` } },
    )
  }),

  // 게시글 수정 — board는 변경 불가(계약상 title·content만 수용)
  http.patch(`${BASE}/api/v1/core/community/posts/:postId`, async ({ request, params }) => {
    const summary = fixtures.communityPosts.responses.find((post) => post.postId === params.postId)
    if (!summary) return fail('COMMUNITY_POST_NOT_FOUND', 404)
    const body = (await request.json().catch(() => ({}))) as { title?: string; content?: string }
    if (!body.title?.trim() || !body.content?.trim()) {
      return fail('VALIDATION_ERROR', 400, [{ field: 'title', code: 'NotBlank', message: 'must not be blank' }])
    }
    return HttpResponse.json(
      ok({
        response: {
          postId: summary.postId,
          board: summary.board,
          title: body.title,
          content: body.content,
          author: summary.author,
          createdAt: summary.createdAt,
          updatedAt: '2026-09-17T01:00:00Z',
        },
      }),
    )
  }),

  // 게시글 삭제 — 204
  http.delete(`${BASE}/api/v1/core/community/posts/:postId`, () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // 코멘트 목록 — 오래된 순. RELEASE_NOTE 글도 빈 목록(계약: 조회는 허용, 작성만 제한)
  http.get(`${BASE}/api/v1/core/community/posts/:postId/comments`, ({ params }) => {
    const comments = fixtures.communityComments.responses.filter(
      (comment) => comment.postId === params.postId,
    )
    return HttpResponse.json(ok({ responses: comments, totalCount: comments.length }))
  }),

  // 코멘트 작성 — FEEDBACK 글만 허용(계약: RELEASE_NOTE는 400 COMMENT_NOT_ALLOWED). 201 + Location
  http.post(`${BASE}/api/v1/core/community/posts/:postId/comments`, async ({ request, params }) => {
    const post = fixtures.communityPosts.responses.find((item) => item.postId === params.postId)
    if (!post) return fail('COMMUNITY_POST_NOT_FOUND', 404)
    if (post.board !== 'FEEDBACK') return fail('COMMUNITY_COMMENT_NOT_ALLOWED', 400)
    const body = (await request.json().catch(() => ({}))) as { content?: string }
    if (!body.content?.trim()) {
      return fail('VALIDATION_ERROR', 400, [{ field: 'content', code: 'NotBlank', message: 'must not be blank' }])
    }
    return HttpResponse.json(
      ok({
        response: {
          commentId: '900',
          postId: post.postId,
          content: body.content,
          author: { userId: '2', name: '부트스트랩 관리자' },
          createdAt: '2026-09-17T02:00:00Z',
          updatedAt: '2026-09-17T02:00:00Z',
        },
      }),
      { status: 201, headers: { Location: '/api/v1/core/community/comments/900' } },
    )
  }),

  // 코멘트 수정 — 작성자·관리자(권한은 서버 계약, 목업은 소유 여부만 반영)
  http.patch(`${BASE}/api/v1/core/community/comments/:commentId`, async ({ request, params }) => {
    const comment = fixtures.communityComments.responses.find(
      (item) => item.commentId === params.commentId,
    )
    if (!comment) return fail('COMMUNITY_COMMENT_NOT_FOUND', 404)
    const body = (await request.json().catch(() => ({}))) as { content?: string }
    if (!body.content?.trim()) {
      return fail('VALIDATION_ERROR', 400, [{ field: 'content', code: 'NotBlank', message: 'must not be blank' }])
    }
    return HttpResponse.json(
      ok({
        response: {
          commentId: comment.commentId,
          postId: comment.postId,
          content: body.content,
          author: comment.author,
          createdAt: comment.createdAt,
          updatedAt: '2026-09-17T03:00:00Z',
        },
      }),
    )
  }),

  // 코멘트 삭제 — 204
  http.delete(`${BASE}/api/v1/core/community/comments/:commentId`, () =>
    new HttpResponse(null, { status: 204 }),
  ),
]
