/**
 * 랜딩/소개 페이지 컴포넌트 테스트 (frontend-testing.md B2)
 *
 * given: 게스트/인증 세션 상태, 통합 공유 갤러리(인기 3+최근)·최근 릴리스 공개 API 응답(MSW)
 * when: 렌더
 * then: 특징 카드·갤러리(인기 박스·템플릿 섹션 부재)·릴리스·CTA 링크 노출, 빈 섹션 숨김과 인증 CTA 규칙 검증
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { LandingPage } from '@/pages/landing'
import { APP_VERSION } from '@/lib/version'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

describe('랜딩 페이지', () => {
  beforeEach(() => {
    resetSessionState()
  })

  it('무료 개발용 데이터베이스 구역 — 요점 넷과 접속 정보 모양, 받기 버튼은 게스트를 로그인으로 보낸다', () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)
    const section = screen.getByTestId('landing-free-db')
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('개발에 쓸 데이터베이스, 그냥 드립니다')
    expect(within(section).getAllByRole('listitem')).toHaveLength(4)
    expect(section).toHaveTextContent('계정당 5개까지 무료 — 카드 등록 없음')
    expect(within(section).getByTestId('landing-free-db-cta')).toHaveAttribute('href', '/login')
    // 슬라이드 다음에 온다
    const order = screen.getByTestId('landing-shots').compareDocumentPosition(section)
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('슬라이드 — 5초마다 다음 장으로 넘어가고, 마우스를 올리거나 탭을 고르면 멈춘다', () => {
    vi.useFakeTimers()
    try {
      renderWithProviders(<Route path="/" element={<LandingPage />} />)
      const shots = screen.getByTestId('landing-shots')
      const index = () => within(shots).getByTestId('landing-shots-track').getAttribute('data-index')
      expect(index()).toBe('0')

      act(() => vi.advanceTimersByTime(4900))
      expect(index()).toBe('0')
      act(() => vi.advanceTimersByTime(100))
      expect(index()).toBe('1')

      // 마우스를 올리면 멈추고, 떼면 다시 넘어간다
      fireEvent.mouseEnter(shots)
      act(() => vi.advanceTimersByTime(15000))
      expect(index()).toBe('1')
      fireEvent.mouseLeave(shots)
      act(() => vi.advanceTimersByTime(5000))
      expect(index()).toBe('2')

      // 마지막 장 다음은 첫 장으로 돌아온다
      act(() => vi.advanceTimersByTime(15000))
      expect(index()).toBe('0')

      // 탭을 직접 고르면 그 뒤로는 넘기지 않는다
      fireEvent.click(within(shots).getAllByRole('tab')[4])
      act(() => vi.advanceTimersByTime(30000))
      expect(index()).toBe('4')
    } finally {
      vi.useRealTimers()
    }
  })

  it('AI 연동(MCP) 소개 — 슬라이드의 첫 장. 요점 넷과 대화 예시, 연결 방법은 사용 가이드의 그 소제목으로 새 창에서 연다', async () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)
    const section = await screen.findByTestId('landing-mcp')
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Claude와 ChatGPT가 ERD를 그립니다')
    expect(within(section).getAllByRole('listitem')).toHaveLength(4)
    expect(section).toHaveTextContent('샘플 데이터')
    expect(section).toHaveTextContent('도서 대여 서비스의 요구사항을 정리해서 ERD로 만들어 줘')
    const guide = within(section).getByTestId('landing-mcp-guide')
    expect(guide).toHaveAttribute('href', '/guide#20.1')
    expect(guide).toHaveAttribute('target', '_blank')
    // MCP 소개는 슬라이드의 첫 장이다
    expect(screen.getByTestId('landing-shots-track').firstElementChild).toBe(section)
  })

  it('사용 가이드 링크 — 헤더·히어로·주요 기능 아래·푸터에 있고 모두 새 창으로 연다', () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    const links = screen.getAllByRole('link', { name: /사용 가이드/ })
    // 헤더, 히어로 버튼, 주요 기능 아래("…사용 가이드에서 자세히 보기"), 푸터
    expect(links).toHaveLength(4)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/guide')
      expect(link).toHaveAttribute('target', '_blank')
    }
    expect(screen.getByTestId('landing-guide-link')).toHaveTextContent('사용 가이드')
    expect(screen.getByRole('link', { name: '모든 기능과 사용법을 사용 가이드에서 자세히 보기' })).toBeVisible()
  })

  it('게스트 — 히어로·핵심 강조·특징 12종·CTA를 렌더한다', () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    // 히어로 아래의 슬라이드 — 첫 장은 AI 연동(MCP) 소개, 그 뒤로 제품 화면 넷. 탭으로 고른다
    const shots = screen.getByTestId('landing-shots')
    const tabs = within(shots).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['AI 연동 (MCP)', 'ERD 에디터', '요구사항 추적', 'Claude·ChatGPT 연결', '데이터 브라우저'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    // 화면 넷이 한 줄(트랙)에 이어져 있고, 고른 화면의 자리로 옆으로 민다
    const track = within(shots).getByTestId('landing-shots-track')
    const images = track.querySelectorAll('img')
    expect([...images].map((image) => image.getAttribute('src'))).toEqual([
      '/guide-assets/ko/editor-overview.webp',
      '/guide-assets/ko/editor-requirements.webp',
      '/guide-assets/ko/workspace-mcp.webp',
      '/guide-assets/ko/data-tab.webp',
    ])
    expect(images[0]).toHaveAttribute('alt', expect.stringContaining('Crowfoot ERD 에디터 화면'))
    expect(track).toHaveAttribute('data-index', '0')
    expect(track.style.transform).toBe('translateX(-0%)')

    // 첫 장(MCP 소개)이 보이고 다른 장은 초점이 가지 않는다
    expect(within(track).getByTestId('landing-mcp')).not.toHaveAttribute('inert')
    expect(images[0].closest('a')).toHaveAttribute('inert')

    fireEvent.click(tabs[3])
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true')
    expect(track.style.transform).toBe('translateX(-300%)')
    expect(images[2].closest('a')).toHaveAttribute('target', '_blank')
    expect(images[2].closest('a')).not.toHaveAttribute('inert')
    expect(within(track).getByTestId('landing-mcp')).toHaveAttribute('inert')
    // 제목 — 다른 ERD 툴과 갈리는 점(실제 DB까지, 무료)을 앞세운다
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ERD만 그리고 끝나는 툴은 많습니다Crowfoot은 실제 DB까지, 무료로')
    // 행동 버튼 아래에 무료 조건 한 줄
    expect(screen.getByTestId('landing-cta-note')).toHaveTextContent('카드 등록 없음')
    // 제목 아래의 요청 예시 — AI에게 하는 말을 타자 치듯 보여 준다(전체 문장은 접근성 이름으로 준다)
    expect(screen.getByTestId('landing-hero-prompt')).toHaveAccessibleName(/쇼핑몰 ERD 만들어 줘/)
    // 다른 ERD 툴과 갈리는 세 가지 — 무료 DB, 내 AI 연결(MCP), 요구사항 추적
    const edge = screen.getByTestId('landing-edge')
    expect(within(edge).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '무료 DB 발급과 배포',
      '내 AI가 설계합니다 (MCP)',
      '요구사항 추적',
    ])
    expect(edge).toHaveTextContent('AI를 내장하지 않았습니다')
    // 특징 12종 카드 — 매니지드 DB가 첫 번째
    for (const title of [
      '무료 MySQL·PostgreSQL 데이터베이스',
      '온라인 ERD 에디터',
      '실시간 ERD 협업',
      'DB에서 ERD 자동 생성',
      'DDL·마이그레이션 SQL 생성',
      'ERD 설계 검증',
      '버전 기록과 비교',
      'ERD 예제·템플릿',
      '링크 공유와 피드백',
      '이미지·SQL 내보내기',
      '워크스페이스·팀 권한',
      '오픈소스',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    // 3단계 흐름 — ERD 그리기 → 함께 다듬기 → DB로 만들기
    for (const title of ['ERD 그리기', '함께 다듬기', 'DB로 만들기']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    // CTA — 로그인 링크와 GitHub 외부 링크
    expect(screen.getAllByText('지금 무료로 시작하기').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/crowfoot-erd',
    )
    // 푸터 — 이용약관 링크 + 현재 버전(첫 방문에서도 지금 버전을 알 수 있게)
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms')
    // 버전 표기는 원천(version.ts)과 비교 — 릴리스마다 기대값을 고쳐 쓰지 않게(v1.19 때 누락)
    expect(screen.getByTestId('landing-current-version')).toHaveTextContent(`현재 버전 v${APP_VERSION}`)
  })

  it('게스트 — 랜딩에는 템플릿 전용 섹션이 없다(통합 갤러리로 흡수)', async () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    // then: 템플릿 진입은 워크스페이스 다이얼로그뿐 — 랜딩 섹션·제목 모두 없다
    await screen.findByRole('heading', { name: '지금 공유되고 있는 ERD' })
    expect(screen.queryByTestId('landing-templates')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '템플릿으로 바로 시작' })).not.toBeInTheDocument()
  })

  it('게스트 — 갤러리는 인기 3 박스와 최근 카드로 구성되고 순서는 서버 그대로다', async () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    // then: 제목은 원래 이름으로 고정 — 순서·선별(전 워크스페이스·인기 3 우선+최근·21 상한)은 서버 소관
    expect(await screen.findByRole('heading', { name: '지금 공유되고 있는 ERD' })).toBeVisible()
    // 인기 박스 — 선두 3건(반응 수 우선, v1.21)이 다른 꼴의 카드로 강조된다
    expect(screen.getByText('가장 인기 있는 문서')).toBeVisible()
    const popular = screen.getByTestId('landing-gallery-popular')
    expect(within(popular).getAllByText('인기')).toHaveLength(3)
    // 반응 우선 산정 증명 — 반응 12·조회 3인 정산이 반응 9·조회 128인 주문을 제친다
    const popularLinks = within(popular).getAllByRole('link')
    expect(popularLinks[0]).toHaveAttribute('href', '/share/P0pularT0ken0fSettle2c')
    const order = screen.getByRole('link', { name: /주문 서비스 ERD/ })
    expect(order).toHaveAttribute('href', '/share/Sh4reT0ken0fM0del501aaaa')
    expect(order).toHaveAttribute('target', '_blank')
    expect(within(popular).getByRole('link', { name: /정산 배치 ERD/ })).toHaveAttribute(
      'href',
      '/share/P0pularT0ken0fSettle2c',
    )
    // 현지화 템플릿(86 zh)도 갤러리 카드는 문서 메타 그대로 — 템플릿 다이얼로그도 같은 규칙(v1.24)
    expect(within(popular).getByRole('link', { name: /图书馆借阅 ERD/ })).toHaveAttribute(
      'href',
      '/share/R3CdH4r2yASL7MoWB61H0Y',
    )
    expect(screen.queryByText('도서관 대출 ERD')).not.toBeInTheDocument()
    // 반응 수 표기(v1.21) — 인기 정렬 1순위 원료를 red 악센트로 노출
    expect(screen.getByText('좋아요 12')).toBeInTheDocument()
    expect(screen.getByText('좋아요 9')).toBeInTheDocument()
    expect(screen.getByText('좋아요 3')).toBeInTheDocument()
    // 조회수 표기 — 반응 다음의 보조 신호(단순 카운트)를 카드에도 그대로 노출
    expect(screen.getByText('조회 128회')).toBeInTheDocument()
    expect(screen.getByText('조회 3회')).toBeInTheDocument()
    expect(screen.getByText('조회 2회')).toBeInTheDocument()
    // 최근 구간 — 인기 3을 제외한 나머지가 인기 박스와 같은 꼴(배지→제목→설명→풋터)로 온다.
    // 배지 아이콘은 인기(Flame·red)와 달리 Clock+primary — "최근"을 나타내는 관용 표기(2026-09-28)
    expect(screen.getByText('최근 공유되고 있는 문서')).toBeVisible()
    const recent = screen.getByTestId('landing-gallery-recent')
    expect(within(recent).getAllByText('최근')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /iUnoT ERD/ })).toHaveAttribute(
      'href',
      '/share/CommunityT0ken0fiUnoTx1',
    )
    expect(screen.getByText('좋아요 0')).toBeInTheDocument()
    expect(screen.queryByText('그 밖의 커뮤니티 공유')).not.toBeInTheDocument()
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
    await screen.findByRole('heading', { name: 'ERD 설계에 필요한 기능을 한곳에' })
    await expect
      .poll(() => screen.queryByRole('heading', { name: '지금 공유되고 있는 ERD' }))
      .toBeNull()
  })

  it('게스트 — 최근 릴리스를 나열하고 공개 뷰어를 새 창으로 연다 (FEEDBACK 미노출)', async () => {
    renderWithProviders(<Route path="/" element={<LandingPage />} />)

    // then: 릴리스 라벨 + fixture 릴리스 노트(RELEASE_NOTE만) — 인증 없는 공개 API
    expect(await screen.findByRole('heading', { name: '최근 릴리스' })).toBeVisible()
    // 전체 목록(목차가 있는 공개 화면)으로 가는 링크
    expect(screen.getByTestId('landing-release-notes-more')).toHaveAttribute('href', '/release-notes')
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

    await screen.findByRole('heading', { name: 'ERD 설계에 필요한 기능을 한곳에' })
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
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('ERD만 그리고 끝나는 툴은 많습니다')
    // 히어로 CTA·헤더 버튼 모두 앱(대시보드)으로 — 로그인 유도는 사라진다
    expect(screen.getByRole('link', { name: '앱으로 이동' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: '대시보드' })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByRole('link', { name: '지금 무료로 시작하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
    // 앱 셸과 같은 사용자 메뉴 — 정보·로그아웃 진입이 헤더에 있다
    expect(await screen.findByRole('button', { name: /부트스트랩 관리자/ })).toBeVisible()
  })
})
