import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sql-import-content.json'
import { parseContent } from '../content-io'

/**
 * SQL Import 응답 계약 (08-core/02-model.md §1.12) —
 * core-api DdlTextParser + ReverseContentAssembler가 DDL에서 조립한 content(JSON)를
 * 그대로 fixture로 두고 프론트 스키마(parseContent·zod)를 통과하는지 검증한다.
 * 샘플: MySQL 상품 DDL(shop.members·orders — inline UK·제약 FK·스키마 한정명·테이블 COMMENT,
 * 2026-09-22 jshell 실측, 파서→조립기 직렬 실행).
 */
describe('SQL Import content ↔ 프론트 스키마 계약', () => {
  const raw = JSON.stringify(fixture)

  it('조립 content는 parseContent(zod)를 통과한다', () => {
    const content = parseContent(raw)

    expect(content.schemaVersion).toBe(1)
    expect(content.model.tables.map((t) => t.physicalName)).toEqual(['members', 'orders'])
  })

  it('컬럼·키가 프론트 도메인 규칙을 지킨다 — 타입 역매핑·논리명(COMMENT)·PK·UK', () => {
    const content = parseContent(raw)
    const members = content.model.tables[0]
    const orders = content.model.tables[1]

    // 테이블 논리명 — MySQL COMMENT '회원'이 논리명으로
    expect(members.logicalName).toBe('회원')
    expect(orders.logicalName).toBe('주문')

    // 컬럼 — BIGINT 자동증가·VARCHAR(191) 길이·DECIMAL(12,2) 정밀도
    const id = members.columns.find((c) => c.physicalName === 'id')
    expect(id?.dataType).toBe('BIGINT')
    expect(id?.autoIncrement).toBe(true)
    expect(id?.nullable).toBe(false)
    // 컬럼 COMMENT '로그인 이메일' — 리버스 관례대로 논리명으로 (comment 필드는 문서 설명 전용)
    const email = members.columns.find((c) => c.physicalName === 'email')
    expect(email?.dataType).toBe('VARCHAR')
    expect(email?.length).toBe(191)
    expect(email?.logicalName).toBe('로그인 이메일')
    const amount = orders.columns.find((c) => c.physicalName === 'total_amount')
    expect(amount?.dataType).toBe('DECIMAL')
    expect(amount?.precision).toBe(12)
    expect(amount?.scale).toBe(2)

    // PK·UK 이름 — DDL 원문 유지
    expect(members.primaryKey?.name).toBe('PRIMARY_members')
    expect(members.uniques.map((u) => u.name)).toContain('uk_members_email')
  })

  it('FK → 관계 — 1:N·부모 EXACTLY_ONE(NOT NULL)·CASCADE', () => {
    const content = parseContent(raw)
    const [members, orders] = content.model.tables

    expect(content.model.relationships).toHaveLength(1)
    const rel = content.model.relationships[0]
    expect(rel.name).toBe('fk_orders_members')
    expect(rel.type).toBe('ONE_TO_MANY')
    expect(rel.identifying).toBe(false)
    expect(rel.parentTableId).toBe(members.id)
    expect(rel.childTableId).toBe(orders.id)
    expect(rel.onDelete).toBe('CASCADE')
    expect(rel.columnMappings).toHaveLength(1)
  })
})
