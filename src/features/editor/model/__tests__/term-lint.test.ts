/**
 * 비표준 단어 검증 순수 모듈 테스트 — 병합 사전 기준 판정·출처 수집·토큰화 정합
 * (용어 사전 패널, 05-editor/02-ui.md)
 */
import { describe, expect, it } from 'vitest'

import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import { buildTermMap } from '@/features/editor/model/logical-name-inference'
import { lintNonStandardTerms } from '@/features/editor/model/term-lint'

/** 커스텀 사전 없음 — 시스템(BUILTIN_TERMS)만 */
const BUILTIN = buildTermMap(undefined)

function docWith(tables: ReturnType<typeof createTable>[]) {
  const content = emptyContent()
  content.model.tables = tables
  return { model: content.model }
}

function tokensOf(findings: ReturnType<typeof lintNonStandardTerms>) {
  return findings.map((finding) => finding.token)
}

describe('lintNonStandardTerms — 판정', () => {
  it('사전에 없는 토큰을 비표준 단어로 찾아낸다 — usr이 findings에 나온다', () => {
    const table = createTable('usr', { columns: [createColumn({ physicalName: 'usr_nm' })] })
    const findings = lintNonStandardTerms(docWith([table]), BUILTIN)
    expect(tokensOf(findings)).toEqual(['usr']) // nm은 시스템 사전에 있다
  })

  it('표준 사전 등록이 시스템 사전을 덮은 병합 사전 기준으로 판정한다 — usr 등록으로 finding이 사라진다', () => {
    const table = createTable('usr', { columns: [] })
    const standard = buildTermMap([{ termId: '1', workspaceId: '101', term: 'usr', label: '회원', updatedAt: '2026-09-23T00:00:00Z' }])
    expect(lintNonStandardTerms(docWith([table]), BUILTIN)).toHaveLength(1)
    expect(lintNonStandardTerms(docWith([table]), standard)).toEqual([])
  })

  it('전체 이름 등록(user_id)이 있으면 그 이름의 토큰은 비표준이 아니다', () => {
    const table = createTable('member', { columns: [createColumn({ physicalName: 'zzz_unknown' })] })
    const dict = { ...BUILTIN, zzz_unknown: '수수께끼 컬럼' }
    expect(lintNonStandardTerms(docWith([table]), dict)).toEqual([])
  })

  it('tokenizeName 규칙을 따른다 — usrNm(camelCase)은 [usr, nm]으로 검사된다', () => {
    const table = createTable('order', { columns: [createColumn({ physicalName: 'usrNm' })] })
    expect(tokensOf(lintNonStandardTerms(docWith([table]), BUILTIN))).toEqual(['usr'])
  })

  it('모든 토큰이 사전에 있으면 빈 배열이다', () => {
    const table = createTable('order', {
      columns: [createColumn({ physicalName: 'user_id' })],
    })
    expect(lintNonStandardTerms(docWith([table]), BUILTIN)).toEqual([])
  })
})

describe('lintNonStandardTerms — 출처', () => {
  it('테이블명·컬럼명 토큰 모두 검사하고 등장 위치(occurrences)를 돌려준다', () => {
    const table = createTable('usr', { columns: [createColumn({ physicalName: 'usr_id' })] })
    const [finding] = lintNonStandardTerms(docWith([table]), BUILTIN)
    expect(finding.occurrences).toEqual([
      { tableId: table.id, tablePhysicalName: 'usr', columnId: null, columnPhysicalName: null },
      {
        tableId: table.id,
        tablePhysicalName: 'usr',
        columnId: table.columns[0].id,
        columnPhysicalName: 'usr_id',
      },
    ])
  })

  it('같은 토큰이 여러 객체에 있으면 한 finding에 출처가 쌓인다', () => {
    const first = createTable('usr', { columns: [] })
    const second = createTable('account', { columns: [createColumn({ physicalName: 'usr_no' })] })
    const [finding] = lintNonStandardTerms(docWith([first, second]), BUILTIN)
    expect(finding.token).toBe('usr')
    expect(finding.occurrences).toHaveLength(2)
    expect(finding.occurrences[1].columnPhysicalName).toBe('usr_no')
  })

  it('같은 이름 안에 토큰이 반복돼도(usr_usr) 출처는 한 번만 센다', () => {
    const table = createTable('order', { columns: [createColumn({ physicalName: 'usr_usr' })] })
    const [finding] = lintNonStandardTerms(docWith([table]), BUILTIN)
    expect(finding.occurrences).toHaveLength(1)
  })

  it('findings는 토큰 오름차순으로 정렬한다', () => {
    const table = createTable('zzz', { columns: [createColumn({ physicalName: 'aaa_flag' })] })
    expect(tokensOf(lintNonStandardTerms(docWith([table]), BUILTIN))).toEqual(['aaa', 'zzz'])
  })
})
