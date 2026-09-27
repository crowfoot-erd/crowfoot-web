/**
 * ERD 문서 API (08-core/02-model.md) — 목록·상세·생성·데이터베이스 종류 코드.
 * content 저장은 에디터 단계(2.x)에서 추가한다.
 */
import { apiDelete, apiDeleteWithBody, apiGet, apiGetList, apiGetPage, apiPatch, apiPost, apiPut } from '@/api/client'
import type {
  DatabaseType,
  ListResult,
  Model,
  ModelSummary,
  ModelShare,
  ModelVersionDetail,
  ModelVersionEntry,
  MyShareComment,
  MyShareReaction,
  OffsetPagingParams,
  PageResult,
  PublicShare,
  ShareComment,
  ShareFeedback,
  ShareReaction,
  SharedGalleryItem,
  SqlImportPreviewResult,
  SqlImportResult,
  TemplateSummary,
} from '@/api/types'

export type FetchModelsParams = {
  keyword?: string
  page?: number
  size?: number
}

/** 모델 목록(요약) — keyword는 이름·설명 부분 일치 */
export function fetchModels(workspaceId: string, params: FetchModelsParams = {}, signal?: AbortSignal): Promise<ListResult<ModelSummary>> {
  return apiGetList<ModelSummary>(`/api/v1/core/workspaces/${workspaceId}/models`, params, signal)
}

/** 모델 상세(1.3) — content를 통째로 내려받는다 */
export function fetchModel(workspaceId: string, modelId: string, signal?: AbortSignal): Promise<Model | undefined> {
  return apiGet<Model>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}`, undefined, signal)
}

/** 문서 열기 — 새 창 전체 화면 라우트 (window.open 대상) */
export function modelEditorPath(workspaceId: string, modelId: string): string {
  return `/workspaces/${workspaceId}/models/${modelId}`
}

/** 버전 뷰어 — 해당 시점 문서를 읽기 전용으로 여는 라우트 (버전 기록 다이얼로그 조회 링크) */
export function modelVersionPath(workspaceId: string, modelId: string, version: number): string {
  return `/workspaces/${workspaceId}/models/${modelId}/history/${version}`
}

export interface CreateModelInput {
  name: string
  description?: string
  databaseType: string
}

export function createModel(workspaceId: string, body: CreateModelInput) {
  return apiPost<Model>(`/api/v1/core/workspaces/${workspaceId}/models`, body)
}

/* ---------- SQL Import (08-core/02-model.md §1.12 — DDL 텍스트 → 문서) ---------- */

export interface SqlImportInput {
  name?: string
  description?: string
  databaseType: string
  /** DDL 원문 — 상한 1MB(서버 @Size). CREATE TABLE 0개면 400 */
  ddl: string
}

/** 미리보기 — 저장 없이 파싱·조립 결과만 (Editor 이상) */
export function sqlImportPreview(workspaceId: string, body: Omit<SqlImportInput, 'name' | 'description'>) {
  return apiPost<SqlImportPreviewResult>(
    `/api/v1/core/workspaces/${workspaceId}/models/sql-import/preview`,
    body,
  )
}

/** 생성 — DDL로 신규 문서를 만들고 저장한다 (Editor 이상) */
export function sqlImport(workspaceId: string, body: SqlImportInput) {
  return apiPost<SqlImportResult>(`/api/v1/core/workspaces/${workspaceId}/models/sql-import`, body)
}

/** 메타 변경 — 이름·설명만, 변경분만 전송 (description: null은 명시적 클리어) */
export function updateModel(
  workspaceId: string,
  modelId: string,
  body: Partial<Pick<ModelSummary, 'name' | 'description'>>,
) {
  return apiPatch<ModelSummary>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}`, body)
}

/** 삭제 — Owner 전용, 204 */
export function deleteModel(workspaceId: string, modelId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}`)
}

/** 데이터베이스 종류 코드(활성만) — 생성 다이얼로그 드롭다운 */
export function fetchDatabaseTypes(signal?: AbortSignal): Promise<ListResult<DatabaseType>> {
  return apiGetList<DatabaseType>('/api/v1/core/database-types', undefined, signal)
}

/* ---------- 문서 공유 링크 (08-core/02-model.md §1.10) ---------- */

/** 공유 링크 발급 본문 — 각 필드 생략(null)은 시작일 즉시·종료일 무제한 */
export interface CreateShareInput {
  startsAt?: string | null
  endsAt?: string | null
}

/** 링크 발급 — Editor 이상. 응답 토큰으로 공개 주소(/share/{token})를 만든다 */
export function createModelShare(workspaceId: string, modelId: string, body: CreateShareInput) {
  return apiPost<ModelShare>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}/shares`, body)
}

/** 링크 목록 — Editor 이상, 최근 발급순 */
export function fetchModelShares(workspaceId: string, modelId: string, signal?: AbortSignal) {
  return apiGetList<ModelShare>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}/shares`, undefined, signal)
}

/** 링크 철회 — 즉시 무효화, 204 */
export function revokeModelShare(workspaceId: string, modelId: string, shareId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}/shares/${shareId}`)
}

/** 검증 실행 기록 본문 — 에디터 린터가 계산한 등급별 건수(서버는 재계산하지 않는다) */
export interface ValidationRunInput {
  errorCount: number
  warningCount: number
  infoCount: number
}

/** 검증 실행 기록(§1.13) — Editor 이상, 감사 MODEL_VALIDATED만 남긴다. 204 본문 없음.
 *  패널을 열 때 1회 전송한다(디바운스 재계산마다 보내지 않는다) */
export function recordValidationRun(workspaceId: string, modelId: string, body: ValidationRunInput) {
  return apiPost<void>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}/validation-runs`, body)
}

/** 공유 문서 공개 조회 — 인증 없이 토큰으로만 (게이트웨이 화이트리스트 경로) */
export function fetchSharedDocument(token: string, signal?: AbortSignal) {
  return apiGet<PublicShare>(`/api/v1/core/shares/${token}`, undefined, signal)
}

/** 공유 갤러리 목록 — 인증 없이(게이트웨이 화이트리스트), 랜딩 페이지가 현재 공유 중인 문서를 나열 */
export function fetchSharedGallery(signal?: AbortSignal) {
  return apiGetList<SharedGalleryItem>('/api/v1/core/shares', undefined, signal)
}

/* ---------- 공유 문서 피드백 (08-core/02-model.md §1.10.6·§1.10.7 — 선택 인증) ---------- */

/** 피드백 응답 정규화 — 서버는 Jackson NON_NULL 직렬화라 최상위 댓글에서 parentCommentId
 *  필드를 아예 생략한다(런타임 undefined). 섹션은 `=== null` 엄격 비교로 원댓글을 가려내므로
 *  경계에서 null을 채워 넣는다(토큰·멤버 두 경로가 같은 응답 형태를 쓴다).
 *  apiGet은 204 대비 undefined를 돌려줄 수 있어 그대로 흘려보낸다 */
function normalizeFeedback(feedback: ShareFeedback | undefined): ShareFeedback | undefined {
  if (!feedback) return feedback
  return {
    ...feedback,
    comments: feedback.comments.map((comment) => ({ ...comment, parentCommentId: comment.parentCommentId ?? null })),
  }
}

/** 피드백 초기화 — 반응 상태 + 댓글 목록 1회 fetch. 선택 인증 경로: Bearer 토큰이 있으면
 *  게이트웨이가 검증해 회원 신원으로(reacted가 그 기준), 없으면 비회원으로 내려준다 */
export function fetchShareFeedback(token: string, signal?: AbortSignal) {
  return apiGet<ShareFeedback>(`/api/v1/core/shares/${token}/comments`, undefined, signal).then(normalizeFeedback)
}

/** 반응(좋아요) 토글 — 회원전용. 본문 없는 POST 한 번으로 추가/제거.
 *  비회원(토큰 없음)은 게이트웨이가 401로 거부한다 — UI는 로그인 안내로 받는다 */
export function toggleShareReaction(token: string) {
  return apiPost<ShareReaction>(`/api/v1/core/shares/${token}/reactions`, undefined)
}

/** 댓글 등록 본문 — 회원은 content만(별명·비밀번호는 서버가 무시), 비회원은 별명·비밀번호 필수.
 *  상한은 서버 @Size와 같다(별명 30 · 비밀번호 4~100 · 내용 1000) */
export interface CreateShareCommentInput {
  nickname?: string
  password?: string
  content: string
}

/** 댓글 등록 (선택 인증 — Bearer 유무로 회원/비회원 모드가 갈린다) */
export function createShareComment(token: string, body: CreateShareCommentInput) {
  return apiPost<ShareComment>(`/api/v1/core/shares/${token}/comments`, body)
}

/** 댓글 수정 본문 — 비회원 댓글은 비밀번호, 회원 댓글은 계정 판정이라 password 없이 */
export interface UpdateShareCommentInput {
  content: string
  password?: string
}

/** 댓글 수정 (선택 인증) — 본문만 고치고 응답은 edited=true */
export function updateShareComment(token: string, commentId: string, body: UpdateShareCommentInput) {
  return apiPut<ShareComment>(`/api/v1/core/shares/${token}/comments/${commentId}`, body)
}

/** 댓글 삭제 (선택 인증) — 비회원 댓글은 비밀번호 몸통, 회원 댓글은 계정 판정.
 *  비밀번호는 쿼리가 아니라 몸통으로 보낸다(액세스 로그 노출 방지) */
export function deleteShareComment(token: string, commentId: string, password?: string) {
  return apiDeleteWithBody<void>(
    `/api/v1/core/shares/${token}/comments/${commentId}`,
    password !== undefined ? { password } : undefined,
  )
}

/* ---------- 멤버 문서 피드백 (08-core/02-model.md §1.10.6·§1.10.7 — 인증, 문서 열기 댓글 탭) ----------
 * 공유 링크가 없어도 문서 스레드(좋아요·댓글)에 바로 접근하는 문서 단위 경로 —
 * 토큰 경로와 같은 스레드를 본다(활성 링크가 있으면 같은 댓글 목록이 뜬다) */

/** 피드백 초기화(멤버 경로) — 반응 상태 + 댓글 목록 1회 fetch. 멤버면 역할 무관 */
export function fetchModelFeedback(workspaceId: string, modelId: string, signal?: AbortSignal) {
  return apiGet<ShareFeedback>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/feedback`,
    undefined,
    signal,
  ).then(normalizeFeedback)
}

/** 반응(좋아요) 토글(멤버 경로) — 역할 무관, 본문 없는 POST */
export function toggleModelReaction(workspaceId: string, modelId: string) {
  return apiPost<ShareReaction>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/reactions`,
    undefined,
  )
}

/** 멤버 댓글 등록 본문 — Commenter 이상. 답글은 문서 작성자(오너)만 parentCommentId를 실어 보낸다 */
export interface CreateModelCommentInput {
  content: string
  parentCommentId?: string
}

/** 멤버 댓글 등록 — 회원 경로라 별명·비밀번호 없이 내용만 */
export function createModelComment(workspaceId: string, modelId: string, body: CreateModelCommentInput) {
  return apiPost<ShareComment>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/comments`,
    body,
  )
}

/** 멤버 댓글 수정 — 본인 댓글만(오너·관리자도 남의 글은 못 고친다) */
export function updateModelComment(
  workspaceId: string,
  modelId: string,
  commentId: string,
  body: UpdateShareCommentInput,
) {
  return apiPut<ShareComment>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/comments/${commentId}`,
    body,
  )
}

/** 멤버 댓글 삭제 — 본인·문서 작성자·관리자. 몸통 없이 경로만 */
export function deleteModelComment(workspaceId: string, modelId: string, commentId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}/comments/${commentId}`)
}

/* ---------- 내 공유 문서 피드백 역조회 (08-core/02-model.md §1.10.9 — 인증) ---------- */

/** 내가 작성한 공유 문서 댓글 — 커뮤니티 "내 댓글" 메뉴. 최신 활동순 무페이징.
 *  회원 댓글·오너 답글만 내려온다(비회원 댓글은 신원이 없다). 원댓글의 parentCommentId는
 *  NON_NULL 직렬화로 생략돼 오니(normalizeFeedback과 같은 사유) 경계에서 null로 채운다 —
 *  my-comments 화면의 "답글" 배지가 !== null 엄격 비교 때문 */
export async function fetchMyShareComments(signal?: AbortSignal) {
  const result = await apiGetList<MyShareComment>('/api/v1/core/accounts/me/share-comments', undefined, signal)
  return {
    ...result,
    items: result.items.map((comment) => ({ ...comment, parentCommentId: comment.parentCommentId ?? null })),
  }
}

/** 내가 좋아요한 공유 문서 — 커뮤니티 "좋아한 문서" 메뉴. 최근 반응순 무페이징 */
export function fetchMyShareReactions(signal?: AbortSignal) {
  return apiGetList<MyShareReaction>('/api/v1/core/accounts/me/share-reactions', undefined, signal)
}

/* ---------- 템플릿 (08-core/09-templates.md) ---------- */

/** 템플릿 복제 본문 — name 생략·빈 값이면 원본 이름(대상 워크스페이스 내 중복이면 409) */
export interface CloneFromTemplateInput {
  templateModelId: string
  name?: string
}

/** 템플릿 공개 목록 — 인증 없이(게이트웨이 화이트리스트 GET만), 갤러리 카드·복제 다이얼로그가 쓴다 */
export function fetchTemplates(signal?: AbortSignal) {
  return apiGetList<TemplateSummary>('/api/v1/core/templates', undefined, signal)
}

/** 템플릿 복제 — 템플릿 문서를 이 워크스페이스의 새 문서로 통째로 복사한다 (Editor 이상, 201) */
export function cloneFromTemplate(workspaceId: string, body: CloneFromTemplateInput) {
  return apiPost<Model>(`/api/v1/core/workspaces/${workspaceId}/models/from-template`, body)
}

/* ---------- 문서 버전 기록 (08-core/02-model.md §1.11) ---------- */

/** 버전 기록 목록 — 최신순 페이징, 행은 content 없는 요약(메모·자동 요약 포함).
 *  keyword는 메모 부분 일치(대소문자 무시) — 빈값은 파라미터에서 빠진다(전체 목록) */
export function fetchModelVersions(
  workspaceId: string,
  modelId: string,
  params: OffsetPagingParams & { keyword?: string } = {},
  signal?: AbortSignal,
): Promise<PageResult<ModelVersionEntry>> {
  return apiGetPage<ModelVersionEntry>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/versions`,
    { page: params.page, size: params.size, keyword: params.keyword || undefined },
    signal,
  )
}

/** 버전 상세 — 해당 시점 문서 전문(content). 버전 뷰어가 연다 */
export function fetchModelVersionDetail(
  workspaceId: string,
  modelId: string,
  version: number,
  signal?: AbortSignal,
): Promise<ModelVersionDetail | undefined> {
  return apiGet<ModelVersionDetail>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/versions/${version}`,
    undefined,
    signal,
  )
}

/** 버전 메모 편집 — memo null은 삭제, 생략은 변경 없음(빈 문자열·501자 이상은 400). 갱신된 목록 행 응답 */
export function patchModelVersionMemo(
  workspaceId: string,
  modelId: string,
  version: number,
  body: { memo?: string | null },
) {
  return apiPatch<ModelVersionEntry>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/versions/${version}/memo`,
    body,
  )
}

/** 버전 복원 — 과거 content를 새 버전으로 저장한다(과거 버전은 불변).
 *  응답은 저장과 같은 계약(새 version·updatedAt — SaveContentResponse). */
export function restoreModelVersion(
  workspaceId: string,
  modelId: string,
  version: number,
  body: { baseVersion: number },
): Promise<{ version: number; updatedAt: string } | undefined> {
  return apiPost<{ version: number; updatedAt: string }>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/versions/${version}/restore`,
    body,
  )
}
