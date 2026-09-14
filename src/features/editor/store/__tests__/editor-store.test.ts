import { beforeEach, describe, expect, it } from 'vitest'

import { createTable } from '@/features/editor/model/changes'
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
