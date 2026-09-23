/**
 * 객체 검색 순수 계산 — 대상 범위·대소문자·문서 순서·컬럼 히트의 부모 위임 (05-editor/02-ui.md §11)
 */
import { describe, expect, it } from 'vitest'

import type { EditorDocument } from '@/features/editor/model/content-schema'
import { createColumn, createTable } from '@/features/editor/model/changes'
import { searchObjects } from '@/features/editor/model/object-search'

function fixtureDoc(): EditorDocument {
  const users = createTable('users', {
    logicalName: '회원',
    columns: [
      createColumn({ id: 'col-id', physicalName: 'id', logicalName: '식별자', nullable: false }),
      createColumn({ id: 'col-email', physicalName: 'email', comment: '로그인 이메일' }),
    ],
  })
  const orders = createTable('orders', { logicalName: '주문', comment: '주문 본문' })
  const rel = {
    id: 'rel-1',
    name: 'fk_orders_users',
    fkName: 'orders_user_fk',
    parentTableId: users.id,
    childTableId: orders.id,
    type: 'ONE_TO_MANY' as const,
    identifying: false,
    parentMultiplicity: 'EXACTLY_ONE' as const,
    childMultiplicity: 'ZERO_OR_MORE' as const,
    columnMappings: [{ parentColumnId: 'col-id', childColumnId: 'col-fk' }],
    onDelete: 'NO_ACTION' as const,
    onUpdate: 'NO_ACTION' as const,
  }
  return {
    model: { tables: [users, orders], relationships: [rel] },
    diagram: {
      nodes: {},
      notes: [{ id: 'note-1', x: 0, y: 0, width: 200, text: '배치 정책 메모', title: '정책', color: 'yellow', linkedTableId: null }],
      viewport: null,
    },
  }
}

describe('searchObjects', () => {
  it('빈 쿼리·공백 쿼리는 히트 없음', () => {
    const doc = fixtureDoc()
    expect(searchObjects(doc, '')).toEqual([])
    expect(searchObjects(doc, '   ')).toEqual([])
  })

  it('테이블 물리명·논리명·comment를 대소문자 무시로 찾는다', () => {
    const doc = fixtureDoc()
    expect(searchObjects(doc, '회원')).toEqual([{ kind: 'table', targetId: doc.model.tables[0].id }])
    expect(searchObjects(doc, '주문')).toEqual([{ kind: 'table', targetId: doc.model.tables[1].id }])
    expect(searchObjects(doc, '본문')).toEqual([{ kind: 'table', targetId: doc.model.tables[1].id }])
    // 물리명 users는 관계명 fk_orders_users에도 걸린다 — 부분 일치라 겹침이 자연스럽다
    expect(searchObjects(doc, 'USERS').map((hit) => hit.kind)).toEqual(['table', 'relationship'])
  })

  it('컬럼 히트는 targetId가 부모 테이블이고 columnId를 가진다', () => {
    const doc = fixtureDoc()
    expect(searchObjects(doc, 'email')).toEqual([
      { kind: 'column', targetId: doc.model.tables[0].id, columnId: 'col-email' },
    ])
    expect(searchObjects(doc, '식별자')).toEqual([
      { kind: 'column', targetId: doc.model.tables[0].id, columnId: 'col-id' },
    ])
  })

  it('관계는 name·fkName으로 찾는다', () => {
    const doc = fixtureDoc()
    expect(searchObjects(doc, 'fk_orders_users')).toEqual([{ kind: 'relationship', targetId: 'rel-1' }])
    expect(searchObjects(doc, 'orders_user_fk')).toEqual([{ kind: 'relationship', targetId: 'rel-1' }])
  })

  it('메모는 title·text로 찾는다', () => {
    expect(searchObjects(fixtureDoc(), '정책')).toEqual([{ kind: 'note', targetId: 'note-1' }])
    expect(searchObjects(fixtureDoc(), '배치')).toEqual([{ kind: 'note', targetId: 'note-1' }])
  })

  it('결과는 문서 순서를 따른다 — 테이블·컬럼 → 관계 → 메모', () => {
    const doc = fixtureDoc()
    // 이메일 comment 컬럼 → (관계 없음) → 배치 정책 메모
    expect(searchObjects(doc, '메')).toEqual([
      { kind: 'column', targetId: doc.model.tables[0].id, columnId: 'col-email' },
      { kind: 'note', targetId: 'note-1' },
    ])
  })

  it('일치 객체가 없으면 빈 배열', () => {
    expect(searchObjects(fixtureDoc(), 'no-such-object')).toEqual([])
  })
})
