/**
 * 공유 문서 공개 뷰어(/share/{token}) 테스트 — 08-core/02-model.md §1.10, storyboard 00-common §2.1
 *
 * given: 공개 조회(/core/shares/{token}) 응답을 MSW로 정의 — 인증 없는 경로
 * when: 라우트로 직접 진입 (게스트 — 세션 없음)
 * then: 문서 메타 + 읽기 전용 툴바(저장·DDL·공유 없음) / 만료 410·없는 토큰 404 안내
 *       + head 메타(문서 제목·설명 — 성공 시 색인 허용·canonical /share/{token}·og:article,
 *       대기·오류는 noindex 유지, 00-common §3.11 v1.18 SEO 정책)
 */
import { screen } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { Route } from 'react-router-dom'

import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { resetEditorStore } from '@/features/editor/store/editor-store'
import { ShareViewerPage } from '@/pages/share-viewer'
import { renderWithProviders } from '@/test/test-app'

afterEach(() => resetEditorStore())

function renderViewer(token: string) {
  return renderWithProviders(<Route path="/share/:token" element={<ShareViewerPage />} />, {
    route: `/share/${token}`,
  })
}

describe('공유 문서 공개 뷰어', () => {
  it('renders the shared document read-only — 툴바에 저장·SQL 생성·공유가 없다', async () => {
    renderViewer('Sh4reT0ken0fM0del501aaaa')

    // then: 공개 응답 — 이름·DB 종류·공유 문서 배지
    expect(await screen.findByRole('heading', { name: '주문 서비스 ERD' })).toBeVisible()
    expect(screen.getByText('postgresql')).toBeVisible()
    expect(screen.getByText('공유 문서')).toBeVisible()

    // then: 읽기 전용 툴바 — 저장은 비활성, SQL 생성·공유(워크스페이스 API)는 없다
    expect(screen.getByText('읽기 전용')).toBeVisible()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'SQL 생성' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '공유' })).not.toBeInTheDocument()

    // then: 홈으로 링크
    expect(screen.getByRole('link', { name: /홈으로/ })).toHaveAttribute('href', '/')

    // then: head — 문서 제목·설명·색인 허용·canonical·og:article (00-common §3.11 v1.18)
    expect(document.title).toBe('주문 서비스 ERD — Crowfoot')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow',
    )
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      '결제 도메인 1차',
    )
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://crowfoot.java21.net/share/Sh4reT0ken0fM0del501aaaa',
    )
    expect(document.head.querySelector('meta[property="og:type"]')).toHaveAttribute(
      'content',
      'article',
    )
  })

  it('shows the inactive message for an expired token (410)', async () => {
    renderViewer('expired0000000000000000')

    expect(await screen.findByText('공유 기간이 아니거나 만료된 링크입니다.')).toBeVisible()
    expect(screen.getByRole('link', { name: /홈으로/ })).toBeVisible()

    // then: 오류 화면도 색인 제외 유지 (00-common §3.11)
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    )
  })

  it('shows the not-found message for an unknown token (404)', async () => {
    renderViewer('unknown00000000000000000')

    expect(await screen.findByText('공유 링크를 찾을 수 없습니다.')).toBeVisible()
  })

  it('falls back to the generic message on network failure', async () => {
    server.use(
      http.get('/api/v1/core/shares/*', () => fail('NETWORK_ERROR', 503)),
    )

    renderViewer('Sh4reT0ken0fM0del501aaaa')

    expect(await screen.findByText('공유 문서를 찾을 수 없습니다.')).toBeVisible()
  })
})
