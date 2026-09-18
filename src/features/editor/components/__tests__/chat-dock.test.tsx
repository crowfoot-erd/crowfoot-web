/**
 * 문서 채팅 도크 — 토글·미읽음 배지·메시지 정렬·입력(Enter/Shift+Enter)·연결 끊김 비활성화
 */
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage, CollabParticipant } from '@/features/editor/collab'
import { ChatDock } from '@/features/editor/components/ChatDock'
import { renderWithProviders } from '@/test/test-app'

const message = (over: Partial<ChatMessage>): ChatMessage => ({
  seq: 1,
  userId: 'u2',
  name: '밥',
  avatarUrl: null,
  userLogin: null,
  message: '안녕',
  at: '2026-09-18T00:00:00Z',
  ...over,
})

const participants: CollabParticipant[] = [
  { userId: 'u1', name: '앨리스', avatarUrl: null },
  { userId: 'u2', name: '밥', avatarUrl: null },
]

function renderDock(props: Partial<Parameters<typeof ChatDock>[0]> = {}) {
  const onOpenChange = vi.fn()
  const onSend = vi.fn()
  const base = {
    open: false,
    onOpenChange,
    unread: 0,
    messages: [] as ChatMessage[],
    participants,
    myUserId: 'u1',
    connected: true,
    onSend,
    ...props,
  }
  const utils = renderWithProviders(<ChatDock {...base} />, { wrapRoutes: false })
  return { ...utils, props: base }
}

describe('ChatDock — 문서 채팅 도크', () => {
  it('닫힘 — 토글 버튼만. 열면 패널(참가자·빈 문구)이 뜬다', () => {
    const { rerender } = renderDock()

    expect(screen.getByTestId('chat-toggle')).toBeVisible()
    expect(screen.queryByRole('region', { name: '문서 채팅' })).toBeNull()

    rerender(
      <ChatDock
        open
        onOpenChange={vi.fn()}
        unread={0}
        messages={[]}
        participants={participants}
        myUserId="u1"
        connected
        onSend={vi.fn()}
      />,
    )
    const panel = screen.getByRole('region', { name: '문서 채팅' })
    expect(panel).toBeVisible()
    expect(screen.getByText('아직 대화가 없습니다')).toBeVisible()
  })

  it('미읽음 배지 — prop으로 받은 개수(99 초과 표기 포함). 0이면 렌더하지 않는다', () => {
    const { rerender } = renderDock({ unread: 1 })
    expect(screen.getByTestId('chat-unread')).toHaveTextContent('1')

    rerender(
      <ChatDock
        open={false}
        onOpenChange={vi.fn()}
        unread={120}
        messages={[]}
        participants={participants}
        myUserId="u1"
        connected
        onSend={vi.fn()}
      />,
    )
    expect(screen.getByTestId('chat-unread')).toHaveTextContent('99+')

    rerender(
      <ChatDock
        open
        onOpenChange={vi.fn()}
        unread={0}
        messages={[]}
        participants={participants}
        myUserId="u1"
        connected
        onSend={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('chat-unread')).toBeNull()
  })

  it('메시지 목록 — 내 발언 우측(mine)·남의 발언 좌측(other), 이름·시각 표시', () => {
    renderDock({
      open: true,
      messages: [
        message({ seq: 1, userId: 'u2', name: '밥', message: '남의 발언' }),
        message({ seq: 2, userId: 'u1', name: '앨리스', message: '내 발언' }),
      ],
    })

    expect(screen.getByTestId('chat-bubble-other')).toHaveTextContent('남의 발언')
    expect(screen.getByTestId('chat-bubble-mine')).toHaveTextContent('내 발언')
    expect(screen.getByText(/밥 ·/)).toBeVisible() // 남의 발언은 이름 노출
  })

  it('남의 발언은 GitHub 핸들(@login)을 이름 옆에 노출 — 핸들 없으면 생략, 내 발언은 시각만', () => {
    renderDock({
      open: true,
      messages: [
        message({ seq: 1, userId: 'u2', name: '밥', userLogin: 'octocat', message: '핸들 있음' }),
        message({ seq: 2, userId: 'u3', name: '캐럴', message: '핸들 없음' }),
        message({ seq: 3, userId: 'u1', name: '앨리스', userLogin: 'myhandle', message: '내 발언' }),
      ],
    })

    // 핸들은 중첩 span이라 텍스트 직접 매칭 — 이름과 같은 메타 라인인지도 확인
    const handle = screen.getByText('@octocat')
    expect(handle).toBeVisible()
    expect(handle.parentElement).toHaveTextContent('밥')
    expect(screen.getByText(/캐럴 ·/)).toBeVisible() // 핸들 없으면 @ 없이
    expect(screen.queryByText(/@myhandle/)).toBeNull() // 내 발언 메타는 시각만
  })

  it('입력 — Enter 전송 후 지워지고, Shift+Enter는 개행(전송 아님)', () => {
    const { props } = renderDock({ open: true })
    const input = screen.getByLabelText('메시지 보내기')

    fireEvent.change(input, { target: { value: '안녕하세요' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(props.onSend).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onSend).toHaveBeenCalledWith('안녕하세요')
    expect(input).toHaveValue('') // 전송 후 드래프트 초기화
  })

  it('연결 끊기면 입력·전송이 비활성화된다', () => {
    renderDock({ open: true, connected: false })

    expect(screen.getByLabelText('메시지 보내기')).toBeDisabled()
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()
  })
})
