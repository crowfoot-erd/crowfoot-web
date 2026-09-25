/**
 * 계정 로케일 동기화 테스트 (storyboard 00-common §3.3) — useAccountLanguage 우선순위.
 *
 * me 도착 시 1회: ① 수동 흔적(localStorage)이 있으면 무동작(수동값 최우선)
 * ② 계정 locale이 저장돼 있으면 적용(재로그인 유지) ③ locale이 null이면 감지 언어를
 * 1회 PATCH로 등록한다. URL prefix 영역에서는 LocaleRoute가 이겨 적용하지 않는다.
 */
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n, { LANGUAGE_STORAGE_KEY } from '@/lib/i18n'
import { ok, resetModelContentState } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { useAccountLanguage } from '@/features/auth/hooks'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

function Probe() {
  useAccountLanguage()
  return <div>probe</div>
}

/** me 응답의 locale을 교체한 핸들러 */
function meWithLocale(locale: string | null) {
  return http.get('/api/v1/core/accounts/me', () =>
    HttpResponse.json(ok({ response: { userId: '2', email: 'bootstrap@example.com', name: '부트스트랩 관리자', locale, providers: ['github'], admin: true, createdAt: '2026-01-02T00:00:00Z' } })),
  )
}

beforeEach(() => {
  resetSessionState()
  resetModelContentState()
  window.localStorage.clear()
  window.history.pushState(null, '', '/')
  void i18n.changeLanguage('ko')
  document.documentElement.lang = 'ko'
  asAuthenticated()
})

afterEach(() => {
  window.localStorage.clear()
  window.history.pushState(null, '', '/')
  void i18n.changeLanguage('ko')
  document.documentElement.lang = 'ko'
})

describe('useAccountLanguage — 언어 상태 우선순위', () => {
  it('계정 locale이 저장돼 있고 흔적이 없으면 → 계정 언어를 적용한다 (PATCH 없음)', async () => {
    const patch = vi.fn()
    server.use(meWithLocale('ja'))
    server.use(http.patch('/api/v1/core/accounts/me', () => { patch(); return HttpResponse.json(ok({ response: {} })) }))

    renderWithProviders(<Probe />, { wrapRoutes: false })

    await waitFor(() => expect(i18n.language).toBe('ja'))
    expect(document.documentElement.lang).toBe('ja')
    // 등록이 아니라 적용만 한다 — 서버에 쓰지 않는다
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(patch).not.toHaveBeenCalled()
  })

  it('계정 locale이 null이고 흔적도 없으면 → 감지 언어를 1회 PATCH로 등록한다', async () => {
    const bodies: unknown[] = []
    server.use(meWithLocale(null))
    server.use(http.patch('/api/v1/core/accounts/me', async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(ok({ response: {} }))
    }))

    renderWithProviders(<Probe />, { wrapRoutes: false })

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ locale: 'ko' }) // 현재 언어(ko) = 감지 언어
  })

  it('수동 변경 흔적이 있으면 → 무동작 (흔적 언어가 이긴다, 계정 locale도 PATCH도 없다)', async () => {
    const patch = vi.fn()
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    // 수동 전환 직후 상태 — setLanguage를 거치지 않고 동일 조건을 만든다
    void i18n.changeLanguage('zh')
    document.documentElement.lang = 'zh-Hans'
    server.use(meWithLocale('ja'))
    server.use(http.patch('/api/v1/core/accounts/me', () => { patch(); return HttpResponse.json(ok({ response: {} })) }))

    renderWithProviders(<Probe />, { wrapRoutes: false })

    // me 도착·effect 실행까지 기다린 뒤 — 그럼에도 흔적 언어가 유지돼야 한다
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(i18n.language).toBe('zh')
    expect(document.documentElement.lang).toBe('zh-Hans')
    expect(patch).not.toHaveBeenCalled()
  })

  it('URL prefix 영역(/en)에서는 계정 locale을 적용하지 않는다 — LocaleRoute가 이긴다', async () => {
    const patch = vi.fn()
    window.history.pushState(null, '', '/en/dashboard')
    // LocaleRoute가 /en을 강제한 직후의 상태
    void i18n.changeLanguage('en')
    document.documentElement.lang = 'en'
    server.use(meWithLocale('ja'))
    server.use(http.patch('/api/v1/core/accounts/me', () => { patch(); return HttpResponse.json(ok({ response: {} })) }))

    renderWithProviders(<Probe />, { wrapRoutes: false })

    // me 도착·effect 실행까지 기다린 뒤 — 그럼에도 URL 언어가 유지돼야 한다
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(i18n.language).toBe('en')
    expect(patch).not.toHaveBeenCalled()
  })
})
