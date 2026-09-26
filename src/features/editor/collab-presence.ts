/**
 * 원격 표시 상태(선택·드래그) — 커서 채널 파생 브리지 (05-editor/03-collaboration.md §2, v1.17)
 *
 * RemoteCursorLayer는 커서 화살표를 그리고, 선택·드래그는 TableNode가 자기 테이블 키만
 * 구독해 그린다(링 하이라이트·드래그 오프셋). 값이 프리미티브(선택=userId)라 커서가
 * 30ms마다 와도 선택이 바뀐 노드만 리렌더된다 — 나머지 노드 memo는 그대로 산다.
 * 드래그 오프셋은 표시 레이어 전용이다: 원격이 끌고 있는 위치 - 커밋된 위치를 translate로
 * 보여주기만 하고 mouseup의 node/move 커맨드가 확정 반영한다(스토어 쓰기 금지).
 */
import { create } from 'zustand'

import { TABLE_COLORS, TABLE_COLOR_HEX } from '@/features/editor/model/content-schema'

interface RemotePresenceState {
  /** tableId → 선택한 사람 userId(여러 명이 골랐으면 문서 순서 첫 사람) */
  selections: Record<string, string>
  /** tableId → 원격 드래그 중인 노드의 flow 좌표(절대값) */
  dragging: Record<string, { x: number; y: number }>
}

export const useRemotePresenceStore = create<RemotePresenceState>(() => ({
  selections: {},
  dragging: {},
}))

/** ErdCanvas가 커서 스냅샷에서 파생해 교체한다(멱등 — 같은 내용이면 같은 참조를 유지) */
export function setRemotePresence(state: RemotePresenceState): void {
  useRemotePresenceStore.setState(state)
}

/** 문서를 떠날 때 비운다 — 다음 문서에서 잔상이 남지 않게 */
export function clearRemotePresence(): void {
  useRemotePresenceStore.setState({ selections: {}, dragging: {} })
}

/** 이 테이블을 남이 선택했는지 — 선택자 userId(없으면 null) */
export function useRemoteSelection(tableId: string): string | null {
  return useRemotePresenceStore((s) => s.selections[tableId] ?? null)
}

/** 이 테이블을 남이 드래그 중인가 — 드래그 중인 flow 좌표(없으면 null) */
export function useRemoteDrag(tableId: string): { x: number; y: number } | null {
  return useRemotePresenceStore((s) => s.dragging[tableId] ?? null)
}

/* ---------- 참가자 색 — userId 해시 → 테이블 강조색 프리셋 10색 ---------- */

/** userId → 안정 색 인덱스(FNV-1a 32bit) — 같은 사람은 모든 클라이언트에서 같은 색 */
export function participantColorIndex(userId: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % TABLE_COLORS.length
}

/** 참가자 표시색(hex) — 커서 화살표·이름표·선택 링이 같은 색을 쓴다 */
export function participantColor(userId: string): string {
  return TABLE_COLOR_HEX[TABLE_COLORS[participantColorIndex(userId)]]
}
