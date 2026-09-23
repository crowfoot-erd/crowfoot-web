/**
 * 에디터 문서 스토어 (zustand plain create — 관례)
 *
 * 모든 변경은 ErdChange → applyChange를 통과하고(§15 Command 경로), undo/redo 실행은
 * 문서 스냅샷 복원(하이브리드). 스냅샷은 구조 공유라 복사 비용은 O(변경분)이다.
 * dirty 판정: past.length !== savedDepth — 저장 지점 기준이므로 undo로 되돌아가도 정확하다.
 *
 * savedDocument는 마지막으로 저장된 문서(버전 기록 요약의 diff 기준점 — §13). 저장 성공 시점의
 * present가 아니라 PUT한 본문을 포착한다: 요청 비행 중 편집이 들어와도 다음 요약이 그 편집을
 * 놓치지 않게(그 편집은 다음 저장의 요약에 남는다).
 */
import { create } from 'zustand'

import { applyChange, applyChanges, type ErdChange } from '@/features/editor/model/changes'
import type { EditorDocument, ErdViewport } from '@/features/editor/model/content-schema'

const STACK_LIMIT = 50

const emptyDocument: EditorDocument = {
  model: { tables: [], relationships: [] },
  diagram: { nodes: {}, notes: [], viewport: null },
}

/** present가 바뀐 뒤 선택 정리 — 문서에서 사라진 객체 id(테이블·메모·관계)는 선택에서 뺀다.
 *  관계 id도 선택 원천에 함께 산다(익스플로러 관계 행 ↔ 캔버스 엣지 하이라이트). */
function pruneSelection(present: EditorDocument, selectedIds: string[]): string[] {
  const alive = new Set<string>([
    ...present.model.tables.map((table) => table.id),
    ...present.model.relationships.map((rel) => rel.id),
    ...present.diagram.notes.map((note) => note.id),
  ])
  const next = selectedIds.filter((id) => alive.has(id))
  return next.length === selectedIds.length ? selectedIds : next
}

export interface EditorHydrateInput {
  modelId: string
  baseVersion: number
  document: EditorDocument
  /** 마지막 저장본(요약 diff 기준점). 생략하면 document이 곧 저장본(일반 로드).
   *  임시 저장 복원 때만 다르다: document=임시본, savedDocument=서버 본문 — 플러시 저장의
   *  요약이 임시본의 변경분만 말하도록. */
  savedDocument?: EditorDocument
}

interface EditorState {
  modelId: string | null
  baseVersion: number
  present: EditorDocument
  past: EditorDocument[]
  future: EditorDocument[]
  /** 저장 시점의 past 길이 — dirty = past.length !== savedDepth */
  savedDepth: number
  /** 마지막 저장본 — present와의 diff가 버전 기록 요약(§13)이 된다 */
  savedDocument: EditorDocument | null
  /** 선택된 객체 id(테이블·메모) — 캔버스와 모델 익스플로러가 같은 원천을 공유(§3).
   *  선택은 문서가 아니라 뷰 상태라 undo 대상이 아니다. 삭제된 객체 id는 캔버스 동기화에서 정리된다 */
  selectedIds: string[]

  /** 문서 로드. 같은 문서를 dirty 상태에서 다시 수화하려 하면 거부(false)해 로컬 변경을 지킨다. force는 충돌 재로드처럼 폐기가 확정된 경우 */
  hydrate: (input: EditorHydrateInput, opts?: { force?: boolean }) => boolean
  /** 변경 1건 커밋 — undo 1스택 */
  commit: (change: ErdChange) => void
  /** 연속 변경을 한 스택에 커밋 — 관계+FK·대상 일괄 삭제 등 */
  commitAll: (changes: ErdChange[]) => void
  undo: () => void
  redo: () => void
  /** 저장 완료 — 버전 갱신·dirty 해제. saved는 실제 PUT한 문서(생략하면 현재 present) */
  markSaved: (version: number, saved?: EditorDocument) => void
  /** 뷰포인트 저장(저장 시점 화면 복원용) — undo 대상 아님 */
  setViewport: (viewport: ErdViewport) => void
  /** 선택 교체(익스플로러 클릭·전체 선택·해제). 캔버스 클릭은 select 변경 write-through로 같은 액션을 탄다 */
  setSelection: (ids: string[]) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  modelId: null,
  baseVersion: 0,
  present: emptyDocument,
  past: [],
  future: [],
  savedDepth: 0,
  savedDocument: null,
  selectedIds: [],

  hydrate: (input, opts) => {
    const state = get()
    if (!opts?.force && state.modelId === input.modelId && state.past.length !== state.savedDepth) {
      return false
    }
    set({
      modelId: input.modelId,
      baseVersion: input.baseVersion,
      present: input.document,
      past: [],
      future: [],
      savedDepth: 0,
      savedDocument: input.savedDocument ?? input.document,
      selectedIds: [],
    })
    return true
  },

  commit: (change) => {
    const { present, past } = get()
    const next = applyChange(present, change)
    set({
      past: [...past.slice(-(STACK_LIMIT - 1)), present],
      present: next,
      future: [],
      selectedIds: pruneSelection(next, get().selectedIds),
    })
  },

  commitAll: (changes) => {
    if (changes.length === 0) return
    const { present, past } = get()
    const next = applyChanges(present, changes)
    set({
      past: [...past.slice(-(STACK_LIMIT - 1)), present],
      present: next,
      future: [],
      selectedIds: pruneSelection(next, get().selectedIds),
    })
  },

  undo: () => {
    const { past, future, present } = get()
    if (past.length === 0) return
    const next = past[past.length - 1]
    set({
      past: past.slice(0, -1),
      present: next,
      future: [present, ...future].slice(0, STACK_LIMIT),
      selectedIds: pruneSelection(next, get().selectedIds),
    })
  },

  redo: () => {
    const { past, future } = get()
    if (future.length === 0) return
    set({
      past: [...past.slice(-(STACK_LIMIT - 1)), get().present],
      present: future[0],
      future: future.slice(1),
      selectedIds: pruneSelection(future[0], get().selectedIds),
    })
  },

  markSaved: (version, saved) => {
    set({ baseVersion: version, savedDepth: get().past.length, savedDocument: saved ?? get().present })
  },

  setViewport: (viewport) => {
    set({ present: { ...get().present, diagram: { ...get().present.diagram, viewport } } })
  },

  setSelection: (ids) => {
    const current = get().selectedIds
    if (current.length === ids.length && current.every((id, i) => id === ids[i])) return
    set({ selectedIds: ids })
  },
}))

/* ---------- 셀렉터 — 노드 단위 구독으로 리렌더 격리 ---------- */

export const selectDirty = (s: EditorState): boolean => s.past.length !== s.savedDepth
export const selectCanUndo = (s: EditorState): boolean => s.past.length > 0
export const selectCanRedo = (s: EditorState): boolean => s.future.length > 0

/** 테스트·스토어 리셋용 */
export function resetEditorStore(): void {
  useEditorStore.setState({
    modelId: null,
    baseVersion: 0,
    present: emptyDocument,
    past: [],
    future: [],
    savedDepth: 0,
    savedDocument: null,
    selectedIds: [],
  })
}
