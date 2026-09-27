import { describe, expect, it } from 'vitest'

import { LOGICAL_NAME_SEPARATOR, displayLogicalName, splitLogicalName } from '@/features/editor/model/logical-name'

/** 논리명 "-----" 구분자 관례 — 분리 표기 원천 규칙(05-editor/01-core.md §3.3) */
describe('splitLogicalName', () => {
  it('첫 구분자를 기준으로 논리명·설명을 1회 분리한다', () => {
    expect(splitLogicalName('Workspace 실체-----core 소유, 삭제는 물리 삭제')).toEqual({
      name: 'Workspace 실체',
      description: 'core 소유, 삭제는 물리 삭제',
    })
  })

  it('이후 구분자는 설명의 일부로 보존한다', () => {
    const { name, description } = splitLogicalName('Workspace 실체-----core 소유 — 팀은 멤버십 부여로만 참여')
    expect(name).toBe('Workspace 실체')
    expect(description).toBe('core 소유 — 팀은 멤버십 부여로만 참여')
  })

  it('구분자 없으면 원문 전체가 논리명이고 설명은 null이다', () => {
    expect(splitLogicalName('주문')).toEqual({ name: '주문', description: null })
    expect(splitLogicalName('')).toEqual({ name: '', description: null })
  })

  it('앞뒤 공백을 제거하고, 뒷부분이 빈 문자열이면 설명은 null이다', () => {
    expect(splitLogicalName('  주문  -----  고객 주문 관리  ')).toEqual({ name: '주문', description: '고객 주문 관리' })
    expect(splitLogicalName('주문-----')).toEqual({ name: '주문', description: null })
  })

  it('설명만 있으면(앞부분 빈 값) 논리명이 빈 문자열이다 — 검증 누락 판정 신호', () => {
    expect(splitLogicalName('-----고객 주문 관리')).toEqual({ name: '', description: '고객 주문 관리' })
  })

  it('구분자는 하이픈 5자다 — 4개 이하는 구분자가 아니다', () => {
    expect(splitLogicalName('주문----설명')).toEqual({ name: '주문----설명', description: null })
    expect(LOGICAL_NAME_SEPARATOR).toBe('-----')
  })
})

describe('displayLogicalName', () => {
  it('화면 표기는 구분자 앞부분만', () => {
    expect(displayLogicalName('감사·폐기 이력(통합)-----INSERT-only, 갱신·삭제 없음')).toBe('감사·폐기 이력(통합)')
    expect(displayLogicalName('주문')).toBe('주문')
  })
})
