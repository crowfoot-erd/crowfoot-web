/**
 * 논리명 자동 추론 순수 모듈 테스트 — 토큰화·사전 조회·후보 필터·체인지 변환
 * (05-editor/04-dbms-engineering.md §3.2)
 */
import { describe, expect, it } from 'vitest'

import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import {
  buildTermMap,
  inferenceChanges,
  inferName,
  planLogicalNameInference,
  tokenizeName,
} from '@/features/editor/model/logical-name-inference'

/** 커스텀 사전 없음 — 내장만 */
const BUILTIN = buildTermMap(undefined)

describe('tokenizeName — 물리명 토큰화', () => {
  it("snake_case·camelCase·PascalCase를 소문자 토큰으로 분해한다", () => {
    expect(tokenizeName('user_id')).toEqual(['user', 'id'])
    expect(tokenizeName('orderItemCount')).toEqual(['order', 'item', 'count'])
    expect(tokenizeName('OrderItem')).toEqual(['order', 'item'])
    expect(tokenizeName('URLPath')).toEqual(['url', 'path']) // 연속 대문자 경계
    expect(tokenizeName('user  id')).toEqual(['user', 'id']) // 공백도 경계
  })
})

describe('inferName — 사전 조회', () => {
  it('토큰별 조회 후 공백 결합 — 미등록 토큰은 원문 유지', () => {
    expect(inferName('user_id', BUILTIN)).toBe('사용자 ID')
    expect(inferName('createdAt', BUILTIN)).toBe('생성 일시')
    expect(inferName('foobar_flag', BUILTIN)).toBe('foobar 구분') // foobar는 사전에 없다
  })

  it('토큰이 하나도 사전에 걸리지 않으면 null — 재포맷은 추론이 아니다', () => {
    expect(inferName('zzz_unknown', BUILTIN)).toBeNull()
    expect(inferName('foobar', BUILTIN)).toBeNull()
  })

  it('전체 이름 등록이 토큰 결합보다 우선한다(커스텀 사전 용법)', () => {
    const dict = { ...BUILTIN, user_id: '회원 식별자' }
    expect(inferName('user_id', dict)).toBe('회원 식별자')
    // 토큰 1개짜리 이름은 전체 이름 조회와 같다 — 우선 규칙이 의미 없다
    expect(inferName('user', dict)).toBe('사용자')
  })

  it('buildTermMap — 커스텀 등록이 내장을 덮어쓴다', () => {
    const map = buildTermMap([{ termId: '1', workspaceId: '101', term: 'user', label: '회원', updatedAt: '2026-09-23T00:00:00Z' }])
    expect(map.user).toBe('회원')
    expect(map.order).toBe('주문') // 내장은 그대로
  })
})

function docWith(tables: ReturnType<typeof createTable>[]) {
  const content = emptyContent()
  content.model.tables = tables
  return { model: content.model }
}

describe('planLogicalNameInference — 후보 필터', () => {
  it("논리명이 ''이거나 물리명과 같은 객체만 후보다 — 채워진 논리명(DB 코멘트)은 건드리지 않는다", () => {
    const filled = createTable('user', {
      logicalName: 'DB 코멘트로 옮겨둔 회원',
      columns: [createColumn({ physicalName: 'user_id', logicalName: '회원 식별자' })],
    })
    expect(planLogicalNameInference(docWith([filled]), BUILTIN)).toEqual([])
  })

  it('사전에 걸리는 것만 후보다 — 어느 토큰도 사전에 없으면(치환 0건) 담지 않는다', () => {
    const table = createTable('user', {
      columns: [
        createColumn({ physicalName: 'user_id', logicalName: '' }),
        createColumn({ physicalName: 'zzz_unknown', logicalName: '' }), // 어느 토큰도 사전에 없다
      ],
    })
    const plan = planLogicalNameInference(docWith([table]), BUILTIN)
    expect(plan).toHaveLength(2) // 테이블 user + 컬럼 user_id (zzz_unknown은 제외)
    expect(plan.map((e) => e.inferred)).toEqual(['사용자', '사용자 ID'])
  })

  it('inferenceChanges — 테이블은 table/patch, 컬럼은 column/patch로 변환한다', () => {
    const table = createTable('user', {
      columns: [createColumn({ physicalName: 'user_id', logicalName: '' })],
    })
    const plan = planLogicalNameInference(docWith([table]), BUILTIN)
    const changes = inferenceChanges(plan)
    expect(changes).toEqual([
      { type: 'table/patch', tableId: table.id, patch: { logicalName: '사용자' } },
      { type: 'column/patch', tableId: table.id, columnId: table.columns[0].id, patch: { logicalName: '사용자 ID' } },
    ])
  })
})
