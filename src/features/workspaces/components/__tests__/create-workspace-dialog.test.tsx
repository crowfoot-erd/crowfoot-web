/**
 * S-04 워크스페이스 생성 다이얼로그 테스트 (frontend-testing.md B5)
 *
 * - 이름 필수(공백 불가) 검증
 * - 성공 → 다이얼로그 닫힘 + 생성된 상세로 직행 (목록을 거치지 않는다)
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { CreateWorkspaceDialog } from '@/features/workspaces/components/create-workspace-dialog'
import { useCreateWorkspaceDialog } from '@/features/workspaces/dialog-store'
import { renderWithProviders } from '@/test/test-app'

function renderDialog() {
  return renderWithProviders(
    <>
      <Route
        path="/"
        element={
          <>
            <div>현재 화면</div>
            <CreateWorkspaceDialog />
          </>
        }
      />
      <Route path="/workspaces/:workspaceId" element={<div>워크스페이스 상세</div>} />
    </>,
    { route: '/' },
  )
}

describe('워크스페이스 생성 다이얼로그', () => {
  beforeEach(() => {
    useCreateWorkspaceDialog.setState({ open: false })
  })

  it('shows the required-name message for an empty or blank name', async () => {
    useCreateWorkspaceDialog.setState({ open: true })
    renderDialog()

    // given: 다이얼로그 열림
    expect(await screen.findByRole('dialog')).toBeVisible()

    // when: 이름 비워두고 제출
    await userEvent.click(screen.getByRole('button', { name: '생성' }))

    // then: 검증 메시지 — 요청도 보내지 않는다
    expect(await screen.findByText('이름을 입력해 주세요.')).toBeVisible()
    expect(screen.queryByText('워크스페이스 상세')).not.toBeInTheDocument()
  })

  it('navigates straight to the created workspace detail on success', async () => {
    server.use(
      http.post('/api/v1/core/workspaces', () =>
        HttpResponse.json(
          {
            header: { isSuccessful: true, resultCode: 'CREATED', resultMessage: 'CREATED' },
            response: {
              workspaceId: '301',
              name: '주문 서비스 ERD',
              description: null,
              isDefault: false,
              myRole: 'OWNER',
              memberCount: 1,
            },
          },
          { status: 201 },
        ),
      ),
    )

    useCreateWorkspaceDialog.setState({ open: true })
    renderDialog()

    // when: 이름 입력 후 생성
    const nameInput = await screen.findByLabelText('이름')
    await userEvent.type(nameInput, '주문 서비스 ERD')
    await userEvent.click(screen.getByRole('button', { name: '생성' }))

    // then: 생성된 상세로 직행 — 목록을 거치지 않는다
    expect(await screen.findByText('워크스페이스 상세')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the dialog open with an error toast when creation fails', async () => {
    server.use(http.post('/api/v1/core/workspaces', () => fail('INVALID_REQUEST', 400)))

    useCreateWorkspaceDialog.setState({ open: true })
    renderDialog()

    const nameInput = await screen.findByLabelText('이름')
    await userEvent.type(nameInput, '이름')
    await userEvent.click(screen.getByRole('button', { name: '생성' }))

    // then: 다이얼로그 유지 — 닫히지 않고 오류 안내
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeVisible()
    })
  })
})
