/**
 * 앱 셸 헤더 테스트 (storyboard 00-common §3.1)
 *
 * given: 인증 세션 + AppLayout 라우트
 * when: 헤더 렌더
 * then: 우측 상단에 메인(랜딩 /) 바로가기 버튼 — 이름 + 아이콘 순서
 */
import { screen } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppLayout } from '@/layouts/AppLayout'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

describe('AppLayout 헤더', () => {
  it('우측 상단에 메인(랜딩) 바로가기 버튼이 노출된다', async () => {
    resetSessionState()
    asAuthenticated()

    renderWithProviders(
      <Route element={<AppLayout />}>
        <Route path="/" element={<div>outlet-stub</div>} />
      </Route>,
      { route: '/' },
    )

    // then: 메인 바로가기 — 랜딩(/) 행선지, 사용자 메뉴와 같은 우측 그룹
    const home = await screen.findByTestId('shell-home-link')
    expect(home).toBeVisible()
    expect(home).toHaveAttribute('href', '/')
    expect(home).toHaveTextContent('메인으로')
    // 사용자 메뉴(부트스트랩 관리자)도 같은 그룹에 있다
    expect(await screen.findByRole('button', { name: /부트스트랩 관리자/ })).toBeVisible()
  })
})
