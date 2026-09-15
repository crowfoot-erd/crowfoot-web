/**
 * 랜딩/소개 페이지 컴포넌트 테스트 (frontend-testing.md B2)
 *
 * given: 게스트/인증 세션 상태, 공유 갤러리 공개 API 응답(MSW)
 * when: 렌더
 * then: 특징 카드·갤러리·CTA 링크 노출, 빈 갤러리 숨김과 /dashboard 리다이렉트 규칙 검증
 */
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { LandingPage } from '@/pages/landing'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

describe('랜딩 페이지', () => {
  beforeEach(() => {
    resetSessionState()
  })

  it('게스트 — 히어로·핵심 강조·특징 6종·CTA를 렌더한다', () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한 장의 ERD가')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('실제 데이터베이스가 됩니다')
    // 핵심 강조 — 무료 매니지드 DB 조건
    expect(screen.getByText('PostgreSQL · MySQL')).toBeInTheDocument()
    expect(screen.getByText('계정당 최대 5개')).toBeInTheDocument()
    expect(screen.getByText('무료 제공')).toBeInTheDocument()
    // 특징 6종 카드 — 매니지드 DB가 첫 번째
    for (const title of [
      '무료 매니지드 데이터베이스',
      '브라우저 ERD 에디터',
      '실시간 협업',
      '데이터베이스 연동',
      '워크스페이스·팀 권한',
      '오픈소스',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    // 3단계 흐름 — 그리기 → 함께 다듬기 → 실행
    for (const title of ['그리기', '함께 다듬기', '실행하기']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    // CTA — 로그인 링크와 GitHub 외부 링크
    expect(screen.getAllByText('무료로 시작하기').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/crowfoot-erd',
    )
    // 푸터 — 이용약관 링크
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms')
  })

  it('게스트 — 공유 갤러리는 현재 공유 중인 문서를 카드로 렌더하고 공개 뷰어로 연결한다', async () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    // then: 갤러리 헤딩 + fixture 문서 카드(이름·DBMS 배지) — 인증 없는 공개 API
    expect(await screen.findByRole('heading', { name: '지금 공유되고 있는 문서' })).toBeVisible()
    const card = screen.getByRole('link', { name: /주문 서비스 ERD/ })
    expect(card).toHaveAttribute('href', '/share/Sh4reT0ken0fM0del501aaaa')
    // 공개 뷰어는 새 창으로 — 랜딩 흐름 유지
    expect(card).toHaveAttribute('target', '_blank')
    expect(screen.getByText('postgresql')).toBeInTheDocument()
  })

  it('게스트 — 공유 중인 문서가 없으면 갤러리 섹션을 숨긴다', async () => {
    server.use(
      // 갤러리 응답을 빈 목록으로 — 섹션 자체가 없어야 한다
      http.get('/api/v1/core/shares', () =>
        HttpResponse.json(ok({ totalCount: 0, responses: [] })),
      ),
    )
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    // 갤러리 로드가 확정될 때까지 대기 후 — 헤딩이 없다
    await screen.findByRole('heading', { name: '주요 기능' })
    await expect
      .poll(() => screen.queryByRole('heading', { name: '지금 공유되고 있는 문서' }))
      .toBeNull()
  })

  it('인증 상태 — 소개 대신 /dashboard로 보낸다', () => {
    asAuthenticated()
    renderWithProviders(
      <>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<div>dashboard-mock</div>} />
      </>,
    )

    expect(screen.getByText('dashboard-mock')).toBeInTheDocument()
  })
})
