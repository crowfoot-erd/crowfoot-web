/**
 * 확인 다이얼로그(파괴 작업 공통) 테스트
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { renderWithProviders } from '@/test/test-app'

describe('ConfirmDialog', () => {
  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="워크스페이스 삭제"
        description="되돌릴 수 없습니다"
        confirmLabel="삭제"
        destructive
        confirming={false}
        onConfirm={onConfirm}
      />,
      { wrapRoutes: false },
    )

    // then: 제목·설명·버튼
    expect(screen.getByText('워크스페이스 삭제')).toBeVisible()
    expect(screen.getByText('되돌릴 수 없습니다')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('disables the cancel path while confirming', async () => {
    const onConfirm = vi.fn()
    renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="삭제"
        description="설명"
        confirmLabel="삭제"
        destructive
        confirming
        onConfirm={onConfirm}
      />,
      { wrapRoutes: false },
    )

    // then: 진행 중 — 확인 버튼 비활성화
    const confirmButton = screen.getByRole('button', { name: /삭제/ })
    expect(confirmButton).toBeDisabled()

    await userEvent.click(confirmButton, { pointerEventsCheck: 0 }).catch(() => {})
    await waitFor(() => {
      expect(onConfirm).not.toHaveBeenCalled()
    })
  })
})
