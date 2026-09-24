/**
 * 논리명 자동 추론 순수 모듈 테스트 — 토큰화·사전 조회·후보 필터·체인지 변환·다국어 라벨 해석
 * (05-editor/04-dbms-engineering.md §3.2)
 */
import { describe, expect, it } from 'vitest'

import type { SystemTerm, WorkspaceTerm } from '@/api/types'
import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import {
  buildTermMap,
  inferenceChanges,
  inferName,
  planLogicalNameInference,
  resolveLabel,
  tokenizeName,
} from '@/features/editor/model/logical-name-inference'

/** 시스템 사전 픽스처 — 서버(system_terms) 형태 그대로. labels는 언어→라벨 맵 */
function systemTerm(term: string, labels: Record<string, string>): SystemTerm {
  return { termId: term, term, labels, type: null, updatedAt: '2026-09-24T00:00:00Z' }
}

const SYSTEM: SystemTerm[] = [
  systemTerm('user', { ko: '사용자', en: 'User' }),
  systemTerm('id', { ko: 'ID', en: 'ID' }),
  systemTerm('created', { ko: '생성', en: 'Created' }),
  systemTerm('at', { ko: '일시', en: 'At' }),
  systemTerm('order', { ko: '주문', en: 'Order' }),
  systemTerm('flag', { ko: '구분', en: 'Flag' }),
  systemTerm('item', { ko: '항목', en: 'Item' }),
  systemTerm('ja_only', { ja: '일본어전용' }), // 폴백 검증용 — ko/en이 없는 항목
]

function workspaceTerm(term: string, label: string, type: string | null = null): WorkspaceTerm {
  return { termId: term, workspaceId: '101', term, label, type, updatedAt: '2026-09-24T00:00:00Z' }
}

/** 한국어 해석 병합 사전 — 구 BUILTIN 사전에 해당하는 기준 사전 */
const DICT = buildTermMap(SYSTEM, undefined, 'ko')

describe('tokenizeName — 물리명 토큰화', () => {
  it("snake_case·camelCase·PascalCase를 소문자 토큰으로 분해한다", () => {
    expect(tokenizeName('user_id')).toEqual(['user', 'id'])
    expect(tokenizeName('orderItemCount')).toEqual(['order', 'item', 'count'])
    expect(tokenizeName('OrderItem')).toEqual(['order', 'item'])
    expect(tokenizeName('URLPath')).toEqual(['url', 'path']) // 연속 대문자 경계
    expect(tokenizeName('user  id')).toEqual(['user', 'id']) // 공백도 경계
  })
})

describe('resolveLabel — 다국어 라벨 해석', () => {
  it('UI 언어 라벨을 쓴다', () => {
    expect(resolveLabel({ ko: '사용자', en: 'User' }, 'ko')).toBe('사용자')
    expect(resolveLabel({ ko: '사용자', en: 'User' }, 'en')).toBe('User')
  })

  it('UI 언어가 없으면 en → ko → 첫 값 폴백 — 어느 언어로 등록됐어도 라벨이 나온다', () => {
    expect(resolveLabel({ en: 'User', ja: 'ユーザー' }, 'ko')).toBe('User') // en 폴백
    expect(resolveLabel({ ja: 'ユーザー', ko: '사용자' }, 'en')).toBe('사용자') // ko 폴백
    expect(resolveLabel({ ja: '일본어전용', zh: '中文' }, 'ko')).toBe('일본어전용') // 첫 값 폴백
    expect(resolveLabel({ ja: '일본어전용' }, 'en')).toBe('일본어전용')
  })

  it('빈 맵(데이터 오류)은 빈 문자열 — 추론이 깨지지 않게 한다', () => {
    expect(resolveLabel({}, 'ko')).toBe('')
  })
})

describe('buildTermMap — 병합 사전', () => {
  it('시스템 라벨을 UI 언어로 해석해 바닥에 깐다', () => {
    const ko = buildTermMap(SYSTEM, undefined, 'ko')
    const en = buildTermMap(SYSTEM, undefined, 'en')
    expect(ko.user).toBe('사용자')
    expect(en.user).toBe('User') // 언어를 바꾸면 해석도 바뀐다
    expect(ko.ja_only).toBe('일본어전용') // 첫 값 폴백이 그대로 적용된다
  })

  it('표준 사전 등록이 시스템을 덮어쓴다(워크스페이스가 표준을 재정의한다)', () => {
    const map = buildTermMap(SYSTEM, [workspaceTerm('user', '회원')], 'ko')
    expect(map.user).toBe('회원')
    expect(map.order).toBe('주문') // 시스템은 그대로
  })

  it('한쪽이 undefined여도 나머지 한쪽으로 계산한다(로드 실패 안내는 UI가 담당)', () => {
    expect(buildTermMap(undefined, [workspaceTerm('usr', '회원')], 'ko')).toEqual({ usr: '회원' })
    expect(buildTermMap(undefined, undefined, 'ko')).toEqual({})
    expect(buildTermMap(SYSTEM, undefined, 'ko').user).toBe('사용자')
  })
})

describe('inferName — 사전 조회', () => {
  it('토큰별 조회 후 공백 결합 — 미등록 토큰은 원문 유지', () => {
    expect(inferName('user_id', DICT)).toBe('사용자 ID')
    expect(inferName('createdAt', DICT)).toBe('생성 일시')
    expect(inferName('foobar_flag', DICT)).toBe('foobar 구분') // foobar는 사전에 없다
  })

  it('토큰이 하나도 사전에 걸리지 않으면 null — 재포맷은 추론이 아니다', () => {
    expect(inferName('zzz_unknown', DICT)).toBeNull()
    expect(inferName('foobar', DICT)).toBeNull()
  })

  it('전체 이름 등록이 토큰 결합보다 우선한다(표준 사전 용법)', () => {
    const dict = { ...DICT, user_id: '회원 식별자' }
    expect(inferName('user_id', dict)).toBe('회원 식별자')
    // 토큰 1개짜리 이름은 전체 이름 조회와 같다 — 우선 규칙이 의미 없다
    expect(inferName('user', dict)).toBe('사용자')
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
    expect(planLogicalNameInference(docWith([filled]), DICT)).toEqual([])
  })

  it('사전에 걸리는 것만 후보다 — 어느 토큰도 사전에 없으면(치환 0건) 담지 않는다', () => {
    const table = createTable('user', {
      columns: [
        createColumn({ physicalName: 'user_id', logicalName: '' }),
        createColumn({ physicalName: 'zzz_unknown', logicalName: '' }), // 어느 토큰도 사전에 없다
      ],
    })
    const plan = planLogicalNameInference(docWith([table]), DICT)
    expect(plan).toHaveLength(2) // 테이블 user + 컬럼 user_id (zzz_unknown은 제외)
    expect(plan.map((e) => e.inferred)).toEqual(['사용자', '사용자 ID'])
  })

  it('inferenceChanges — 테이블은 table/patch, 컬럼은 column/patch로 변환한다', () => {
    const table = createTable('user', {
      columns: [createColumn({ physicalName: 'user_id', logicalName: '' })],
    })
    const plan = planLogicalNameInference(docWith([table]), DICT)
    const changes = inferenceChanges(plan)
    expect(changes).toEqual([
      { type: 'table/patch', tableId: table.id, patch: { logicalName: '사용자' } },
      { type: 'column/patch', tableId: table.id, columnId: table.columns[0].id, patch: { logicalName: '사용자 ID' } },
    ])
  })
})
