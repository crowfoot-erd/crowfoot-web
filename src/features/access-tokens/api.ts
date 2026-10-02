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

/** 등록 방법을 보여 주는 클라이언트 — Claude Code와 ChatGPT의 Codex. 둘 다 요청 헤더로 토큰을 보낼 수 있다 */
export const MCP_CLIENTS = ['claude', 'codex'] as const
export type McpClient = (typeof MCP_CLIENTS)[number]

/**
 * Codex(ChatGPT) 설정 — ~/.codex/config.toml에 붙여 넣는 블록 (docs 10-mcp/00-mcp-server.md Section 8).
 * ChatGPT 웹·모바일 앱의 커넥터는 OAuth를 전제로 해서 이 토큰으로는 붙지 못한다.
 */
export function codexMcpConfig(serverName: string, token: string): string {
  return [`[mcp_servers.${serverName}]`, `url = "${mcpServerUrl()}"`, `http_headers = { "Authorization" = "Bearer ${token}" }`].join('\n')
}

/** 클라이언트별 등록 문구 */
export function mcpRegistration(client: McpClient, serverName: string, token: string): string {
  return client === 'claude' ? claudeMcpAddCommand(serverName, token) : codexMcpConfig(serverName, token)
}

/** Claude Code 등록 명령 (docs 10-mcp/00-mcp-server.md Section 8) */
export function claudeMcpAddCommand(serverName: string, token: string): string {
  return `claude mcp add --transport http ${serverName} ${mcpServerUrl()} --header "Authorization: Bearer ${token}"`
}
