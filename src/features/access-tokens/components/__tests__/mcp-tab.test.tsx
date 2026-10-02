/**
 * 워크스페이스 MCP 탭 — 토큰 목록, 발급(원문과 등록 명령은 한 번만), 폐기, 읽기 역할 안내 (04-front/02-workspace.md §9)
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import type { WorkspaceRole } from '@/api/types'
import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { claudeMcpAddCommand, mcpServerName } from '@/features/access-tokens/api'
import { McpTab } from '@/features/access-tokens/components/mcp-tab'
import { renderWithProviders } from '@/test/test-app'

function renderTab(props: { myRole?: WorkspaceRole; workspaceName?: string } = {}) {
  return renderWithProviders(
    <>
      <McpTab workspaceId="101" workspaceName={props.workspaceName ?? 'Payments Team'} myRole={props.myRole ?? 'OWNER'} />
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

describe('MCP 탭', () => {
  it('토큰 목록 — 이름, 앞부분, 발급한 사람, 만료, 마지막 사용', async () => {
    renderTab()
    const rows = await screen.findAllByTestId('mcp-token-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('내 노트북의 Claude Code')
    expect(rows[0]).toHaveTextContent('cfw_a1B2c3D4…')
    expect(rows[0]).toHaveTextContent('부트스트랩 관리자')
    expect(rows[1]).toHaveTextContent('무기한')
    expect(rows[1]).toHaveTextContent('사용 전')
    expect(screen.queryByTestId('mcp-readonly-notice')).toBeNull()
  })

  it('읽기 역할이면 토큰이 읽기만 할 수 있다고 알린다', async () => {
    renderTab({ myRole: 'VIEWER' })
    expect(await screen.findByTestId('mcp-readonly-notice')).toHaveTextContent('읽기만')
  })

  it('발급 — 이름은 필수이고, 기간을 날 수로 보낸다. 원문과 등록 명령은 발급 직후에만 보인다', async () => {
    let captured: Record<string, unknown> | null = null
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/access-tokens')) {
        void request.clone().json().then((body) => (captured = body as Record<string, unknown>))
      }
    })
    const user = userEvent.setup()
    renderTab()

    await user.click(await screen.findByTestId('mcp-issue-button'))
    const dialog = await screen.findByTestId('mcp-issue-dialog')
    await user.click(within(dialog).getByRole('button', { name: '발급' }))
    expect(within(dialog).getByText('이름을 입력하세요')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('이름'), '새 토큰')
    await user.click(within(dialog).getByRole('button', { name: '30일' }))
    await user.click(within(dialog).getByRole('button', { name: '발급' }))

    const issued = await screen.findByTestId('mcp-issued-dialog')
    await waitFor(() => expect(captured).toEqual({ name: '새 토큰', expiresInDays: 30 }))
    const token = 'cfw_Zm9vYmFyLXRoaXMtaXMtYS1tb2NrLXRva2VuLXZhbHVl'
    expect(within(issued).getByTestId('mcp-issued-token')).toHaveTextContent(token)
    expect(within(issued).getByTestId('mcp-issued-command')).toHaveTextContent(
      `claude mcp add --transport http crowfoot-payments-team https://crowfoot-mcp.java21.net/mcp --header "Authorization: Bearer ${token}"`,
    )

    await user.click(within(issued).getByRole('button', { name: '복사했습니다' }))
    await waitFor(() => expect(screen.queryByTestId('mcp-issued-dialog')).toBeNull())
    expect(screen.queryByText(token)).toBeNull()
  })

  it('무기한을 고르면 기간을 보내지 않는다', async () => {
    let captured: Record<string, unknown> | null = null
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/access-tokens')) {
        void request.clone().json().then((body) => (captured = body as Record<string, unknown>))
      }
    })
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByTestId('mcp-issue-button'))
    const dialog = await screen.findByTestId('mcp-issue-dialog')
    await user.type(within(dialog).getByLabelText('이름'), '무기한 토큰')
    await user.click(within(dialog).getByRole('button', { name: '무기한' }))
    await user.click(within(dialog).getByRole('button', { name: '발급' }))
    await screen.findByTestId('mcp-issued-dialog')
    await waitFor(() => expect(captured).toEqual({ name: '무기한 토큰' }))
  })

  it('발급 한도를 넘으면 서버의 안내를 보여 주고 창을 닫지 않는다', async () => {
    server.use(http.post('/api/v1/core/workspaces/101/access-tokens', () => fail('ACCESS_TOKEN_LIMIT_EXCEEDED', 409)))
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByTestId('mcp-issue-button'))
    const dialog = await screen.findByTestId('mcp-issue-dialog')
    await user.type(within(dialog).getByLabelText('이름'), '여섯째')
    await user.click(within(dialog).getByRole('button', { name: '발급' }))
    await waitFor(() => expect(document.querySelector('[data-sonner-toast]')).not.toBeNull())
    expect(screen.getByTestId('mcp-issue-dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('mcp-issued-dialog')).toBeNull()
  })

  it('폐기 — 확인을 거쳐 지운다', async () => {
    let deleted: string | null = null
    server.use(
      http.delete('/api/v1/core/workspaces/101/access-tokens/:tokenId', ({ params }) => {
        deleted = String(params.tokenId)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderTab()
    const rows = await screen.findAllByTestId('mcp-token-row')
    await user.click(within(rows[1]).getByRole('button', { name: '폐기' }))
    expect(deleted).toBeNull()
    const confirm = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'))
    await user.click(within(confirm).getByRole('button', { name: '폐기' }))
    await waitFor(() => expect(deleted).toBe('902'))
  })

  it('빈 목록', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/access-tokens', () =>
        HttpResponse.json({ header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }, totalCount: 0, responses: [] }),
      ),
    )
    renderTab()
    expect(await screen.findByText('발급한 토큰이 없습니다')).toBeInTheDocument()
  })
})

describe('등록 명령', () => {
  it('서버 이름은 워크스페이스 이름에서 만든다 — 영문·숫자가 없으면 번호를 붙인다', () => {
    expect(mcpServerName('Payments Team', '101')).toBe('crowfoot-payments-team')
    expect(mcpServerName('  ERD / v2 (2026)  ', '7')).toBe('crowfoot-erd-v2-2026')
    expect(mcpServerName('결제 플랫폼', '101')).toBe('crowfoot-101')
  })

  it('명령은 전송 방식, 서버 이름, 주소, 인증 헤더를 담는다', () => {
    expect(claudeMcpAddCommand('crowfoot-101', 'cfw_x')).toBe(
      'claude mcp add --transport http crowfoot-101 https://crowfoot-mcp.java21.net/mcp --header "Authorization: Bearer cfw_x"',
    )
  })
})
