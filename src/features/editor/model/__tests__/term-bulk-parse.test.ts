/**
 * 용어 대량 등록 파서 순수 모듈 테스트 — 구분자·정규화·빈 줄·형식 오류
 * (용어 사전 패널, 05-editor/02-ui.md)
 */
import { describe, expect, it } from 'vitest'

import { parseTermBulkText } from '@/features/editor/model/term-bulk-parse'

describe('parseTermBulkText — 파싱', () => {
  it("'토큰,라벨' 쉼표 줄을 파싱한다", () => {
    const { entries, issues } = parseTermBulkText('user_id,회원 식별자')
    expect(entries).toEqual([{ line: 1, term: 'user_id', label: '회원 식별자', type: null }])
    expect(issues).toEqual([])
  })

  it('탭 구분 줄을 파싱한다', () => {
    const { entries, issues } = parseTermBulkText('ordr\t주문')
    expect(entries).toEqual([{ line: 1, term: 'ordr', label: '주문', type: null }])
    expect(issues).toEqual([])
  })

  it("'토큰,라벨,타입' 3열 줄을 파싱한다 — type은 trim해 돌려준다", () => {
    const { entries, issues } = parseTermBulkText('user_id,회원 식별자, VARCHAR(50) ')
    expect(entries).toEqual([
      { line: 1, term: 'user_id', label: '회원 식별자', type: 'VARCHAR(50)' },
    ])
    expect(issues).toEqual([])
  })

  it('3열에서 타입을 비우면 null이다(선택 값)', () => {
    const { entries } = parseTermBulkText('ordr,주문,')
    expect(entries).toEqual([{ line: 1, term: 'ordr', label: '주문', type: null }])
  })

  it('구분자가 2개면 3열로 해석한다 — 두번째 조각이 타입이다(라벨에 구분자 불가 규칙)', () => {
    const { entries } = parseTermBulkText('grade,일반,VIP 등급')
    expect(entries).toEqual([{ line: 1, term: 'grade', label: '일반', type: 'VIP 등급' }])
  })

  it('term은 trim+소문자로 정규화한다(서버 규칙과 같게)', () => {
    const { entries } = parseTermBulkText('  Ordr \t  주문  ')
    expect(entries).toEqual([{ line: 1, term: 'ordr', label: '주문', type: null }])
  })

  it('빈 줄은 조용히 건너뛴다', () => {
    const { entries, issues } = parseTermBulkText('\nuser_id,회원 식별자\n\n\nordr,주문\n')
    expect(entries.map((entry) => entry.term)).toEqual(['user_id', 'ordr'])
    expect(entries[1].line).toBe(5)
    expect(issues).toEqual([])
  })
})

describe('parseTermBulkText — 형식 오류', () => {
  it('구분자(쉼표·탭) 없는 줄을 issues로 돌려준다', () => {
    const { entries, issues } = parseTermBulkText('user_id 회원 식별자')
    expect(entries).toEqual([])
    expect(issues).toEqual([{ line: 1, text: 'user_id 회원 식별자', reason: 'missingSeparator' }])
  })

  it('라벨이나 토큰이 비어 있는 줄을 issues로 돌려준다', () => {
    const { issues } = parseTermBulkText('ordr,\n,회원')
    expect(issues).toEqual([
      { line: 1, text: 'ordr,', reason: 'emptyLabel' },
      { line: 2, text: ',회원', reason: 'emptyLabel' },
    ])
  })

  it('토큰에 내부 공백이 있는 줄을 issues로 돌려준다', () => {
    const { issues } = parseTermBulkText('user id,회원 식별자')
    expect(issues).toEqual([{ line: 1, text: 'user id,회원 식별자', reason: 'spaceInTerm' }])
  })

  it('3열인데 조각이 더 남으면 tooManyColumns다 — 타입에 구분자는 성립하지 않는다', () => {
    const { entries, issues } = parseTermBulkText('user_id,회원 식별자,VARCHAR(50),메모')
    expect(entries).toEqual([])
    expect(issues).toEqual([
      { line: 1, text: 'user_id,회원 식별자,VARCHAR(50),메모', reason: 'tooManyColumns' },
    ])
  })

  it('정상 줄과 오류 줄이 섞이면 각각 entries·issues로 나뉜다', () => {
    const { entries, issues } = parseTermBulkText('ordr,주문\n깨진 줄\nuser_id,회원 식별자')
    expect(entries).toHaveLength(2)
    expect(issues).toEqual([{ line: 2, text: '깨진 줄', reason: 'missingSeparator' }])
  })
})
