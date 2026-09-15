/**
 * 공통 응답 포맷·API 타입 (01-architecture/api-design.md Section 5~6, 08-core/00-overview.md Section 3)
 *
 * 성공: { header: { isSuccessful, resultCode, resultMessage }, response | responses, totalCount, ... }
 * 실패: header.isSuccessful=false + resultCode (response 필드 생략) + errors?(필드 수준)
 */

export interface ResponseHeader {
  isSuccessful: boolean
  resultCode: string
  resultMessage: string
}

/** 필드 수준 오류 (400·422 등에서만) */
export interface FieldError {
  field: string
  code: string
  message: string
}

export interface ApiEnvelope {
  header: ResponseHeader
  response?: unknown
  responses?: unknown[]
  totalCount?: number
  page?: number
  size?: number
  totalPages?: number
  errors?: FieldError[]
}

/** 오프셋 페이징 목록 (page 1부터) */
export interface PageResult<T> {
  items: T[]
  totalCount: number
  page: number
  size: number
  totalPages: number
}

/** 페이징 없는 목록 */
export interface ListResult<T> {
  items: T[]
  totalCount: number
}

/** 페이징 요청 파라미터 (공통 — page 1부터, size 최대 100) */
export interface OffsetPagingParams {
  page?: number
  size?: number
}

/* ---------- 도메인 타입 (1단계 API 계약) ---------- */

export type WorkspaceRole = 'OWNER' | 'EDITOR' | 'COMMENTER' | 'VIEWER'
export type TeamRole = 'OWNER' | 'MEMBER'
export type GranteeType = 'USER' | 'TEAM'

export interface Me {
  userId: string
  email: string
  name: string
  providers: string[]
  admin: boolean
  createdAt: string
}

/** 사용자 요약 (grantedBy·addedBy·createdBy 등) */
export interface UserRef {
  userId: string
  name: string
}

export interface MyWorkspace {
  workspaceId: string
  name: string
  description: string | null
  isDefault: boolean
  /** 유효 역할 — 개인 직접 부여 + 소속 팀 부여의 max (08-core/03-membership.md) */
  myRole: WorkspaceRole
  memberCount: number
}

export interface Workspace {
  workspaceId: string
  name: string
  description: string | null
  isDefault: boolean
  memberCount: number
  createdBy: UserRef
  createdAt: string
}

export interface Team {
  teamId: string
  name: string
  description: string | null
  isOwner: boolean
  ownerUserId: string
  memberCount: number
  createdAt: string
}

export interface TeamDetail extends Team {
  myRole: TeamRole
}

export interface TeamMember {
  userId: string
  name: string
  email: string
  teamRole: TeamRole
  addedBy: UserRef | null
  addedAt: string
}

export interface Membership {
  membershipId: string
  granteeType: GranteeType
  user: { userId: string; name: string; email: string } | null
  team: { teamId: string; name: string; memberCount: number } | null
  role: WorkspaceRole
  grantedBy: UserRef | null
  grantedAt: string
}

/** 부여 후보 검색 결과 (멤버십·팀 공통) */
export interface MemberCandidate {
  userId: string
  name: string
  email: string
}

export interface Provider {
  code: string
  displayName: string
}

export interface AdminDatabaseType {
  code: string
  displayName: string
  isActive: boolean
}

export interface AdminProvider extends Provider {
  isActive: boolean
}

export interface AdminRole {
  code: string
  displayName: string
}

/** 제공자 연동 — providerUserId는 GitHub 숫자 ID 등 제공자 관점 식별자 (08-core/05 §2.1) */
export interface AdminIdentity {
  provider: string
  providerUserId: string
}

export interface AdminUser {
  userId: string
  /** 제공자가 이메일을 내려주지 않은 경우 null(GitHub 기본 scope) — 화면은 "—" 표시 */
  email: string | null
  name: string
  identities: AdminIdentity[]
  admin: boolean
  withdrawnAt: string | null
  createdAt: string
}

/** 감사 로그 행 (08-core/05 §2.7) — actorUserId null은 시스템 행, detail은 파싱된 객체 */
export interface AdminAuditLog {
  id: string
  createdAt: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  action: string
  targetType: string
  targetId: string
  detail: Record<string, unknown> | null
  ip: string | null
}

export interface AdminSession {
  sid: string
  createdAt: string
  lastUsedAt: string
  ip: string
  userAgent: string
}

/* ---------- ERD 문서 (08-core/02-model.md) ---------- */

export interface DatabaseType {
  code: string
  displayName: string
}

/** 모델 요약 — 목록 (content 제외) — 캔버스 크기는 폐지(#123) */
export interface ModelSummary {
  modelId: string
  workspaceId: string
  name: string
  description: string | null
  databaseType: string
  version: number
  createdBy: { userId: string; name: string } | null
  createdAt: string
  updatedAt: string
}

/** 모델 전체 — 생성·상세 응답 (content 포함) */
export interface Model extends ModelSummary {
  content: string
}

/* ---------- 문서 공유 링크 (08-core/02-model.md §1.10) ---------- */

/** 공유 링크 — 발급자에게만 보이는 관리 정보. startsAt·endsAt 없음(null)은 각각 즉시·무제한 */
export interface ModelShare {
  shareId: string
  shareToken: string
  startsAt: string | null
  endsAt: string | null
  createdAt: string
}

/** 공유 문서 공개 조회 — 토큰을 아는 누구나 (인증 없음) */
export interface PublicShare {
  modelName: string
  description: string | null
  databaseType: string
  version: number
  content: string
  startsAt: string | null
  endsAt: string | null
}

/** 공유 갤러리 항목 (08-core/02-model.md §1.10.5) — 랜딩 페이지가 현재 공유 중인 문서를 나열. 본문(content) 없음 */
export interface SharedGalleryItem {
  shareToken: string
  modelName: string
  description: string | null
  databaseType: string
  updatedAt: string
  sharedAt: string
}

/* ---------- DB 커넥션 (08-core/06-connection.md) ---------- */

/** 커넥션 — 비밀번호는 응답에 내려오지 않는다 */
export interface DbConnection {
  connectionId: string
  workspaceId: string
  name: string
  dbmsType: string
  host: string
  port: number
  databaseName: string
  /** PostgreSQL 커넥션의 대상 스키마 — null이면 기본 스키마(search_path) */
  schemaName?: string | null
  username: string
  createdBy: { userId: string; name: string } | null
  createdAt: string
}

/** 접속 테스트 응답 — 실패도 200 계약(connected:false + 분류 문구) */
export interface ConnectionTestResult {
  connected: boolean
  latencyMs: number | null
  message: string | null
}

/** 리버스 엔지니어링 응답 — 생성된 문서 + 가져오기 요약 */
export interface ReverseEngineeringResult {
  model: Model
  tableCount: number
  relationshipCount: number
  skipped: string[]
}

/** 매니지드 루트 인스턴스 — 관리자 등록 root 커넥션 (08-core/07). password는 어떤 형태로도 내려오지 않는다.
 *  databaseName은 생략 가능 — PostgreSQL은 username database 폴백, MySQL은 발급 시 database 생성 */
export interface ManagedInstance {
  instanceId: string
  displayName: string
  dbmsType: string
  host: string
  /** 사용자 노출 주소(선택) — null이면 host를 그대로 노출. 표기 전용이라 접속 검증 대상이 아니다 */
  publicHost: string | null
  port: number
  databaseName: string | null
  username: string
  isActive: boolean
  issuedCount: number
  createdBy: { userId: string; name: string } | null
  createdAt: string
}

/** 매니지드 발급 — 1행 = 발급 스키마 + 자동 생성 커넥션 대응 */
export interface ManagedDatabase {
  databaseId: string
  instanceId: string
  instanceDisplayName: string | null
  schemaName: string
  workspaceId: string
  connectionId: string
  connectionName: string | null
  createdBy: { userId: string; name: string } | null
  createdAt: string
}

/** 발급 접속 정보 — 본인 발급의 접속 주소·계정·비밀번호. 요청 시마다 복호화해 내려온다(유일한 비밀번호 노출 경로) */
export interface ManagedCredential {
  databaseId: string
  instanceDisplayName: string
  dbmsType: string
  host: string
  port: number
  databaseName: string
  /** PostgreSQL은 발급 스키마, MySQL은 database = schema라 null */
  schemaName: string | null
  username: string
  password: string
}

/** 발급 한도 — 관리자가 지정(기본 5). 워크스페이스 내 사용자당(모든 인스턴스 합산) 기준 */
export interface ManagedIssueLimit {
  limit: number
}

/** 인스턴스별 발급 한도 요약 — limit은 서비스 고정(워크스페이스 내 사용자당 5),
 *  used는 이 워크스페이스에서 요청자가 받은 발급 수(모든 인스턴스 합산) */
export interface ManagedLimitSummary {
  instanceId: string
  displayName: string
  isActive: boolean
  limit: number
  used: number
  remaining: number
}

/** 발급 목록 응답 — 목록 본문에 이어 한도 요약이 실린다 */
export interface ManagedDatabaseListResult {
  items: ManagedDatabase[]
  totalCount: number
  limitSummary: ManagedLimitSummary[]
}

