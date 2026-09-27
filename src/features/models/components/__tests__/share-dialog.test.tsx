/**
 * 문서 공유 링크 다이얼로그 테스트 — 08-core/02-model.md §1.10
 *
 * given: 링크 목록·발급·철회·피드백(공개 GET 재사용)을 MSW로 정의
 * when: 다이얼로그 열기·발급·복사·철회·댓글 관리 확장
 * then: 목록 렌더(토큰 링크·기간·카운터 라벨)·발급 토스트·클립보드·기간 검증·
 *       오너 답글 등록·댓글 삭제(v1.21 댓글 관리)
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/api/mocks/server'
import { ok as okEnvelope } from '@/api/mocks/handlers'
import { Toaster } from '@/components/ui/sonner'
import { ShareDialog } from '@/features/models/components/share-dialog'
import { renderWithProviders } from '@/test/test-app'

afterEach(() => vi.restoreAllMocks())

function renderDialog() {
  return renderWithProviders(
    <>
      <ShareDialog
        open
        onOpenChange={() => {}}
        workspaceId="101"
        modelId="501"
        modelName="주문 서비스 ERD"
      />
      {/* 토스트 문구 단언용 — 앱 셸 밖에서 렌더하는 컴포넌트 테스트라 직접 마운트 */}
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

describe('ShareDialog — 목록', () => {
  it('renders existing links with token and period labels', async () => {
    renderDialog()

    // then: 기간 있는 링크 — 시작~종료 라벨
    const items = await screen.findAllByTestId('share-item')
    expect(items).toHaveLength(2)
    expect(screen.getAllByTestId('share-token')[0].textContent).toContain(
      'Sh4reT0ken0fM0del501aaaa',
    )
    // then: 무제한 링크 라벨 — 발급 폼의 라디오('무제한 (기간 제한 없음)')와 목록 행 라벨 2곳
    expect(screen.getAllByText(/무제한/)).toHaveLength(2)
    // then: 카운터 표기(v1.21) — 기간 라벨 옆에 조회·반응·댓글
    expect(screen.getByText(/조회 128 · 반응 9 · 댓글 3/)).toBeVisible()
    expect(screen.getByText(/조회 5 · 반응 0 · 댓글 0/)).toBeVisible()
  })

  it('shows the empty state when no links exist', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/shares', () =>
        HttpResponse.json(okEnvelope({ totalCount: 0, responses: [] })),
      ),
    )

    renderDialog()

    expect(await screen.findByText('발급된 링크가 없습니다')).toBeVisible()
  })
})

describe('ShareDialog — 발급', () => {
  it('issues an unlimited link and toasts success', async () => {
    renderDialog()

    fireEvent.click(await screen.findByRole('button', { name: /링크 발급/ }))

    expect(await screen.findByText('공유 링크를 발급했습니다')).toBeVisible()
  })

  it('rejects a reversed period without calling the API', async () => {
    renderDialog()

    // 기간 지정으로 전환 — 종료가 시작보다 앞서게
    fireEvent.click(screen.getByRole('radio', { name: /기간 지정/ }))
    fireEvent.change(screen.getByLabelText('시작 일시'), { target: { value: '2026-10-02T10:00' } })
    fireEvent.change(screen.getByLabelText('종료 일시'), { target: { value: '2026-10-01T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: /링크 발급/ }))

    expect(await screen.findByText('종료 일시는 시작 일시 이후여야 합니다')).toBeVisible()
  })

  it('rejects an incomplete period', async () => {
    renderDialog()

    fireEvent.click(screen.getByRole('radio', { name: /기간 지정/ }))
    fireEvent.change(screen.getByLabelText('시작 일시'), { target: { value: '2026-10-02T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: /링크 발급/ }))

    expect(await screen.findByText('시작·종료 일시를 모두 지정해 주세요')).toBeVisible()
  })
})

describe('ShareDialog — 복사·철회', () => {
  it('copies the public link to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderDialog()

    await screen.findAllByTestId('share-item')
    fireEvent.click(screen.getAllByRole('button', { name: '링크 복사' })[0])

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('/share/Sh4reT0ken0fM0del501aaaa')
    expect(await screen.findByText('공유 링크를 복사했습니다')).toBeVisible()
  })

  it('revokes a link and toasts success', async () => {
    renderDialog()

    await screen.findAllByTestId('share-item')
    fireEvent.click(screen.getAllByRole('button', { name: '철회' })[0])

    expect(await screen.findByText('공유 링크를 철회했습니다')).toBeVisible()
  })
})

describe('ShareDialog — 댓글 관리 (v1.21)', () => {
  it('expands the manager and lists comments with the owner badge', async () => {
    renderDialog()

    // 행 확장 — 목록은 공개 GET(.../comments)를 재사용(원댓글 2 + 오너 답글 1)
    fireEvent.click((await screen.findAllByTestId('share-manage-comments'))[0])

    const manager = await screen.findByTestId('share-comment-manager')
    // 피드백 도착 — 매니저 컨테이너는 대기 중에도 렌더된다
    expect(await within(manager).findByText('첫 방문자')).toBeVisible()
    expect(within(manager).getByText('지나가는 DBA')).toBeVisible()
    expect(within(manager).getAllByTestId('share-comment-item')).toHaveLength(3)
    // 오너 답글 — "작성자" 배지, 답글에는 답글 버튼이 없다(1단계 제한)
    expect(within(manager).getByText('작성자')).toBeVisible()
    expect(within(manager).getAllByRole('button', { name: '답글' })).toHaveLength(2)
  })

  it('posts an owner reply to a top-level comment and toasts success', async () => {
    renderDialog()

    fireEvent.click((await screen.findAllByTestId('share-manage-comments'))[0])
    fireEvent.click((await screen.findAllByRole('button', { name: '답글' }))[0])

    // 답글 폼 — 빈 값이면 등록 불가
    const submit = await screen.findByTestId('owner-reply-submit')
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('owner-reply-input'), {
      target: { value: '피드백 감사합니다.' },
    })
    fireEvent.click(submit)

    expect(await screen.findByText('답글을 등록했습니다')).toBeVisible()
  })

  it('deletes a comment from the manager and toasts success', async () => {
    renderDialog()

    fireEvent.click((await screen.findAllByTestId('share-manage-comments'))[0])
    fireEvent.click((await screen.findAllByRole('button', { name: '삭제' }))[0])
    fireEvent.click(await screen.findByRole('button', { name: '확인' }))

    expect(await screen.findByText('댓글을 삭제했습니다')).toBeVisible()
  })
})
