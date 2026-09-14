import { describe, expect, it } from 'vitest'
import fixture from './fixtures/reverse-content.json'
import { parseContent } from '../content-io'
import { templateIdForDatabase } from '../dbms'

/**
 * 리버스 엔지니어링 응답 계약 (08-core/06-connection.md §3.6) —
 * core-api ReverseContentAssembler가 조립한 content(JSON)를 그대로 fixture로 두고
 * 프론트 스키마(parseContent·zod)를 통과하는지 검증한다.
 * 샘플: 개발 PG public 스키마 rev_member·rev_orders (2026-09-14 실측, 모델 6).
 */
describe('리버스 content ↔ 프론트 스키마 계약', () => {
  const raw = JSON.stringify(fixture)

  it('리버스 content는 parseContent(zod)를 통과한다', () => {
    const content = parseContent(raw)

    expect(content.schemaVersion).toBe(1)
    expect(content.model.tables.map((t) => t.physicalName)).toEqual([
      'rev_member',
      'rev_orders',
    ])
  })

  it('컬럼·키·관계가 프론트 도메인 규칙을 지킨다', () => {
    const content = parseContent(raw)
    const member = content.model.tables[0]
    const orders = content.model.tables[1]

    // 타입 역매핑 — int8→BIGINT·varchar→VARCHAR(+length)·numeric→DECIMAL(p,s)
    const email = member.columns.find((c) => c.physicalName === 'email')
    expect(email?.dataType).toBe('VARCHAR')
    expect(email?.length).toBe(255)
    const amount = orders.columns.find((c) => c.physicalName === 'amount')
    expect(amount?.dataType).toBe('DECIMAL')
    expect(amount?.precision).toBe(10)
    expect(amount?.scale).toBe(2)

    // PK·UK 이름 — PG 원문 유지
    expect(member.primaryKey?.name).toBe('rev_member_pkey')
    expect(member.uniques.map((u) => u.name)).toContain('uq_rev_member_email')

    // FK → 관계 — 1:N·부모 EXACTLY_ONE(FK NOT NULL)·CASCADE
    const rel = content.model.relationships[0]
    expect(rel.type).toBe('ONE_TO_MANY')
    expect(rel.identifying).toBe(false)
    expect(rel.parentMultiplicity).toBe('EXACTLY_ONE')
    expect(rel.childMultiplicity).toBe('ZERO_OR_MORE')
    expect(rel.onDelete).toBe('CASCADE')
    expect(rel.parentTableId).toBe(member.id)
    expect(rel.childTableId).toBe(orders.id)

    // 그리드 배치 — diagram.nodes가 테이블별 좌표를 갖는다
    expect(Object.keys(content.diagram.nodes)).toHaveLength(2)
    expect(content.diagram.nodes[member.id]).toMatchObject({ x: 80, y: 80 })
  })

  it('리버스 문서 모델의 DB 타입(postgresql)로 DDL 템플릿을 유도할 수 있다', () => {
    // 에디터 진입 시 model.databaseType → templateId 파생이 정상 동작하는지
    expect(templateIdForDatabase('postgresql')).toBe('postgres')
  })
})
