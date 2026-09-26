/**
 * 랜딩/소개 페이지 컴포넌트 테스트 (frontend-testing.md B2)
 *
 * given: 게스트/인증 세션 상태, 템플릿·공유 갤러리·최근 릴리스 공개 API 응답(MSW)
 * when: 렌더
 * then: 특징 카드·갤러리·릴리스·CTA 링크 노출, 빈 섹션 숨김과 인증 상태 CTA 전환 규칙 검증
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
    // 푸터 — 이용약관 링크 + 현재 버전(첫 방문에서도 지금 버전을 알 수 있게)
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms')
    expect(screen.getByTestId('landing-current-version')).toHaveTextContent('현재 버전 v1.18')
  })

  it('게스트 — 템플릿 섹션은 미리보기 링크가 있는 카드만 공개 뷰어로 연결한다', async () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    // then: 템플릿 헤딩 + fixture 카드(이름·counts) — 인증 없는 공개 API
    expect(await screen.findByTestId('landing-templates')).toBeVisible()
    expect(screen.getByRole('heading', { name: '템플릿으로 바로 시작' })).toBeVisible()
    // shareToken 있는 템플릿 — 미리보기 링크(새 창)
    const preview = screen.getByRole('link', { name: /쇼핑몰 커머스 ERD/ })
    expect(preview).toHaveAttribute('href', '/share/T3mplat3T0ken0fShopping1')
    expect(preview).toHaveAttribute('target', '_blank')
    expect(screen.getByText('테이블 20개 · 관계 24개')).toBeInTheDocument()
    // shareToken 없는 템플릿 — 정보 카드일 뿐 링크가 아니다. 현지화 문서(86 zh)는
    // 카드 표기가 한국어 표시맵으로 내려온다 — 원문 언어는 보이지 않는다
    expect(screen.getByRole('heading', { name: '도서관 대출 ERD' })).toBeVisible()
    expect(screen.queryByText('图书馆借阅 ERD')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /도서관 대출 ERD/ })).not.toBeInTheDocument()
  })

  it('게스트 — 갤러리는 서버가 정렬한 순서 그대로 카드를 내고 조회수를 표시한다', async () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    // then: 템플릿 섹션이 있으면 갤러리 제목은 "그 밖의" — 순서·선별(템플릿 제외·인기 6+최근·21 상한)은 서버 소관
    expect(await screen.findByRole('heading', { name: '그 밖의 커뮤니티 공유' })).toBeVisible()
    const card = screen.getByRole('link', { name: /주문 서비스 ERD/ })
    expect(card).toHaveAttribute('href', '/share/Sh4reT0ken0fM0del501aaaa')
    expect(card).toHaveAttribute('target', '_blank')
    // 조회수 표기 — 인기 정렬 원료(단순 카운트)를 카드에도 그대로 노출
    expect(screen.getByText('조회 128회')).toBeInTheDocument()
    expect(screen.getByText('조회 3회')).toBeInTheDocument()
  })

  it('게스트 — 템플릿이 없으면 갤러리 제목이 원래대로 돌아간다', async () => {
    server.use(
      // 템플릿 응답을 빈 목록으로 — 갤러리 제목이 기본으로 돌아간다(선별 자체는 서버 소관이라 그대로)
      http.get('/api/v1/core/templates', () =>
        HttpResponse.json(ok({ totalCount: 0, responses: [] })),
      ),
    )
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    expect(await screen.findByRole('heading', { name: '지금 공유되고 있는 문서' })).toBeVisible()
    expect(screen.getByRole('link', { name: /정산 배치 ERD/ })).toHaveAttribute(
      'href',
      '/share/P0pularT0ken0fSettle2c',
    )
    expect(screen.queryByTestId('landing-templates')).not.toBeInTheDocument()
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

  it('게스트 — 최근 릴리스를 나열하고 공개 뷰어를 새 창으로 연다 (FEEDBACK 미노출)', async () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    // then: 릴리스 라벨 + fixture 릴리스 노트(RELEASE_NOTE만) — 인증 없는 공개 API
    expect(await screen.findByRole('heading', { name: '최근 릴리스' })).toBeVisible()
    const link = screen.getByRole('link', { name: /v1\.4\.0 — 커뮤니티 게시판/ })
    expect(link).toHaveAttribute('href', '/release-notes/902')
    // 새 창 — 랜딩 흐름 유지(갤러리 카드와 같은 규칙)
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: /v1\.3\.0 — 관리형 데이터베이스/ })).toHaveAttribute(
      'href',
      '/release-notes/901',
    )
    // 공개 API 누수 방어 — FEEDBACK 제안 글은 랜딩에 없다
    expect(screen.queryByText('ERD 내보내기 포맷 제안')).not.toBeInTheDocument()
  })

  it('게스트 — 공개 릴리스 노트가 없으면 릴리스 섹션을 숨긴다', async () => {
    server.use(
      // 공개 recent 응답을 빈 목록으로 — 섹션 자체가 없어야 한다
      http.get('/api/v1/core/community/release-notes/recent', () =>
        HttpResponse.json(ok({ totalCount: 0, responses: [] })),
      ),
    )
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    await screen.findByRole('heading', { name: '주요 기능' })
    await expect
      .poll(() => screen.queryByRole('heading', { name: '최근 릴리스' }))
      .toBeNull()
  })

  it('인증 상태 — 랜딩을 그대로 보여주고 CTA는 앱 진입으로 전환된다', async () => {
    asAuthenticated()
    renderWithProviders(
      <>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<div>dashboard-mock</div>} />
      </>,
    )

    // then: 리다이렉트 없이 랜딩이 렌더된다 — 인증 사용자도 열람 가능
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('한 장의 ERD가')
    // 히어로 CTA·헤더 버튼 모두 앱(대시보드)으로 — 로그인 유도는 사라진다
    expect(screen.getByRole('link', { name: '앱으로 이동' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: '대시보드' })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByRole('link', { name: '무료로 시작하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
    // 앱 셸과 같은 사용자 메뉴 — 정보·로그아웃 진입이 헤더에 있다
    expect(await screen.findByRole('button', { name: /부트스트랩 관리자/ })).toBeVisible()
  })
})
