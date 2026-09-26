/**
 * 협업 3차 — 실시간 채널 (crowfoot-collab, STOMP over WebSocket) · v1.17 고도화
 *
 * - presence: 문서 룸의 접속자 목록(일시적) — 입퇴장 브로드캐스트에 항상 전체 스냅샷이 실린다.
 *   참가자에 role(OWNER/EDITOR/...)이 실려 나 → myRole·readOnly를 여기서 도출한다.
 * - version: 남의 저장 푸시(영속 변경 알림) — seq를 함께 실어 수신 측 baseVersion 승계 판정에 쓴다.
 * - chat: 문서별 실시간 채팅 — join 시 최근 50건 history로 목록을 교체하고 이후 발언이 append된다.
 * - commands (v1.17): 실시간 편집 커맨드 — 수렴 규칙은 "서버 seq 순서" 하나. 서버는 검증·seq
 *   부여·중계만 하고 병합은 각 클라이언트가 같은 순서로 적용해 달성한다:
 *   · 수신: seq 정렬 버퍼(오름차순만 적용, 갭이 오래 남으면 250ms 후 강제 적용 — applyChange 멱등)
 *   · 자기 에코(actorId===me)는 적용 스킵·seq만 기록 — 로컬 낙관적 적용이 이미 있다
 *   · 발신: 로컬 커밋 통지를 150ms 창에 모아 병합(collab-merge coalesceChanges)해 프레임 수를 줄인다
 * - cursor (v1.17): 참가자 커서·선택·드래그(일시적) — 클라이언트 30ms 쓰로틀, 서버도 같은 창으로 드롭.
 * - locks (v1.17): Edit Session Lock 전체 스냅샷(멱등 교체) — 구조 편집 다이얼로그 획득/해제.
 * - collab-events (v1.17): 요청자 전용 개인 큐 — rejected(쓰기 차단 사유)·resync(재동기화 지시).
 *   재접속 때 resync('reconnect')를 스스로 부른다(seq 공간이 새로 시작하므로).
 * - 연결 대상: 운영은 협업 서버 전용 도메인(VITE_WS_URL = wss://crowfoot-ws.java21.net, 443 —
 *   HTTPS 페이지에서 ws:// 는 Mixed Content 로 차단된다), 로컬은 Vite 프록시(/ws → 8083)로 브라우저 주소 기준 조립.
 *   실패해도 조용히: 채널이 없으면 v1 폴링(5초)이 세이프티넷이다.
 * - 신원: 토큰이 있으면 Authorization: Bearer(운영 — introspection 신원), X-USER-*는 로컬 계약.
 *   X-USER-AVATAR·X-USER-LOGIN은 선택(있는 계정만 실어 보낸다 — 사진·GitHub 핸들).
 * - CONNECT native header accept-language로 서버 문구 언어를 고른다(collab WebSocketConfig —
 *   연결 거부 문구·폴백 표시명). 연결 시점 언어로 고정, 재접속 때 갱신된다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import { Client } from '@stomp/stompjs'

import { getAccessToken } from '@/api/client'
import { coalesceChanges } from '@/features/editor/model/collab-merge'
import type { ErdChange } from '@/features/editor/model/changes'
import { currentLanguage } from '@/lib/i18n'

export interface CollabParticipant {
  userId: string
  name: string
  avatarUrl?: string | null
  /** 제공자 핸들(GitHub login) — 채팅 @표시용. 없는 계정은 null */
  userLogin?: string | null
  /** 문서에서의 역할(OWNER/EDITOR/COMMENTER/VIEWER) — 서버 멤버십 확정값. 연결 전 null */
  role?: string | null
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
  /** 저장 시점의 룸 seq — 받은 커맨드가 저장 내용을 전부 덮으면 baseVersion을 조용히 승계한다 */
  seq: number
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

/** 커맨드 브로드캐스트 — 발신자 포함 전원. change는 웹 ErdChange 직렬화 그대로 */
interface CommandEventPayload {
  seq: number
  actorId: string
  actorName: string | null
  change: ErdChange
}

/** Edit Session Lock 뷰 — 누가 어떤 객체를 언제부터 잠갔는지 (전체 스냅샷 원소) */
export interface CollabLock {
  targetType: 'table' | 'relationship' | 'note' | 'area'
  targetId: string
  userId: string
  userName: string
  acquiredAt: string
}

interface LocksEventPayload {
  locks: CollabLock[] | null
}

/** 참가자 커서 상태 — cursor는 발신 원문 {x, y, selection, dragging} 그대로 */
export interface RemoteCursorState {
  userId: string
  name: string
  cursor: { x: number; y: number; selection?: string[]; dragging?: Record<string, { x: number; y: number }> }
  at: string
}

interface CursorEventPayload {
  type: 'move' | 'snapshot'
  userId: string | null
  name: string | null
  cursor: RemoteCursorState['cursor'] | null
  at: string | null
  cursors: Array<{ userId: string; name: string; cursor: RemoteCursorState['cursor']; at: string }> | null
}

/** 개인 통보 — rejected(쓰기 차단)·resync(서버 상태로 재동기화 지시) */
interface CollabEventPayload {
  type: 'rejected' | 'resync'
  modelId: string
  reason: string
  at: string
}

/** SockJS 엔드포인트는 /ws — 네이티브 WebSocket 전송은 /ws/websocket 에 붙는다 */
const COLLAB_WS_PATH = '/ws/websocket'

/** 재접속 간격 — 채널 복구를 기다리는 동안 폴링이 변경을 덮는다 */
const RECONNECT_DELAY_MS = 5000

/** 채팅 목록 상한 — 서버 history 창과 같은 50건 */
const CHAT_WINDOW = 50

/** 발신 커맨드 병합 창 — 같은 대상의 연속 편집(텍스트 입력 등)을 한 프레임으로 합친다 */
const COMMAND_BURST_MS = 150

/** 커서 발신 쓰로틀 — 서버 드롭 창(30ms)과 같아 클라이언트에서 미리 끊는다 */
const CURSOR_MIN_INTERVAL_MS = 30

/** seq 갭 강제 적용 대기 — 이 안에 빠진 프레임이 오면 순서를 지키고, 못 오면 멱등 적용로 넘어간다 */
const GAP_FORCE_MS = 250

export interface RemoteSavedPayload {
  version: number
  savedBy: string
  savedByName: string
  at: string
  /** 저장 시점 룸 seq — 승계 판정(receivedSeq ≥ seq)에 쓴다 */
  seq: number
  /** 내가 받아 적용한 커맨드의 최대 seq(자기 에코 포함) */
  receivedSeq: number
}

export interface CursorPayload {
  x: number
  y: number
  selection?: string[]
  dragging?: Record<string, { x: number; y: number }>
}

export type LockTargetType = CollabLock['targetType']

export interface UseModelCollabOptions {
  modelId: string
  userId: string | undefined
  userName: string | undefined
  /** 내 프로필 사진 URL — 있을 때만 CONNECT 헤더 X-USER-AVATAR 로 실린다 */
  avatarUrl?: string | null | undefined
  /** 내 GitHub 핸들(login) — 있을 때만 CONNECT 헤더 X-USER-LOGIN 으로 실어 보낸다 */
  githubLogin?: string | null | undefined
  /** 남의 저장 푸시(자기 반향은 서버가 savedBy 를 실어 주므로 여기서 걸러낸다) */
  onRemoteSaved?: (event: RemoteSavedPayload) => void
  /** 남의 채팅 수신(자기 에코 제외) — 닫힌 채팅 패널의 토스트·배지 알림용 */
  onIncomingChat?: (message: ChatMessage) => void
  /** 남의 편집 커맨드(자기 에코 제외·seq 정렬 후) — 스토어 applyRemote·LWW 감지로 이어진다 */
  onRemoteCommand?: (change: ErdChange, actor: { userId: string; name: string }) => void
  /** 서버의 쓰기 차단 통보(read-only·lock-held·payload-too-large) — 토스트·UI 잠금으로 */
  onRejected?: (reason: string) => void
  /** 재동기화 지시(read-only 입장·권한 박탈·재접속) — fetchModel 강제 수화 등 */
  onResync?: (reason: string) => void
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
  /* ---------- v1.17 실시간 편집 ---------- */
  /** 로컬 커밋 발행 — 150ms 창 병합 후 서버 seq를 받아 전원(나 포함)에게 중계된다.
   *  read-only 역할이면 로컬에서 차단한다(서버 2차 방어와 이중화) */
  sendCommands: (changes: ErdChange[]) => void
  /** 커서 이동 통보(30ms 쓰로틀) — 문서를 건드리지 않는 일시적 채널 */
  sendCursor: (cursor: CursorPayload) => void
  /** 구조 편집 다이얼로그 진입 — 락 획득. 거부(다른 보유자)는 locks 스냅샷+rejected로 표현된다 */
  acquireLock: (targetType: LockTargetType, targetId: string) => void
  /** 다이얼로그 종료·TTL 유지용 갱신 */
  renewLock: (targetType: LockTargetType, targetId: string) => void
  releaseLock: (targetType: LockTargetType, targetId: string) => void
  /** 현재 락 스냅샷(멱등 교체) — 락 뱃지·편집 차단 판정의 원천 */
  locks: CollabLock[]
  /** 남의 커서 상태(자기 제외, userId 키 최종값) — RemoteCursorLayer가 그린다 */
  remoteCursors: RemoteCursorState[]
  /** 이 문서에서의 내 역할 — presence 스냅샷에서 나를 찾아 도출. 연결 전 null */
  myRole: string | null
  /** Viewer·Commenter — 편집 UI 잠금. 역할 미확정(null)이면 낙관적으로 쓰기 허용(서버가 방어) */
  readOnly: boolean
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
  const { modelId, userId, userName, avatarUrl, githubLogin, enabled } = options

  // 최신 콜백 유지 — 구독은 연결 수립 시 1회만 맺는다
  const onRemoteSavedRef = useRef(options.onRemoteSaved)
  onRemoteSavedRef.current = options.onRemoteSaved
  const onIncomingChatRef = useRef(options.onIncomingChat)
  onIncomingChatRef.current = options.onIncomingChat
  const onRemoteCommandRef = useRef(options.onRemoteCommand)
  onRemoteCommandRef.current = options.onRemoteCommand
  const onRejectedRef = useRef(options.onRejected)
  onRejectedRef.current = options.onRejected
  const onResyncRef = useRef(options.onResync)
  onResyncRef.current = options.onResync

  const [participants, setParticipants] = useState<CollabParticipant[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [locks, setLocks] = useState<CollabLock[]>([])
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursorState[]>([])
  const clientRef = useRef<Client | null>(null)

  /* ---------- seq 정렬 버퍼 — refs는 채널 수명과 함께 산다 ---------- */
  const lastSeqRef = useRef(0)
  const pendingSeqRef = useRef(new Map<number, CommandEventPayload>())
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hadConnectionRef = useRef(false)

  /* ---------- 발신 버퍼 ---------- */
  const commandQueueRef = useRef<ErdChange[]>([])
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readOnlyRef = useRef(false)
  const cursorPendingRef = useRef<CursorPayload | null>(null)
  const cursorSentAtRef = useRef(0)
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 신원 없으면(미인증) 채널 없음 — 폴링만으로 동작한다. 읽기 전용 화면(publicView)도 마찬가지
    if (enabled === false || !userId || !modelId) return

    // 채널 수명 시작 — seq 공간·버퍼 초기화(문서 이동·재마운트)
    lastSeqRef.current = 0
    pendingSeqRef.current.clear()
    hadConnectionRef.current = false

    const connectHeaders: Record<string, string> = {
      'X-USER-ID': userId,
      'X-USER-NAME': userName ?? '',
      'accept-language': currentLanguage(),
    }
    if (avatarUrl) connectHeaders['X-USER-AVATAR'] = avatarUrl
    if (githubLogin) connectHeaders['X-USER-LOGIN'] = githubLogin
    // 운영 신원 — Bearer introspection. 로컬(header 모드)에서는 서버가 이 헤더를 무시한다
    const token = getAccessToken()
    if (token) connectHeaders.Authorization = `Bearer ${token}`

    /** 커맨드 1건 적용 — 자기 에코는 스킵(이미 로컬 낙관적 적용), seq는 항상 기록 */
    const consume = (event: CommandEventPayload): void => {
      lastSeqRef.current = event.seq
      if (event.actorId !== userId) {
        onRemoteCommandRef.current?.(event.change, { userId: event.actorId, name: event.actorName ?? '' })
      }
    }

    /** 갭 강제 적용 — 250ms 내 빠진 프레임이 오지 않으면 손으로 순서를 잡는다.
     *  늦게 온 원본이 다시 적용돼도 applyChange는 멱등(절대값 설정)이라 안전하다 */
    const forceFlushPending = (): void => {
      const entries = [...pendingSeqRef.current.values()].sort((a, b) => a.seq - b.seq)
      pendingSeqRef.current.clear()
      entries.forEach(consume)
    }

    const onCommandEvent = (event: CommandEventPayload): void => {
      if (event.seq <= lastSeqRef.current) return // 늦은 도착·중복 — 이미 지나간 순번
      if (event.seq === lastSeqRef.current + 1) {
        consume(event)
        let next = pendingSeqRef.current.get(lastSeqRef.current + 1)
        while (next) {
          pendingSeqRef.current.delete(next.seq)
          consume(next)
          next = pendingSeqRef.current.get(lastSeqRef.current + 1)
        }
        if (gapTimerRef.current && pendingSeqRef.current.size === 0) {
          clearTimeout(gapTimerRef.current)
          gapTimerRef.current = null
        }
        return
      }
      pendingSeqRef.current.set(event.seq, event)
      if (gapTimerRef.current === null) {
        gapTimerRef.current = setTimeout(() => {
          gapTimerRef.current = null
          forceFlushPending()
        }, GAP_FORCE_MS)
      }
    }

    const client = new Client({
      brokerURL: collabWebSocketUrl(),
      connectHeaders,
      reconnectDelay: RECONNECT_DELAY_MS,
      onConnect: () => {
        setConnected(true)
        // 재접속 — seq 공간이 새로 시작한다: 버퍼 비우고 웹에 알려 문서를 다시 맞추게 한다
        if (hadConnectionRef.current) {
          lastSeqRef.current = 0
          pendingSeqRef.current.clear()
          onResyncRef.current?.('reconnect')
        }
        hadConnectionRef.current = true

        client.subscribe(`/topic/models/${modelId}/presence`, (message) => {
          const event = JSON.parse(message.body) as PresenceEvent
          setParticipants(event.participants)
        })
        client.subscribe(`/topic/models/${modelId}/version`, (message) => {
          const event = JSON.parse(message.body) as ModelSavedEvent
          // 자기 저장 반향은 콜백을 태우지 않되, seq 기록은 한다(끊김 중 발행분 보강).
          // seq 누락(구형 서버)이면 기록하지 않는다 — Math.max(…, undefined)는 NaN이라 버퍼를 못 쓰게 한다
          if (event.savedBy === userId) {
            if (typeof event.seq === 'number') lastSeqRef.current = Math.max(lastSeqRef.current, event.seq)
            return
          }
          onRemoteSavedRef.current?.({
            version: event.version,
            savedBy: event.savedBy,
            savedByName: event.savedByName,
            at: event.at,
            seq: event.seq,
            receivedSeq: lastSeqRef.current,
          })
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
        client.subscribe(`/topic/models/${modelId}/commands`, (message) => {
          onCommandEvent(JSON.parse(message.body) as CommandEventPayload)
        })
        client.subscribe(`/topic/models/${modelId}/locks`, (message) => {
          setLocks((JSON.parse(message.body) as LocksEventPayload).locks ?? [])
        })
        client.subscribe(`/topic/models/${modelId}/cursor`, (message) => {
          const event = JSON.parse(message.body) as CursorEventPayload
          if (event.type === 'snapshot') {
            setRemoteCursors((event.cursors ?? []).filter((entry) => entry.userId !== userId))
            return
          }
          if (!event.userId || event.userId === userId) return // 자기 커서 에코 — 그리지 않는다
          const movedBy = event.userId // 좁힘을 콜백 안까지 유지
          setRemoteCursors((prev) => {
            const next = prev.filter((c) => c.userId !== movedBy)
            if (event.cursor) {
              next.push({ userId: movedBy, name: event.name ?? '', cursor: event.cursor, at: event.at ?? '' })
            }
            return next
          })
        })
        client.subscribe(`/user/queue/models/${modelId}/collab-events`, (message) => {
          const event = JSON.parse(message.body) as CollabEventPayload
          if (event.type === 'rejected') onRejectedRef.current?.(event.reason)
          else onResyncRef.current?.(event.reason)
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
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current)
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current)
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
      gapTimerRef.current = null
      burstTimerRef.current = null
      cursorTimerRef.current = null
      commandQueueRef.current = []
      cursorPendingRef.current = null
      setParticipants([])
      setMessages([])
      setConnected(false)
      setLocks([])
      setRemoteCursors([])
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

  /** 로컬 커밋 발행 — 창에 모아 병합. read-only면 여기서 끊는다(서버 2차 방어와 이중화) */
  const sendCommands = useMemo(
    () =>
      (changes: ErdChange[]): void => {
        if (changes.length === 0 || readOnlyRef.current) return
        const client = clientRef.current
        if (!client?.connected) return // 끊김 중 발행은 버린다 — 재접속 resync가 문서를 맞춘다
        commandQueueRef.current.push(...changes)
        if (burstTimerRef.current === null) {
          burstTimerRef.current = setTimeout(() => {
            burstTimerRef.current = null
            const burst = coalesceChanges(commandQueueRef.current)
            commandQueueRef.current = []
            const active = clientRef.current
            if (!active?.connected) return
            for (const change of burst) {
              active.publish({
                destination: `/app/models/${modelId}/commands`,
                body: JSON.stringify({ change }),
              })
            }
          }, COMMAND_BURST_MS)
        }
      },
    [modelId],
  )

  /** 커서 발신 쓰로틀 — 창 안 이동은 마지막 위치 하나만 간다(트레일링 타이머) */
  const sendCursor = useMemo(
    () =>
      (cursor: CursorPayload): void => {
        cursorPendingRef.current = cursor
        const active = clientRef.current
        if (!active?.connected) return
        const elapsed = Date.now() - cursorSentAtRef.current
        if (elapsed >= CURSOR_MIN_INTERVAL_MS) {
          const pending = cursorPendingRef.current
          cursorPendingRef.current = null
          cursorSentAtRef.current = Date.now()
          active.publish({
            destination: `/app/models/${modelId}/cursor`,
            body: JSON.stringify(pending),
          })
          return
        }
        if (cursorTimerRef.current === null) {
          cursorTimerRef.current = setTimeout(() => {
            cursorTimerRef.current = null
            const pending = cursorPendingRef.current
            const current = clientRef.current
            if (!pending || !current?.connected) return
            cursorPendingRef.current = null
            cursorSentAtRef.current = Date.now()
            current.publish({
              destination: `/app/models/${modelId}/cursor`,
              body: JSON.stringify(pending),
            })
          }, CURSOR_MIN_INTERVAL_MS - elapsed)
        }
      },
    [modelId],
  )

  /** 락 발행 — acquire/renew/release. read-only·미연결은 조용히 */
  const lockOp = useMemo(
    () =>
      (action: 'acquire' | 'renew' | 'release', targetType: LockTargetType, targetId: string): void => {
        const client = clientRef.current
        if (!client?.connected || readOnlyRef.current) return
        client.publish({
          destination: `/app/models/${modelId}/locks`,
          body: JSON.stringify({ action, targetType, targetId }),
        })
      },
    [modelId],
  )

  const myRole = useMemo(
    () => participants.find((p) => p.userId === userId)?.role ?? null,
    [participants, userId],
  )
  const readOnly = myRole !== null && myRole !== 'OWNER' && myRole !== 'EDITOR'
  readOnlyRef.current = readOnly // 발행 경로가 즉시 참조 — 렌더 지연 없이 차단

  return {
    participants,
    publishSaved,
    messages,
    sendMessage,
    connected,
    sendCommands,
    sendCursor,
    acquireLock: (targetType, targetId) => lockOp('acquire', targetType, targetId),
    renewLock: (targetType, targetId) => lockOp('renew', targetType, targetId),
    releaseLock: (targetType, targetId) => lockOp('release', targetType, targetId),
    locks,
    remoteCursors,
    myRole,
    readOnly,
  }
}
