/**
 * v1.37 특수 인덱스 — 유니크·식·부분(WHERE)·INCLUDE·연산자 클래스·PostgreSQL 접근 방식(커뮤니티 버그 리포트 44)
 *
 * given: 새 인덱스 필드를 쓰는 문서(와 새 필드가 없는 이전 문서)
 * when:  스키마 파싱, 컬럼 삭제, 버전 비교·협업 diff, FK 인덱스 판정, 복사·붙여넣기, DBMS 전환
 * then:  값이 왕복·보존되고, cascade는 CHECK와 같은 규칙으로 정리하며, 부분·식 인덱스는 FK를 덮지 않는다
 */
import { afterEach, describe, expect, it } from 'vitest'

import { applyChange, applyChanges, createColumn, createTable } from '@/features/editor/model/changes'
import { clearClipboard, copyToClipboard, pasteFromClipboard } from '@/features/editor/model/clipboard'
import { deriveChanges } from '@/features/editor/model/collab-merge'
import { emptyContent } from '@/features/editor/model/content-io'
import { indexSchema, type EditorDocument, type ErdIndex } from '@/features/editor/model/content-schema'
import { dbmsIndexSupport } from '@/features/editor/model/dbms'
import { convertDocumentDbms } from '@/features/editor/model/dbms-convert'
import { diffDocuments } from '@/features/editor/model/doc-diff'
import { expressionKey, indexDetail, indexSignature, withIndexExtras } from '@/features/editor/model/keys'
import { buildRelationship } from '@/features/editor/model/relationship'
import { diffSync } from '@/features/editor/model/sync-merge'
import { validateModel } from '@/features/editor/model/validation'

afterEach(() => {
  clearClipboard()
})

/** members(id, tenant_id, nickname, status, price, deleted_at) 한 테이블 */
function baseDoc(indexes: ErdIndex[] = []): EditorDocument {
  const empty = emptyContent()
  const members = createTable('members', {
    id: 'T-m',
    columns: [
      createColumn({ id: 'C-id', physicalName: 'id', dataType: 'BIGINT', nullable: false }),
      createColumn({ id: 'C-tenant', physicalName: 'tenant_id', dataType: 'BIGINT' }),
      createColumn({ id: 'C-nick', physicalName: 'nickname', dataType: 'VARCHAR', length: 50 }),
      createColumn({ id: 'C-status', physicalName: 'status', dataType: 'VARCHAR', length: 20 }),
      createColumn({ id: 'C-price', physicalName: 'price', dataType: 'INT' }),
      createColumn({ id: 'C-del', physicalName: 'deleted_at', dataType: 'DATETIME' }),
    ],
    primaryKey: { name: 'members_pk', columnIds: ['C-id'] },
    indexes,
  })
  return applyChange({ model: empty.model, diagram: empty.diagram }, { type: 'table/create', table: members, position: { x: 0, y: 0 } })
}

const plain = (id: string, name: string, columnId: string): ErdIndex => ({
  id,
  name,
  columns: [{ columnId, order: 'ASC' }],
  type: 'BTREE',
  parser: null,
})

describe('스키마 — 새 필드는 선택, 이전 문서는 그대로 왕복', () => {
  it('새 필드를 모두 쓴 인덱스를 그대로 읽는다', () => {
    const raw = {
      id: 'I1',
      name: 'ux_members_nick',
      columns: [{ columnId: 'C-nick', order: 'ASC', opclass: 'varchar_pattern_ops' }],
      type: 'BTREE',
      parser: null,
      unique: true,
      where: 'deleted_at IS NULL',
      include: ['C-status'],
    }
    expect(indexSchema.parse(raw)).toEqual(raw)
  })

  it('PostgreSQL 접근 방식(GIN 등)과 식 인덱스(columns 비움)를 받는다', () => {
    const parsed = indexSchema.parse({ id: 'I1', name: 'ix_lower', columns: [], type: 'GIN', expression: 'lower(nickname)' })
    expect(parsed).toMatchObject({ type: 'GIN', columns: [], expression: 'lower(nickname)', parser: null })
  })

  it('이전 문서의 인덱스에는 새 키를 더하지 않는다', () => {
    const parsed = indexSchema.parse({ id: 'I1', name: 'ix', columns: [{ columnId: 'C', order: 'DESC' }] })
    expect(parsed).toEqual({ id: 'I1', name: 'ix', columns: [{ columnId: 'C', order: 'DESC' }], type: 'BTREE', parser: null })
  })

  it('컬럼도 식도 없는 인덱스는 무효다', () => {
    expect(indexSchema.safeParse({ id: 'I1', name: 'ix', columns: [] }).success).toBe(false)
    expect(indexSchema.safeParse({ id: 'I1', name: 'ix', columns: [], expression: '  ' }).success).toBe(false)
  })
})

describe('컬럼 삭제 cascade', () => {
  const indexes: ErdIndex[] = [
    { ...plain('I-cover', 'ix_status_cover', 'C-status'), include: ['C-price', 'C-tenant'] },
    { id: 'I-expr', name: 'ix_lower_nick', columns: [], type: 'BTREE', parser: null, expression: 'lower(nickname)' },
    { ...plain('I-partial', 'ix_status_live', 'C-status'), where: 'deleted_at IS NULL' },
    { id: 'I-expr2', name: 'ix_lower_status', columns: [], type: 'BTREE', parser: null, expression: 'lower(status)', unique: true },
  ]

  it('INCLUDE에서 컬럼을 뺀다 — 인덱스는 남는다', () => {
    const doc = applyChange(baseDoc(indexes), { type: 'column/remove', tableId: 'T-m', columnId: 'C-price' })
    const names = doc.model.tables[0].indexes.map((ix) => ix.name)
    expect(names).toEqual(['ix_status_cover', 'ix_lower_nick', 'ix_status_live', 'ix_lower_status'])
    expect(doc.model.tables[0].indexes[0].include).toEqual(['C-tenant'])
  })

  it('식이 지운 컬럼을 쓰면 식 인덱스를 지운다', () => {
    const doc = applyChange(baseDoc(indexes), { type: 'column/remove', tableId: 'T-m', columnId: 'C-nick' })
    expect(doc.model.tables[0].indexes.map((ix) => ix.name)).toEqual(['ix_status_cover', 'ix_status_live', 'ix_lower_status'])
  })

  it('조건(WHERE)이 지운 컬럼을 쓰면 부분 인덱스를 지운다', () => {
    const doc = applyChange(baseDoc(indexes), { type: 'column/remove', tableId: 'T-m', columnId: 'C-del' })
    expect(doc.model.tables[0].indexes.map((ix) => ix.name)).toEqual(['ix_status_cover', 'ix_lower_nick', 'ix_lower_status'])
  })

  it('키 컬럼이 다 빠지면 지우지만, 관계없는 컬럼을 지워도 식 인덱스는 남는다', () => {
    const doc = applyChange(baseDoc(indexes), { type: 'column/remove', tableId: 'T-m', columnId: 'C-status' })
    // 키가 status 하나인 두 인덱스와 식이 status를 쓰는 인덱스가 지워진다
    expect(doc.model.tables[0].indexes.map((ix) => ix.name)).toEqual(['ix_lower_nick'])
    expect(doc.model.tables[0].indexes[0]).toMatchObject({ columns: [], expression: 'lower(nickname)' })
  })
})

describe('버전 비교·협업 diff', () => {
  it('WHERE만 바뀌어도 버전 비교와 협업 diff가 알아챈다', () => {
    const from = baseDoc([{ ...plain('I1', 'ix_status', 'C-status'), where: 'deleted_at IS NULL' }])
    const to = applyChange(from, {
      type: 'index/set',
      tableId: 'T-m',
      indexes: [{ ...plain('I1', 'ix_status', 'C-status'), where: "status <> 'gone'" }],
    })
    const items = diffDocuments(from, to).items.filter((item) => item.kind === 'index')
    expect(items).toEqual([expect.objectContaining({ action: 'update', name: 'ix_status', detail: "status WHERE status <> 'gone'" })])
    expect(deriveChanges(from, to)).toEqual([expect.objectContaining({ type: 'index/set', tableId: 'T-m' })])
  })

  it('없는 필드와 null·false·빈 배열은 같은 서명이다 — 표현 차이로 index/set이 생기지 않는다', () => {
    const a = plain('I1', 'ix', 'C-status')
    const b: ErdIndex = { ...a, unique: false, expression: null, where: null, include: [], columns: [{ columnId: 'C-status', order: 'ASC', opclass: null }] }
    expect(indexSignature(a)).toBe(indexSignature(b))
    expect(deriveChanges(baseDoc([a]), baseDoc([b]))).toEqual([])
  })

  it('한 줄 표기 — 유니크·종류·식·INCLUDE·WHERE', () => {
    const nameOf = (id: string) => ({ 'C-status': 'status', 'C-price': 'price' })[id] ?? id
    expect(
      indexDetail({ id: 'I', name: 'ix', columns: [], type: 'GIN', parser: null, unique: true, expression: 'lower(nickname)' }, nameOf),
    ).toBe('UNIQUE GIN lower(nickname)')
    expect(
      indexDetail(
        { ...plain('I', 'ix', 'C-status'), columns: [{ columnId: 'C-status', order: 'ASC', opclass: 'text_pattern_ops' }], include: ['C-price'], where: 'price > 0' },
        nameOf,
      ),
    ).toBe('status text_pattern_ops INCLUDE (price) WHERE price > 0')
  })

  it('withIndexExtras — 값이 없으면 키째 빼서 일반 인덱스 모양으로 되돌린다', () => {
    const special: ErdIndex = { ...plain('I1', 'ix', 'C-status'), unique: true, where: 'x > 0', include: ['C-price'] }
    expect(withIndexExtras(special, { unique: false, expression: null, where: null, include: [] })).toEqual(plain('I1', 'ix', 'C-status'))
    expect(withIndexExtras(plain('I1', 'ix', 'C-status'), { unique: true, expression: 'lower(nickname)', where: null, include: [] })).toEqual({
      ...plain('I1', 'ix', 'C-status'),
      columns: [],
      unique: true,
      expression: 'lower(nickname)',
    })
  })
})

describe('FK 인덱스 판정 — 부분·식 인덱스는 FK를 덮지 않는다', () => {
  /** teams ← members.team_id (비식별 1:N, PostgreSQL — 앱이 FK 인덱스를 만든다) */
  function withFk(): EditorDocument {
    let doc = baseDoc()
    const teams = createTable('teams', {
      id: 'T-t',
      columns: [createColumn({ id: 'C-tid', physicalName: 'id', dataType: 'BIGINT', nullable: false })],
      primaryKey: { name: 'teams_pk', columnIds: ['C-tid'] },
    })
    doc = applyChange(doc, { type: 'table/create', table: teams, position: { x: 400, y: 0 } })
    const built = buildRelationship({
      parentTable: doc.model.tables[1],
      childTable: doc.model.tables[0],
      type: 'ONE_TO_MANY',
      identifying: false,
      parentMultiplicity: 'EXACTLY_ONE',
      childMultiplicity: 'ONE_OR_MORE',
      onDelete: 'NO_ACTION',
      onUpdate: 'NO_ACTION',
    })
    if (!built.ok) throw new Error('관계를 만들지 못했다')
    return applyChange(doc, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns }, 'postgresql')
  }

  const fkWarnings = (doc: EditorDocument) => validateModel(doc.model, 'postgresql').filter((issue) => issue.code === 'FK_WITHOUT_INDEX')

  it('일반 FK 인덱스는 덮는다, 같은 컬럼이라도 WHERE가 붙으면 FK_WITHOUT_INDEX가 다시 뜬다', () => {
    const doc = withFk()
    expect(fkWarnings(doc)).toHaveLength(0)
    const fkIndex = doc.model.tables[0].indexes[0]
    const partial = applyChange(doc, { type: 'index/set', tableId: 'T-m', indexes: [{ ...fkIndex, where: 'deleted_at IS NULL' }] })
    expect(fkWarnings(partial)).toHaveLength(1)
  })

  it('식 인덱스는 FK를 덮지 않는다', () => {
    const doc = withFk()
    const fkColumnId = doc.model.relationships[0].columnMappings[0].childColumnId
    const expr = applyChange(doc, {
      type: 'index/set',
      tableId: 'T-m',
      indexes: [{ id: 'I-e', name: 'ix_e', columns: [{ columnId: fkColumnId, order: 'ASC' }], type: 'BTREE', parser: null, expression: 'abs(teams_id)' }],
    })
    expect(fkWarnings(expr)).toHaveLength(1)
  })

  it('관계 유형을 바꿔도 사용자가 만든 부분 인덱스는 FK 인덱스로 치지 않아 지우지 않는다', () => {
    const doc = withFk()
    const fkIndex = doc.model.tables[0].indexes[0]
    const partial = applyChange(doc, { type: 'index/set', tableId: 'T-m', indexes: [{ ...fkIndex, where: 'deleted_at IS NULL' }] })
    const relId = partial.model.relationships[0].id
    const oneToOne = applyChange(partial, { type: 'relationship/patch', relationshipId: relId, patch: { type: 'ONE_TO_ONE', childMultiplicity: 'ZERO_OR_ONE' } }, 'postgresql')
    expect(oneToOne.model.tables[0].indexes.map((ix) => ix.where)).toEqual(['deleted_at IS NULL'])
  })

  it('DBMS 전환은 부분 인덱스만 있는 FK에 FK 인덱스를 보충한다', () => {
    const doc = withFk()
    const fkIndex = doc.model.tables[0].indexes[0]
    const partial = applyChange(doc, { type: 'index/set', tableId: 'T-m', indexes: [{ ...fkIndex, where: 'deleted_at IS NULL' }] })
    const { report } = convertDocumentDbms(partial, 'mysql', 'postgresql')
    expect(report.addedIndexes).toHaveLength(1)
  })
})

describe('복사·붙여넣기 — 새 필드를 지키고 INCLUDE id도 새 id로', () => {
  it('식 인덱스는 컬럼이 없어도 남고, INCLUDE·연산자 클래스가 따라간다', () => {
    const doc = baseDoc([
      { id: 'I-expr', name: 'ix_lower_nick', columns: [], type: 'GIN', parser: null, expression: 'lower(nickname) gin_trgm_ops' },
      {
        ...plain('I-cover', 'ix_status_cover', 'C-status'),
        columns: [{ columnId: 'C-status', order: 'ASC', opclass: 'text_pattern_ops' }],
        include: ['C-price'],
        where: 'deleted_at IS NULL',
        unique: true,
      },
    ])
    expect(copyToClipboard(doc, ['T-m']).copied).toBe(true)
    const result = pasteFromClipboard(doc, 'copy')
    if (!result) throw new Error('paste failed')
    const pasted = applyChanges(doc, result.changes).model.tables[1]
    const priceId = pasted.columns.find((c) => c.physicalName === 'price')!.id
    const statusId = pasted.columns.find((c) => c.physicalName === 'status')!.id
    expect(pasted.indexes).toHaveLength(2)
    expect(pasted.indexes[0]).toMatchObject({ type: 'GIN', columns: [], expression: 'lower(nickname) gin_trgm_ops' })
    expect(pasted.indexes[1]).toMatchObject({
      columns: [{ columnId: statusId, order: 'ASC', opclass: 'text_pattern_ops' }],
      include: [priceId],
      where: 'deleted_at IS NULL',
      unique: true,
    })
  })
})

describe('DBMS 전환 — 대상이 내지 못하는 인덱스 기능은 값을 지키고 보고한다', () => {
  it('PostgreSQL → MySQL: GIN·WHERE·INCLUDE·연산자 클래스를 보고하고 값은 그대로 둔다', () => {
    const special: ErdIndex = {
      ...plain('I1', 'ix_nick_trgm', 'C-nick'),
      type: 'GIN',
      columns: [{ columnId: 'C-nick', order: 'ASC', opclass: 'gin_trgm_ops' }],
      where: 'deleted_at IS NULL',
      include: ['C-status'],
    }
    const doc = baseDoc([special, { id: 'I2', name: 'ix_lower', columns: [], type: 'BTREE', parser: null, expression: 'lower(nickname)' }])
    const { document, report } = convertDocumentDbms(doc, 'postgresql', 'mysql')
    expect(report.unsupportedIndexes).toEqual([{ tableName: 'members', indexName: 'ix_nick_trgm', features: ['GIN', 'WHERE', 'INCLUDE', 'OPCLASS'] }])
    expect(document.model.tables[0].indexes[0]).toEqual(special)
  })

  it('DBMS별 인덱스 기능', () => {
    expect(dbmsIndexSupport('postgresql')).toMatchObject({ expression: true, where: true, include: true, opclass: true })
    expect(dbmsIndexSupport('postgresql').types).toContain('GIN')
    expect(dbmsIndexSupport('mysql')).toMatchObject({ types: ['BTREE', 'FULLTEXT', 'SPATIAL', 'HASH'], expression: true, where: false })
    expect(dbmsIndexSupport('mssql')).toMatchObject({ types: ['BTREE'], expression: false, where: true, include: true })
    expect(dbmsIndexSupport('oracle')).toMatchObject({ types: ['BTREE'], expression: true, where: false })
    expect(dbmsIndexSupport('unknown')).toMatchObject({ types: ['BTREE'], unique: true, expression: false })
  })
})

describe('DB 동기화 — 인덱스는 이름으로 맞추고, 다시 쓴 식·조건은 문서 원문을 지킨다', () => {
  /** DB 측 members — id는 문서와 전혀 다르다(물리명으로 맞춘다) */
  function dbDoc(indexes: ErdIndex[]): EditorDocument {
    const doc = baseDoc()
    const table = doc.model.tables[0]
    const dbId = (id: string) => `DB-${id}`
    return {
      ...doc,
      model: {
        ...doc.model,
        tables: [
          {
            ...table,
            id: 'DB-T',
            columns: table.columns.map((c) => ({ ...c, id: dbId(c.id), logicalName: c.physicalName })),
            primaryKey: { name: 'members_pk', columnIds: [dbId('C-id')] },
            indexes: indexes.map((ix) => ({
              ...ix,
              columns: ix.columns.map((c) => ({ ...c, columnId: dbId(c.columnId) })),
              ...(ix.include ? { include: ix.include.map(dbId) } : {}),
            })),
          },
        ],
      },
    }
  }
  /** 문서 쪽 논리명도 물리명과 같게 — 논리명 차이가 섞이지 않게 */
  const docWith = (indexes: ErdIndex[]): EditorDocument => {
    const doc = baseDoc(indexes)
    return { ...doc, model: { ...doc.model, tables: [{ ...doc.model.tables[0], columns: doc.model.tables[0].columns.map((c) => ({ ...c, logicalName: c.physicalName })) }] } }
  }

  it('expressionKey — 캐스트·ANY(ARRAY[…])·괄호·따옴표·대소문자를 무시한다', () => {
    expect(expressionKey("(purpose)::text = 'PROFILE'::text")).toBe(expressionKey("purpose = 'PROFILE'"))
    expect(expressionKey("((status)::text = ANY ((ARRAY['A'::character varying(20), 'B'::character varying])::text[]))")).toBe(
      expressionKey("status IN ('A', 'B')"),
    )
    expect(expressionKey('  ')).toBeNull()
    expect(expressionKey('a > 0')).not.toBe(expressionKey('a > 1'))
  })

  it('정규화해 같으면 바꾸지 않고 문서 원문을 지킨다', () => {
    const own: ErdIndex = { ...plain('I1', 'ix_profile', 'C-status'), where: "purpose = 'PROFILE'", unique: true }
    const db: ErdIndex = { ...own, id: 'X', where: "(purpose)::text = 'PROFILE'::text" }
    expect(diffSync(docWith([own]), dbDoc([db])).changes).toEqual([])
  })

  it('DB 인덱스를 들이고(INCLUDE·연산자 클래스 id 재매핑), 다시 돌리면 빈 diff다', () => {
    const db: ErdIndex[] = [
      {
        ...plain('X1', 'ix_status_cover', 'C-status'),
        columns: [{ columnId: 'C-status', order: 'ASC', opclass: 'text_pattern_ops' }],
        include: ['C-price'],
        where: '(deleted_at IS NULL)',
      },
      { id: 'X2', name: 'ix_lower_nick', columns: [], type: 'GIN', parser: null, expression: 'lower((nickname)::text)' },
    ]
    const current = docWith([])
    const first = diffSync(current, dbDoc(db))
    expect(first.summary.items.filter((item) => item.kind === 'index').map((item) => item.action)).toEqual(['add', 'add'])
    const applied = applyChanges(current, first.changes)
    expect(applied.model.tables[0].indexes[0]).toMatchObject({
      columns: [{ columnId: 'C-status', order: 'ASC', opclass: 'text_pattern_ops' }],
      include: ['C-price'],
    })
    expect(diffSync(applied, dbDoc(db)).changes).toEqual([])
  })

  it('조건이 실제로 다르면 DB 값으로 갱신한다 — 문서 전용 인덱스는 남긴다', () => {
    const own: ErdIndex = { ...plain('I1', 'ix_status', 'C-status'), where: 'deleted_at IS NULL' }
    const docOnly = plain('I2', 'ix_doc_only', 'C-price')
    const db: ErdIndex = { ...own, id: 'X', where: "status <> 'gone'" }
    const current = docWith([own, docOnly])
    const result = diffSync(current, dbDoc([db]))
    expect(result.summary.items).toEqual([expect.objectContaining({ kind: 'index', action: 'update', name: 'ix_status' })])
    const indexes = applyChanges(current, result.changes).model.tables[0].indexes
    expect(indexes.map((ix) => [ix.id, ix.where ?? null])).toEqual([
      ['I1', "status <> 'gone'"],
      ['I2', null],
    ])
  })
})
