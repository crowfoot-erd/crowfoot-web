/**
 * Edit Session Lock 다리 — collab 채널(EditorShell이 소유)과 락 소비자(구조 편집 다이얼로그·
 * 캔버스 뱃지)를 잇는 작은 상태 저장소 (05-editor/03-collaboration.md §2, v1.17)
 *
 * 채널은 EditorShell의 useModelCollab 하나뿐이라 락 스냅샷·발행 함수를 모듈에 둔다:
 * - useCollabLockStore: 전체 락 스냅샷(멱등 교체) + 내 userId. 깊은 컴포넌트(다이얼로그·노드)가
 *   props 겹침 없이 구독한다.
 * - useEditLock(targetType, targetId, active): 다이얼로그 수명 락 — active면 acquire, 90s마다
 *   renew(서버 TTL 120s lazy), 종료 시 release. 반환값은 남이 잡은 락(내 락 제외) — 편집 차단·
 *   안내에 쓴다. 남이 잡고 있으면 획득을 시도하지 않고, 놓으면 다시 얻는다.
 * - 발행 경로(publishLock)는 EditorShell이 setLockPublisher로 등록한다 — 채널 없음(공개 뷰어·
 *   미연결)이면 조용히 no-op.
 */
import { useEffect } from 'react'
import { create } from 'zustand'

import type { CollabLock, LockTargetType } from '@/features/editor/collab'

interface CollabLockState {
  myUserId: string | null
  locks: CollabLock[]
}

export const useCollabLockStore = create<CollabLockState>(() => ({
  myUserId: null,
  locks: [],
}))

/** EditorShell이 채널 수명과 맞춰 세팅 — presence의 내 신원 */
export function setCollabIdentity(myUserId: string | null): void {
  const prev = useCollabLockStore.getState().myUserId
  if (prev !== myUserId) useCollabLockStore.setState({ myUserId })
}

/** 락 전체 스냅샷 교체(멱등) — /topic/locks 브로드캐스트 수신부 */
export function setCollabLocks(locks: CollabLock[]): void {
  useCollabLockStore.setState({ locks })
}

/* ---------- 발행 경로 — 채널 주입 ---------- */

type LockAction = 'acquire' | 'renew' | 'release'
type LockPublisher = (action: LockAction, targetType: LockTargetType, targetId: string) => void

let publisher: LockPublisher | null = null

/** EditorShell이 등록 — 반환 함수로 해제(채널 종료 시 발행 끊김) */
export function setLockPublisher(fn: LockPublisher): () => void {
  publisher = fn
  return () => {
    publisher = null
  }
}

function publishLock(action: LockAction, targetType: LockTargetType, targetId: string): void {
  publisher?.(action, targetType, targetId)
}

/* ---------- 소비자 훅 ---------- */

/** renew 주기 — 서버 TTL(120s lazy) 안에 도착하도록 90s. 다이얼로그가 오래 열려 있어도 유지된다 */
const LOCK_RENEW_MS = 90_000

/** 남이 잡은 락만 반환 — 내가 잡은 락은 편집 가능(배지·차단 모두 "남의 락"만 센다) */
export function useForeignLock(
  targetType: LockTargetType,
  targetId: string | null | undefined,
): CollabLock | null {
  return useCollabLockStore((s) => {
    if (!targetId) return null
    const held = s.locks.find((l) => l.targetType === targetType && l.targetId === targetId)
    return held && held.userId !== s.myUserId ? held : null
  })
}

/** 다이얼로그 수명 락 — active(다이얼로그 열림) 동안 acquire·renew, 종료 시 release.
 *  남이 잡은 순간에는 획득하지 않고(서버도 거부) 편집 차단용으로 반환한다. */
export function useEditLock(
  targetType: LockTargetType,
  targetId: string | null | undefined,
  active: boolean,
): CollabLock | null {
  const foreign = useForeignLock(targetType, targetId)
  const foreignKey = foreign ? `${foreign.userId}:${foreign.acquiredAt}` : null
  useEffect(() => {
    if (!active || !targetId || foreignKey !== null) return
    publishLock('acquire', targetType, targetId)
    const timer = setInterval(() => publishLock('renew', targetType, targetId), LOCK_RENEW_MS)
    return () => {
      clearInterval(timer)
      // 잡고 있지 않은 락의 release는 서버가 무시한다(본인만 해제) — 조용히
      publishLock('release', targetType, targetId)
    }
  }, [active, targetId, targetType, foreignKey])
  return foreign
}
