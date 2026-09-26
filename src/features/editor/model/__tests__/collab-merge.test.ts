import { describe, expect, it } from 'vitest'

import { applyChanges, createColumn, createTable, type ErdChange } from '@/features/editor/model/changes'
import type { EditorDocument, ErdArea, ErdNote, ErdRelationship } from '@/features/editor/model/content-schema'
import {
  changeTargetKeys,
  coalesceChanges,
  deriveChanges,
  describeTarget,
  detectLwwConflicts,
} from '@/features/editor/model/collab-merge'

/* ---------- 픽스처 ---------- */

const column = (id: string, physicalName: string) =>
  createColumn({ id, physicalName, logicalName: physicalName, dataType: 'VARCHAR', length: 64 })

function baseDoc(): EditorDocument {
  const member = createTable('member', {
    id: 'T1',
    columns: [column('C1', 'id'), column('C2', 'email')],
    primaryKey: { name: 'member_pk', columnIds: ['C1'] },
  })
  return {
    model: { tables: [member], relationships: [] },
    diagram: {
      nodes: { T1: { x: 10, y: 20, width: null, color: 'default' } },
      notes: [],
      areas: [],
      viewport: null,
    },
  }
}

function relationship(over: Partial<ErdRelationship> = {}): ErdRelationship {
  return {
    id: 'R1',
    name: '주문_회원',
    parentTableId: 'T1',
    childTableId: 'T1',
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'EXACTLY_ONE',
    childMultiplicity: 'ZERO_OR_MORE',
    fkName: 'fk_member',
    columnMappings: [{ parentColumnId: 'C1', childColumnId: 'C2' }],
    onDelete: 'NO_ACTION',
    onUpdate: 'NO_ACTION',
    ...over,
  }
}

/** deriveChanges 왕복 — from에서 도출한 커맨드열을 from에 적용하면 to와 같아야 한다 */
const roundTrip = (from: EditorDocument, to: EditorDocument): EditorDocument =>
  applyChanges(from, deriveChanges(from, to))

/* ---------- deriveChanges — 스냅샷 diff → 커맨드열 ---------- */

describe('deriveChanges — 테이블·컬럼', () => {
  it('테이블 패치(logicalName·comment)를 table/patch로 도출한다', () => {
    const from = baseDoc()
    const to = baseDoc()
    to.model.tables[0].logicalName = '회원'
    to.model.tables[0].comment = '회원 마스터'

    expect(deriveChanges(from, to)).toEqual([
      { type: 'table/patch', tableId: 'T1', patch: { logicalName: '회원', comment: '회원 마스터' } },
    ])
    expect(roundTrip(from, to)).toEqual(to)
  })

  it('컬럼 패치·순서 변경을 column/patch·column/move로 도출한다 — to 순서 그대로 재현', () => {
    const from = baseDoc()
    const to = baseDoc()
    to.model.tables[0].columns[1].length = 128
    to.model.tables[0].columns = [to.model.tables[0].columns[1], to.model.tables[0].columns[0]] // 순서 뒤집기

    const changes = deriveChanges(from, to)
    expect(changes.some((c) => c.type === 'column/patch' && c.columnId === 'C2' && c.patch.length === 128)).toBe(true)
    expect(changes.filter((c) => c.type === 'column/move')).toHaveLength(1)
    expect(roundTrip(from, to)).toEqual(to)
  })

  it('PK·UK·인덱스 변경은 배열 통째 절대값 커맨드로 도출한다', () => {
    const from = baseDoc()
    const to = baseDoc()
    to.model.tables[0].primaryKey = { name: 'member_pk2', columnIds: ['C1', 'C2'] }
    to.model.tables[0].uniques = [{ id: 'U1', name: 'uk_email', columnIds: ['C2'] }]
    to.model.tables[0].indexes = [{ id: 'I1', name: 'ix_email', columns: [{ columnId: 'C2', order: 'ASC' }] }]

    const changes = deriveChanges(from, to)
    expect(changes).toContainEqual({ type: 'primaryKey/set', tableId: 'T1', primaryKey: to.model.tables[0].primaryKey })
    expect(changes).toContainEqual({ type: 'uniqueKey/set', tableId: 'T1', uniques: to.model.tables[0].uniques })
    expect(changes).toContainEqual({ type: 'index/set', tableId: 'T1', indexes: to.model.tables[0].indexes })
    expect(roundTrip(from, to)).toEqual(to)
  })

  it('컬럼 추가·제거는 add/remove로, PK 재구성도 함께 도출한다', () => {
    const from = baseDoc()
    const to = baseDoc()
    to.model.tables[0].columns.push(column('C9', 'status')) // 추가
    // C1 제거 — PK에서도 빠진다
    to.model.tables[0].columns = to.model.tables[0].columns.filter((c) => c.id !== 'C1')
    to.model.tables[0].primaryKey = { name: 'member_pk', columnIds: ['C2'] }

    const changes = deriveChanges(from, to)
    expect(changes).toContainEqual({ type: 'column/add', tableId: 'T1', column: to.model.tables[0].columns.find((c) => c.id === 'C9') })
    expect(changes.some((c) => c.type === 'column/remove' && c.columnId === 'C1')).toBe(true)
    expect(roundTrip(from, to)).toEqual(to)
  })

  it('테이블 생성(컬럼·노드 포함)과 제거를 도출한다', () => {
    const withOrder = baseDoc()
    const order = createTable('orders', {
      id: 'T2',
      columns: [column('C3', 'id')],
      primaryKey: null,
    })
    withOrder.model.tables.push(order)
    withOrder.diagram.nodes.T2 = { x: 300, y: 0, width: 260, color: 'sky' }

    // 빈 → T2 있는 문서
    const created = deriveChanges(baseDoc(), withOrder)
    expect(created).toContainEqual({ type: 'table/create', table: order, position: { x: 300, y: 0 } })
    expect(created).toContainEqual({ type: 'node/resize', tableId: 'T2', width: 260 })
    expect(created).toContainEqual({ type: 'node/color', tableId: 'T2', color: 'sky' })
    expect(roundTrip(baseDoc(), withOrder)).toEqual(withOrder)

    // T2 있는 문서 → 빈 문서(제거)
    expect(deriveChanges(withOrder, baseDoc())).toContainEqual({ type: 'table/remove', tableId: 'T2' })
    expect(roundTrip(withOrder, baseDoc())).toEqual(baseDoc())
  })
})

describe('deriveChanges — 관계·노트·영역·노드', () => {
  const withRel = (): EditorDocument => {
    const doc = baseDoc()
    doc.model.relationships = [relationship()]
    return doc
  }

  it('관계 생성은 관계 행만 실어 추가한다 — FK·PK·UK는 각자의 diff 커맨드가 재현한다', () => {
    const changes = deriveChanges(baseDoc(), withRel())
    expect(changes).toContainEqual({
      type: 'relationship/create',
      relationship: relationship(),
      fkColumns: [],
    })
    expect(roundTrip(baseDoc(), withRel())).toEqual(withRel())
  })

  it('관계 패치는 fkName 등 필드 diff로, 매핑 변경은 remove+create 통째 교체로 도출한다', () => {
    const from = withRel()
    const to = withRel()
    to.model.relationships[0].fkName = 'fk_member_new'
    expect(deriveChanges(from, to)).toEqual([{ type: 'relationship/patch', relationshipId: 'R1', patch: { fkName: 'fk_member_new' } }])

    const remapped = withRel()
    remapped.model.relationships[0].columnMappings = [{ parentColumnId: 'C1', childColumnId: 'C9' }]
    const replaced = deriveChanges(withRel(), remapped)
    expect(replaced.some((c) => c.type === 'relationship/remove' && c.relationshipId === 'R1')).toBe(true)
    expect(replaced.some((c) => c.type === 'relationship/create')).toBe(true)
  })

  it('관계 제거를 도출한다', () => {
    expect(deriveChanges(withRel(), baseDoc())).toContainEqual({ type: 'relationship/remove', relationshipId: 'R1' })
  })

  it('노트·영역 생성·패치·제거를 도출한다', () => {
    const withNote = baseDoc()
    const note: ErdNote = { id: 'N1', x: 0, y: 0, width: 200, text: '메모', title: '제목', color: 'yellow', linkedTableId: null }
    withNote.diagram.notes = [note]
    expect(roundTrip(baseDoc(), withNote)).toEqual(withNote)

    const moved = baseDoc()
    moved.diagram.notes = [{ ...note, x: 50, text: '고침' }]
    expect(deriveChanges(withNote, moved)).toEqual([{ type: 'note/patch', noteId: 'N1', patch: { x: 50, text: '고침' } }])

    const withArea = baseDoc()
    const area: ErdArea = { id: 'A1', name: '회원', description: '', color: 'default', tableIds: ['T1'] }
    withArea.diagram.areas = [area]
    expect(roundTrip(baseDoc(), withArea)).toEqual(withArea)
  })

  it('노드 이동은 한 커맨드로 모으고 폭·색은 개별로 도출한다', () => {
    const from = baseDoc()
    from.model.tables.push(createTable('orders', { id: 'T2', columns: [], primaryKey: null }))
    from.diagram.nodes.T2 = { x: 300, y: 0, width: null, color: 'default' }

    const to = baseDoc()
    to.model.tables.push(createTable('orders', { id: 'T2', columns: [], primaryKey: null }))
    to.diagram.nodes.T1 = { x: 99, y: 20, width: null, color: 'default' }
    to.diagram.nodes.T2 = { x: 300, y: 77, width: 260, color: 'sky' }

    const changes = deriveChanges(from, to)
    expect(changes).toContainEqual({ type: 'node/move', positions: { T1: { x: 99, y: 20 }, T2: { x: 300, y: 77 } } })
    expect(changes).toContainEqual({ type: 'node/resize', tableId: 'T2', width: 260 })
    expect(changes).toContainEqual({ type: 'node/color', tableId: 'T2', color: 'sky' })
    expect(roundTrip(from, to)).toEqual(to)
  })

  it('viewport는 협업 대상이 아니다 — diff에 남지 않는다', () => {
    const from = baseDoc()
    const to = baseDoc()
    to.diagram.viewport = { x: 1, y: 2, zoom: 0.5 }
    expect(deriveChanges(from, to)).toEqual([])
  })
})

/* ---------- changeTargetKeys ---------- */

describe('changeTargetKeys — 커맨드 → (객체, 속성) 키', () => {
  it('patch는 속성별 키, 구조 변경은 객체 전체(*) 키', () => {
    expect(
      changeTargetKeys({ type: 'table/patch', tableId: 'T1', patch: { logicalName: 'a', comment: 'b' } }),
    ).toEqual([
      { kind: 'table', id: 'T1', field: 'logicalName' },
      { kind: 'table', id: 'T1', field: 'comment' },
    ])
    expect(changeTargetKeys({ type: 'table/remove', tableId: 'T1' })).toEqual([{ kind: 'table', id: 'T1', field: '*' }])
    expect(changeTargetKeys({ type: 'column/move', tableId: 'T1', columnId: 'C2', toIndex: 1 })).toEqual([
      { kind: 'column', id: 'C2', field: 'order' },
    ])
    expect(changeTargetKeys({ type: 'primaryKey/set', tableId: 'T1', primaryKey: null })).toEqual([
      { kind: 'primaryKey', id: 'T1', field: '*' },
    ])
  })

  it('node/move는 축별 키로 펼친다 — 내 node dirty와의 교집합 판정의 기준', () => {
    expect(changeTargetKeys({ type: 'node/move', positions: { T1: { x: 1, y: 2 }, T2: { x: 3, y: 4 } } })).toEqual([
      { kind: 'node', id: 'T1', field: 'x' },
      { kind: 'node', id: 'T1', field: 'y' },
      { kind: 'node', id: 'T2', field: 'x' },
      { kind: 'node', id: 'T2', field: 'y' },
    ])
  })
})

/* ---------- detectLwwConflicts ---------- */

describe('detectLwwConflicts — LWW 충돌 감지', () => {
  /** 내 dirty: C2 logicalName 편집 중 */
  const dirtyState = (): { saved: EditorDocument; present: EditorDocument } => {
    const saved = baseDoc()
    const present = baseDoc()
    present.model.tables[0].columns[1].logicalName = '이메일(내 편집)'
    return { saved, present }
  }

  it('같은 속성을 다른 값으로 — 충돌 1건, 양측 값을 담는다', () => {
    const { saved, present } = dirtyState()
    const conflicts = detectLwwConflicts(
      { type: 'column/patch', tableId: 'T1', columnId: 'C2', patch: { logicalName: '이메일(상대)' } },
      saved,
      present,
    )
    expect(conflicts).toEqual([
      { target: { kind: 'column', id: 'C2', field: 'logicalName' }, mine: '이메일(내 편집)', theirs: '이메일(상대)' },
    ])
  })

  it('같은 속성 같은 값 — 조용히(알림 없음)', () => {
    const { saved, present } = dirtyState()
    expect(
      detectLwwConflicts(
        { type: 'column/patch', tableId: 'T1', columnId: 'C2', patch: { logicalName: '이메일(내 편집)' } },
        saved,
        present,
      ),
    ).toEqual([])
  })

  it('같은 객체 다른 속성·다른 객체 — 자동 병합(알림 없음)', () => {
    const { saved, present } = dirtyState()
    expect(
      detectLwwConflicts({ type: 'column/patch', tableId: 'T1', columnId: 'C2', patch: { nullable: false } }, saved, present),
    ).toEqual([])
    expect(
      detectLwwConflicts({ type: 'table/patch', tableId: 'T1', patch: { comment: 'x' } }, saved, present),
    ).toEqual([])
  })

  it('dirty가 없으면 무엇이 와도 충돌 아니다', () => {
    const doc = baseDoc()
    expect(
      detectLwwConflicts({ type: 'table/remove', tableId: 'T1' }, doc, doc),
    ).toEqual([])
  })

  it('구조 변경이 내가 편집 중인 객체와 겹치면 값 비교 없이 알린다(*)', () => {
    const { saved, present } = dirtyState()
    // 상대가 내가 고친 컬럼을 삭제 — Lock 우회(WS 끊김 등) 보강 알림
    expect(detectLwwConflicts({ type: 'column/remove', tableId: 'T1', columnId: 'C2' }, saved, present)).toEqual([
      { target: { kind: 'column', id: 'C2', field: '*' }, mine: '*', theirs: '*' },
    ])

    // 내가 구조 변경(컬럼 추가) 중인 객체를 상대가 패치 — 반대 방향도 알림
    const saved2 = baseDoc()
    const present2 = baseDoc()
    present2.model.tables[0].columns.push(column('C9', 'status'))
    expect(
      detectLwwConflicts({ type: 'column/patch', tableId: 'T1', columnId: 'C9', patch: { nullable: false } }, saved2, present2),
    ).toEqual([{ target: { kind: 'column', id: 'C9', field: 'nullable' }, mine: '*', theirs: '*' }])
  })
})

/* ---------- coalesceChanges ---------- */

describe('coalesceChanges — 발신 버스트 병합', () => {
  it('같은 대상 patch는 하나로 합친다 — 나중 필드가 이긴다', () => {
    const coalesced = coalesceChanges([
      { type: 'table/patch', tableId: 'T1', patch: { comment: 'a' } },
      { type: 'table/patch', tableId: 'T2', patch: { comment: 'b' } },
      { type: 'table/patch', tableId: 'T1', patch: { comment: 'c', logicalName: '멤버' } },
    ])
    expect(coalesced).toEqual([
      { type: 'table/patch', tableId: 'T1', patch: { comment: 'c', logicalName: '멤버' } },
      { type: 'table/patch', tableId: 'T2', patch: { comment: 'b' } },
    ])
  })

  it('node/move 두 번은 positions 합집합으로 합친다', () => {
    expect(
      coalesceChanges([
        { type: 'node/move', positions: { T1: { x: 1, y: 1 } } },
        { type: 'node/move', positions: { T2: { x: 2, y: 2 }, T1: { x: 9, y: 9 } } },
      ]),
    ).toEqual([{ type: 'node/move', positions: { T1: { x: 9, y: 9 }, T2: { x: 2, y: 2 } } }])
  })

  it('제거·생성이 같은 객체의 앞선 patch를 대신한다 — 적용 결과는 원래 열과 동일', () => {
    const original: ErdChange[] = [
      { type: 'table/patch', tableId: 'T1', patch: { comment: '곧 사라질 패치' } },
      { type: 'table/remove', tableId: 'T1' },
    ]
    expect(coalesceChanges(original)).toEqual([{ type: 'table/remove', tableId: 'T1' }])
    expect(applyChanges(baseDoc(), original)).toEqual(applyChanges(baseDoc(), coalesceChanges(original)))
  })

  it('primaryKey/set·column/move는 앞선 patch를 무효화하지 않는다 — 순서·의미 보존', () => {
    const original: ErdChange[] = [
      { type: 'table/patch', tableId: 'T1', patch: { comment: '보존되어야 한다' } },
      { type: 'primaryKey/set', tableId: 'T1', primaryKey: null },
      { type: 'column/move', tableId: 'T1', columnId: 'C2', toIndex: 0 },
    ]
    expect(coalesceChanges(original)).toEqual(original)
  })

  it('구조 변경끼리는 절대 합치지 않는다 — 추가 뒤 제거 순서가 의미 있다', () => {
    const original: ErdChange[] = [
      { type: 'column/add', tableId: 'T1', column: column('C9', 'status') },
      { type: 'column/remove', tableId: 'T1', columnId: 'C9' },
    ]
    expect(coalesceChanges(original)).toEqual(original)
  })

  it('병합 후 적용 결과는 원래 열 적용과 항상 같다 — 절대값 커맨드 계약', () => {
    const from = baseDoc()
    from.model.tables.push(createTable('orders', { id: 'T2', columns: [column('C3', 'oid')], primaryKey: null }))
    from.diagram.nodes.T2 = { x: 300, y: 0, width: null, color: 'default' }
    const original: ErdChange[] = [
      { type: 'column/patch', tableId: 'T1', columnId: 'C2', patch: { length: 100 } },
      { type: 'node/move', positions: { T1: { x: 1, y: 1 } } },
      { type: 'column/patch', tableId: 'T1', columnId: 'C2', patch: { length: 200, comment: 'c' } },
      { type: 'node/color', tableId: 'T2', color: 'sky' },
      { type: 'node/color', tableId: 'T2', color: 'red' },
      { type: 'table/patch', tableId: 'T2', patch: { logicalName: '주문' } },
      { type: 'column/move', tableId: 'T1', columnId: 'C2', toIndex: 0 },
    ]
    expect(applyChanges(from, coalesceChanges(original))).toEqual(applyChanges(from, original))
  })
})

/* ---------- describeTarget ---------- */

describe('describeTarget — 충돌 알림 라벨', () => {
  it('컬럼은 테이블.컬럼 물리 경로, 노트는 제목(없으면 첫 줄)', () => {
    const doc = baseDoc()
    expect(describeTarget(doc, { kind: 'column', id: 'C2', field: 'length' })).toBe('member.email')
    expect(describeTarget(doc, { kind: 'table', id: 'T1', field: '*' })).toBe('member')
    expect(describeTarget(doc, { kind: 'node', id: 'T1', field: 'x' })).toBe('member')

    const noted = baseDoc()
    noted.diagram.notes = [
      { id: 'N1', x: 0, y: 0, width: 200, text: '본문 첫 줄\n둘째', title: '', color: 'yellow', linkedTableId: null },
    ]
    expect(describeTarget(noted, { kind: 'note', id: 'N1', field: 'text' })).toBe('본문 첫 줄')
  })
})
