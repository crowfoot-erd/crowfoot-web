/**
 * 협업 2차 — 실시간 채널 (crowfoot-collab, STOMP over WebSocket)
 *
 * - presence: 문서 룸의 접속자 목록(일시적) — 입퇴장 브로드캐스트에 항상 전체 스냅샷이 실린다
 * - version: 남의 저장 푸시(영속 변경 알림) — 콜백으로 넘겨 v1 폴링 캐시에 주입하면
 *   기존 감지 경로(자동 동기화·충돌 배너)가 그대로 재사용된다.
 * - chat: 문서별 실시간 채팅 — join 시 최근 50건 history로 목록을 교체하고 이후 발언이
 *   append된다. 발신자 에코(자기 발언)도 목록에 남는다 — UI가 우측 정렬로 구분한다.
 * - 연결 대상: 운영은 협업 서버 전용 도메인(VITE_WS_URL = wss://crowfoot-ws.java21.net, 443 —
 *   HTTPS 페이지에서 ws:// 는 Mixed Content 로 차단된다), 로컬은 Vite 프록시(/ws → 8083)로 브라우저 주소 기준 조립.
 *   실패해도 조용히: 채널이 없으면 v1 폴링(5초)이 세이프티넷이다.
 * - 신원(HEADER X-USER-*)은 로컬 계약 — 운영은 게이트웨이가 주입한다.
 *   X-USER-AVATAR·X-USER-LOGIN은 선택(있는 계정만 실어 보낸다 — 사진·GitHub 핸들).
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import { Client } from '@stomp/stompjs'

export interface CollabParticipant {
  userId: string
  name: string
  avatarUrl?: string | null
  /** 제공자 핸들(GitHub login) — 채팅 @표시용. 없는 계정은 null */
  userLogin?: string | null
}

interface PresenceEvent {
  type: 'join' | 'leave'
  userId: string
  name: string
  at: string
  participants: CollabParticipant[]
}

interface ModelSavedEvent {
  modelId: string
  version: number
  savedBy: string
  savedByName: string
  at: string
}

/** 채팅 발언 1건 — seq는 서버 부여 단조 순번(프레임 도착 순서가 뒤집힐 수 있어 정렬 근거) */
export interface ChatMessage {
  seq: number
  userId: string
  name: string
  avatarUrl?: string | null
  /** 발신자의 제공자 핸들(GitHub login) — 남의 발언에 @로 표시된다 */
  userLogin?: string | null
  message: string
  at: string
}

/** 서버 채팅 이벤트 — type별로 채워지는 필드가 다르다(단일 발언 vs history 창) */
interface ChatEvent {
  type: 'message' | 'history'
  userId: string | null
  name: string | null
  avatarUrl: string | null
  userLogin: string | null
  message: string | null
  at: string | null
  seq: number
  messages: ChatMessage[] | null
}

/** SockJS 엔드포인트는 /ws — 네이티브 WebSocket 전송은 /ws/websocket 에 붙는다 */
const COLLAB_WS_PATH = '/ws/websocket'

/** 재접속 간격 — 채널 복구를 기다리는 동안 폴링이 변경을 덮는다 */
const RECONNECT_DELAY_MS = 5000

/** 채팅 목록 상한 — 서버 history 창과 같은 50건 */
const CHAT_WINDOW = 50

export interface RemoteSavedPayload {
  version: number
  savedBy: string
  savedByName: string
  at: string
}

export interface UseModelCollabOptions {
  modelId: string
  userId: string | undefined
  userName: string | undefined
  /** 내 프로필 사진 URL — 있을 때만 CONNECT 헤더 X-USER-AVATAR 로 실린다 */
  avatarUrl?: string | null | undefined
  /** 내 GitHub 핸들(login) — 있을 때만 CONNECT 헤더 X-USER-LOGIN 으로 실린다 */
  githubLogin?: string | null | undefined
  /** 남의 저장 푸시(자기 반향은 서버가 savedBy 를 실어 주므로 여기서 걸러낸다) */
  onRemoteSaved?: (event: RemoteSavedPayload) => void
  /** 남의 채팅 수신(자기 에코 제외) — 닫힌 채팅 패널의 토스트·배지 알림용 */
  onIncomingChat?: (message: ChatMessage) => void
  /** false면 채널을 아예 열지 않는다 — 공개 뷰어·버전 뷰어처럼 읽기 전용 화면의 고스트 룸 방지 */
  enabled?: boolean
}

export interface ModelCollabHandle {
  /** 문서 룸 접속자 스냅샷 — 연결 전·실패 시 빈 배열 */
  participants: CollabParticipant[]
  /** 저장 성공 후 룸에 알림 — core-api 저장이 성공한 확정 버전만 실어 보낸다 */
  publishSaved: (version: number) => void
  /** 채팅 목록(오래된 순) — join 시 서버 history로 교체되고 발언마다 append된다 */
  messages: ChatMessage[]
  /** 채팅 발행 — 연결 끊김·빈 메시지면 조용히 무시된다 */
  sendMessage: (text: string) => void
  /** 채널 연결 여부 — 끊기면 채팅 입력을 비활성화한다 */
  connected: boolean
}

function collabWebSocketUrl(): string {
  // 운영은 협업 서버 전용 도메인(crowfoot-ws.java21.net)으로 직접 붙는다 —
  // 프론트 호스트 기준 조립은 로컬(게이트웨이 우회, Vite 프록시 /ws → 8083)에서만 쓴다
  const configured = import.meta.env.VITE_WS_URL
  if (configured) return `${configured}${COLLAB_WS_PATH}`
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}${COLLAB_WS_PATH}`
}

/** message 이벤트 → 발언 값 객체(단일 필드가 채워져 있다는 계약) */
function toChatMessage(event: ChatEvent): ChatMessage {
  return {
    seq: event.seq,
    userId: event.userId ?? '',
    name: event.name ?? '',
    avatarUrl: event.avatarUrl,
    userLogin: event.userLogin,
    message: event.message ?? '',
    at: event.at ?? '',
  }
}

export function useModelCollab(options: UseModelCollabOptions): ModelCollabHandle {
  const { modelId, userId, userName, avatarUrl, githubLogin, onRemoteSaved, onIncomingChat, enabled } = options

  // 최신 콜백 유지 — 구독은 연결 수립 시 1회만 맺는다
  const onRemoteSavedRef = useRef(onRemoteSaved)
  onRemoteSavedRef.current = onRemoteSaved
  const onIncomingChatRef = useRef(onIncomingChat)
  onIncomingChatRef.current = onIncomingChat

  const [participants, setParticipants] = useState<CollabParticipant[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const clientRef = useRef<Client | null>(null)

  useEffect(() => {
    // 신원 없으면(미인증) 채널 없음 — 폴링만으로 동작한다. 읽기 전용 화면(publicView)도 마찬가지
    if (enabled === false || !userId || !modelId) return

    const connectHeaders: Record<string, string> = { 'X-USER-ID': userId, 'X-USER-NAME': userName ?? '' }
    if (avatarUrl) connectHeaders['X-USER-AVATAR'] = avatarUrl
    if (githubLogin) connectHeaders['X-USER-LOGIN'] = githubLogin

    const client = new Client({
      brokerURL: collabWebSocketUrl(),
      connectHeaders,
      reconnectDelay: RECONNECT_DELAY_MS,
      onConnect: () => {
        setConnected(true)
        client.subscribe(`/topic/models/${modelId}/presence`, (message) => {
          const event = JSON.parse(message.body) as PresenceEvent
          setParticipants(event.participants)
        })
        client.subscribe(`/topic/models/${modelId}/version`, (message) => {
          const event = JSON.parse(message.body) as ModelSavedEvent
          if (event.savedBy === userId) return // 자기 저장 반향
          onRemoteSavedRef.current?.(event)
        })
        client.subscribe(`/topic/models/${modelId}/chat`, (message) => {
          const event = JSON.parse(message.body) as ChatEvent
          if (event.type === 'history') {
            // 목록 교체(멱등) — 서버의 최근 50건 창이 곧 진실. 재접속 join에도 다시 온다
            setMessages((event.messages ?? []).slice(-CHAT_WINDOW))
            return
          }
          const incoming = toChatMessage(event)
          // seq 정렬 — 발언 이벤트의 도착 순서는 뒤집힐 수 있다(브로커 멀티스레드)
          setMessages((prev) => [...prev, incoming].sort((a, b) => a.seq - b.seq).slice(-CHAT_WINDOW))
          if (incoming.userId && incoming.userId !== userId) {
            onIncomingChatRef.current?.(incoming)
          }
        })
        // 문서를 열었다 — presence 등록. 퇴장은 연결 해제로 충분(서버가 disconnect 정리를 원천으로 삼는다)
        client.publish({ destination: `/app/models/${modelId}/join`, body: '' })
      },
      onDisconnect: () => setConnected(false),
      onWebSocketClose: () => setConnected(false),
    })
    clientRef.current = client
    client.activate()

    return () => {
      clientRef.current = null
      setParticipants([])
      setMessages([])
      setConnected(false)
      void client.deactivate()
    }
  }, [enabled, userId, userName, avatarUrl, githubLogin, modelId])

  // 룸 키는 modelId(문서 정체성) — workspaceId 는 채널 주소에 쓰지 않는다
  const publishSaved = useMemo(
    () =>
      (version: number): void => {
        const client = clientRef.current
        if (!client?.connected) return // 채널 없으면 조용히 — 폴링이 대신 발견한다
        client.publish({
          destination: `/app/models/${modelId}/saved`,
          body: JSON.stringify({ version }),
        })
      },
    [modelId],
  )

  const sendMessage = useMemo(
    () =>
      (text: string): void => {
        const client = clientRef.current
        if (!client?.connected || !text.trim()) return // 빈 메시지는 서버 검증 전에 여기서도
        client.publish({
          destination: `/app/models/${modelId}/chat`,
          body: JSON.stringify({ message: text }),
        })
      },
    [modelId],
  )

  return { participants, publishSaved, messages, sendMessage, connected }
}
