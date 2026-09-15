/**
 * S-01 로그인 화면 컴포넌트 테스트 (frontend-testing.md B2)
 *
 * given: providers 응답 형태를 MSW로 정의
 * when: 화면 렌더·버튼 클릭
 * then: 로딩/빈/에러/정상 상태와 풀페이지 이동 규칙 검증
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { afterAll, afterEach, beforeEach, beforeAll, describe, expect, it } from 'vitest'

import { clearAccessToken } from '@/api/client'
import { fail, fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { OAUTH_PROVIDER_STORAGE_KEY, TERMS_CONSENT_STORAGE_KEY } from '@/features/auth'
import { LoginPage } from '@/pages/login'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

/** window.location 대체 — href 직접 설정 감지 (풀페이지 이동 검증) */
const stubbedLocation = { href: 'http://localhost/' }
const originalLocation = window.location

describe('로그인 화면', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', { value: stubbedLocation, writable: true })
  })
  afterAll(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem(TERMS_CONSENT_STORAGE_KEY)
    stubbedLocation.href = 'http://localhost/'
    resetSessionState()
    clearAccessToken()
  })

  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('renders provider buttons from the public providers API', async () => {
    renderWithProviders(<Route path="/login" element={<LoginPage />} />, { route: '/login' })

    // then: 활성 제공자 수만큼 버튼 (github 1건)
    const button = await screen.findByRole('button', { name: /GitHub/ })
    expect(button).toBeVisible()
  })

  it('shows skeletons while providers are loading', () => {
    // given: 응답이 영원히 오지 않는 핸들러
    server.use(http.get('/api/v1/core/providers', () => new Promise<never>(() => {})))

    renderWithProviders(<Route path="/login" element={<LoginPage />} />, { route: '/login' })

    // then: 스켈레톤 2개 (스토리보드 §2)
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: /GitHub/ })).not.toBeInTheDocument()
  })

  it('shows the error state with retry when providers fail', async () => {
    // given: 5xx
    server.use(http.get('/api/v1/core/providers', () => fail('SERVICE_UNAVAILABLE', 502)))

    renderWithProviders(<Route path="/login" element={<LoginPage />} />, { route: '/login' })

    // then: 실패 문구 + 재시도
    expect(await screen.findByText(/로그인 방식을 불러오지 못했습니다/)).toBeVisible()

    // when: 재시도 — 정상 응답으로 복구
    server.use(
      http.get('/api/v1/core/providers', () =>
        HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
          ...fixtures.providers,
        }),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: /다시 시도/ }))

    // then
    expect(await screen.findByRole('button', { name: /GitHub/ })).toBeVisible()
  })

  it('shows the empty guidance when no providers are active', async () => {
    // given: 활성 제공자 0건
    server.use(
      http.get('/api/v1/core/providers', () =>
        HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
          totalCount: 0,
          responses: [],
        }),
      ),
    )

    renderWithProviders(<Route path="/login" element={<LoginPage />} />, { route: '/login' })

    // then: 0건 안내 문구
    expect(await screen.findByText('사용 가능한 로그인 방식이 없습니다')).toBeVisible()
  })

  it('stores provider in sessionStorage and navigates full-page on click', async () => {
    renderWithProviders(<Route path="/login" element={<LoginPage />} />, { route: '/login' })

    // given: 이용약관 동의
    await userEvent.click(screen.getByRole('checkbox'))
    const button = await screen.findByRole('button', { name: /GitHub/ })
    await userEvent.click(button)

    // then: 풀페이지 이동(302 — fetch 금지) + provider 저장
    expect(stubbedLocation.href).toBe('/api/v1/auth/oauth2/github')
    expect(window.sessionStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY)).toBe('github')
  })

  it('locks provider buttons until the terms consent is given', async () => {
    renderWithProviders(<Route path="/login" element={<LoginPage />} />, { route: '/login' })

    // then: 동의 전에는 제공자 버튼 잠금 + 약관 링크 노출
    const button = await screen.findByRole('button', { name: /GitHub/ })
    expect(button).toBeDisabled()
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms')

    // when: 동의 체크
    await userEvent.click(screen.getByRole('checkbox'))

    // then: 버튼 활성 + 동의는 브라우저에 기록
    expect(button).toBeEnabled()
    expect(window.localStorage.getItem(TERMS_CONSENT_STORAGE_KEY)).toBe('agreed')
  })

  it('remembers previous consent — buttons enabled immediately', async () => {
    // given: 이전 로그인에서 동의 기록
    window.localStorage.setItem(TERMS_CONSENT_STORAGE_KEY, 'agreed')

    renderWithProviders(<Route path="/login" element={<LoginPage />} />, { route: '/login' })

    // then: 재동의 없이 즉시 진행 가능
    const button = await screen.findByRole('button', { name: /GitHub/ })
    expect(button).toBeEnabled()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('redirects to next when already authenticated', async () => {
    // given: 이미 인증 상태 + next 파라미터
    asAuthenticated()

    renderWithProviders(
      <>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/workspaces" element={<div>워크스페이스 화면</div>} />
      </>,
      { route: '/login?next=/workspaces' },
    )

    // then: 로그인 화면을 보지 않고 next로 치환 이동
    expect(await screen.findByText('워크스페이스 화면')).toBeVisible()
    expect(screen.queryByRole('button', { name: /GitHub/ })).not.toBeInTheDocument()
  })
})
