/**
 * ERD 문서 API (08-core/02-model.md) — 목록·상세·생성·데이터베이스 종류 코드.
 * content 저장은 에디터 단계(2.x)에서 추가한다.
 */
import { apiDelete, apiGet, apiGetList, apiGetPage, apiPatch, apiPost } from '@/api/client'
import type {
  DatabaseType,
  ListResult,
  Model,
  ModelSummary,
  ModelShare,
  ModelVersionDetail,
  ModelVersionEntry,
  OffsetPagingParams,
  PageResult,
  PublicShare,
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

/** 공유 문서 공개 조회 — 인증 없이 토큰으로만 (게이트웨이 화이트리스트 경로) */
export function fetchSharedDocument(token: string, signal?: AbortSignal) {
  return apiGet<PublicShare>(`/api/v1/core/shares/${token}`, undefined, signal)
}

/** 공유 갤러리 목록 — 인증 없이(게이트웨이 화이트리스트), 랜딩 페이지가 현재 공유 중인 문서를 나열 */
export function fetchSharedGallery(signal?: AbortSignal) {
  return apiGetList<SharedGalleryItem>('/api/v1/core/shares', undefined, signal)
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
