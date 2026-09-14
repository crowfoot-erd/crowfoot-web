import { describe, expect, it } from 'vitest'

import { emptyContent, parseContent, serializeContent } from '@/features/editor/model/content-io'

describe('content-io', () => {
  it('빈 문자열·null·undefined는 빈 문서 v1로 정규화한다', () => {
    for (const raw of ['', '   ', null, undefined]) {
      expect(parseContent(raw)).toEqual(emptyContent())
    }
  })

  it('레거시 v0(content 없는 초기값)를 v1로 정규화한다 — 빈 model + 빈 diagram', () => {
    const parsed = parseContent('{"tables":[],"relationships":[]}')
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.model).toEqual({ tables: [], relationships: [] })
    expect(parsed.diagram).toEqual({ nodes: {}, notes: [], viewport: null })
  })

  it('v1 문서는 round-trip으로 동일하게 복원된다', () => {
    const content = {
      schemaVersion: 1,
      model: {
        tables: [
          {
            id: 't1',
            logicalName: '주문',
            physicalName: 'orders',
            comment: null,
            columns: [
              {
                id: 'c1',
                logicalName: '',
                physicalName: 'id',
                dataType: 'BIGINT',
                length: null,
                precision: null,
                scale: null,
                nullable: false,
                defaultValue: null,
                autoIncrement: true,
                comment: null,
              },
              {
                id: 'c2',
                logicalName: '',
                physicalName: 'email',
                dataType: 'VARCHAR',
                length: 255,
                precision: null,
                scale: null,
                nullable: true,
                defaultValue: null,
                autoIncrement: false,
                comment: null,
              },
            ],
            primaryKey: { name: 'orders_pk', columnIds: ['c1'] },
            uniques: [{ id: 'u1', name: 'uk_orders_email', columnIds: ['c2'] }],
            indexes: [{ id: 'i1', name: 'idx_orders_email', columns: [{ columnId: 'c2', order: 'DESC' }] }],
          },
        ],
        relationships: [],
      },
      diagram: {
        nodes: { t1: { x: 120, y: 80, width: null } },
        notes: [],
        viewport: null,
      },
    }
    const parsed = parseContent(JSON.stringify(content))
    expect(parsed).toEqual(content)
    expect(JSON.parse(serializeContent(parsed))).toEqual(content)
  })

  it('키 없는 이전 v1 문서는 기본값으로 정규화된다 — uniques/indexes []', () => {
    const parsed = parseContent(
      JSON.stringify({
        schemaVersion: 1,
        model: { tables: [], relationships: [] },
        diagram: { nodes: {}, notes: [], viewport: null },
      }),
    )
    expect(parsed.model.tables).toEqual([])
  })

  it('PK 컬럼은 항상 일반 컬럼보다 위로 정규화된다 — 같은 영역 안 순서는 유지', () => {
    const mk = (id: string) => ({
      id,
      logicalName: '',
      physicalName: id,
      dataType: 'VARCHAR',
      length: 10,
      precision: null,
      scale: null,
      nullable: true,
      defaultValue: null,
      autoIncrement: false,
      comment: null,
    })
    const parsed = parseContent(
      JSON.stringify({
        schemaVersion: 1,
        model: {
          tables: [
            { id: 't1', logicalName: '', physicalName: 'orders', comment: null, columns: [mk('a'), mk('p1'), mk('b'), mk('p2')], primaryKey: { name: 'orders_pk', columnIds: ['p1', 'p2'] } },
          ],
          relationships: [],
        },
        diagram: { nodes: {}, notes: [], viewport: null },
      }),
    )
    // [a, p1, b, p2] → PK(p1, p2)가 위로, 일반(a, b) 순서 유지
    expect(parsed.model.tables[0].columns.map((c) => c.id)).toEqual(['p1', 'p2', 'a', 'b'])
  })

  it('FK 컬럼은 PK 바로 밑(일반 위)으로 정규화된다 — 배열 끝에 붙은 레거시 문서 자가 치유', () => {
    const mk = (id: string) => ({
      id,
      logicalName: '',
      physicalName: id,
      dataType: 'VARCHAR',
      length: 10,
      precision: null,
      scale: null,
      nullable: true,
      defaultValue: null,
      autoIncrement: false,
      comment: null,
    })
    const parsed = parseContent(
      JSON.stringify({
        schemaVersion: 1,
        model: {
          tables: [
            // 관계 삽입 로직 개선 전에 저장된 문서 — FK(f1)가 배열 끝에 있다
            { id: 't1', logicalName: '', physicalName: 'orders', comment: null, columns: [mk('p1'), mk('a'), mk('b'), mk('f1')], primaryKey: { name: 'orders_pk', columnIds: ['p1'] } },
          ],
          relationships: [
            {
              id: 'r1',
              name: 'fk_orders_users',
              parentTableId: 't2',
              childTableId: 't1',
              type: 'ONE_TO_MANY',
              identifying: false,
              parentMultiplicity: 'EXACTLY_ONE' as const,
              childMultiplicity: 'ONE_OR_MORE' as const,
              fkName: 'fk_orders_users',
              columnMappings: [{ parentColumnId: 'p-users', childColumnId: 'f1' }],
              onDelete: 'NO_ACTION',
              onUpdate: 'NO_ACTION',
            },
          ],
        },
        diagram: { nodes: {}, notes: [], viewport: null },
      }),
    )
    // [p1, a, b, f1] → PK(p1) → FK(f1) → 일반(a, b) 순서 유지
    expect(parsed.model.tables[0].columns.map((c) => c.id)).toEqual(['p1', 'f1', 'a', 'b'])
  })

  it('구문 오류·스키마 불일치 content는 예외를 던진다', () => {
    expect(() => parseContent('not-json{')).toThrow()
    expect(() => parseContent('{"schemaVersion":2,"model":{},"diagram":{}}')).toThrow()
    expect(() => parseContent('{"schemaVersion":1,"model":{"tables":"no"},"diagram":{"nodes":{},"notes":[],"viewport":null}}')).toThrow()
  })
})

describe('parseContent — 메모 title·color 레거시 정규화', () => {
  it('제목·색상이 없는 레거시 메모는 기본값(빈 제목·yellow)으로 수화된다', () => {
    const parsed = parseContent(JSON.stringify({
      schemaVersion: 1,
      model: { tables: [], relationships: [] },
      diagram: { nodes: {}, notes: [{ id: 'n1', x: 10, y: 20, width: 180, text: 'hi' }], viewport: null },
    }))
    expect(parsed.diagram.notes[0]).toMatchObject({ id: 'n1', text: 'hi', title: '', color: 'yellow' })
    // 연관 테이블도 레거시 문서에서 기본값 null로 수화된다
    expect(parsed.diagram.notes[0].linkedTableId).toBeNull()
  })

  it('자유 색(#rrggbb)은 프리셋과 같이 통과되고, 색이 아니면 거부된다', () => {
    const note = (color: string) => JSON.stringify({
      schemaVersion: 1,
      model: { tables: [], relationships: [] },
      diagram: { nodes: {}, notes: [{ id: 'n1', x: 0, y: 0, width: 360, text: '', title: 't', color }], viewport: null },
    })
    expect(parseContent(note('#7c3aed')).diagram.notes[0].color).toBe('#7c3aed')
    expect(parseContent(note('blue')).diagram.notes[0].color).toBe('blue')
    expect(() => parseContent(note('teal'))).toThrow() // 프리셋도 hex도 아니다
  })
})

describe('parseContent — 관계 선택성 boolean 레거시 정규화', () => {
  /** 선택성 boolean(parentOptional/childOptional) 관계 — v1 중반 이전 저장 문서 */
  const legacyRelation = (type: 'ONE_TO_ONE' | 'ONE_TO_MANY', parentOptional: boolean, childOptional: boolean) => ({
    id: 'r1',
    name: 'fk_orders_users',
    parentTableId: 't-users',
    childTableId: 't-orders',
    type,
    identifying: false,
    parentOptional,
    childOptional,
    fkName: 'fk_orders_users',
    columnMappings: [],
    onDelete: 'NO_ACTION',
    onUpdate: 'NO_ACTION',
  })

  const parseWith = (relationship: Record<string, unknown>) =>
    parseContent(
      JSON.stringify({
        schemaVersion: 1,
        model: { tables: [], relationships: [relationship] },
        diagram: { nodes: {}, notes: [], viewport: null },
      }),
    )

  it('1:N — true는 ZERO_OR_MORE/ZERO_OR_ONE, false는 ONE_OR_MORE/EXACTLY_ONE로 변환된다', () => {
    const optional = parseWith(legacyRelation('ONE_TO_MANY', true, true)).model.relationships[0]
    expect(optional).toMatchObject({ parentMultiplicity: 'ZERO_OR_ONE', childMultiplicity: 'ZERO_OR_MORE' })
    const mandatory = parseWith(legacyRelation('ONE_TO_MANY', false, false)).model.relationships[0]
    expect(mandatory).toMatchObject({ parentMultiplicity: 'EXACTLY_ONE', childMultiplicity: 'ONE_OR_MORE' })
  })

  it('1:1 — 자식 선택(true)은 ZERO_OR_ONE로 변환된다', () => {
    const parsed = parseWith(legacyRelation('ONE_TO_ONE', false, true)).model.relationships[0]
    expect(parsed).toMatchObject({ parentMultiplicity: 'EXACTLY_ONE', childMultiplicity: 'ZERO_OR_ONE' })
  })

  it('이미 기수 필드가 있으면 그대로 둔다 — 단 레거시 TWO_OR_MORE는 ONE_OR_MORE로 강등된다', () => {
    const kept = parseWith({
      ...legacyRelation('ONE_TO_MANY', true, true),
      parentMultiplicity: 'EXACTLY_ONE',
      childMultiplicity: 'ZERO_OR_MORE',
    }).model.relationships[0]
    expect(kept).toMatchObject({ parentMultiplicity: 'EXACTLY_ONE', childMultiplicity: 'ZERO_OR_MORE' })
    const demoted = parseWith({
      ...legacyRelation('ONE_TO_MANY', true, true),
      parentMultiplicity: 'EXACTLY_ONE',
      childMultiplicity: 'TWO_OR_MORE',
    }).model.relationships[0]
    expect(demoted).toMatchObject({ parentMultiplicity: 'EXACTLY_ONE', childMultiplicity: 'ONE_OR_MORE' })
  })
})
