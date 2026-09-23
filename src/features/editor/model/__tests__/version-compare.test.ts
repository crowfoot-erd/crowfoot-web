/**
 * 버전 비교 분류 테스트 (08-core/02-model.md §1.11.3) — 배지 마크 규칙·사라진 테이블.
 * diffDocuments 요약을 직접 만들어 classifyTableChanges·toTableIdMarks를 검증한다.
 */
import { describe, expect, it } from 'vitest'

import type { DocDiffItem, DocumentDiffSummary } from '@/features/editor/model/doc-diff'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { createTable } from '@/features/editor/model/changes'
import { classifyTableChanges, toTableIdMarks } from '@/features/editor/model/version-compare'

function summary(items: DocDiffItem[], extra: Partial<DocumentDiffSummary> = {}): DocumentDiffSummary {
  return { items, layoutOnly: false, truncated: false, ...extra }
}

const item = (kind: DocDiffItem['kind'], action: DocDiffItem['action'], table: string, name = table): DocDiffItem => ({
  kind,
  action,
  table,
  name,
  detail: '',
})

function docWith(...tables: { id: string; name: string }[]): EditorDocument {
  return {
    model: {
      tables: tables.map((t) => createTable(t.name, { id: t.id, columns: [] })),
      relationships: [],
    },
    diagram: { nodes: {}, notes: [], areas: [], viewport: null },
  }
}

describe('classifyTableChanges', () => {
  it('구조 kind의 add/update만 배지가 된다 — note·node·move는 무시', () => {
    const result = classifyTableChanges(summary([
      item('column', 'add', 'users', 'grade'),
      item('table', 'update', 'orders'),
      item('note', 'add', '', '메모'),
      item('node', 'move', 'users'),
      item('node', 'update', 'orders'),
    ]))

    expect(result.byName.get('users')).toBe('add')
    expect(result.byName.get('orders')).toBe('update')
    expect(result.removed).toEqual([])
  })

  it('add가 update보다 우선 — 한 테이블에 섞이면 add로 뭉친다', () => {
    const result = classifyTableChanges(summary([
      item('column', 'update', 'users', 'email'),
      item('primaryKey', 'add', 'users', 'pk'),
    ]))

    expect(result.byName.get('users')).toBe('add')
  })

  it('remove는 배지가 아니라 사라진 테이블 섹션으로 — 테이블·관계 삭제 모두', () => {
    const result = classifyTableChanges(summary([
      item('table', 'remove', 'orders'),
      item('relationship', 'remove', 'orders', 'fk_orders_user'),
    ]))

    expect(result.byName.size).toBe(0)
    expect(result.removed).toEqual(['orders'])
  })

  it('관계·키 추가는 소속 테이블(자식·대상) 배지가 된다', () => {
    const result = classifyTableChanges(summary([
      item('relationship', 'add', 'orders', 'fk_orders_user'),
      item('uniqueKey', 'update', 'users', 'uk_email'),
    ]))

    expect(result.byName.get('orders')).toBe('add')
    expect(result.byName.get('users')).toBe('update')
  })

  it('배지와 사라짐이 같은 이름에 겹치면 사라짐이 이긴다(삭제 후 재추가 예비 — 목록 전용)', () => {
    const result = classifyTableChanges(summary([
      item('table', 'remove', 'orders'),
      item('table', 'add', 'orders'),
    ]))

    expect(result.byName.has('orders')).toBe(false)
    expect(result.removed).toEqual(['orders'])
  })
})

describe('toTableIdMarks', () => {
  it('물리명 마크를 최신 문서의 테이블 id로 옮긴다 — 대상 밖 이름은 버린다', () => {
    const classification = classifyTableChanges(summary([
      item('column', 'add', 'users', 'grade'),
      item('table', 'update', 'orders'),
    ]))
    const newer = docWith({ id: 't1', name: 'users' }, { id: 't2', name: 'orders' })

    const marks = toTableIdMarks(classification, newer)

    expect(marks.get('t1')).toBe('add')
    expect(marks.get('t2')).toBe('update')
    expect(marks.size).toBe(2)
  })
})
