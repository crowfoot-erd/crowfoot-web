/**
 * ERD 문서 열기(새 창 전체 화면) 테스트 — storyboard 02-user §5
 *
 * given: /core/workspaces/101/models/501 상세 응답을 MSW로 정의 (101 = OWNER, 501 = 본인 작성)
 * when: 라우트로 직접 진입·하단 탭 전환
 * then: 메아(이름·DB 종류·캔버스·버전·생성자)·에디터 1차(툴바)·창 닫기
 *       + 하단 탭 바(ERD 기본 · 댓글 탭 — 공개 뷰어와 같은 UX, v1.21 후속):
 *       댓글 탭은 문서 단위 멤버 경로(#261)라 공유 링크가 없어도 피드백 섹션이 뜨고,
 *       Viewer(댓글 권한 없음)는 폼 대신 읽기 전용 안내, 작성자에게는 답글 버튼
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { Route } from 'react-router-dom'

import { fail, fixtures, ok as okEnvelope } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { resetDataView } from '@/features/editor/store/data-view-store'
import { resetEditorStore } from '@/features/editor/store/editor-store'
import { ModelViewerPage } from '@/pages/model-viewer'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

afterEach(() => {
  resetEditorStore()
  resetDataView()
  resetSessionState()
})

function renderViewer() {
  // 문서 열기는 인증 라우트 — 멤버 피드백 경로(fetch·mutation 전부)도 Bearer가 필요하다
  asAuthenticated()
  return renderWithProviders(
    <Route path="/workspaces/:workspaceId/models/:modelId" element={<ModelViewerPage />} />,
    { route: '/workspaces/101/models/501' },
  )
}

describe('ERD 문서 열기', () => {
  it('renders document meta and the editor toolbar', async () => {
    renderViewer()

    // then: fixtures 501 — 이름·DB 종류·버전·생성자
    expect(await screen.findByRole('heading', { name: '주문 서비스 ERD' })).toBeVisible()
    // 헤더 배지 — 코드 원값(postgresql)이 아니라 표시명. 툴바 DBMS 표시기에도 같은 이름이 있어 헤더로 좁힌다
    expect(within(screen.getByRole('banner')).getByText('PostgreSQL')).toBeVisible()
    expect(screen.getByText('v3')).toBeVisible()
    expect(screen.getByText(/부트스트랩 관리자/)).toBeVisible()

    // then: 에디터 툴바 — 저장·undo/redo·줌 (101 = OWNER → 편집 가능, 읽기 전용 아님)
    expect(screen.getByRole('button', { name: '저장' })).toBeVisible()
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeVisible()
    expect(screen.getByRole('button', { name: '다시 실행' })).toBeVisible()
    expect(screen.queryByText('읽기 전용')).not.toBeInTheDocument()

    // then: 창 닫기
    expect(screen.getByRole('button', { name: /창 닫기/ })).toBeVisible()

    // then: 하단 탭 바 — ERD 기본(에디터가 화면을 다 쓴다), 댓글 탭 배지는 댓글 수
    //       (픽스처 댓글 3건 — 좋아요 합산은 2026-09-27 2차 보고로 철회)
    //       탭 순서는 ERD · 요구사항 · 데이터 보기 · 댓글(v1.35 — 데이터 보기는 Editor 이상)
    const tabs = screen.getByTestId('model-viewer-tabs')
    const tabButtons = within(tabs).getAllByRole('tab')
    expect(tabButtons.map((tab) => tab.textContent?.replace(/\d+$/, ''))).toEqual(['ERD', '요구사항', '데이터 보기', '댓글'])
    expect(tabButtons[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabButtons[3]).toHaveAttribute('aria-selected', 'false')
    await within(tabButtons[3]).findByText('3') // 배지 칩 = 댓글 수
    expect(screen.queryByTestId('share-feedback-section')).not.toBeInTheDocument()
  })

  it('요구사항 탭 — 캔버스를 감추고 요구사항 화면을 보여 준다. ERD 탭으로 돌아오면 에디터가 그대로다', async () => {
    renderViewer()
    await screen.findByRole('heading', { name: '주문 서비스 ERD' })
    const [erdTab, requirementsTab] = await screen.findAllByRole('tab')

    fireEvent.click(requirementsTab)
    expect(requirementsTab).toHaveAttribute('aria-selected', 'true')
    expect(erdTab).toHaveAttribute('aria-selected', 'false')
    expect(await screen.findByTestId('requirements-panel')).toBeInTheDocument()
    // 에디터는 내리지 않고 감추기만 한다 — 자동 저장과 협업 채널이 이어진다
    expect(screen.getByTestId('editor-canvas-area')).toHaveClass('hidden')

    fireEvent.click(erdTab)
    expect(screen.queryByTestId('requirements-panel')).toBeNull()
    expect(screen.getByTestId('editor-canvas-area')).not.toHaveClass('hidden')
  })

  it('데이터 보기 탭 — 원천 커넥션의 데이터 브라우저를 에디터 안에 띄운다. 다른 탭으로 옮겨도 상태가 남는다', async () => {
    renderViewer()
    await screen.findByRole('heading', { name: '주문 서비스 ERD' })
    const tabs = within(screen.getByTestId('model-viewer-tabs'))
    // 처음 열기 전에는 데이터 브라우저를 마운트하지 않는다
    expect(screen.queryByTestId('editor-data-view')).toBeNull()

    fireEvent.click(tabs.getByRole('tab', { name: '데이터 보기' }))
    expect(tabs.getByRole('tab', { name: '데이터 보기' })).toHaveAttribute('aria-selected', 'true')
    expect(tabs.getByRole('tab', { name: 'ERD' })).toHaveAttribute('aria-selected', 'false')
    expect(await screen.findByTestId('data-browser')).toBeInTheDocument()
    expect(screen.getByTestId('editor-canvas-area')).toHaveClass('hidden')
    // 객체를 고른다 — 에디터 주소는 그대로다(스토어에 둔다)
    fireEvent.click(await screen.findByRole('button', { name: /^orders/ }))
    expect(await screen.findByRole('heading', { level: 2, name: 'orders' })).toBeInTheDocument()

    // 요구사항 탭 — 데이터 보기는 감추기만 한다
    fireEvent.click(tabs.getByRole('tab', { name: '요구사항' }))
    expect(await screen.findByTestId('requirements-panel')).toBeInTheDocument()
    expect(screen.getByTestId('editor-data-view')).toHaveClass('hidden')
    expect(tabs.getByRole('tab', { name: '데이터 보기' })).toHaveAttribute('aria-selected', 'false')

    // ERD 탭 — 캔버스가 돌아온다
    fireEvent.click(tabs.getByRole('tab', { name: 'ERD' }))
    expect(screen.getByTestId('editor-canvas-area')).not.toHaveClass('hidden')
    expect(screen.queryByTestId('requirements-panel')).toBeNull()

    // 다시 데이터 보기 — 고른 객체가 그대로 남아 있다
    fireEvent.click(tabs.getByRole('tab', { name: '데이터 보기' }))
    expect(screen.getByTestId('editor-data-view')).not.toHaveClass('hidden')
    expect(screen.getByRole('heading', { level: 2, name: 'orders' })).toBeInTheDocument()
  })

  it('switches the document feedback panel in via the comments tab', async () => {
    renderViewer()
    await screen.findByRole('heading', { name: '주문 서비스 ERD' })

    // 댓글 탭 선택 — 탭 바 위 영역이 문서 단위 피드백 패널로 교체된다
    fireEvent.click((await screen.findAllByRole('tab'))[3])

    expect(await screen.findByTestId('share-feedback-section')).toBeVisible()
    expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')
    expect(screen.getByTestId('share-comment-list')).toBeVisible()
    // 에디터는 내려간다 — 저장 버튼이 사라진다
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()

    // ERD 탭 복귀 — 에디터가 다시 오고 피드백 패널은 내려간다
    fireEvent.click(screen.getAllByRole('tab')[0])
    expect(await screen.findByRole('button', { name: '저장' })).toBeVisible()
    expect(screen.queryByTestId('share-feedback-section')).not.toBeInTheDocument()
  })

  it('shows feedback without any share link and offers owner reply', async () => {
    // 링크가 하나도 없다 — 문서 단위 경로(#261)라 댓글 탭은 그대로 피드백을 보여준다
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/shares', () =>
        HttpResponse.json(okEnvelope({ totalCount: 0, responses: [] })),
      ),
    )
    renderViewer()
    await screen.findByRole('heading', { name: '주문 서비스 ERD' })

    fireEvent.click((await screen.findAllByRole('tab'))[3])
    expect(await screen.findByTestId('share-feedback-section')).toBeVisible()

    // 회원 폼(내용만) — 별명·비밀번호 칸은 공개 뷰어의 비회원 전용
    expect(screen.getByTestId('share-feedback-form')).toBeVisible()
    expect(screen.queryByTestId('share-feedback-nickname')).not.toBeInTheDocument()

    // 501은 본인(me=2)이 만든 문서 — 원댓글에만 답글 버튼이 뜬다(답글은 작성자 전용)
    const items = screen.getAllByTestId('share-comment-item')
    const topLevel = items.filter((item) => item.querySelector('[data-testid="share-comment-reply-button"]'))
    expect(topLevel.length).toBe(2) // 원댓글 31·33 — 답글 32에는 없다
    fireEvent.click(topLevel[0].querySelector('[data-testid="share-comment-reply-button"]')!)
    expect(screen.getByTestId('share-comment-reply-form')).toBeVisible()
  })

  it('replaces the form with a readonly notice for viewers', async () => {
    // 101에서 내 역할이 VIEWER면 댓글을 달 수 없다 — 폼 대신 읽기 전용 안내
    server.use(
      http.get('/api/v1/core/accounts/me/workspaces', () =>
        HttpResponse.json(
          okEnvelope({
            ...fixtures.myWorkspaces,
            responses: fixtures.myWorkspaces.responses.map((ws) =>
              ws.workspaceId === '101' ? { ...ws, myRole: 'VIEWER' } : ws,
            ),
          }),
        ),
      ),
    )
    renderViewer()
    await screen.findByRole('heading', { name: '주문 서비스 ERD' })

    // Viewer에게는 데이터 보기 탭이 없다 — 데이터 브라우저와 같은 권한(Editor 이상)
    const tabButtons = await screen.findAllByRole('tab')
    expect(tabButtons.map((tab) => tab.textContent?.replace(/\d+$/, ''))).toEqual(['ERD', '요구사항', '댓글'])
    fireEvent.click(tabButtons[2])
    expect(await screen.findByTestId('share-feedback-section')).toBeVisible()
    expect(await screen.findByTestId('share-feedback-readonly')).toBeVisible()
    expect(screen.queryByTestId('share-feedback-form')).not.toBeInTheDocument()
    // 좋아요는 역할 무관 — 카운터는 그대로 움직인다
    expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')
  })

  it('shows the error state with retry on failure', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501', () => fail('MODEL_NOT_FOUND', 404)),
    )

    renderViewer()

    // then: 에러 문구 + 재시도 버튼
    expect(await screen.findByRole('button', { name: /다시 시도/ })).toBeVisible()
  })
})
