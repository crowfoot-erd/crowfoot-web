/**
 * 협업 2차 채널 훅 — STOMP 클라이언트를 갈아끼워 계약을 검증한다(실서버 왕복은 스크립트 실측 담당)
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useModelCollab } from '@/features/editor/collab'

// 목 클라이언트 — activate만 실처럼 보이게 하고, 구독·발행은 기록으로 남긴다
const stomp = vi.hoisted(() => ({ instances: [] as Array<Record<string, unknown>> }))
vi.mock('@stomp/stompjs', () => ({
  // 생성자(new Client) 형태 계약 — 인스턴스를 만들어 레지스트리에 남긴다
  Client: function MockClient(this: unknown, config: Record<string, unknown>) {
    const instance = {
      config,
      connected: false,
      activate: vi.fn(),
      deactivate: vi.fn(),
      publish: vi.fn(),
      subscriptions: new Map<string, (message: { body: string }) => void>(),
      subscribe: vi.fn((destination: string, callback: (message: { body: string }) => void) => {
        instance.subscriptions.set(destination, callback)
        return { unsubscribe: () => instance.subscriptions.delete(destination) }
      }),
    }
    stomp.instances.push(instance)
    return instance
  },
}))

type StompMock = {
  config: Record<string, unknown>
  connected: boolean
  activate: ReturnType<typeof vi.fn>
  deactivate: ReturnType<typeof vi.fn>
  publish: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  subscriptions: Map<string, (message: { body: string }) => void>
}

const lastClient = (): StompMock => stomp.instances[stomp.instances.length - 1] as StompMock

/** 연결 수립 재현 — activate 후 서버가 CONNECTED를 준 시점 */
const connect = (client: StompMock) => {
  client.connected = true
  const onConnect = client.config.onConnect as () => void
  onConnect()
}

const presenceBody = (participants: Array<{ userId: string; name: string }>) =>
  JSON.stringify({ type: 'join', userId: 'x', name: 'x', at: '2026-09-14T00:00:00Z', participants })

afterEach(() => {
  stomp.instances.length = 0
  vi.restoreAllMocks()
})

describe('useModelCollab — 협업 2차 실시간 채널', () => {
  it('신원이 있으면 연결하고 문서 룸에 join — presence·version 구독 2건', () => {
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }),
    )

    const client = lastClient()
    expect(client.activate).toHaveBeenCalledTimes(1)
    // 같은 오리진 프록시 주소 — 브라우저 스킴을 따라간다
    expect(String(client.config.brokerURL)).toContain('/ws/websocket')
    expect(client.config.connectHeaders).toEqual({ 'X-USER-ID': 'u1', 'X-USER-NAME': '앨리스', 'accept-language': 'ko' })

    act(() => connect(client))
    expect(client.subscribe).toHaveBeenCalledWith('/topic/models/m1/presence', expect.any(Function))
    expect(client.subscribe).toHaveBeenCalledWith('/topic/models/m1/version', expect.any(Function))
    expect(client.publish).toHaveBeenCalledWith({ destination: '/app/models/m1/join', body: '' })
    expect(result.current.participants).toEqual([])
  })

  it('신원 없으면(미인증) 채널을 만들지 않는다 — 폴링만으로 동작', () => {
    renderHook(() => useModelCollab({ modelId: 'm1', userId: undefined, userName: undefined }))
    expect(stomp.instances).toHaveLength(0)
  })

  it('presence 브로드캐스트로 접속자 스냅샷이 갱신된다', () => {
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }),
    )
    const client = lastClient()
    act(() => connect(client))

    const onPresence = client.subscriptions.get('/topic/models/m1/presence')!
    act(() => {
      onPresence({ body: presenceBody([
        { userId: 'u1', name: '앨리스' },
        { userId: 'u2', name: '밥' },
      ]) })
    })

    expect(result.current.participants).toEqual([
      { userId: 'u1', name: '앨리스' },
      { userId: 'u2', name: '밥' },
    ])
  })

  it('남의 저장 푸시만 콜백으로 넘긴다 — 자기 반향은 무시', () => {
    const onRemoteSaved = vi.fn()
    renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스', onRemoteSaved }),
    )
    const client = lastClient()
    act(() => connect(client))

    const onVersion = client.subscriptions.get('/topic/models/m1/version')!
    act(() => {
      onVersion({ body: JSON.stringify({ modelId: 'm1', version: 5, savedBy: 'u1', savedByName: '앨리스', at: 'T' }) })
      onVersion({ body: JSON.stringify({ modelId: 'm1', version: 6, savedBy: 'u2', savedByName: '밥', at: 'T' }) })
    })

    expect(onRemoteSaved).toHaveBeenCalledTimes(1)
    expect(onRemoteSaved).toHaveBeenCalledWith(
      expect.objectContaining({ version: 6, savedBy: 'u2', savedByName: '밥' }),
    )
  })

  it('publishSaved — 연결된 룸에 확정 버전을 실어 보낸다', () => {
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }),
    )
    const client = lastClient()
    act(() => connect(client))

    act(() => result.current.publishSaved(553))
    expect(client.publish).toHaveBeenCalledWith({
      destination: '/app/models/m1/saved',
      body: JSON.stringify({ version: 553 }),
    })
  })

  it('채널이 끊긴 상태의 publishSaved는 조용히 무시된다 — 폴링이 대신 발견한다', () => {
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }),
    )
    const client = lastClient()
    expect(client.connected).toBe(false) // activate했지만 아직 CONNECTED 전

    act(() => result.current.publishSaved(553))
    expect(client.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ destination: '/app/models/m1/saved' }),
    )
  })

  it('언마운트(문서 닫기)하면 연결을 해제한다', () => {
    const { unmount } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }),
    )
    const client = lastClient()

    unmount()

    expect(client.deactivate).toHaveBeenCalledTimes(1)
  })

  /* ---------- 채팅 ---------- */

  /** message 이벤트 바디 조립 */
  const chatBody = (over: Record<string, unknown>) =>
    JSON.stringify({
      type: 'message',
      modelId: 'm1',
      userId: 'u2',
      name: '밥',
      avatarUrl: null,
      userLogin: null,
      message: '안녕',
      at: '2026-09-18T00:00:00Z',
      seq: 1,
      messages: null,
      ...over,
    })

  it('채팅 토픽 구독은 join 발행보다 먼저 등록된다 — history 유실 경합 완화', () => {
    renderHook(() => useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }))
    const client = lastClient()
    act(() => connect(client))

    expect(client.subscribe).toHaveBeenCalledTimes(3) // presence · version · chat
    const chatSubscribedAt = client.subscribe.mock.invocationCallOrder[2]
    const joinPublishedAt = client.publish.mock.invocationCallOrder[0]
    expect(joinPublishedAt).toBeGreaterThan(chatSubscribedAt)
  })

  it('history 이벤트는 목록을 교체한다 — 서버의 최근 창이 곧 진실', () => {
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }),
    )
    const client = lastClient()
    act(() => connect(client))
    const onChat = client.subscriptions.get('/topic/models/m1/chat')!

    act(() => {
      onChat({ body: chatBody({ type: 'message', message: '이전', seq: 1 }) })
    })
    act(() => {
      onChat({
        body: JSON.stringify({
          type: 'history',
          userId: null, name: null, avatarUrl: null, message: null, at: null, seq: 0,
          messages: [
            { seq: 7, userId: 'u2', name: '밥', avatarUrl: null, message: '창1', at: 'T' },
            { seq: 8, userId: 'u3', name: '캐럴', avatarUrl: null, message: '창2', at: 'T' },
          ],
        }),
      })
    })

    expect(result.current.messages.map((m) => m.message)).toEqual(['창1', '창2'])
  })

  it('message 이벤트는 목록에 추가된다 — seq 정렬·50건 cap', () => {
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }),
    )
    const client = lastClient()
    act(() => connect(client))
    const onChat = client.subscriptions.get('/topic/models/m1/chat')!

    // 도착 순서가 뒤집혀도 seq로 정렬된다
    act(() => {
      onChat({ body: chatBody({ message: '나중', seq: 5 }) })
      onChat({ body: chatBody({ message: '먼저', seq: 4, userId: 'u1', name: '앨리스' }) })
    })
    expect(result.current.messages.map((m) => m.message)).toEqual(['먼저', '나중'])

    // 50건 상한 — 오래된 발언부터 밀려난다
    act(() => {
      for (let seq = 6; seq <= 60; seq++) {
        onChat({ body: chatBody({ message: `m${seq}`, seq }) })
      }
    })
    expect(result.current.messages).toHaveLength(50)
    expect(result.current.messages[0]).toMatchObject({ seq: 11 })
    expect(result.current.messages[49]).toMatchObject({ seq: 60 })
  })

  it('onIncomingChat은 남의 메시지만 넘긴다 — 자기 에코는 목록만 갱신', () => {
    const onIncomingChat = vi.fn()
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스', onIncomingChat }),
    )
    const client = lastClient()
    act(() => connect(client))
    const onChat = client.subscriptions.get('/topic/models/m1/chat')!

    act(() => {
      onChat({ body: chatBody({ userId: 'u1', message: '내 발언', seq: 1 }) })
      onChat({ body: chatBody({ userId: 'u2', message: '남의 발언', seq: 2 }) })
    })

    expect(onIncomingChat).toHaveBeenCalledTimes(1)
    expect(onIncomingChat).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2', message: '남의 발언' }))
    expect(result.current.messages).toHaveLength(2) // 자기 에코도 목록에는 남는다(우측 정렬)
  })

  it('sendMessage — 연결된 룸에 {message} 를 실어 보낸다. 빈 메시지는 무시', () => {
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }),
    )
    const client = lastClient()
    act(() => connect(client))
    expect(result.current.connected).toBe(true)

    act(() => result.current.sendMessage('안녕하세요'))
    expect(client.publish).toHaveBeenCalledWith({
      destination: '/app/models/m1/chat',
      body: JSON.stringify({ message: '안녕하세요' }),
    })

    act(() => result.current.sendMessage('   '))
    // join 1건 + 정상 발신 1건 — 빈 메시지는 발행을 늘리지 않는다
    expect(client.publish).toHaveBeenCalledTimes(2)
  })

  it('연결이 끊긴 sendMessage는 조용히 무시된다 — connected도 내려간다', () => {
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }),
    )
    const client = lastClient()
    act(() => connect(client))
    const onDisconnect = client.config.onDisconnect as () => void
    act(() => {
      client.connected = false
      onDisconnect()
    })
    expect(result.current.connected).toBe(false)

    act(() => result.current.sendMessage('안녕'))
    expect(client.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ destination: '/app/models/m1/chat' }),
    )
  })

  it('avatarUrl이 있을 때만 X-USER-AVATAR 헤더가 실린다', () => {
    renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4' }),
    )
    expect(lastClient().config.connectHeaders).toEqual({
      'X-USER-ID': 'u1',
      'X-USER-NAME': '앨리스',
      'X-USER-AVATAR': 'https://avatars.githubusercontent.com/u/1?v=4',
      'accept-language': 'ko',
    })

    renderHook(() => useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스' }))
    expect(lastClient().config.connectHeaders).not.toHaveProperty('X-USER-AVATAR')
  })

  it('githubLogin이 있을 때만 X-USER-LOGIN 헤더가 실린다 — 수신 userLogin은 그대로 매핑', () => {
    const { result } = renderHook(() =>
      useModelCollab({ modelId: 'm1', userId: 'u1', userName: '앨리스', githubLogin: 'octocat' }),
    )
    expect(lastClient().config.connectHeaders).toEqual({
      'X-USER-ID': 'u1',
      'X-USER-NAME': '앨리스',
      'X-USER-LOGIN': 'octocat',
      'accept-language': 'ko',
    })

    // 수신 측 — 이벤트의 userLogin(핸들)이 메시지에 그대로 실린다
    const client = lastClient()
    act(() => connect(client))
    const onChat = client.subscriptions.get('/topic/models/m1/chat')!
    act(() => {
      onChat({ body: chatBody({ userLogin: 'octocat', seq: 1 }) })
    })
    expect(result.current.messages[0]).toMatchObject({ userLogin: 'octocat' })

    renderHook(() => useModelCollab({ modelId: 'm2', userId: 'u1', userName: '앨리스' }))
    expect(lastClient().config.connectHeaders).not.toHaveProperty('X-USER-LOGIN')
  })
})
