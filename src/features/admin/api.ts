/**
 * 관리자 API (08-core/05-account.md Section 2)
 *
 * - users·sessions는 공통 오프셋 페이징(page 1~, 기본 size 20)
 * - 코드 관리 PATCH는 대상 code를 body에 포함 (roles의 level 변경은 400 — UI 미노출)
 */
import { apiDelete, apiGet, apiGetList, apiGetPage, apiPatch } from '@/api/client'
import type {
  AdminAuditLog,
  AdminDatabaseType,
  AdminProvider,
  AdminRole,
  AdminSession,
  AdminUser,
  ListResult,
  PageResult,
} from '@/api/types'

export interface AdminUsersParams {
  keyword?: string
  page?: number
  size?: number
}

export function fetchAdminUsers(params: AdminUsersParams = {}, signal?: AbortSignal): Promise<PageResult<AdminUser>> {
  const { keyword, page = 1, size = 20 } = params
  return apiGetPage<AdminUser>('/api/v1/core/admin/users', { keyword, page, size }, signal)
}

export function fetchAdminUser(userId: string, signal?: AbortSignal) {
  return apiGet<AdminUser>(`/api/v1/core/admin/users/${userId}`, undefined, signal)
}

export function fetchAdminSessions(
  userId: string,
  params: { page?: number; size?: number } = {},
  signal?: AbortSignal,
): Promise<PageResult<AdminSession>> {
  return apiGetPage<AdminSession>('/api/v1/core/admin/sessions', { userId, ...params }, signal)
}

/** 세션 폐기 — Refresh lineage 전량 폐기 + Access 즉시 차단. 성공 204 */
export function deleteAdminSession(sid: string) {
  return apiDelete<void>(`/api/v1/core/admin/sessions/${encodeURIComponent(sid)}`)
}

export function fetchAdminDatabaseTypes(signal?: AbortSignal): Promise<ListResult<AdminDatabaseType>> {
  return apiGetList<AdminDatabaseType>('/api/v1/core/admin/database-types', undefined, signal)
}

export function updateAdminDatabaseType(body: { code: string; displayName?: string; isActive?: boolean }) {
  return apiPatch<AdminDatabaseType>('/api/v1/core/admin/database-types', body)
}

export function fetchAdminProviders(signal?: AbortSignal): Promise<ListResult<AdminProvider>> {
  return apiGetList<AdminProvider>('/api/v1/core/admin/providers', undefined, signal)
}

export function updateAdminProvider(body: { code: string; displayName?: string; isActive?: boolean }) {
  return apiPatch<AdminProvider>('/api/v1/core/admin/providers', body)
}

/** GET 응답에는 level이 포함되지만 UI는 미노출 (변경 시도 400) */
export function fetchAdminRoles(signal?: AbortSignal): Promise<ListResult<AdminRole & { level?: number }>> {
  return apiGetList<AdminRole & { level: number }>('/api/v1/core/admin/roles', undefined, signal)
}

export function updateAdminRole(body: { code: string; displayName: string }) {
  return apiPatch<AdminRole>('/api/v1/core/admin/roles', body)
}

export interface AdminAuditLogsParams {
  keyword?: string
  action?: string
  page?: number
  size?: number
}

/** 감사 로그 목록 — keyword는 주체(actor) 이름·이메일, action은 정확 일치. 정렬 id desc 고정 */
export function fetchAdminAuditLogs(
  params: AdminAuditLogsParams = {},
  signal?: AbortSignal,
): Promise<PageResult<AdminAuditLog>> {
  const { keyword, action, page = 1, size = 20 } = params
  return apiGetPage<AdminAuditLog>('/api/v1/core/admin/audit-logs', { keyword, action, page, size }, signal)
}
