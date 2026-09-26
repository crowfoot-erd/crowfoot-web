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
  /** 계정 단위 UI 언어(ko/en/ja/zh) — 최초 로그인 null(브라우저 감지 따름), 메뉴에서 변경하면 저장된다 */
  locale?: string | null
  /** 제공자 프로필 사진 — GitHub 계정만 도출되는 URL, 그 외 null(이니셜 폴백) */
  avatarUrl?: string | null
  /** GitHub 핸들(login) — 로그인 시 저장된 값. Google 계정은 null(@표시 생략) */
  githubLogin?: string | null
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
  /** 리버스 엔지니어링 원천 커넥션 — 직접 생성 문서는 null (DB 동기화 버튼 노출 근거) */
  sourceConnectionId: string | null
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

/** 공유 갤러리 항목 (08-core/02-model.md §1.10.5) — 랜딩 페이지가 현재 공유 중인 문서를 나열.
 *  전 워크스페이스 공유(템플릿 문서 포함). 순서 = 조회수 상위 3(인기) 우선 + 나머지 최근 공유순,
 *  최대 21건 — 선두 3건이 랜딩 인기 박스 구간. 본문(content) 없음 */
export interface SharedGalleryItem {
  shareToken: string
  modelName: string
  description: string | null
  databaseType: string
  updatedAt: string
  sharedAt: string
  /** 공개 조회 수 — 카드에 인기 표기(정렬은 서버가 이미 마쳤다) */
  viewCount: number
}

/* ---------- 템플릿 (08-core/09-templates.md) ---------- */

/** 템플릿 공개 목록 항목 (§2.1) — 템플릿 워크스페이스 문서의 메타. 본문(content) 없음.
 *  shareToken은 그 문서의 활성 공유 링크 최근 1건 — 없으면(null) 카드에 미리보기가 없다 */
export interface TemplateSummary {
  modelId: string
  name: string
  description: string | null
  databaseType: string
  tableCount: number
  relationshipCount: number
  shareToken: string | null
  updatedAt: string
}

/* ---------- 문서 버전 기록 (08-core/02-model.md §1.11) ---------- */

/** 변경 요약 items형 — 웹 doc-diff 계약의 구조 diff (kind·action은 렌더 i18n 키로 쓰인다) */
export interface ChangeSummaryItems {
  items: { kind: string; action: string; table: string; name: string; detail: string }[]
  /** model 변경 없이 diagram(노트·레이아웃·뷰포트)만 바뀐 저장 */
  layoutOnly: boolean
  truncated: boolean
}

/** 변경 요약 특수형 — 리버스 엔지니어링·SQL Import·템플릿 복제 생성 직후 (서버가 기록).
 *  source는 SQL Import('sql')와 템플릿 복제('template')가 심는다 — 렌더 문구 분기용,
 *  리버스는 미전송(기존 호환) */
export interface ChangeSummaryCreated {
  created: true
  source?: 'sql' | 'template'
  tables: number
  relationships: number
}

/** 변경 요약 특수형 — 과거 버전 복원 (서버가 기록) */
export interface ChangeSummaryRestored {
  restoredFrom: number
}

export type ChangeSummary = ChangeSummaryItems | ChangeSummaryCreated | ChangeSummaryRestored

/** 버전 기록 목록 행 — content 제외. memo는 사용자 자유 메모, null이면 자동 요약을 렌더한다 */
export interface ModelVersionEntry {
  version: number
  /** 자동 변경 요약 JSON 원문 — null은 요약 없는 저장(직접 생성 v0) */
  changeSummary: string | null
  memo: string | null
  createdBy: { userId: string; name: string } | null
  createdAt: string
}

/** 버전 기록 상세 — 해당 시점 문서 전문 포함 (버전 뷰어가 연다) */
export interface ModelVersionDetail extends ModelVersionEntry {
  content: string
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

/** 워크스페이스 사전 항목 (08-core/01-workspace.md §4) — 논리명 자동 추론의 워크스페이스 사전 */
export interface WorkspaceTerm {
  termId: string
  workspaceId: string
  /** 물리명 토큰 — 서버가 trim+소문자로 정규화한 값 */
  term: string
  /** 논리명 라벨 — 추론 결과에 그대로 쓰이는 표기(한글 등) */
  label: string
  /** DBMS 종류별 데이터 타입 맵(키 = database_types 코드, 예: {mysql: "VARCHAR(100)"}) —
   *  선택(설정 안 하면 null). 표시는 문서의 DB 종류에 맞는 값을 고른다 */
  types: Record<string, string> | null
  updatedAt: string
}

/** 시스템 사전 항목 (08-core/01-workspace.md §4.5) — 관리자가 등록하는 전역 사전(읽기 전용).
 *  labels는 언어→라벨 맵 전체 — 어떤 언어를 보여줄지는 클라이언트가 정한다(resolveLabel 폴백) */
export interface SystemTerm {
  termId: string
  term: string
  labels: Record<string, string>
  /** DBMS 종류별 데이터 타입 맵(키 = database_types 코드) — 선택. 표시는 문서의 DB 종류 값 */
  types: Record<string, string> | null
  updatedAt: string
}

/** 리버스 엔지니어링 응답 — 생성된 문서 + 가져오기 요약 */
export interface ReverseEngineeringResult {
  model: Model
  tableCount: number
  relationshipCount: number
  skipped: string[]
}

/* ---------- SQL Import (08-core/02-model.md §1.12 — DDL 텍스트 → 문서) ---------- */

/** SQL Import 미리보기 — 테이블별 요약 1건 */
export interface SqlImportPreviewTable {
  name: string
  comment: string | null
  columnCount: number
  primaryKeyColumns: string[]
  foreignKeyCount: number
}

/** SQL Import 미리보기 응답 — 저장 없이 파싱·조립까지만. 개수는 생성과 같은 경로라 그대로 믿으면 된다 */
export interface SqlImportPreviewResult {
  databaseType: string
  tableCount: number
  relationshipCount: number
  tables: SqlImportPreviewTable[]
  /** 읽지 못한 문장·제약 요약(CREATE INDEX·VIEW…) — 문서 생성은 가능한 만큼 진행된다 */
  skipped: string[]
}

/** SQL Import 생성 응답 — 리버스와 같은 뼈대. 커넥션 원천이 없어 DB 동기화 대상이 아니다 */
export interface SqlImportResult {
  model: Model
  tableCount: number
  relationshipCount: number
  skipped: string[]
}

/** 스키마 조회 응답 — 리버스와 같은 규칙으로 조립된 content만 내린다(문서 생성 없음).
 *  비교·병합은 에디터가 담당한다(sync-merge). */
export interface ConnectionSchema {
  content: string
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

/* ---------- 커뮤니티 (08-core/08-community.md) ---------- */

/** 게시판 종류 — RELEASE_NOTE(릴리스 노트, 관리자 전용 쓰기)·FEEDBACK(제안 및 신고) */
export type CommunityBoard = 'RELEASE_NOTE' | 'FEEDBACK'

/** 게시글 요약(목록) — content 제외 */
export interface CommunityPostSummary {
  postId: string
  board: CommunityBoard
  title: string
  /** 본문이 작성된 언어 코드 목록(내림차순 우선순위 없음) — 폴백 배지·언어 전환기 근거 */
  availableLangs?: string[]
  author: UserRef
  commentCount: number
  createdAt: string
  updatedAt: string
}

/** 게시글 상세 — 마크다운 원문 포함 */
export interface CommunityPostDetail {
  postId: string
  board: CommunityBoard
  title: string
  content: string
  /** 본문이 작성된 언어 코드 목록 — 폴백 배지·언어 전환기 근거 (§2.1) */
  availableLangs?: string[]
  author: UserRef
  createdAt: string
  updatedAt: string
}

/** 최근글(대시보드 통합 위젯) */
export interface CommunityRecentPost {
  postId: string
  board: CommunityBoard
  title: string
  availableLangs?: string[]
  author: UserRef
  commentCount: number
  createdAt: string
}

/** 코멘트 — FEEDBACK 게시글 전용, plain text */
export interface CommunityComment {
  commentId: string
  postId: string
  content: string
  author: UserRef
  createdAt: string
  updatedAt: string
}

