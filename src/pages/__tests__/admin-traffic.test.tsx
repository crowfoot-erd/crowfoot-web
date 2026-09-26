/**
 * 관리자 트래픽 통계 화면 테스트 (storyboard 03-admin §9 — 지표 원천 08-core/10-metrics.md §7)
 *
 * given: /core/admin/metrics/* MSW fixtures (KST 오늘 기준 계열)
 * when: 화면 렌더·기간/차원 탭 전환
 * then: 요약 카드 값·어제 대비 배지·탭 전환 재조회·빈 상태·share 문서명 표기 검증
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fixtures } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import AdminTrafficPage from '@/pages/admin/traffic'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderTraffic() {
  return renderWithProviders(<Route path="/admin/traffic" element={<AdminTrafficPage />} />, {
    route: '/admin/traffic',
  })
}

describe('트래픽 통계 화면', () => {
  it('renders summary cards with today values and day-over-day badges', async () => {
    renderTraffic()

    // then: 오늘 스냅샷 5종 — pv 120(+25% vs 어제 96), 봇은 지표 카드로만 존재
    expect(await screen.findByText('페이지뷰')).toBeVisible()
    expect(screen.getByText('120')).toBeVisible()
    expect(screen.getByText('+25%')).toBeVisible()
    expect(screen.getByText('고유 방문자')).toBeVisible()
    expect(screen.getByText('신규 방문자')).toBeVisible()
    expect(screen.getByText('봇 비콘')).toBeVisible()
  })

  it('refetches summary and breakdown with the selected period', async () => {
    const requestedDays: number[] = []
    server.use(
      http.get('/api/v1/core/admin/metrics/summary', ({ request }) => {
        requestedDays.push(Number(new URL(request.url).searchParams.get('days')))
        return HttpResponse.json(
          ok({
            response: {
              days: 28,
              today: fixtures.traffic.today,
              yesterday: fixtures.traffic.yesterday,
              lastWeekSameDay: fixtures.traffic.lastWeekSameDay,
              series: [],
            },
          }),
        )
      }),
    )
    const user = userEvent.setup()
    renderTraffic()

    await screen.findByText('120')
    await user.click(screen.getByRole('tab', { name: '7일' }))

    // then: queryKey(days)가 바뀌어 days=7으로 재조회
    await screen.findByText('120')
    expect(requestedDays.length).toBeGreaterThanOrEqual(2)
    expect(requestedDays.at(-1)).toBe(7)
  })

  it('switches the breakdown dimension tab and refetches entries', async () => {
    const user = userEvent.setup()
    renderTraffic()

    // 기본 차원 device — 표에 원문 key
    expect(await screen.findByText('desktop')).toBeVisible()
    expect(screen.getByText('mobile')).toBeVisible()

    await user.click(screen.getByRole('tab', { name: '브라우저' }))

    // then: browser 차원으로 재조회 — chrome/safari 행
    expect(await screen.findByText('chrome')).toBeVisible()
    expect(screen.getByText('safari')).toBeVisible()
  })

  it('shows share document names and falls back to the token when the document is gone', async () => {
    renderTraffic()

    // then: share 섹션 — 서버 displayName 조인(§5.2), 문서가 사라진 공유는 토큰 그대로
    expect(await screen.findByText('쇼핑몰 ERD')).toBeVisible()
    expect(screen.getByText('블로그 CMS')).toBeVisible()
    expect(screen.getByText('tok-ghost')).toBeVisible()
  })

  it('renders an empty state when no visits were collected in the period', async () => {
    server.use(
      http.get('/api/v1/core/admin/metrics/breakdown', ({ request }) => {
        const dimension = new URL(request.url).searchParams.get('dimension')
        return HttpResponse.json(ok({ response: { dimension, days: 28, total: 0, entries: [] } }))
      }),
    )
    renderTraffic()

    // then: 차원 분포·공유 TOP 모두 빈 문구
    expect(await screen.findAllByText('이 기간에 수집된 방문이 없습니다')).toHaveLength(1)
    expect(await screen.findByText('이 기간에 공유 문서 방문이 없습니다')).toBeVisible()
  })

  it('renders login lines and top feature usage charts with accessible labels', async () => {
    renderTraffic()

    // then: 차트는 role="img" + aria-label(표·카드가 수치 원천, 차트는 시각 보조)
    expect(await screen.findByRole('img', { name: '일별 로그인 선 차트 — 성공은 실선, 실패는 점선' })).toBeVisible()
    expect(screen.getByRole('img', { name: '감사 액션별 사용량 가로 막대 — 상위 10개' })).toBeVisible()
    expect(screen.getByRole('img', { name: '일별 방문 추이 차트 — 페이지뷰·세션(왼쪽 축), 고유 방문자·신규 방문자(오른쪽 축)' })).toBeVisible()
  })
})
