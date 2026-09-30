/**
 * 워크스페이스 사이드바 테스트 (storyboard 00-common §3.1 [3] 소유/공유 분리)
 *
 * given: me/workspaces 응답(소유 2 + 공유 1)
 * when: 사이드바 렌더
 * then: 두 섹션 헤더가 아이콘으로 구분되고 공유받은 섹션은 구분선으로 나뉜다
 */
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceSidebar } from '@/layouts/components/workspace-sidebar'
import { renderWithProviders, resetSessionState } from '@/test/test-app'
import type { MyWorkspace } from '@/api/types'

let items: MyWorkspace[] = []
const openDialog = vi.fn()

vi.mock('@/features/workspaces', () => ({
  useMyWorkspaces: () => ({ data: { items }, isPending: false, isError: false, refetch: vi.fn() }),
  useCreateWorkspaceDialog: () => openDialog,
}))

function workspace(id: string, name: string, myRole: MyWorkspace['myRole'], isDefault = false): MyWorkspace {
  return { workspaceId: id, name, description: null, isDefault, myRole, memberCount: 1 }
}

describe('워크스페이스 사이드바 소유/공유 구분', () => {
  beforeEach(() => {
    resetSessionState()
    openDialog.mockClear()
  })

  it('두 섹션 헤더에 아이콘이 있고 공유받은 섹션은 구분선으로 나뉜다', () => {
    items = [
      workspace('1', '내 작업실', 'OWNER', true),
      workspace('2', '개인 프로젝트', 'OWNER'),
      workspace('3', '팀 스터디', 'VIEWER'),
    ]

    renderWithProviders(<WorkspaceSidebar />, { route: '/', wrapRoutes: false })

    // then: 섹션 헤더 — 라벨 + 아이콘(FolderOpen·Users)
    const mineHeader = screen.getByText('나의 워크스페이스').closest('p')
    const sharedHeader = screen.getByText('공유받은 워크스페이스').closest('p')
    expect(mineHeader?.querySelector('svg')).toBeInTheDocument()
    expect(sharedHeader?.querySelector('svg')).toBeInTheDocument()

    // then: 공유받은 섹션은 구분선(border-t)으로 나의 섹션과 나뉜다
    expect(screen.getByText('공유받은 워크스페이스').closest('section')).toHaveClass('border-t')
    expect(screen.getByText('나의 워크스페이스').closest('section')).not.toHaveClass('border-t')

    // then: 각 섹션에 해당 워크스페이스만 있다 — 공유받은 행은 역할 표기
    expect(screen.getByText('내 작업실')).toBeVisible()
    expect(screen.getByText('팀 스터디')).toBeVisible()
    expect(screen.getByText('VIEWER')).toBeVisible()
  })

  it('공유받은 워크스페이스가 없으면 해당 섹션은 렌더되지 않는다', () => {
    items = [workspace('1', '내 작업실', 'OWNER', true)]

    renderWithProviders(<WorkspaceSidebar />, { route: '/', wrapRoutes: false })

    expect(screen.getByText('나의 워크스페이스')).toBeVisible()
    expect(screen.queryByText('공유받은 워크스페이스')).not.toBeInTheDocument()
  })
})
