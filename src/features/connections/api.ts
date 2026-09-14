/**
 * DB 커넥션 API (08-core/06-connection.md) — 목록·등록·변경·삭제·접속 테스트·리버스 엔지니어링.
 * 비밀번호는 등록·변경에만 실리고 응답에는 내려오지 않는다.
 */
import { apiDelete, apiGetList, apiPatch, apiPost } from '@/api/client'
import type { ConnectionTestResult, DbConnection, ReverseEngineeringResult } from '@/api/types'

export function fetchConnections(workspaceId: string, signal?: AbortSignal) {
  return apiGetList<DbConnection>(`/api/v1/core/workspaces/${workspaceId}/connections`, undefined, signal)
}

export interface CreateConnectionInput {
  name: string
  dbmsType: string
  host: string
  port: number
  databaseName: string
  /** PostgreSQL에서만 의미 — 다른 DBMS는 아예 실리지 않는다 */
  schemaName?: string | null
  username: string
  password: string
}

export function createConnection(workspaceId: string, body: CreateConnectionInput) {
  return apiPost<DbConnection>(`/api/v1/core/workspaces/${workspaceId}/connections`, body)
}

/** 변경 — 변경분만 전송. password는 입력했을 때만(빈 값 = 기존 유지) */
export function updateConnection(
  workspaceId: string,
  connectionId: string,
  body: Partial<Omit<CreateConnectionInput, 'password'>> & { password?: string },
) {
  return apiPatch<DbConnection>(`/api/v1/core/workspaces/${workspaceId}/connections/${connectionId}`, body)
}

export function deleteConnection(workspaceId: string, connectionId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/connections/${connectionId}`)
}

/** 접속 테스트 — SELECT 1. 실패도 200 계약(connected:false + 서버 분류 문구) */
export function testConnection(workspaceId: string, connectionId: string) {
  return apiPost<ConnectionTestResult>(
    `/api/v1/core/workspaces/${workspaceId}/connections/${connectionId}/test`,
    {},
  )
}

export interface ReverseEngineeringInput {
  modelName?: string
  description?: string
}

/** 리버스 엔지니어링 — 스키마를 읽어 신규 문서를 만든다 (201 + ModelResponse + 요약) */
export function reverseEngineer(workspaceId: string, connectionId: string, body: ReverseEngineeringInput = {}) {
  return apiPost<ReverseEngineeringResult>(
    `/api/v1/core/workspaces/${workspaceId}/connections/${connectionId}/reverse-engineering`,
    body,
  )
}

/** DBMS 코드 → 포트 기본값 (다이얼로그 UX) */
export const DEFAULT_PORTS: Record<string, number> = {
  mysql: 3306,
  postgresql: 5432,
}
