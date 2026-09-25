/**
 * 언어 prefix 라우팅 테스트 (storyboard 00-common §2.3·§3.3) — W2 회귀 게이트.
 *
 * ko(무prefix) 경로가 불변이라는 것이 전제다(기존 페이지 테스트 전수가 담당) — 여기서는
 * /en·/ja·/zh 서브트리가 같은 페이지를 언어별로 렌더하는지, prefix가 언어를 강제하는지,
 * useChangeLanguage이 논리 경로·쿼리를 유지한 채 prefix만 교체하는지를 검증한다.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import i18n, { LANGUAGE_STORAGE_KEY } from '@/lib/i18n'
import { AppRoutes } from '@/routes/app-routes'
import { resetSessionState, renderWithProviders } from '@/test/test-app'
import { useChangeLanguage } from '@/hooks/use-change-language'
import { useSessionStore } from '@/stores/session'

/** 현재 라우터 위치를 화면에 노출 — prefix 교체·쿼리 보존 단언용 */
function LocationEcho() {
  const { pathname, search } = useLocation()
  return <div data-testid="location-echo">{`${pathname}${search}`}</div>
}

/** 언어 전환 트리거 — user-menu·LanguageSelect가 쓰는 것과 같은 훅 */
function ChangeLanguageButton({ target }: { target: 'en' | 'zh' }) {
  const changeLanguage = useChangeLanguage()
  return <button type="button" onClick={() => changeLanguage(target)}>{`to-${target}`}</button>
}

beforeEach(() => {
  resetSessionState()
  window.localStorage.clear()
  void i18n.changeLanguage('ko')
  document.documentElement.lang = 'ko'
})

afterEach(() => {
  window.localStorage.clear()
  void i18n.changeLanguage('ko')
  document.documentElement.lang = 'ko'
})

describe('언어 prefix 라우팅', () => {
  it('/en 랜딩 — 영어 문구 렌더 + html lang=en + 흔적 저장', async () => {
    renderWithProviders(<AppRoutes />, { route: '/en', wrapRoutes: false })

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('From one diagram')
    await waitFor(() => expect(document.documentElement.lang).toBe('en'))
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })

  it('/zh/terms — 중국어 약관 + html lang=zh-Hans', async () => {
    renderWithProviders(<AppRoutes />, { route: '/zh/terms', wrapRoutes: false })

    // 약관 본문(간체) — fixture 없는 정적 페이지라 즉시 렌더된다
    expect(await screen.findByRole('heading', { name: '服务条款' })).toBeInTheDocument()
    await waitFor(() => expect(document.documentElement.lang).toBe('zh-Hans'))
  })

  it('/ja/dashboard 게스트 — /ja/login으로 리다이렉트(prefix 보존), 일본어 로그인 화면', async () => {
    // 게스트 확정 — 가드가 리다이렉트를 내리는 상태(bootstrapping이면 스플래시에 머문다)
    useSessionStore.setState({ status: 'unauthenticated' })
    renderWithProviders(<AppRoutes />, { route: '/ja/dashboard', wrapRoutes: false })

    expect(await screen.findByRole('heading', { name: 'Crowfootにログイン' })).toBeInTheDocument()
  })

  it('무prefix / — ko 랜딩 회귀(기존 경로 불변)', async () => {
    renderWithProviders(<AppRoutes />, { route: '/', wrapRoutes: false })

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('한 장의 ERD가')
    await waitFor(() => expect(document.documentElement.lang).toBe('ko'))
  })

  it('/en/almost-anything — 언어 영역별 404(영어)', async () => {
    renderWithProviders(<AppRoutes />, { route: '/en/does-not-exist', wrapRoutes: false })

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('useChangeLanguage — prefix 교체', () => {
  it('ko → en: 논리 경로·쿼리를 유지한 채 prefix를 붙인다', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <Route path="/workspaces" element={<><ChangeLanguageButton target="en" /><LocationEcho /></>} />
        <Route path="/en/workspaces" element={<LocationEcho />} />
      </>,
      { route: '/workspaces?tab=members' },
    )

    await user.click(screen.getByRole('button', { name: 'to-en' }))

    expect(await screen.findByTestId('location-echo')).toHaveTextContent('/en/workspaces?tab=members')
  })

  it('ja → zh: 현재 prefix를 떼고 대상 prefix를 붙인다', async () => {
    const user = userEvent.setup()
    await i18n.changeLanguage('ja')
    renderWithProviders(
      <>
        <Route path="/ja/workspaces" element={<><ChangeLanguageButton target="zh" /><LocationEcho /></>} />
        <Route path="/zh/workspaces" element={<LocationEcho />} />
      </>,
      { route: '/ja/workspaces?tab=settings' },
    )

    await user.click(screen.getByRole('button', { name: 'to-zh' }))

    expect(await screen.findByTestId('location-echo')).toHaveTextContent('/zh/workspaces?tab=settings')
  })
})
