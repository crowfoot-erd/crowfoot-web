/**
 * 문서 채팅 도크 — 미니맵 위 채팅 버튼과 위로 펼쳐지는 카드 패널 (02-ui.md, 캔버스 편집 방해 금지)
 *
 * - 닫힘: 남의 메시지가 오면 버튼에 미읽음 배지가 오른다 — 개수는 EditorShell이 계산해
 *   받는다(라이브 수신만 센다. join 시 도착한 과거 history는 미읽음이 아니다).
 * - 열림: 참가자 아바타 스택 + 실시간 목록(내 발언 우측) + 입력. Enter 전송 / Shift+Enter 개행.
 * - 입력은 textarea라 전역 단축키 스킵 규칙(input,textarea)이 그대로 적용된다.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle, SendHorizonal, X } from 'lucide-react'

import { cn } from 'cn'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ChatMessage, CollabParticipant } from '@/features/editor/collab'
import { formatTime } from '@/lib/format'

/** 미니맵 회피 — RF 미니맵(기본 200×150)이 bottom-2(8px)에 붙으므로 그 위 8px: 8+150+8.
 *  ErdCanvas가 미니맵 크기를 바꾸면 이 상수도 따라가야 한다. */
const DOCK_BOTTOM = 'bottom-[166px]'

const MESSAGE_MAX_LENGTH = 500

/** 토스트·배지 미리보기 길이 */
const PREVIEW_LENGTH = 60

interface ChatDockProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 안읽은 남의 메시지 수 — 라이브 수신만 센다(history 제외). 패널을 열면 0으로 리셋된다 */
  unread: number
  messages: ChatMessage[]
  participants: CollabParticipant[]
  myUserId: string | undefined
  connected: boolean
  onSend: (text: string) => void
}

export function ChatDock({
  open,
  onOpenChange,
  unread,
  messages,
  participants,
  myUserId,
  connected,
  onSend,
}: ChatDockProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')

  // 새 발언이 오면 목록 끝으로 스크롤
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = listRef.current
    if (open && list) list.scrollTop = list.scrollHeight
  }, [open, messages.length])

  const send = () => {
    const text = draft.trim()
    if (!text || !connected) return
    onSend(text)
    setDraft('')
  }

  return (
    <div
      data-testid="chat-dock"
      className={cn('absolute right-3 z-10 flex flex-col items-end gap-2', DOCK_BOTTOM)}
    >
      {open && (
        <section
          aria-label={t('model.editor.chat.label')}
          className="flex max-h-[50vh] w-80 flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
        >
          {/* 헤더 — 참가자 스택 + 닫기 */}
          <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="flex -space-x-1.5">
              {participants.slice(0, 5).map((participant) => (
                <Avatar
                  key={participant.userId}
                  name={participant.name}
                  avatarUrl={participant.avatarUrl}
                  className="size-5 border border-background text-[9px] shadow-sm"
                />
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t('model.editor.chat.close')}
              onClick={() => onOpenChange(false)}
            >
              <X aria-hidden className="size-4" />
            </Button>
          </header>

          {/* 목록 — 오래된 순, 남의 발언 좌측(아바타)·내 발언 우측 */}
          <div ref={listRef} className="min-h-24 flex-1 space-y-2 overflow-y-auto px-3 py-2">
            {messages.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {t('model.editor.chat.empty')}
              </p>
            ) : (
              messages.map((message) => {
                const mine = message.userId === myUserId
                return (
                  <div key={message.seq} className={cn('flex gap-2', mine ? 'justify-end' : 'justify-start')}>
                    {!mine && (
                      <Avatar
                        name={message.name}
                        avatarUrl={message.avatarUrl}
                        className="mt-4 size-6 text-[10px]"
                      />
                    )}
                    <div className={cn('max-w-[75%]', mine && 'flex flex-col items-end')}>
                      <div
                        data-testid={mine ? 'chat-bubble-mine' : 'chat-bubble-other'}
                        className={cn(
                          'rounded-lg px-2.5 py-1.5 text-sm',
                          mine
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground',
                        )}
                      >
                        {message.message}
                      </div>
                      <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                        {mine ? formatTime(message.at) : (
                          <>
                            {message.name}
                            {message.userLogin && (
                              <span className="font-medium text-muted-foreground/80"> @{message.userLogin}</span>
                            )}
                            {' · '}
                            {formatTime(message.at)}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* 입력 — Enter 전송 / Shift+Enter 개행. 연결 끊기면 비활성 */}
          <div className="flex items-end gap-1.5 border-t p-2">
            <Textarea
              rows={1}
              value={draft}
              maxLength={MESSAGE_MAX_LENGTH}
              disabled={!connected}
              placeholder={t('model.editor.chat.inputPlaceholder')}
              aria-label={t('model.editor.chat.inputPlaceholder')}
              className="min-h-9 resize-none text-sm"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // 조립(IME) 중 Enter는 확정으로 소비된다 — 여기서 전송하면 미완성 글자가 간다
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault() // 개행 방지 — 전송으로 소비
                  send()
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              className="size-9 shrink-0"
              aria-label={t('model.editor.chat.send')}
              disabled={!connected || !draft.trim()}
              onClick={send}
            >
              <SendHorizonal aria-hidden className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {/* 토글 버튼 — 미읽음 배지 */}
      <Button
        type="button"
        size="icon"
        aria-label={t('model.editor.chat.label')}
        aria-expanded={open}
        data-testid="chat-toggle"
        className="relative size-9 rounded-full shadow-md"
        onClick={() => onOpenChange(!open)}
      >
        <MessageCircle aria-hidden className="size-4" />
        {unread > 0 && (
          <span
            data-testid="chat-unread"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>
    </div>
  )
}

/** 토스트 미리보기 — 60자 자르기(코어 로직 없이 표시용) */
export function chatPreview(message: string): string {
  return message.length > PREVIEW_LENGTH ? `${message.slice(0, PREVIEW_LENGTH)}…` : message
}
