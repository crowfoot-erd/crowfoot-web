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
    expect(client.config.connectHeaders).toEqual({ 'X-USER-ID': 'u1', 'X-USER-NAME': '앨리스' })

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
})
