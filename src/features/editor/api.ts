/**
 * 에디터 API — 문서 본체 저장(§1.5)·DDL 생성(§1.7)·배포(§1.8)
 */
import { apiGet, apiPost, apiPut } from '@/api/client'

export interface SaveModelContentInput {
  baseVersion: number
  content: string
}

export interface SaveModelContentResult {
  version: number
  updatedAt: string
}

export interface ModelDdlWarning {
  code: string
  message: string
}

export interface ModelDdlResult {
  sql: string
  warnings: ModelDdlWarning[]
  tableCount: number
  relationshipCount: number
}

/** 문서 본체 저장(낙관적 잠금) — 409 VERSION_CONFLICT는 ApiError로 전달된다 */
export function saveModelContent(
  workspaceId: string,
  modelId: string,
  body: SaveModelContentInput,
): Promise<SaveModelContentResult | undefined> {
  return apiPut<SaveModelContentResult>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}/content`, body)
}

/** DDL 스크립트 생성 — 서버가 content를 해석해 문서 DB 타입 방언으로 조립한다.
 *  마지막 저장 본문 기준이라 저장되지 않은 편집은 반영되지 않는다(자동 저장 2s). */
export function fetchModelDdl(
  workspaceId: string,
  modelId: string,
  signal?: AbortSignal,
): Promise<ModelDdlResult | undefined> {
  return apiGet<ModelDdlResult>(`/api/v1/core/workspaces/${workspaceId}/models/${modelId}/ddl`, undefined, signal)
}

export interface ModelVersionResult {
  version: number
  updatedAt: string
}

/** 버전 경량 조회(§1.9 협업 폴링) — content 없이 version만 내려받는다.
 *  에디터가 주기적으로 물어 로컬 base보다 높으면 남이 저장한 변경으로 판단한다. */
export function fetchModelVersion(
  workspaceId: string,
  modelId: string,
  signal?: AbortSignal,
): Promise<ModelVersionResult | undefined> {
  return apiGet<ModelVersionResult>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/version`,
    undefined,
    signal,
  )
}

export interface ModelDeployStatement {
  sql: string
  ok: boolean
  error: string | null
}

export interface ModelDeployResult {
  executedCount: number
  failedCount: number
  statements: ModelDeployStatement[]
  warnings: ModelDdlWarning[]
}

/** 포워드 엔지니어링 배포(§1.8) — DDL을 커넥션 DB에 문장별 실행.
 *  한 문장이 실패해도 나머지를 계속 실행해 부분 실패까지 200으로 보고한다. */
export function deployModel(workspaceId: string, modelId: string, connectionId: string) {
  return apiPost<ModelDeployResult>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/deploy`,
    { connectionId },
  )
}
