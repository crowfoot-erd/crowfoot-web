import { beforeEach, describe, expect, it } from 'vitest'

import { createArea, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import {
  resetEditorStore,
  selectCanRedo,
  selectCanUndo,
  selectDirty,
  useEditorStore,
} from '@/features/editor/store/editor-store'

function document(): EditorDocument {
  return { model: emptyContent().model, diagram: emptyContent().diagram }
}

const hydrate = () =>
  useEditorStore.getState().hydrate({ modelId: '501', baseVersion: 3, document: document() })

beforeEach(() => {
  resetEditorStore()
  hydrate()
})

describe('editor-store — 커밋·undo·redo', () => {
  it('커밋은 past에 스냅샷을 쌓고 future를 비운다', () => {
    const store = useEditorStore.getState()
    store.commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    const s = useEditorStore.getState()
    expect(s.present.model.tables).toHaveLength(1)
    expect(s.past).toHaveLength(1)
    expect(s.future).toHaveLength(0)
    expect(selectDirty(s)).toBe(true)
  })

  it('undo는 직전 문서로 되돌리고 redo로 재적용한다', () => {
    const store = useEditorStore.getState()
    store.commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    useEditorStore.getState().undo()

    let s = useEditorStore.getState()
    expect(s.present.model.tables).toHaveLength(0)
    expect(selectCanUndo(s)).toBe(false)
    expect(selectCanRedo(s)).toBe(true)
    expect(selectDirty(s)).toBe(false) // 저장 지점(baseVersion 3 로드 시점)으로 되돌아옴

    useEditorStore.getState().redo()
    s = useEditorStore.getState()
    expect(s.present.model.tables).toHaveLength(1)
    expect(selectDirty(s)).toBe(true)
  })

  it('commitAll은 여러 변경을 undo 1스택으로 처리한다', () => {
    const t1 = createTable('orders')
    const t2 = createTable('users')
    useEditorStore.getState().commitAll([
      { type: 'table/create', table: t1, position: { x: 0, y: 0 } },
      { type: 'table/create', table: t2, position: { x: 300, y: 0 } },
    ])
    expect(useEditorStore.getState().present.model.tables).toHaveLength(2)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().present.model.tables).toHaveLength(0)
  })

  it('undo 스택은 50을 넘지 않는다', () => {
    for (let i = 0; i < 60; i += 1) {
      useEditorStore.getState().commit({ type: 'table/patch', tableId: 'x', patch: { comment: `v${i}` } })
    }
    expect(useEditorStore.getState().past).toHaveLength(50)

    let undoCount = 0
    while (selectCanUndo(useEditorStore.getState())) {
      useEditorStore.getState().undo()
      undoCount += 1
    }
    expect(undoCount).toBe(50)
  })

  it('markSaved는 버전을 갱신하고 dirty를 해제한다 — 이후 undo는 다시 dirty로 만든다', () => {
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    useEditorStore.getState().markSaved(4)

    const s = useEditorStore.getState()
    expect(s.baseVersion).toBe(4)
    expect(selectDirty(s)).toBe(false)

    useEditorStore.getState().undo()
    expect(selectDirty(useEditorStore.getState())).toBe(true)
  })
})

describe('editor-store — 수화 가드', () => {
  it('dirty 상태에서 같은 문서 재수화는 거부한다(false) — 로컬 변경 보존', () => {
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    const accepted = useEditorStore.getState().hydrate({ modelId: '501', baseVersion: 9, document: document() })

    expect(accepted).toBe(false)
    expect(useEditorStore.getState().baseVersion).toBe(3)
    expect(useEditorStore.getState().present.model.tables).toHaveLength(1)
  })

  it('clean 상태 재수화와 다른 문서 수화는 허용한다', () => {
    expect(useEditorStore.getState().hydrate({ modelId: '501', baseVersion: 9, document: document() })).toBe(true)

    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    expect(useEditorStore.getState().hydrate({ modelId: '502', baseVersion: 1, document: document() })).toBe(true)
    expect(useEditorStore.getState().modelId).toBe('502')
  })
})

describe('editor-store — savedDocument(버전 기록 요약 기준점)', () => {
  it('수화 시 savedDocument는 document 자체(일반 로드 — 서버 본문이 마지막 저장본)', () => {
    expect(useEditorStore.getState().savedDocument).toEqual(useEditorStore.getState().present)
  })

  it('임시 저장 복원 수화 — document(임시본)와 savedDocument(서버 본문)를 따로 가진다', () => {
    const server = document()
    const draft = document()
    useEditorStore.getState().hydrate({
      modelId: '501',
      baseVersion: 3,
      document: draft,
      savedDocument: server,
    })
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    const s = useEditorStore.getState()
    expect(s.present.model.tables).toHaveLength(1)
    expect(s.savedDocument?.model.tables).toHaveLength(0) // 기준점은 서버 본문 그대로
  })

  it('markSaved는 present를 기준점으로 포착한다 — 이후 요약 diff의 from', () => {
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    useEditorStore.getState().markSaved(4)

    expect(useEditorStore.getState().savedDocument?.model.tables).toHaveLength(1)
  })

  it('markSaved는 PUT한 본문을 명시적으로 포착한다 — 비행 중 편집은 기준점에 못 들어간다', () => {
    const putDocument = document() // PUT 시점 스냅샷(빈 문서)
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } }) // 비행 중 편집
    useEditorStore.getState().markSaved(4, putDocument)

    expect(useEditorStore.getState().savedDocument).toBe(putDocument)
  })
})

describe('editor-store — 선택 상태(selectedIds)', () => {
  it('setSelection은 선택을 교체하고 같은 배열이면 스테이트를 흔들지 않는다', () => {
    const store = useEditorStore.getState()
    store.setSelection(['t1', 't2'])
    expect(useEditorStore.getState().selectedIds).toEqual(['t1', 't2'])

    const before = useEditorStore.getState()
    store.setSelection(['t1', 't2'])
    expect(useEditorStore.getState()).toBe(before) // 참조 동일 — 리렌더 없음
  })

  it('커밋으로 사라진 객체 id는 선택에서 정리된다', () => {
    const store = useEditorStore.getState()
    store.commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    const tableId = useEditorStore.getState().present.model.tables[0].id
    store.setSelection([tableId, 'ghost-id'])

    useEditorStore.getState().commit({ type: 'table/remove', tableId })

    expect(useEditorStore.getState().selectedIds).toEqual([]) // 삭제분·유령 모두 정리
  })

  it('undo로 객체가 되살아나도 선택은 살아있는 객체만 유지한다', () => {
    const store = useEditorStore.getState()
    store.commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    const tableId = useEditorStore.getState().present.model.tables[0].id
    store.setSelection([tableId])
    useEditorStore.getState().commit({ type: 'table/remove', tableId })
    expect(useEditorStore.getState().selectedIds).toEqual([])

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().present.model.tables).toHaveLength(1)
    expect(useEditorStore.getState().selectedIds).toEqual([]) // 선택은 뷰 상태 — undo로 부활하지 않는다
  })

  it('수화(hydrate)는 선택을 초기화한다', () => {
    useEditorStore.getState().setSelection(['stale'])
    hydrate()
    expect(useEditorStore.getState().selectedIds).toEqual([])
  })
})

describe('editor-store — 주제 영역 (v1.13)', () => {
  it('영역 생성·패치도 undo/redo 스택을 탄다 — 1커밋 1스택', () => {
    const area = createArea('회원', { id: 'A1', tableIds: [] })
    useEditorStore.getState().commit({ type: 'area/create', area })
    useEditorStore.getState().commit({ type: 'area/patch', areaId: 'A1', patch: { collapsed: true } })
    expect(useEditorStore.getState().present.diagram.areas[0].collapsed).toBe(true)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().present.diagram.areas[0].collapsed).toBe(false)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().present.diagram.areas).toHaveLength(0)
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().present.diagram.areas).toHaveLength(1)
  })

  it('영역 삭제는 선택에서도 정리된다(pruneSelection)', () => {
    useEditorStore.getState().commit({ type: 'area/create', area: createArea('회원', { id: 'A1' }) })
    useEditorStore.getState().setSelection(['A1'])
    useEditorStore.getState().commit({ type: 'area/remove', areaId: 'A1' })
    expect(useEditorStore.getState().selectedIds).toEqual([])
  })
})
