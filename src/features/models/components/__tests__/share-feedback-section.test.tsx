/**
 * 공유 문서 피드백 섹션 테스트 — 08-core/02-model.md §1.10.6·§1.10.7
 *
 * given: 피드백 초기화(반응 상태+댓글) 응답을 MSW로 정의 — 인증 없는 경로
 * when: 반응 토글·익명 댓글 등록·삭제
 * then: 1단계 중첩 목록(오너 배지)·낙관 전환(정착·원복)·폼 제출 토스트·
 *       삭제 서버 판정(403 토스트)·빈 상태·로드 실패 시 섹션 숨김
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/api/mocks/server'
import { fail, ok as okEnvelope } from '@/api/mocks/handlers'
import { Toaster } from '@/components/ui/sonner'
import { ShareFeedbackSection } from '@/features/models/components/share-feedback-section'
import { renderWithProviders } from '@/test/test-app'

const TOKEN = 'Sh4reT0ken0fM0del501aaaa'

afterEach(() => vi.restoreAllMocks())

function renderSection(token = TOKEN) {
  return renderWithProviders(
    <>
      <ShareFeedbackSection token={token} />
      {/* 토스트 문구 단언용 — 앱 셸 밖에서 렌더하는 컴포넌트 테스트라 직접 마운트 */}
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

describe('ShareFeedbackSection — 목록', () => {
  it('renders reactions and a one-level nested comment list with the owner badge', async () => {
    renderSection()

    // then: 피드백 도착 — 댓글 목록이 그려져야 카운터도 정착(버튼은 대기 중에도 렌더된다)
    await screen.findByTestId('share-comment-list')
    const reaction = screen.getByTestId('share-reaction-button')
    expect(reaction).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')

    // then: 댓글 3건(원댓글 2 + 오너 답글 1) — 답글은 원댓글 아래에 중첩
    const items = screen.getAllByTestId('share-comment-item')
    expect(items).toHaveLength(3)
    const list = screen.getByTestId('share-comment-list')
    expect(within(list).getByText('첫 방문자')).toBeVisible()
    expect(within(list).getByText('지나가는 DBA')).toBeVisible()
    // then: 오너 답글 — "작성자" 배지 1건
    expect(screen.getAllByTestId('share-comment-owner-badge')).toHaveLength(1)
    expect(screen.getByText('작성자')).toBeVisible()
    expect(screen.getByText('주문 서비스 오너')).toBeVisible()
    // then: 총 댓글 수 표기
    expect(screen.getByText('총 3개')).toBeVisible()
  })

  it('shows the empty state when no comments exist', async () => {
    server.use(
      http.get(`/api/v1/core/shares/${TOKEN}/comments`, () =>
        HttpResponse.json(okEnvelope({ response: { reactionCount: 0, reacted: false, comments: [] } })),
      ),
    )

    renderSection()

    expect(await screen.findByText('아직 댓글이 없습니다 — 첫 댓글을 남겨주세요')).toBeVisible()
    expect(screen.queryByTestId('share-comment-list')).not.toBeInTheDocument()
  })

  it('hides the whole section when feedback fails to load', async () => {
    server.use(
      http.get(`/api/v1/core/shares/${TOKEN}/comments`, () => fail('NETWORK_ERROR', 503)),
    )

    const { container } = renderSection()

    // then: 본체 조회는 성공한 화면이므로 피드백 실패는 조용히 숨긴다(에러 문구 없음)
    await waitFor(() => {
      expect(container.querySelector('[data-testid="share-feedback-section"]')).not.toBeInTheDocument()
    })
  })
})

describe('ShareFeedbackSection — 반응 토글', () => {
  it('flips optimistically and settles to the server value', async () => {
    renderSection()

    // 피드백 도착 후 토글 — 대기 중 버튼은 비활성이라 클릭이 묵살된다
    await screen.findByTestId('share-comment-list')
    fireEvent.click(screen.getByTestId('share-reaction-button'))

    // then: 즉시 낙관 전환 — pressed → 목업 정착값({10, true})과 일치해 유지된다
    await waitFor(() =>
      expect(screen.getByTestId('share-reaction-button')).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('10')
  })

  it('reverts the optimistic flip and toasts when the toggle fails', async () => {
    server.use(
      http.post(`/api/v1/core/shares/${TOKEN}/reactions`, () => fail('NETWORK_ERROR', 503)),
    )

    renderSection()

    // 피드백 도착 후 토글
    await screen.findByTestId('share-comment-list')
    fireEvent.click(screen.getByTestId('share-reaction-button'))

    // then: 원복 — 카운터 9·미반응 + 실패 토스트
    expect(await screen.findByText('반응 처리에 실패했습니다')).toBeVisible()
    await waitFor(() => {
      expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')
      expect(screen.getByTestId('share-reaction-button')).toHaveAttribute('aria-pressed', 'false')
    })
  })
})

describe('ShareFeedbackSection — 익명 댓글', () => {
  it('keeps the submit disabled until both nickname and content are filled', async () => {
    renderSection()

    const submit = await screen.findByTestId('share-feedback-submit')
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-feedback-nickname'), { target: { value: '방문자' } })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-feedback-content'), { target: { value: '구조가 좋네요.' } })
    expect(submit).toBeEnabled()
  })

  it('posts a comment, clears the form and toasts success', async () => {
    renderSection()

    fireEvent.change(await screen.findByTestId('share-feedback-nickname'), {
      target: { value: '방문자' },
    })
    fireEvent.change(screen.getByTestId('share-feedback-content'), {
      target: { value: '구조가 좋네요.' },
    })
    fireEvent.click(screen.getByTestId('share-feedback-submit'))

    expect(await screen.findByText('댓글을 등록했습니다')).toBeVisible()
    await waitFor(() => {
      expect(screen.getByTestId('share-feedback-content')).toHaveValue('')
    })
  })

  it('denies deletion with a toast when the server rejects it (403)', async () => {
    server.use(
      http.delete(`/api/v1/core/shares/${TOKEN}/comments/:commentId`, () =>
        fail('PERMISSION_DENIED', 403),
      ),
    )

    renderSection()

    // 삭제는 항상 노출 — 본인 여부는 서버(방문자 쿠키)가 최종 판정한다
    fireEvent.click((await screen.findAllByRole('button', { name: '삭제' }))[0])
    fireEvent.click(await screen.findByRole('button', { name: '확인' }))

    expect(await screen.findByText('본인이 작성한 댓글만 삭제할 수 있습니다')).toBeVisible()
  })

  it('deletes own comment after confirmation and toasts success', async () => {
    renderSection()

    fireEvent.click((await screen.findAllByRole('button', { name: '삭제' }))[0])
    fireEvent.click(await screen.findByRole('button', { name: '확인' }))

    expect(await screen.findByText('댓글을 삭제했습니다')).toBeVisible()
  })
})
