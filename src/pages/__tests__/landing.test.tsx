/**
 * 랜딩/소개 페이지 컴포넌트 테스트 (frontend-testing.md B2)
 *
 * given: 게스트/인증 세션 상태
 * when: 렌더
 * then: 특징 카드·CTA 링크 노출과 /dashboard 리다이렉트 규칙 검증
 */
import { screen } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { LandingPage } from '@/pages/landing'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

describe('랜딩 페이지', () => {
  beforeEach(() => {
    resetSessionState()
  })

  it('게스트 — 히어로·핵심 강조·특징 6종·CTA·ERD 일러스트를 렌더한다', () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ERD를 그리고')
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
    // CTA — 로그인 링크와 GitHub 외부 링크
    expect(screen.getAllByText('시작하기').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/crowfoot-erd',
    )
    // ERD 일러스트
    expect(screen.getByRole('img', { name: /ERD 일러스트/ })).toBeInTheDocument()
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
