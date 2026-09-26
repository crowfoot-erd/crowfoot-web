import { beforeEach, describe, expect, it } from 'vitest'

import { createColumn, createTable, type ErdChange } from '@/features/editor/model/changes'
import { applyChanges } from '@/features/editor/model/changes'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import {
  resetEditorStore,
  selectDirty,
  subscribeLocalChanges,
  useEditorStore,
} from '@/features/editor/store/editor-store'

/** T1(id·email) 테이블 하나 있는 문서 — 협업 시나리오의 공통 기저 */
function document(): EditorDocument {
  const table = createTable('member', {
    id: 'T1',
    columns: [
      createColumn({ id: 'C1', physicalName: 'id', logicalName: 'ID' }),
      createColumn({ id: 'C2', physicalName: 'email', logicalName: '이메일' }),
    ],
    primaryKey: null,
  })
  return {
    model: { tables: [table], relationships: [] },
    diagram: { nodes: { T1: { x: 0, y: 0, width: null, color: 'default' } }, notes: [], areas: [], viewport: null },
  }
}

beforeEach(() => {
  resetEditorStore()
  useEditorStore.getState().hydrate({ modelId: '501', baseVersion: 3, document: document() })
})

describe('editor-store — applyRemote (v1.17 협업)', () => {
  it('원격 커맨드를 present에 적용하고 undo 스택도 rebase한다 — undo는 내 변경만 되돌린다', () => {
    // 내 편집: C2 논리명
    useEditorStore.getState().commit({ type: 'column/patch', tableId: 'T1', columnId: 'C2', patch: { logicalName: '내 편집' } })
    // 원격 편집: C1 논리명
    useEditorStore.getState().applyRemote({ type: 'column/patch', tableId: 'T1', columnId: 'C1', patch: { logicalName: '상대 편집' } })

    let s = useEditorStore.getState()
    expect(s.present.model.tables[0].columns[0].logicalName).toBe('상대 편집')
    expect(s.present.model.tables[0].columns[1].logicalName).toBe('내 편집')

    // undo — 내 커밋만 되돌아가고 원격 변경은 유지된다
    useEditorStore.getState().undo()
    s = useEditorStore.getState()
    expect(s.present.model.tables[0].columns[1].logicalName).toBe('이메일') // 내 편집 되돌림
    expect(s.present.model.tables[0].columns[0].logicalName).toBe('상대 편집') // 원격 유지
  })

  it('redo 스택도 rebase된다 — redo 후에도 원격 변경이 살아 있다', () => {
    useEditorStore.getState().commit({ type: 'table/patch', tableId: 'T1', patch: { comment: '내 편집' } })
    useEditorStore.getState().applyRemote({ type: 'column/patch', tableId: 'T1', columnId: 'C2', patch: { nullable: false } })
    useEditorStore.getState().undo()
    useEditorStore.getState().redo()

    const s = useEditorStore.getState()
    expect(s.present.model.tables[0].comment).toBe('내 편집')
    expect(s.present.model.tables[0].columns[1].nullable).toBe(false) // 원격 유지
  })

  it('clean 상태의 원격 적용은 dirty를 만들지 않는다 — past·savedDepth 불변', () => {
    useEditorStore.getState().applyRemote({ type: 'table/patch', tableId: 'T1', patch: { comment: '상대' } })
    expect(selectDirty(useEditorStore.getState())).toBe(false)
  })

  it('savedDocument도 rebase된다 — 다음 저장 요약이 원격 변경을 다시 말하지 않는다', () => {
    useEditorStore.getState().applyRemote({ type: 'column/patch', tableId: 'T1', columnId: 'C2', patch: { logicalName: '상대' } })
    const saved = useEditorStore.getState().savedDocument
    expect(saved?.model.tables[0].columns[1].logicalName).toBe('상대')
  })

  it('원격으로 사라진 객체는 선택에서 정리된다', () => {
    useEditorStore.getState().setSelection(['T1'])
    useEditorStore.getState().applyRemote({ type: 'table/remove', tableId: 'T1' })
    expect(useEditorStore.getState().selectedIds).toEqual([])
  })
})

describe('editor-store — markRemoteSaved (원격 저장 승계)', () => {
  it('baseVersion만 옮긴다 — dirty·savedDocument는 유지된다', () => {
    useEditorStore.getState().commit({ type: 'table/patch', tableId: 'T1', patch: { comment: '내 편집' } })
    const savedBefore = useEditorStore.getState().savedDocument

    useEditorStore.getState().markRemoteSaved(7)

    const s = useEditorStore.getState()
    expect(s.baseVersion).toBe(7)
    expect(selectDirty(s)).toBe(true) // 내 미저장 편집은 이어진다
    expect(s.savedDocument).toBe(savedBefore) // 요약 기준점도 그대로
  })
})

describe('editor-store — subscribeLocalChanges (커맨드 발행 통지)', () => {
  it('commit·commitAll이 지나간 변경을 통지한다 — 발행부는 협업을 모른다', () => {
    const seen: ErdChange[][] = []
    const unsubscribe = subscribeLocalChanges((changes) => seen.push(changes))

    useEditorStore.getState().commit({ type: 'table/patch', tableId: 'T1', patch: { comment: 'a' } })
    useEditorStore.getState().commitAll([
      { type: 'column/patch', tableId: 'T1', columnId: 'C1', patch: { length: 32 } },
      { type: 'node/move', positions: { T1: { x: 5, y: 5 } } },
    ])

    expect(seen).toHaveLength(2)
    expect(seen[0]).toEqual([{ type: 'table/patch', tableId: 'T1', patch: { comment: 'a' } }])
    expect(seen[1]).toHaveLength(2)
    unsubscribe()
  })

  it('undo는 되돌린 결과를 커맨드열로 통지한다 — 생성의 undo는 제거 커맨드', () => {
    const seen: ErdChange[][] = []
    const unsubscribe = subscribeLocalChanges((changes) => seen.push(changes))

    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders', { id: 'T9' }), position: { x: 0, y: 0 } })
    useEditorStore.getState().undo()

    expect(seen).toHaveLength(2)
    // undo 통지는 문서를 T9 없는 상태로 되돌리는 절대값 커맨드 — 타인에게 그대로 발행된다
    const undoNotice = seen[1]
    expect(undoNotice.some((c) => c.type === 'table/remove' && c.tableId === 'T9')).toBe(true)
    const present = useEditorStore.getState().present
    expect(applyChanges(present, undoNotice)).toEqual(present) // 이미 적용된 상태 — 재적용 무해(멱등)
    unsubscribe()
  })

  it('undo 통지에는 원격 변경의 역방향이 없다 — 원격은 present·되돌림 결과 양쪽에 있다', () => {
    const seen: ErdChange[][] = []
    const unsubscribe = subscribeLocalChanges((changes) => seen.push(changes))

    useEditorStore.getState().commit({ type: 'table/patch', tableId: 'T1', patch: { comment: '내 편집' } })
    seen.length = 0
    useEditorStore.getState().applyRemote({ type: 'column/patch', tableId: 'T1', columnId: 'C2', patch: { nullable: false } })
    useEditorStore.getState().undo() // 내 패치 되돌림 — 원격 C2 nullable은 유지

    const undoNotice = seen.at(-1) ?? []
    expect(undoNotice).toEqual([{ type: 'table/patch', tableId: 'T1', patch: { comment: null } }])
    unsubscribe()
  })

  it('구독 해제 후에는 통지가 오지 않는다', () => {
    const seen: ErdChange[][] = []
    const unsubscribe = subscribeLocalChanges((changes) => seen.push(changes))
    unsubscribe()

    useEditorStore.getState().commit({ type: 'table/patch', tableId: 'T1', patch: { comment: 'a' } })
    expect(seen).toHaveLength(0)
  })
})
