/**
 * 에디터 API — 문서 본체 저장(§1.5)·DDL 생성(§1.7)·배포(§1.8)
 */
import { API_BASE_URL, apiGet, apiPost, apiPut, getAccessToken } from '@/api/client'

export interface SaveModelContentInput {
  baseVersion: number
  content: string
  /** 변경 요약 JSON(버전 기록 자동 메모 — §1.11). 에디터가 저장 직전 diff로 만들고
   *  서버는 해석 없이 스냅샷에 보관한다. 없는 저장(레거시·드래프트 플러시 외 경로)은 생략 */
  changeSummary?: string
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

/** keepalive 본문 상한(브라우저 64KB)보다 여유 있게 — 이 값을 넘으면 서버 플러시를 건너뛴다 */
const KEEPALIVE_BODY_LIMIT = 60_000

/** 페이지 이탈(pagehide) 최선 저장 — fetch keepalive로 언로드 이후에도 요청이 살아있게 한다.
 *  응답은 소비할 수 없어 결과를 알 수 없다: 실패해도 임시 저장(localStorage)이 다음 열기에서
 *  복원한다. 본문이 keepalive 상한을 넘는 큰 문서는 건너뛴다 — 임시 저장에만 맡긴다.
 *  Access 토큰 만료 응답도 무시된다(재발급 절차를 언로드 중에 수행할 수 없다). */
export function saveModelContentOnUnload(
  workspaceId: string,
  modelId: string,
  body: SaveModelContentInput,
): void {
  const payload = JSON.stringify(body)
  if (payload.length > KEEPALIVE_BODY_LIMIT) return
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`
  void fetch(`${API_BASE_URL}/api/v1/core/workspaces/${workspaceId}/models/${modelId}/content`, {
    method: 'PUT',
    headers,
    credentials: 'include',
    keepalive: true,
    body: payload,
  }).catch(() => undefined) // 언로드 중 실패 — 임시 저장이 복원 경로
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

export interface MigrationDdlResult {
  sql: string
  warnings: ModelDdlWarning[]
  statementCount: number
  /** "v2" / "DB" — 헤더 표기용 */
  fromLabel: string
  /** "v3" / "문서" */
  toLabel: string
}

/** 마이그레이션 DDL — 버전 A→B 차이를 ALTER 문으로 (08-core/02-model.md §1.7.1).
 *  생성만 제공한다 — 실행은 범위 밖(경고·복사·검토용 스크립트). */
export function fetchVersionMigrationDdl(
  workspaceId: string,
  modelId: string,
  from: number,
  to: number,
  signal?: AbortSignal,
): Promise<MigrationDdlResult | undefined> {
  return apiGet<MigrationDdlResult>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/versions/${from}/migration`,
    { to },
    signal,
  )
}

/** 마이그레이션 DDL — 문서↔실제 DB 비교(doc→DB 방향, §1.7.1). 스키마 조회가 인덱스를
 *  읽지 못해 인덱스 변경은 제외된다(NOT_INTROSPECTED 경고). */
export function fetchConnectionMigrationDdl(
  workspaceId: string,
  modelId: string,
  connectionId: string,
  signal?: AbortSignal,
): Promise<MigrationDdlResult | undefined> {
  return apiGet<MigrationDdlResult>(
    `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/connections/${connectionId}/migration`,
    undefined,
    signal,
  )
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
