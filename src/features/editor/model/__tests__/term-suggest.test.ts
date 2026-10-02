/**
 * 컬럼 이름 입력의 사전 제안 — 용어와 단어 (05-editor/02-ui.md §2.2)
 */
import { describe, expect, it } from 'vitest'

import type { WorkspaceTerm } from '@/api/types'
import {
  completeWord,
  isTermEntry,
  previewLogicalName,
  splitFragment,
  suggestTerms,
  workspaceTermMap,
} from '@/features/editor/model/term-suggest'

const entry = (term: string, label: string, extra: Partial<WorkspaceTerm> = {}): WorkspaceTerm => ({
  termId: term,
  workspaceId: '101',
  term,
  label,
  types: null,
  domainTypeId: null,
  updatedAt: '2026-10-02T00:00:00Z',
  ...extra,
})

const ALL = [
  entry('email', '이메일'),
  entry('user', '회원'),
  entry('user_email', '회원 이메일', { domainTypeId: '11' }),
  entry('created_at', '생성 일시', { types: { mysql: 'DATETIME' } }),
  entry('order', '주문'),
]
const names = (rows: WorkspaceTerm[]) => rows.map((row) => row.term)

describe('용어와 단어', () => {
  it('도메인 타입을 가리키거나 타입 표기가 있으면 용어, 둘 다 없으면 단어다', () => {
    expect(ALL.map(isTermEntry)).toEqual([false, false, true, true, false])
    expect(isTermEntry({ types: {}, domainTypeId: null })).toBe(false)
  })

  it('치고 있는 조각은 마지막 _ 뒤의 글자다', () => {
    expect(splitFragment('user_em')).toEqual({ prefix: 'user_', fragment: 'em' })
    expect(splitFragment('user')).toEqual({ prefix: '', fragment: 'user' })
    expect(splitFragment('user_')).toEqual({ prefix: 'user_', fragment: '' })
  })
})

describe('제안', () => {
  it('비어 있거나 자동 생성 이름(column_N)이면 전체를 묶음별로 보여 준다', () => {
    for (const draft of ['', 'column_3']) {
      const { terms, words } = suggestTerms(ALL, draft)
      expect(names(terms)).toEqual(['user_email', 'created_at'])
      expect(names(words)).toEqual(['email', 'user', 'order'])
    }
  })

  it('용어는 입력 전체와, 단어는 치고 있는 조각과 견준다', () => {
    const { terms, words } = suggestTerms(ALL, 'user_em')
    expect(names(terms)).toEqual(['user_email'])
    // 조각 "em"에 걸리는 단어만 — user는 앞부분에 이미 썼다
    expect(names(words)).toEqual(['email'])
  })

  it('라벨로도 찾는다 — 다 친 단어는 다시 제안하지 않는다', () => {
    expect(names(suggestTerms(ALL, '주문').words)).toEqual(['order'])
    expect(names(suggestTerms(ALL, 'user').words)).toEqual([])
    expect(names(suggestTerms(ALL, 'user').terms)).toEqual(['user_email'])
  })

  it('묶음마다 5개까지만 보여 준다', () => {
    const many = Array.from({ length: 9 }, (_, i) => entry(`w${i}`, `단어${i}`))
    expect(suggestTerms(many, '').words).toHaveLength(5)
  })
})

describe('단어 완성과 논리명 미리보기', () => {
  it('치고 있는 조각만 바꾼다', () => {
    expect(completeWord('user_em', 'email')).toBe('user_email')
    expect(completeWord('em', 'email')).toBe('email')
    expect(completeWord('user_', 'email')).toBe('user_email')
    // 자동 생성 이름은 미입력이다 — 통째로 바뀐다
    expect(completeWord('column_3', 'email')).toBe('email')
  })

  it('사전에 걸리는 조각만 바뀐 모습을 보여 준다 — 통째로 등록된 이름이 먼저다', () => {
    const dict = workspaceTermMap(ALL)
    expect(previewLogicalName('user_em', dict)).toBe('회원 em')
    expect(previewLogicalName('user_email', dict)).toBe('회원 이메일')
    expect(previewLogicalName('order_user', dict)).toBe('주문 회원')
    expect(previewLogicalName('zzz', dict)).toBeNull()
    expect(previewLogicalName('column_1', dict)).toBeNull()
  })
})
