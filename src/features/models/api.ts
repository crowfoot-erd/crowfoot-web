/**
 * ERD 문서 API (08-core/02-model.md) — 목록·상세·생성·데이터베이스 종류 코드.
 * content 저장은 에디터 단계(2.x)에서 추가한다.
 */
import { apiDelete, apiGet, apiGetList, apiPatch, apiPost } from '@/api/client'
import type { DatabaseType, ListResult, Model, ModelSummary } from '@/api/types'

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

export interface CreateModelInput {
  name: string
  description?: string
  databaseType: string
  canvasWidth: number
  canvasHeight: number
}

export function createModel(workspaceId: string, body: CreateModelInput) {
  return apiPost<Model>(`/api/v1/core/workspaces/${workspaceId}/models`, body)
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
