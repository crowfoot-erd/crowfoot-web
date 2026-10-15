/**
 * 앱 셸 헤더 테스트 (storyboard 00-common §3.1)
 *
 * given: 인증 세션 + AppLayout 라우트
 * when: 헤더 렌더
 * then: 우측 상단에 메인(랜딩 /) 바로가기 버튼 — 이름 + 아이콘 순서
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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

  it('상단 메뉴 끝에 사용 가이드 링크가 있다 — 새 창으로 연다', async () => {
    resetSessionState()
    asAuthenticated()

    renderWithProviders(
      <Route element={<AppLayout />}>
        <Route path="/" element={<div>outlet-stub</div>} />
      </Route>,
      { route: '/' },
    )

    const guide = await screen.findByTestId('shell-guide-link')
    expect(guide).toHaveTextContent('사용 가이드')
    expect(guide).toHaveAttribute('href', '/guide')
    expect(guide).toHaveAttribute('target', '_blank')
  })
})

describe('AppLayout 폰 메뉴 서랍 (v1.46)', () => {
  function renderAdmin() {
    resetSessionState()
    asAuthenticated()
    renderWithProviders(
      <Route element={<AppLayout />}>
        <Route path="/admin/users" element={<div>users-stub</div>} />
        <Route path="/admin/codes" element={<div>codes-stub</div>} />
      </Route>,
      { route: '/admin/users' },
    )
  }

  it('메뉴 버튼으로 서랍을 열면 주 메뉴와 지금 화면의 사이드바(관리자 메뉴)가 함께 나온다', async () => {
    renderAdmin()

    fireEvent.click(await screen.findByTestId('mobile-nav-open'))

    const drawer = await screen.findByTestId('mobile-nav')
    expect(within(drawer).getByRole('link', { name: '워크스페이스' })).toHaveAttribute('href', '/workspaces')
    expect(within(drawer).getByRole('link', { name: '관리자' })).toHaveAttribute('href', '/admin/users')
    expect(within(drawer).getByRole('link', { name: /코드 테이블/ })).toHaveAttribute('href', '/admin/codes')
    expect(within(drawer).getByRole('link', { name: /트래픽 통계/ })).toBeVisible()
  })

  it('서랍의 메뉴를 누르면 그 화면으로 가고 서랍이 닫힌다', async () => {
    renderAdmin()

    fireEvent.click(await screen.findByTestId('mobile-nav-open'))
    const drawer = await screen.findByTestId('mobile-nav')
    fireEvent.click(within(drawer).getByRole('link', { name: /코드 테이블/ }))

    expect(await screen.findByText('codes-stub')).toBeVisible()
    await waitFor(() => expect(screen.queryByTestId('mobile-nav')).toBeNull())
  })

  it('언어 prefix(/en)가 붙은 관리자 화면에서도 서랍에 관리자 메뉴가 나온다', async () => {
    resetSessionState()
    asAuthenticated()
    renderWithProviders(
      <Route element={<AppLayout />}>
        <Route path="/en/admin/traffic" element={<div>traffic-stub</div>} />
      </Route>,
      { route: '/en/admin/traffic' },
    )

    fireEvent.click(await screen.findByTestId('mobile-nav-open'))
    const drawer = await screen.findByTestId('mobile-nav')
    expect(within(drawer).getAllByRole('link', { name: /코드 테이블|Code tables/ }).length).toBeGreaterThan(0)
  })
})
