/**
 * 대시보드 워크스페이스 바로가기 카드 테스트 (storyboard 02-user §1)
 *
 * given: 내 워크스페이스 2건(fixtures.myWorkspaces — 소유 1·편집자 1, 소유 쪽은 설명 없음)
 * when: /dashboard 진입
 * then: 공유받은 워크스페이스 카드에만 내 역할 배지가 붙고, 설명이 없는 카드에 "-"를 찍지 않는다
 */
import { screen, within } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { DashboardPage } from '@/pages/dashboard'
import { renderWithProviders } from '@/test/test-app'

describe('대시보드 워크스페이스 바로가기', () => {
  it('공유받은 워크스페이스에만 내 역할을 보이고, 빈 설명은 비워 둔다', async () => {
    renderWithProviders(<Route path="/dashboard" element={<DashboardPage />} />, { route: '/dashboard' })

    const shared = (await screen.findByText('결제팀 공용')).closest('a') as HTMLElement
    const mine = screen.getByText('개인 ERD').closest('a') as HTMLElement

    // 공유받은 쪽(EDITOR) — 역할 배지로 내 워크스페이스와 구분된다
    expect(within(shared).getByText('편집자')).toBeVisible()
    expect(within(shared).getByText('결제 도메인 ERD')).toBeVisible()
    // 내 것(OWNER) — 역할 배지 없음, 설명이 없으면 자리만 지키고 "-"를 찍지 않는다
    expect(within(mine).queryByText('소유자')).not.toBeInTheDocument()
    expect(within(mine).queryByText('-')).not.toBeInTheDocument()
  })
})
