/**
 * 이용약관 페이지 컴포넌트 테스트 (frontend-testing.md B2)
 *
 * given: 공개 라우트 /terms
 * when: 렌더
 * then: 무료 매니지드 DB 영속성 비보장 고지 문구와 메인 링크 노출 검증
 */
import { screen } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { TermsPage } from '@/pages/terms'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

describe('이용약관 페이지', () => {
  beforeEach(() => {
    resetSessionState()
  })

  it('무료 매니지드 DB의 영속성 비보장을 고지한다', () => {
    renderWithProviders(<Route path="/terms" element={<TermsPage />} />, { route: '/terms' })

    expect(screen.getByRole('heading', { level: 1, name: '이용약관' })).toBeInTheDocument()
    // 핵심 고지 — 사전 통지 없는 삭제·중단 가능, 백업 안내
    expect(screen.getByText(/영속성은 보장하지 않습니다/)).toBeInTheDocument()
    expect(screen.getByText(/사전 통지 없이 데이터베이스가 삭제되거나/)).toBeInTheDocument()
    expect(screen.getByText(/직접 백업하십시오/)).toBeInTheDocument()
    // 4개 섹션 전부 렌더
    for (const heading of ['서비스 소개', '무료 매니지드 데이터베이스', '제공 조건의 변경', '책임 제한']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: '← 메인으로' })).toHaveAttribute('href', '/')
  })
})
