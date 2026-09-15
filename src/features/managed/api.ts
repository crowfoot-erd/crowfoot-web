/**
 * 매니지드 DB API (08-core/07-managed-database.md) —
 * 관리자: 루트 인스턴스 등록(자격 검증 수반)·변경·삭제(발급 존재 시 409)
 * 사용자: 발급 목록(limitSummary 포함)·발급·철회. 비밀번호는 등록·변경에만 실린다.
 */
import { apiDelete, apiGet, apiGetEnvelope, apiGetList, apiPatch, apiPost } from '@/api/client'
import type { ApiEnvelope, ConnectionTestResult } from '@/api/types'
import type {
  ManagedCredential,
  ManagedDatabase,
  ManagedDatabaseListResult,
  ManagedInstance,
  ManagedIssueLimit,
  ManagedLimitSummary,
} from '@/api/types'

export function fetchManagedInstances(signal?: AbortSignal) {
  return apiGetList<ManagedInstance>('/api/v1/core/admin/managed-instances', undefined, signal)
}

/** 발급 한도 조회(관리자) — 워크스페이스 내 사용자당, 설정이 없으면 기본 5 */
export function fetchManagedIssueLimit(signal?: AbortSignal) {
  return apiGet<ManagedIssueLimit>('/api/v1/core/admin/managed-instances/issue-limit', undefined, signal)
}

/** 발급 한도 지정(관리자) — 1~100. 즉시 발급·한도 요약에 반영 */
export function updateManagedIssueLimit(limit: number) {
  return apiPatch<ManagedIssueLimit>('/api/v1/core/admin/managed-instances/issue-limit', { limit })
}

export interface CreateManagedInstanceInput {
  displayName: string
  dbmsType: string
  host: string
  /** 사용자 노출 주소(선택) — null이면 host를 그대로 노출 */
  publicHost: string | null
  port: number
  /** 생략 가능(null) — PostgreSQL은 username database 폴백, MySQL은 발급 시 생성 */
  databaseName: string | null
  username: string
  password: string
  isActive?: boolean
}

export function createManagedInstance(body: CreateManagedInstanceInput) {
  return apiPost<ManagedInstance>('/api/v1/core/admin/managed-instances', body)
}

/** 변경 — 변경분만 전송. password는 입력했을 때만(빈 값 = 기존 유지), 자격이 오면 재검증된다.
 *  databaseName은 null 전송으로 제거할 수 있다(생략 = 변경 없음과 구분).
 *  publicHost는 표기 전용이라 재검증을 트리거하지 않는다 — 빈 칸("") 전송이 제거(host 폴백), null은 변경 없음 */
export interface UpdateManagedInstanceInput {
  displayName?: string
  host?: string
  publicHost?: string | null
  port?: number
  databaseName?: string | null
  username?: string
  password?: string
  isActive?: boolean
}

export function updateManagedInstance(instanceId: string, body: UpdateManagedInstanceInput) {
  return apiPatch<ManagedInstance>(`/api/v1/core/admin/managed-instances/${instanceId}`, body)
}

export function deleteManagedInstance(instanceId: string) {
  return apiDelete<void>(`/api/v1/core/admin/managed-instances/${instanceId}`)
}

/** 인스턴스 접속 테스트 — 저장된 자격으로 SELECT 1. 실패도 200 계약(connected:false + 분류 문구) */
export function testManagedInstance(instanceId: string) {
  return apiPost<ConnectionTestResult>(
    `/api/v1/core/admin/managed-instances/${instanceId}/test`,
    {},
  )
}

/** 발급 목록 — envelope 최상위의 limitSummary까지 필요해 공통 파서 대신 직접 파싱한다 */
export async function fetchManagedDatabases(workspaceId: string, signal?: AbortSignal): Promise<ManagedDatabaseListResult> {
  const envelope = await apiGetEnvelope(
    `/api/v1/core/workspaces/${workspaceId}/managed-databases`,
    undefined,
    signal,
  )
  return {
    items: Array.isArray(envelope.responses) ? (envelope.responses as ManagedDatabase[]) : [],
    totalCount: envelope.totalCount ?? 0,
    limitSummary: (envelope as ApiEnvelope & { limitSummary?: ManagedLimitSummary[] }).limitSummary ?? [],
  }
}

/** 발급 — instanceId 생략 시 활성 첫 번째(등록순) 인스턴스로. 201 + 발급 상세 */
export function issueManagedDatabase(workspaceId: string, instanceId?: string) {
  return apiPost<ManagedDatabase>(`/api/v1/core/workspaces/${workspaceId}/managed-databases`, {
    instanceId,
  })
}

/** 철회 — 스키마 DROP CASCADE + 발급 커넥션까지 함께 정리된다. 204 */
export function revokeManagedDatabase(workspaceId: string, databaseId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/managed-databases/${databaseId}`)
}

/** 접속 정보(본인 발급만) — 접속 주소·계정·비밀번호. 요청 시마다 복호화해 내려온다 */
export function fetchManagedCredential(workspaceId: string, databaseId: string) {
  return apiGet<ManagedCredential>(
    `/api/v1/core/workspaces/${workspaceId}/managed-databases/${databaseId}/credential`,
  )
}
