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

/** 모델 요약 — 목록 (content 제외) */
export interface ModelSummary {
  modelId: string
  workspaceId: string
  name: string
  description: string | null
  databaseType: string
  canvasWidth: number
  canvasHeight: number
  version: number
  createdBy: { userId: string; name: string } | null
  createdAt: string
  updatedAt: string
}

/** 모델 전체 — 생성·상세 응답 (content 포함) */
export interface Model extends ModelSummary {
  content: string
}
