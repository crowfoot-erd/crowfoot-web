/**
 * 공유 문서 피드백 섹션 테스트 — 08-core/02-model.md §1.10.6·§1.10.7 (v1.21 재설계)
 *
 * given: 피드백 초기화(반응 상태+댓글) 응답을 MSW로 정의 — 선택 인증 경로(토큰 대상)와
 *        문서 단위 멤버 경로(model 대상, #261 — 문서 열기 댓글 탭)
 * when: 반응 토글(회원만)·댓글 등록(회원=내용만/비회원=별명+비밀번호)·수정(인라인)·삭제(비밀번호)
 * then: authorType 배지(작성자·회원)·수정 표시·낙관 전환(정착·원복)·비회원 좋아요 안내·
 *       폼 모드 전환·수정 403 토스트·삭제 다이얼로그(비회원=비밀번호)·빈 상태·로드 실패 숨김 +
 *       model 대상: 오너 답글 폼·비회원 댓글 수정 숨김·Viewer 읽기 전용 안내
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setAccessToken, clearAccessToken } from '@/api/client'
import { server } from '@/api/mocks/server'
import { fail, ok as okEnvelope } from '@/api/mocks/handlers'
import { Toaster } from '@/components/ui/sonner'
import { ShareFeedbackSection } from '@/features/models/components/share-feedback-section'
import { useSessionStore } from '@/stores/session'
import { asGuest, renderWithProviders } from '@/test/test-app'

const TOKEN = 'Sh4reT0ken0fM0del501aaaa'

afterEach(() => {
  // 세션·토큰은 테스트마다 원복 — 기본은 비회원(bootstrapping도 회원 아님)
  useSessionStore.setState({ status: 'bootstrapping' })
  clearAccessToken()
  vi.restoreAllMocks()
  // sonner 토스트는 모듈 전역 큐에 남는다(자동 소멸 4s > 파일 런타임) — 테스트마다 Toaster를
  // 새로 마운트하므로 이전 테스트의 같은 문구 토스트가 되살아나 "multiple elements"로 실패한다
  act(() => {
    toast.dismiss()
  })
})

function renderSection(token = TOKEN) {
  // 기본은 비회원 — 피드백 조회는 세션 판정 뒤에만 fetch하므로 bootstrapping(스토어 초깃값)을
  // 게스트로 확정한다. 회원 테스트는 signInAsMember가 먼저 상태를 바꿔 놓아 그대로 쓴다
  if (useSessionStore.getState().status === 'bootstrapping') asGuest()
  return renderWithProviders(
    <>
      <ShareFeedbackSection target={{ kind: 'token', token }} />
      {/* 토스트 문구 단언용 — 앱 셸 밖에서 렌더하는 컴포넌트 테스트라 직접 마운트 */}
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

/** 문서 단위 대상(#261) — 문서 열기 댓글 탭. 인증 멤버 경로라 항상 회원 세션으로 렌더한다 */
function renderModelSection(options: { canComment?: boolean; canReply?: boolean } = {}) {
  if (useSessionStore.getState().status === 'bootstrapping') signInAsMember()
  return renderWithProviders(
    <>
      <ShareFeedbackSection
        target={{
          kind: 'model',
          workspaceId: '101',
          modelId: '501',
          canComment: options.canComment ?? true,
          canReply: options.canReply ?? false,
        }}
      />
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

/** 회원 모드 — 세션 스토어 + Bearer 토큰(선택 인증 경로는 헤더 유무로 회원/비회원이 갈린다) */
function signInAsMember() {
  useSessionStore.setState({ status: 'authenticated' })
  setAccessToken('mock-access-token')
}

describe('ShareFeedbackSection — 목록', () => {
  it('renders reactions and comments with authorType badges and the edited mark', async () => {
    renderSection()

    // then: 피드백 도착 — 댓글 목록이 그려져야 카운터도 정착(버튼은 대기 중에도 렌더된다)
    await screen.findByTestId('share-comment-list')
    const reaction = screen.getByTestId('share-reaction-button')
    expect(reaction).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')
    // then: 버튼은 아이콘만이 아니라 "좋아요" 라벨을 함께 노출한다
    expect(within(reaction).getByText('좋아요')).toBeVisible()

    // then: 댓글 3건(비회원 원댓글 + 오너 답글 1 + 회원 댓글 1) — 답글은 원댓글 아래에 중첩
    const items = screen.getAllByTestId('share-comment-item')
    expect(items).toHaveLength(3)
    const list = screen.getByTestId('share-comment-list')
    expect(within(list).getByText('첫 방문자')).toBeVisible()
    expect(within(list).getByText('지나가는 DBA')).toBeVisible()
    // then: authorType 배지 — 오너 답글 "작성자"(primary) 1건, 회원 "회원" 배지 1건
    expect(screen.getAllByTestId('share-comment-owner-badge')).toHaveLength(1)
    expect(screen.getByText('작성자')).toBeVisible()
    expect(screen.getAllByTestId('share-comment-member-badge')).toHaveLength(1)
    // then: 수정 이력(edited) 표시 — 회원 댓글 1건
    expect(screen.getAllByTestId('share-comment-edited')).toHaveLength(1)
    expect(screen.getByText('수정됨')).toBeVisible()
    // then: 총 댓글 수 — 하트 옆이 아니라 댓글 목록 머리에 "댓글 n개"로 표기
    expect(screen.getByTestId('share-comment-count')).toHaveTextContent('댓글 3개')
  })

  it('does not fetch feedback while the session is bootstrapping — 좋아요 상태가 익명으로 박제되지 않는다', async () => {
    // given: 새 탭 직접 접속 — 부트스트랩(refresh 왕복)이 끝나지 않은 상태. 이때 fetch하면
    // Bearer 없이 나가 reacted=false가 캐시돼 "좋아요했는데 회색 하트"가 된다
    useSessionStore.setState({ status: 'bootstrapping' })
    let fetched = 0
    server.use(
      http.get(`/api/v1/core/shares/${TOKEN}/comments`, () => {
        fetched += 1
        return HttpResponse.json(okEnvelope({ response: { reactionCount: 9, reacted: true, comments: [] } }))
      }),
    )
    // 헬퍼는 bootstrapping을 게스트로 시딩하니 여기서는 직접 렌더한다
    renderWithProviders(
      <>
        <ShareFeedbackSection target={{ kind: 'token', token: TOKEN }} />
        <Toaster />
      </>,
      { wrapRoutes: false },
    )

    // then: 잠시 지나도 요청이 없다 — 세션 판정이 끝나야 fetch한다
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetched).toBe(0)
    expect(screen.queryByTestId('share-comment-list')).not.toBeInTheDocument()

    // when: 부트스트랩 완료(회원) — 이제 Bearer가 실려 fetch한다
    useSessionStore.setState({ status: 'authenticated' })
    await waitFor(() => expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9'))
    expect(fetched).toBe(1)
    // then: 회원 신원으로 받은 reacted=true — 하트가 붉게 채워져 보인다
    expect(screen.getByTestId('share-reaction-button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders top-level comments when the server omits parentCommentId (Jackson NON_NULL)', async () => {
    // given: 실서버 응답 형태 — 최상위 댓글의 parentCommentId 필드는 NON_NULL 직렬화로 아예
    // 생략된다(런타임 undefined). MSW 픽스처는 null을 명시해 이 갭을 못 잡았다(2026-09-28
    // 운영 버그 — 배지는 1로 세는데 목록이 0으로 그려짐)
    server.use(
      http.get(`/api/v1/core/shares/${TOKEN}/comments`, () =>
        HttpResponse.json(
          okEnvelope({
            response: {
              reactionCount: 1,
              reacted: false,
              comments: [
                {
                  commentId: '91',
                  nickname: '운영 서버',
                  authorType: 'member',
                  content: '필드가 생략된 원댓글',
                  edited: false,
                  createdAt: '2026-09-28T00:00:00Z',
                },
                {
                  commentId: '92',
                  parentCommentId: '91',
                  nickname: '문서 작성자',
                  authorType: 'owner',
                  content: '생략 없는 답글',
                  edited: false,
                  createdAt: '2026-09-28T00:01:00Z',
                },
              ],
            },
          }),
        ),
      ),
    )

    renderSection()

    // then: 원댓글이 undefined 판정으로 탈락하지 않는다 — 원댓글+중첩 답글 2건·카운터 정합
    const items = await screen.findAllByTestId('share-comment-item')
    expect(items).toHaveLength(2)
    expect(screen.getByTestId('share-comment-count')).toHaveTextContent('댓글 2개')
    expect(screen.getByText('필드가 생략된 원댓글')).toBeVisible()
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

describe('ShareFeedbackSection — 문서 좋아요(회원전용)', () => {
  it('informs guests to sign in without sending the request', async () => {
    const toggle = vi.fn()
    server.use(
      http.post(`/api/v1/core/shares/${TOKEN}/reactions`, () => {
        toggle()
        return HttpResponse.json(okEnvelope({ response: { reactionCount: 10, reacted: true } }))
      }),
    )
    renderSection()

    await screen.findByTestId('share-comment-list')
    fireEvent.click(screen.getByTestId('share-reaction-button'))

    // then: 안내 토스트만 — 요청을 보내지 않는다(게이트웨이가 어차피 401)
    expect(await screen.findByText('로그인 후 좋아요를 남길 수 있습니다')).toBeVisible()
    expect(toggle).not.toHaveBeenCalled()
    expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')
  })

  it('flips optimistically and settles to the server value for members', async () => {
    signInAsMember()
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
    signInAsMember()
    server.use(
      http.post(`/api/v1/core/shares/${TOKEN}/reactions`, () => fail('NETWORK_ERROR', 503)),
    )
    renderSection()

    // 피드백 도착 후 토글
    await screen.findByTestId('share-comment-list')
    fireEvent.click(screen.getByTestId('share-reaction-button'))

    // then: 원복 — 카운터 9·미반응 + 실패 토스트
    expect(await screen.findByText('좋아요 처리에 실패했습니다')).toBeVisible()
    await waitFor(() => {
      expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')
      expect(screen.getByTestId('share-reaction-button')).toHaveAttribute('aria-pressed', 'false')
    })
  })
})

describe('ShareFeedbackSection — 댓글 작성(회원/비회원 폼)', () => {
  it('member form is content-only — 별명·비밀번호 칸이 없다', async () => {
    signInAsMember()
    renderSection()

    const submit = await screen.findByTestId('share-feedback-submit')
    expect(screen.queryByTestId('share-feedback-nickname')).not.toBeInTheDocument()
    expect(screen.queryByTestId('share-feedback-password')).not.toBeInTheDocument()
    expect(screen.getByText('회원으로 댓글을 남깁니다 — 내용만 입력하세요')).toBeVisible()

    // then: 내용만 채우면 제출된다
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-feedback-content'), {
      target: { value: '회원 댓글입니다.' },
    })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    expect(await screen.findByText('댓글을 등록했습니다')).toBeVisible()
  })

  it('guest form requires nickname, password(4+) and content', async () => {
    renderSection()

    const submit = await screen.findByTestId('share-feedback-submit')
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-feedback-nickname'), { target: { value: '방문자' } })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-feedback-password'), { target: { value: '1234' } })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-feedback-content'), { target: { value: '구조가 좋네요.' } })
    expect(submit).toBeEnabled()

    fireEvent.click(submit)
    expect(await screen.findByText('댓글을 등록했습니다')).toBeVisible()
    await waitFor(() => {
      expect(screen.getByTestId('share-feedback-content')).toHaveValue('')
    })
  })
})

describe('ShareFeedbackSection — 댓글 수정·삭제(서버 최종 판정)', () => {
  it('edits a guest comment inline with its password', async () => {
    renderSection()
    await screen.findByTestId('share-comment-list')

    // 첫 행(비회원 원댓글 31) 수정 — 인라인 폼에 비밀번호 칸이 함께 뜬다
    fireEvent.click(screen.getAllByRole('button', { name: '수정' })[0])
    const editSubmit = await screen.findByTestId('share-comment-edit-submit')
    expect(screen.getByTestId('share-comment-edit-password')).toBeVisible()

    fireEvent.change(screen.getByTestId('share-comment-edit-content'), {
      target: { value: '고친 내용' },
    })
    // then: 비밀번호 4자 미만이면 제출 불가
    fireEvent.change(screen.getByTestId('share-comment-edit-password'), { target: { value: '12' } })
    expect(editSubmit).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-comment-edit-password'), { target: { value: 'pass1234' } })
    expect(editSubmit).toBeEnabled()
    fireEvent.click(editSubmit)

    expect(await screen.findByText('댓글을 수정했습니다')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByTestId('share-comment-edit-form')).not.toBeInTheDocument()
    })
  })

  it('toasts forbidden when the edit is rejected (403)', async () => {
    server.use(
      http.put(`/api/v1/core/shares/${TOKEN}/comments/:commentId`, () =>
        fail('PERMISSION_DENIED', 403),
      ),
    )
    renderSection()
    await screen.findByTestId('share-comment-list')

    fireEvent.click(screen.getAllByRole('button', { name: '수정' })[0])
    fireEvent.change(await screen.findByTestId('share-comment-edit-content'), {
      target: { value: '타인 수정' },
    })
    fireEvent.change(screen.getByTestId('share-comment-edit-password'), { target: { value: 'wrong-pass' } })
    fireEvent.click(screen.getByTestId('share-comment-edit-submit'))

    expect(
      await screen.findByText('본인이 작성한 댓글만 수정·삭제할 수 있습니다'),
    ).toBeVisible()
  })

  it('deletes a guest comment through the password dialog', async () => {
    renderSection()
    await screen.findByTestId('share-comment-list')

    // 첫 행(비회원 원댓글) 삭제 — 비밀번호 확인 다이얼로그
    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])
    const passwordInput = await screen.findByTestId('share-delete-password')

    // then: 비밀번호 4자 이상이어야 확인이 움직인다 (다이얼로그 확인 버튼 = '삭제' 정확 일치)
    const confirm = screen.getByRole('button', { name: /^삭제$/ })
    fireEvent.change(passwordInput, { target: { value: '12' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(passwordInput, { target: { value: 'pass1234' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    expect(await screen.findByText('댓글을 삭제했습니다')).toBeVisible()
  })

  it('deletes a member/owner comment through the plain confirm dialog', async () => {
    renderSection()
    await screen.findByTestId('share-comment-list')

    // 회원 댓글(지나가는 DBA) — 비밀번호 없이 확인 다이얼로그(판정은 서버 계정 일치)
    const items = screen.getAllByTestId('share-comment-item')
    fireEvent.click(within(items[2]).getByRole('button', { name: '삭제' }))
    expect(screen.queryByTestId('share-delete-password')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: '확인' }))

    expect(await screen.findByText('댓글을 삭제했습니다')).toBeVisible()
  })

  it('toasts forbidden when the deletion is rejected (403)', async () => {
    server.use(
      http.delete(`/api/v1/core/shares/${TOKEN}/comments/:commentId`, () =>
        fail('PERMISSION_DENIED', 403),
      ),
    )
    renderSection()
    await screen.findByTestId('share-comment-list')

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])
    fireEvent.change(await screen.findByTestId('share-delete-password'), { target: { value: 'wrong-pass' } })
    fireEvent.click(screen.getByRole('button', { name: /^삭제$/ }))

    // 다이얼로그 닫힘과 토스트 마운트가 겹치는 찰나라 가시성 대신 존재로 단언한다
    expect(
      await screen.findByText('본인이 작성한 댓글만 수정·삭제할 수 있습니다'),
    ).toBeInTheDocument()
  })
})

describe('ShareFeedbackSection — 문서 단위 대상(model target, #261)', () => {
  it('keeps the reply button on a comment whose parentCommentId field is omitted', async () => {
    // given: 토큰 경로와 같은 NON_NULL 생략 응답 — 답글 버튼 조건도 === null 엄격 비교라
    // 정규화 없으면 최상위 댓글에서 버튼이 사라진다
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/feedback', () =>
        HttpResponse.json(
          okEnvelope({
            response: {
              reactionCount: 1,
              reacted: false,
              comments: [
                {
                  commentId: '91',
                  nickname: '운영 서버',
                  authorType: 'member',
                  content: '필드가 생략된 원댓글',
                  edited: false,
                  createdAt: '2026-09-28T00:00:00Z',
                },
              ],
            },
          }),
        ),
      ),
    )
    renderModelSection({ canReply: true })

    // then: 원댓글 1건이 그려지고 답글 버튼이 살아 있다
    expect(await screen.findAllByTestId('share-comment-item')).toHaveLength(1)
    expect(screen.getByTestId('share-comment-reply-button')).toBeVisible()
  })

  it('renders the member thread and posts an owner reply to a top-level comment', async () => {
    renderModelSection({ canReply: true })
    await screen.findByTestId('share-comment-list')

    // then: 토큰 경로와 같은 스레드 — 카운터·배지·중첩이 동일하게 그려진다
    expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')
    expect(screen.getAllByTestId('share-comment-item')).toHaveLength(3)
    // then: 회원 폼(내용만) — 별명·비밀번호 칸은 공개 뷰어의 비회원 전용
    expect(screen.getByTestId('share-feedback-form')).toBeVisible()
    expect(screen.queryByTestId('share-feedback-nickname')).not.toBeInTheDocument()

    // when: 오너 답글 — 원댓글(31·33)에만 답글 버튼이 뜨고 답글(32)에는 없다
    const replyButtons = screen.getAllByTestId('share-comment-reply-button')
    expect(replyButtons).toHaveLength(2)
    fireEvent.click(replyButtons[0])
    const replySubmit = screen.getByTestId('share-comment-reply-submit')
    expect(replySubmit).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-comment-reply-content'), {
      target: { value: '답글 감사합니다.' },
    })
    expect(replySubmit).toBeEnabled()
    fireEvent.click(replySubmit)

    // then: 등록 토스트 + 폼 철수
    expect(await screen.findByText('댓글을 등록했습니다')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByTestId('share-comment-reply-form')).not.toBeInTheDocument()
    })
  })

  it('hides the edit button on guest comments but keeps delete (plain confirm)', async () => {
    renderModelSection({ canReply: false })
    await screen.findByTestId('share-comment-list')

    // DOM 순서 = 31(guest) · 32(owner 답글) · 33(member)
    const items = screen.getAllByTestId('share-comment-item')
    // then: 비회원 댓글은 문서 경로로 수정할 수 없다(본인 회원 댓글만) — 수정 버튼 없음
    expect(within(items[0]).queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
    expect(within(items[1]).getByRole('button', { name: '수정' })).toBeVisible()
    expect(within(items[2]).getByRole('button', { name: '수정' })).toBeVisible()
    // then: 삭제는 항상 — 비회원 댓글도 오너·관리자가 지울 수 있어 비밀번호 아닌 단순 확인
    fireEvent.click(within(items[0]).getByRole('button', { name: '삭제' }))
    expect(screen.queryByTestId('share-delete-password')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: '확인' }))
    expect(await screen.findByText('댓글을 삭제했습니다')).toBeVisible()
  })

  it('replaces the form with a readonly notice when commenting is not allowed', async () => {
    renderModelSection({ canComment: false })
    await screen.findByTestId('share-comment-list')

    // then: Viewer(댓글 권한 없음) — 폼 대신 읽기 전용 안내, 목록·좋아요는 그대로
    expect(screen.getByTestId('share-feedback-readonly')).toBeVisible()
    expect(screen.queryByTestId('share-feedback-form')).not.toBeInTheDocument()
    expect(screen.getByTestId('share-reaction-count')).toHaveTextContent('9')
  })

  it('hides the section when the member request is rejected', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/feedback', () =>
        fail('AUTH_TOKEN_INVALID', 401),
      ),
    )
    const { container } = renderModelSection()

    // then: 토큰 경로와 같은 원칙 — 실패는 조용히 숨긴다
    await waitFor(() => {
      expect(container.querySelector('[data-testid="share-feedback-section"]')).not.toBeInTheDocument()
    })
  })
})
