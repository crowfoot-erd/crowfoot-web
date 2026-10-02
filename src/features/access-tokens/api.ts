/**
 * 워크스페이스 액세스 토큰 API (08-core/18-access-token.md) — 목록, 발급, 폐기.
 * 토큰 원문(token)은 발급 응답에만 한 번 실린다. 목록에는 앞부분(tokenPrefix)만 있다.
 */
import { apiDelete, apiGetList, apiPost } from '@/api/client'
import type { WorkspaceAccessToken } from '@/api/types'

export function fetchAccessTokens(workspaceId: string, signal?: AbortSignal) {
  return apiGetList<WorkspaceAccessToken>(`/api/v1/core/workspaces/${workspaceId}/access-tokens`, undefined, signal)
}

export interface IssueAccessTokenInput {
  name: string
  /** 만료까지의 날 수(1~365) — 없으면 무기한 */
  expiresInDays?: number
}

export function issueAccessToken(workspaceId: string, body: IssueAccessTokenInput) {
  return apiPost<WorkspaceAccessToken>(`/api/v1/core/workspaces/${workspaceId}/access-tokens`, body)
}

export function revokeAccessToken(workspaceId: string, tokenId: string) {
  return apiDelete<void>(`/api/v1/core/workspaces/${workspaceId}/access-tokens/${tokenId}`)
}

/** 한 사람이 한 워크스페이스에서 발급할 수 있는 토큰 수 */
export const ACCESS_TOKEN_LIMIT = 5

/** 기간 선택지 — null은 무기한 */
export const EXPIRY_OPTIONS = [null, 30, 90, 365] as const

/**
 * MCP 서버 주소 — 운영은 전용 도메인, 로컬은 Gateway(8000)가 /mcp를 MCP 서버로 넘긴다
 * (docs 10-mcp/00-mcp-server.md Section 2). VITE_MCP_URL로 바꿀 수 있다.
 */
export function mcpServerUrl(): string {
  const configured = import.meta.env.VITE_MCP_URL as string | undefined
  return configured && configured.length > 0 ? configured : 'https://crowfoot-mcp.java21.net/mcp'
}

/**
 * 등록 명령의 서버 이름 — 워크스페이스마다 토큰이 다르므로 이름을 나눈다.
 * 워크스페이스 이름에서 영문 소문자·숫자만 남긴다. 남는 것이 없으면(한글 이름 등) 워크스페이스 번호를 붙인다.
 */
export function mcpServerName(workspaceName: string, workspaceId: string): string {
  const slug = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '')
  return slug.length > 0 ? `crowfoot-${slug}` : `crowfoot-${workspaceId}`
}

/** Claude Code 등록 명령 (docs 10-mcp/00-mcp-server.md Section 8) */
export function claudeMcpAddCommand(serverName: string, token: string): string {
  return `claude mcp add --transport http ${serverName} ${mcpServerUrl()} --header "Authorization: Bearer ${token}"`
}
