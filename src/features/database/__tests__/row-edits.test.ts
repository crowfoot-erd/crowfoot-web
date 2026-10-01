/**
 * 행 편집 모으기 (09-database-manager/00-data-browser.md §5.2)
 */
import { describe, expect, it } from 'vitest'

import type { ColumnMeta } from '@/features/database/api'
import {
  EMPTY_EDITS,
  addInsert,
  buildChanges,
  countEdits,
  primaryKeyOf,
  removeInsert,
  rowKeyOf,
  setCell,
  setInsertCell,
  toggleDelete,
} from '@/features/database/row-edits'

const column = (name: string, primaryKey = false): ColumnMeta => ({
  name,
  typeName: 'VARCHAR(20)',
  category: 'character',
  nullable: true,
  primaryKey,
})
const COLUMNS = [column('id', true), column('status'), column('memo')]
const KEY = { id: '1' }
const ROW_KEY = '["1"]'

describe('행 키', () => {
  it('기본 키 컬럼의 값으로 만든다 — 복합 키는 컬럼 순서대로', () => {
    expect(primaryKeyOf(COLUMNS, ['1', 'PAID', null])).toEqual({ id: '1' })
    expect(rowKeyOf(COLUMNS, ['1', 'PAID', null])).toBe('["1"]')
    const composite = [column('note_id', true), column('tag', true), column('weight')]
    expect(rowKeyOf(composite, ['2', 'home', null])).toBe('["2","home"]')
  })

  it('기본 키가 없거나 키 값이 문자열이 아니면 키가 없다', () => {
    expect(rowKeyOf([column('a'), column('b')], ['x', 'y'])).toBeNull()
    expect(rowKeyOf(COLUMNS, [null, 'PAID', null])).toBeNull()
  })
})

describe('셀 고치기', () => {
  it('고치면 값과 편집 전 값을 함께 기억한다', () => {
    const edits = setCell(EMPTY_EDITS, ROW_KEY, KEY, 'status', 'PAID', 'READY')

    expect(edits.updates[ROW_KEY]).toEqual({ key: KEY, values: { status: 'PAID' }, original: { status: 'READY' } })
    expect(countEdits(edits)).toEqual({ inserted: 0, updated: 1, deleted: 0, total: 1 })
  })

  it('다시 고쳐도 편집 전 값은 처음 것이다 — 원래 값으로 되돌리면 수정이 사라진다', () => {
    let edits = setCell(EMPTY_EDITS, ROW_KEY, KEY, 'status', 'PAID', 'READY')
    edits = setCell(edits, ROW_KEY, KEY, 'status', 'DONE', 'PAID') // 화면이 넘긴 original은 직전 값이다
    expect(edits.updates[ROW_KEY].original).toEqual({ status: 'READY' })

    edits = setCell(edits, ROW_KEY, KEY, 'status', 'READY', 'DONE')
    expect(edits.updates).toEqual({})
    expect(countEdits(edits).total).toBe(0)
  })

  it('NULL과 빈 문자열은 다른 값이다', () => {
    const toNull = setCell(EMPTY_EDITS, ROW_KEY, KEY, 'memo', null, '')
    expect(toNull.updates[ROW_KEY].values).toEqual({ memo: null })

    const toEmpty = setCell(EMPTY_EDITS, ROW_KEY, KEY, 'memo', '', null)
    expect(toEmpty.updates[ROW_KEY]).toMatchObject({ values: { memo: '' }, original: { memo: null } })
  })
})

describe('변경 목록 만들기', () => {
  it('삭제 → 수정 → 추가 순서로 만든다. 추가는 넣은 순서대로', () => {
    let edits = setCell(EMPTY_EDITS, ROW_KEY, KEY, 'status', 'PAID', 'READY')
    edits = toggleDelete(edits, '["2"]', { id: '2' })
    edits = addInsert(edits)
    edits = setInsertCell(edits, 1, 'status', 'NEW')
    edits = addInsert(edits)
    edits = setInsertCell(edits, 2, 'memo', null)

    const { changes, targets } = buildChanges(edits)

    expect(changes).toEqual([
      { op: 'DELETE', key: { id: '2' } },
      { op: 'UPDATE', key: KEY, values: { status: 'PAID' }, original: { status: 'READY' } },
      { op: 'INSERT', values: { status: 'NEW' } },
      { op: 'INSERT', values: { memo: null } },
    ])
    expect(targets).toEqual([
      { kind: 'row', rowKey: '["2"]' },
      { kind: 'row', rowKey: ROW_KEY },
      { kind: 'insert', id: 1 },
      { kind: 'insert', id: 2 },
    ])
    expect(countEdits(edits)).toEqual({ inserted: 2, updated: 1, deleted: 1, total: 4 })
  })

  it('삭제 표시한 행의 수정은 보내지 않는다 — 삭제를 끄면 수정이 되살아난다', () => {
    let edits = setCell(EMPTY_EDITS, ROW_KEY, KEY, 'status', 'PAID', 'READY')
    edits = toggleDelete(edits, ROW_KEY, KEY)
    expect(buildChanges(edits).changes).toEqual([{ op: 'DELETE', key: KEY }])
    expect(countEdits(edits)).toEqual({ inserted: 0, updated: 0, deleted: 1, total: 1 })

    edits = toggleDelete(edits, ROW_KEY, KEY)
    expect(buildChanges(edits).changes).toEqual([
      { op: 'UPDATE', key: KEY, values: { status: 'PAID' }, original: { status: 'READY' } },
    ])
  })

  it('추가할 행의 칸을 비우면 그 컬럼은 보내지 않는다(데이터베이스 기본값) — 행을 뺄 수도 있다', () => {
    let edits = addInsert(EMPTY_EDITS)
    edits = setInsertCell(edits, 1, 'status', 'NEW')
    edits = setInsertCell(edits, 1, 'status', undefined)
    expect(buildChanges(edits).changes).toEqual([{ op: 'INSERT', values: {} }])

    expect(removeInsert(edits, 1).inserts).toEqual([])
  })
})
