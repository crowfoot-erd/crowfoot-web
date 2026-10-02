/**
 * 공유 문서 공개 뷰어(/share/{token}) 테스트 — 08-core/02-model.md §1.10, storyboard 00-common §2.1
 *
 * given: 공개 조회(/core/shares/{token}) 응답을 MSW로 정의 — 인증 없는 경로
 * when: 라우트로 직접 진입 (게스트 — 세션 없음)·하단 탭 전환·SQL 생성 다이얼로그
 * then: 문서 메타 + 읽기 전용 툴바(저장·공유 없음 — SQL 생성은 공개 DDL §1.10.8로 활성,
 *       좋아요 버튼 노출) + 하단 탭 바(ERD 기본·댓글 탭 — 댓글 탭에서 피드백 섹션 v1.21,
 *       배지=총 피드백 수 좋아요+댓글) / 만료 410·없는 토큰 404 안내(탭 바도 없음)
 *       + head 메타(문서 제목·설명 — 성공 시 색인 허용·canonical /share/{token}·og:article,
 *       대기·오류는 noindex 유지, 00-common §3.11 v1.18 SEO 정책)
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { Route } from 'react-router-dom'

import { fail, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { resetEditorStore } from '@/features/editor/store/editor-store'
import { ShareViewerPage } from '@/pages/share-viewer'
import { asGuest, renderWithProviders } from '@/test/test-app'

afterEach(() => resetEditorStore())

function renderViewer(token: string) {
  asGuest() // 공개 뷰어 — 피드백 조회(useShareFeedback)는 세션 판정 뒤에만 fetch한다
  return renderWithProviders(<Route path="/share/:token" element={<ShareViewerPage />} />, {
    route: `/share/${token}`,
  })
}

describe('공유 문서 공개 뷰어', () => {
  it('renders the shared document read-only — 저장·공유 없음, SQL 생성(공개 DDL)·좋아요는 있다', async () => {
    renderViewer('Sh4reT0ken0fM0del501aaaa')

    // then: 공개 응답 — 이름·DB 종류·공유 문서 배지
    expect(await screen.findByRole('heading', { name: '주문 서비스 ERD' })).toBeVisible()
    // 헤더 배지 — 코드 원값(postgresql)이 아니라 표시명. 툴바 DBMS 표시기에도 같은 이름이 있어 헤더로 좁힌다
    expect(within(screen.getByRole('banner')).getByText('PostgreSQL')).toBeVisible()
    expect(screen.getByText('공유 문서')).toBeVisible()

    // then: 읽기 전용 툴바 — 저장은 비활성, SQL 생성(공개 DDL §1.10.8)은 공개에서도 쓴다.
    //       공유 관리(워크스페이스 API)는 없다. 좋아요(회원전용)는 문서 반응 버튼으로 노출된다
    expect(screen.getByText('읽기 전용')).toBeVisible()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'SQL 생성' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '공유' })).not.toBeInTheDocument()
    expect(screen.getByTestId('toolbar-like-button')).toBeVisible()
    expect(screen.getByTestId('toolbar-like-button')).toHaveTextContent('좋아요') // 버튼 텍스트 라벨
    expect(screen.getByTestId('toolbar-like-count')).toHaveTextContent('9')
    // 좋아요는 내보내기 메뉴 다음 자리다 — 공개 뷰어에는 도구 메뉴(워크스페이스 API)가 없다
    const like = screen.getByTestId('toolbar-like-button')
    const exportMenu = screen.getByRole('button', { name: '내보내기' })
    expect(exportMenu.compareDocumentPosition(like) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: '도구' })).not.toBeInTheDocument()

    // then: 홈으로 링크
    expect(screen.getByRole('link', { name: /홈으로/ })).toHaveAttribute('href', '/')

    // then: 하단 탭 바(v1.21) — ERD 기본, 댓글 탭 배지는 댓글 수(좋아요 합산은
    //       2026-09-27 2차 보고로 철회 — 댓글 0인데 1로 보이면 댓글이 있는 것처럼 읽힌다)
    const tabs = await screen.findByTestId('share-viewer-tabs')
    const tabButtons = within(tabs).getAllByRole('tab')
    expect(tabButtons).toHaveLength(3)
    expect(tabButtons[1]).toHaveTextContent('요구사항')
    expect(tabButtons[0]).toHaveTextContent('ERD')
    expect(tabButtons[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabButtons[2]).toHaveTextContent('댓글')
    expect(within(tabButtons[2]).getByText('3')).toBeVisible() // 배지 칩 = 댓글 수(픽스처 3건)
    expect(tabButtons[2]).toHaveAttribute('aria-selected', 'false')
    // 기본 탭에서는 피드백 섹션이 없다 — 에디터가 화면을 다 쓴다
    expect(screen.queryByTestId('share-feedback-section')).not.toBeInTheDocument()

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

  it('generates DDL from the share token (§1.10.8) — 문서 파일 내보내기는 숨긴다', async () => {
    renderViewer('Sh4reT0ken0fM0del501aaaa')

    // .crown 문서 파일(내 계정 문서용)은 공개에서 숨긴다 — 내보내기 메뉴에 이미지 항목만 있다
    const exportMenu = await screen.findByRole('button', { name: '내보내기' })
    fireEvent.pointerDown(exportMenu, { button: 0 })
    fireEvent.click(exportMenu)
    expect(await screen.findByRole('menuitem', { name: '보이는 화면 PNG' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: '문서 파일 내보내기' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    // 공개 뷰어의 SQL 생성 — 워크스페이스 인증 없이 공유 토큰 경로로 락스크립트를 받는다
    fireEvent.click(screen.getByRole('button', { name: 'SQL 생성' }))

    const script = await screen.findByTestId('ddl-script')
    expect(script).toHaveTextContent('CREATE TABLE member')
  })

  it('switches the feedback panel in for the editor via the comments tab', async () => {
    renderViewer('Sh4reT0ken0fM0del501aaaa')

    // 댓글 탭 선택 — 탭 바 위 영역 전체가 피드백 패널로 교체된다
    fireEvent.click((await screen.findAllByRole('tab'))[2])

    expect(await screen.findByTestId('share-feedback-section')).toBeVisible()
    expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')
    expect(screen.getByTestId('share-comment-list')).toBeVisible()
    // 에디터는 내려간다 — 읽기 전용 툴바의 저장 버튼이 사라진다
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()

    // ERD 탭 복귀 — 에디터가 다시 오른다
    fireEvent.click(screen.getAllByRole('tab')[0])
    expect(await screen.findByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.queryByTestId('share-feedback-section')).not.toBeInTheDocument()
  })

  it('bumps the comments tab badge as a comment arrives — 좋아요는 배지에 합산하지 않는다(2026-09-27 2차 보고)', async () => {
    // 상태 있는 목업 — POST 댓글이 로컬 목록에 쌓이고 GET이 그 목록을 내린다.
    // 뮤테이션 성공 → ['shares', token] 무효화 → 피드백 재조회 → 배지 갱신 흐름을 끝까지 검증한다
    const comments: unknown[] = []
    server.use(
      http.get('/api/v1/core/shares/:token/comments', () =>
        HttpResponse.json(ok({ response: { reactionCount: 1, reacted: false, comments } })),
      ),
      http.post('/api/v1/core/shares/:token/comments', async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { nickname?: string; content?: string }
        const created = {
          commentId: '90',
          parentCommentId: null,
          nickname: body.nickname ?? '방문자',
          authorType: 'guest',
          content: body.content ?? '',
          edited: false,
          createdAt: '2026-09-27T10:00:00Z',
        }
        comments.push(created)
        return HttpResponse.json(ok({ response: created }), { status: 201 })
      }),
    )

    renderViewer('Sh4reT0ken0fM0del501aaaa')

    // 좋아요 1 + 댓글 0 → 배지 0 — 좋아요는 [♥ n] 칩(섹션 헤더·툴바)이 담당한다
    const tabs = await screen.findByTestId('share-viewer-tabs')
    const commentsTab = within(tabs).getAllByRole('tab')[2]
    await within(commentsTab).findByText('0')

    // 댓글 탭으로 이동해 비회원 댓글 작성 → 재조회로 배지가 1로 오른다
    fireEvent.click(commentsTab)
    expect(await screen.findByTestId('share-feedback-section')).toBeVisible()
    fireEvent.change(screen.getByTestId('share-feedback-nickname'), { target: { value: '방문자' } })
    fireEvent.change(screen.getByTestId('share-feedback-password'), { target: { value: '1234' } })
    fireEvent.change(screen.getByTestId('share-feedback-content'), {
      target: { value: '구조가 한눈에 들어옵니다.' },
    })
    fireEvent.click(screen.getByTestId('share-feedback-submit'))

    await within(commentsTab).findByText('1')
    expect(await screen.findByTestId('share-comment-list')).toBeVisible() // 작성한 댓글 목록 등장
  })

  it('shows the inactive message for an expired token (410)', async () => {
    renderViewer('expired0000000000000000')

    expect(await screen.findByText('공유 기간이 아니거나 만료된 링크입니다.')).toBeVisible()
    expect(screen.getByRole('link', { name: /홈으로/ })).toBeVisible()
    // then: 본체가 만료면 탭 바도 없다(오류 안내 화면뿐)
    expect(screen.queryByTestId('share-viewer-tabs')).not.toBeInTheDocument()

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
