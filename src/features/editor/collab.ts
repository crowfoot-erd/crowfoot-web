/**
 * 협업 2차 — 실시간 채널 (crowfoot-collab, STOMP over WebSocket)
 *
 * - presence: 문서 룸의 접속자 목록(일시적) — 입퇴장 브로드캐스트에 항상 전체 스냅샷이 실린다
 * - version: 남의 저장 푸시(영속 변경 알림) — 콜백으로 넘겨 v1 폴링 캐시에 주입하면
 *   기존 감지 경로(자동 동기화·충돌 배너)가 그대로 재사용된다.
 * - 연결 대상: 운영은 협업 서버 전용 도메인(VITE_WS_URL = ws://crowfoot-ws.java21.net:80),
 *   로컬은 Vite 프록시(/ws → 8083)로 브라우저 주소 기준 조립.
 *   실패해도 조용히: 채널이 없으면 v1 폴링(5초)이 세이프티넷이다.
 * - 신원(HEADER X-USER-*)은 로컬 계약 — 운영은 게이트웨이가 주입한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import { Client } from '@stomp/stompjs'

export interface CollabParticipant {
  userId: string
  name: string
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

/** SockJS 엔드포인트는 /ws — 네이티브 WebSocket 전송은 /ws/websocket 에 붙는다 */
const COLLAB_WS_PATH = '/ws/websocket'

/** 재접속 간격 — 채널 복구를 기다리는 동안 폴링이 변경을 덮는다 */
const RECONNECT_DELAY_MS = 5000

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
  /** 남의 저장 푸시(자기 반향은 서버가 savedBy 를 실어 주므로 여기서 걸러낸다) */
  onRemoteSaved?: (event: RemoteSavedPayload) => void
}

export interface ModelCollabHandle {
  /** 문서 룸 접속자 스냅샷 — 연결 전·실패 시 빈 배열 */
  participants: CollabParticipant[]
  /** 저장 성공 후 룸에 알림 — core-api 저장이 성공한 확정 버전만 실어 보낸다 */
  publishSaved: (version: number) => void
}

function collabWebSocketUrl(): string {
  // 운영은 협업 서버 전용 도메인(crowfoot-ws.java21.net)으로 직접 붙는다 —
  // 프론트 호스트 기준 조립은 로컬(게이트웨이 우회, Vite 프록시 /ws → 8083)에서만 쓴다
  const configured = import.meta.env.VITE_WS_URL
  if (configured) return `${configured}${COLLAB_WS_PATH}`
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}${COLLAB_WS_PATH}`
}

export function useModelCollab(options: UseModelCollabOptions): ModelCollabHandle {
  const { modelId, userId, userName, onRemoteSaved } = options

  // 최신 콜백 유지 — 구독은 연결 수립 시 1회만 맺는다
  const onRemoteSavedRef = useRef(onRemoteSaved)
  onRemoteSavedRef.current = onRemoteSaved

  const [participants, setParticipants] = useState<CollabParticipant[]>([])
  const clientRef = useRef<Client | null>(null)

  useEffect(() => {
    // 신원 없으면(미인증) 채널 없음 — 폴링만으로 동작한다
    if (!userId || !modelId) return

    const client = new Client({
      brokerURL: collabWebSocketUrl(),
      connectHeaders: { 'X-USER-ID': userId, 'X-USER-NAME': userName ?? '' },
      reconnectDelay: RECONNECT_DELAY_MS,
      onConnect: () => {
        client.subscribe(`/topic/models/${modelId}/presence`, (message) => {
          const event = JSON.parse(message.body) as PresenceEvent
          setParticipants(event.participants)
        })
        client.subscribe(`/topic/models/${modelId}/version`, (message) => {
          const event = JSON.parse(message.body) as ModelSavedEvent
          if (event.savedBy === userId) return // 자기 저장 반향
          onRemoteSavedRef.current?.(event)
        })
        // 문서를 열었다 — presence 등록. 퇴장은 연결 해제로 충분(서버가 disconnect 정리를 원천으로 삼는다)
        client.publish({ destination: `/app/models/${modelId}/join`, body: '' })
      },
    })
    clientRef.current = client
    client.activate()

    return () => {
      clientRef.current = null
      setParticipants([])
      void client.deactivate()
    }
  }, [userId, userName, modelId])

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

  return { participants, publishSaved }
}
