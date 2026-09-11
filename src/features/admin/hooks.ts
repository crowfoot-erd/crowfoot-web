/**
 * 관리자 쿼리/뮤테이션 훅 — 코드 변경 시 관리자 목록과 공개 providers 캐시를 함께 무효화
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteAdminSession,
  fetchAdminDatabaseTypes,
  fetchAdminAuditLogs,
  fetchAdminProviders,
  fetchAdminRoles,
  fetchAdminSessions,
  fetchAdminUser,
  fetchAdminUsers,
  updateAdminDatabaseType,
  updateAdminProvider,
  updateAdminRole,
} from '@/features/admin/api'
import type { AdminAuditLogsParams, AdminUsersParams } from '@/features/admin/api'

export const adminKeys = {
  users: (params: AdminUsersParams) => ['admin', 'users', params] as const,
  user: (userId: string) => ['admin', 'users', 'detail', userId] as const,
  sessions: (userId: string) => ['admin', 'sessions', userId] as const,
  providers: ['admin', 'providers'] as const,
  databaseTypes: ['admin', 'databaseTypes'] as const,
  roles: ['admin', 'roles'] as const,
  auditLogs: (params: AdminAuditLogsParams) => ['admin', 'auditLogs', params] as const,
}

export function useAdminUsers(params: AdminUsersParams) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: ({ signal }) => fetchAdminUsers(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useAdminUser(userId: string) {
  return useQuery({
    queryKey: adminKeys.user(userId),
    queryFn: ({ signal }) => fetchAdminUser(userId, signal),
    enabled: userId.length > 0,
  })
}

export function useAdminSessions(userId: string) {
  return useQuery({
    queryKey: adminKeys.sessions(userId),
    queryFn: ({ signal }) => fetchAdminSessions(userId, { size: 50 }, signal),
    enabled: userId.length > 0,
  })
}

export function useDeleteAdminSession(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sid: string) => deleteAdminSession(sid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.sessions(userId) })
    },
  })
}

export function useAdminAuditLogs(params: AdminAuditLogsParams) {
  return useQuery({
    queryKey: adminKeys.auditLogs(params),
    queryFn: ({ signal }) => fetchAdminAuditLogs(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useAdminProviders() {
  return useQuery({ queryKey: adminKeys.providers, queryFn: ({ signal }) => fetchAdminProviders(signal) })
}

export function useUpdateAdminProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateAdminProvider,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.providers })
      // 공개 providers(로그인 버튼)도 같이 무효화
      void queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
  })
}

export function useAdminDatabaseTypes() {
  return useQuery({ queryKey: adminKeys.databaseTypes, queryFn: ({ signal }) => fetchAdminDatabaseTypes(signal) })
}

export function useUpdateAdminDatabaseType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateAdminDatabaseType,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.databaseTypes })
      // 공개 database-types(모델 생성 드롭다운)도 같이 무효화
      void queryClient.invalidateQueries({ queryKey: ['database-types'] })
    },
  })
}

export function useAdminRoles() {
  return useQuery({ queryKey: adminKeys.roles, queryFn: ({ signal }) => fetchAdminRoles(signal) })
}

export function useUpdateAdminRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateAdminRole,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.roles })
    },
  })
}
