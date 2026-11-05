/**
 * pgvector — 벡터 컬럼(VECTOR)과 벡터 인덱스(HNSW·IVFFLAT)·저장 매개변수(WITH) (05-editor/04-dbms-engineering.md §3.6)
 *
 * given: PostgreSQL 문서의 vector(n) 컬럼과 벡터 인덱스(와 다른 DBMS 문서에 들어온 같은 값)
 * when:  카탈로그·물리 표기, 스키마 파싱, 검증, 서명·한 줄 표기, DBMS 전환, DB 동기화
 * then:  PostgreSQL 문서에서만 쓰고, 규칙을 어기면 검증이 알리며, WITH는 인덱스 정의의 일부로 왕복·비교된다
 */
import { describe, expect, it } from 'vitest'

import { applyChange, applyChanges, createColumn, createTable } from '@/features/editor/model/changes'
import { deriveChanges } from '@/features/editor/model/collab-merge'
import { emptyContent, parseContent, serializeContent } from '@/features/editor/model/content-io'
import { indexSchema, type EditorDocument, type ErdIndex } from '@/features/editor/model/content-schema'
import {
  dataTypesFor,
  dbmsIndexSupport,
  isTypeSupported,
  lengthField,
  parsePhysicalType,
  physicalType,
  typeSizeSuffix,
} from '@/features/editor/model/dbms'
import { convertDocumentDbms } from '@/features/editor/model/dbms-convert'
import { diffDocuments } from '@/features/editor/model/doc-diff'
import { indexDetail, indexSignature, withIndexExtras } from '@/features/editor/model/keys'
import { diffSync } from '@/features/editor/model/sync-merge'
import { validateModel, type ValidationIssue } from '@/features/editor/model/validation'

/** documents(id, title, embedding vector(dim)) 한 테이블 */
function vectorDoc(indexes: ErdIndex[] = [], dim: number | null = 1536): EditorDocument {
  const empty = emptyContent()
  const table = createTable('documents', {
    id: 'T-d',
    logicalName: '문서',
    columns: [
      createColumn({ id: 'C-id', physicalName: 'id', logicalName: 'ID', dataType: 'BIGINT', nullable: false }),
      createColumn({ id: 'C-title', physicalName: 'title', logicalName: '제목', dataType: 'VARCHAR', length: 200 }),
      createColumn({ id: 'C-emb', physicalName: 'embedding', logicalName: '임베딩', dataType: 'VECTOR', length: dim }),
    ],
    primaryKey: { name: 'documents_pk', columnIds: ['C-id'] },
    indexes,
  })
  return applyChange({ model: empty.model, diagram: empty.diagram }, { type: 'table/create', table, position: { x: 0, y: 0 } })
}

const hnsw = (overrides: Partial<ErdIndex> = {}): ErdIndex => ({
  id: 'I-v',
  name: 'ix_documents_embedding',
  columns: [{ columnId: 'C-emb', order: 'ASC', opclass: 'vector_cosine_ops' }],
  type: 'HNSW',
  parser: null,
  with: { m: '16', ef_construction: '64' },
  ...overrides,
})

/** with 키를 뺀 사본 */
function withoutParams(index: ErdIndex): ErdIndex {
  const copy = { ...index }
  delete copy.with
  return copy
}

const codes = (issues: ValidationIssue[]) => issues.map((issue) => issue.code).filter((code) => code.startsWith('VECTOR_'))

describe('카탈로그 — VECTOR는 PostgreSQL 문서 전용', () => {
  it('PostgreSQL 표기는 vector(n), 길이 칸은 차원이다', () => {
    expect(physicalType('VECTOR', 'postgres')).toBe('vector')
    expect(`${physicalType('VECTOR', 'postgres')}${typeSizeSuffix({ dataType: 'VECTOR', length: 1536, precision: null, scale: null })}`).toBe(
      'vector(1536)',
    )
    expect(lengthField('VECTOR')).toEqual({ label: 'dimension', placeholder: '1536' })
    expect(lengthField('VARCHAR')).toEqual({ label: 'length', placeholder: '255' })
  })

  it('드롭다운은 다른 DBMS 문서에서 VECTOR를 빼고, 이미 그 값이면 남긴다', () => {
    expect(isTypeSupported('VECTOR', 'postgresql')).toBe(true)
    expect(isTypeSupported('VECTOR', 'mysql')).toBe(false)
    expect(isTypeSupported('VARCHAR', 'mysql')).toBe(true)
    expect(dataTypesFor('postgres').map((t) => t.code)).toContain('VECTOR')
    expect(dataTypesFor('mysql').map((t) => t.code)).not.toContain('VECTOR')
    expect(dataTypesFor('mysql', 'VECTOR').map((t) => t.code)).toContain('VECTOR')
  })

  it('vector(1536)을 VECTOR·length 1536으로 읽는다', () => {
    expect(parsePhysicalType('vector(1536)', 'postgres')).toEqual({ code: 'VECTOR', length: 1536, precision: null, scale: null })
    expect(parsePhysicalType('VECTOR', 'postgres')).toEqual({ code: 'VECTOR', length: null, precision: null, scale: null })
  })

  it('PostgreSQL만 HNSW·IVFFLAT와 WITH를 낸다', () => {
    expect(dbmsIndexSupport('postgresql').types).toEqual(expect.arrayContaining(['HNSW', 'IVFFLAT']))
    expect(dbmsIndexSupport('postgresql').with).toBe(true)
    for (const dbms of ['mysql', 'oracle', 'mssql', 'unknown']) {
      expect(dbmsIndexSupport(dbms).types).not.toContain('HNSW')
      expect(dbmsIndexSupport(dbms).with).toBe(false)
    }
  })
})

describe('스키마 — HNSW·IVFFLAT와 with를 받고 그대로 왕복한다', () => {
  it('벡터 인덱스와 with를 읽는다 — with 키 순서를 지킨다', () => {
    const parsed = indexSchema.parse(hnsw())
    expect(parsed.type).toBe('HNSW')
    expect(Object.keys(parsed.with ?? {})).toEqual(['m', 'ef_construction'])
    expect(indexSchema.safeParse(hnsw({ type: 'IVFFLAT', with: { lists: '100' } })).success).toBe(true)
  })

  it('with가 없는 인덱스에는 키를 더하지 않는다', () => {
    const plain = withoutParams(hnsw())
    expect('with' in indexSchema.parse(plain)).toBe(false)
  })

  it('문서 직렬화 왕복', () => {
    const doc = vectorDoc([hnsw()])
    const round = parseContent(serializeContent({ ...emptyContent(), model: doc.model, diagram: doc.diagram }))
    expect(round.model.tables[0].indexes[0]).toEqual(hnsw())
    expect(round.model.tables[0].columns[2]).toMatchObject({ dataType: 'VECTOR', length: 1536 })
  })
})

describe('검증 — 벡터 규칙 4종', () => {
  it('정상 PostgreSQL 문서는 벡터 규칙에 걸리지 않는다', () => {
    expect(codes(validateModel(vectorDoc([hnsw()]).model, 'postgresql'))).toEqual([])
    const ivf = hnsw({ type: 'IVFFLAT', columns: [{ columnId: 'C-emb', order: 'ASC', opclass: 'vector_l2_ops' }], with: { lists: '100' } })
    expect(codes(validateModel(vectorDoc([ivf]).model, 'postgresql'))).toEqual([])
  })

  it('PostgreSQL이 아닌 문서의 VECTOR 컬럼은 VECTOR_UNSUPPORTED_DBMS 오류다', () => {
    const issues = validateModel(vectorDoc().model, 'mysql')
    expect(issues).toContainEqual({ level: 'error', code: 'VECTOR_UNSUPPORTED_DBMS', tableId: 'T-d', columnId: 'C-emb' })
    expect(codes(validateModel(vectorDoc().model, 'postgresql'))).toEqual([])
  })

  it('차원이 없거나 1~16000 밖이면 VECTOR_MISSING_DIMENSION 오류다', () => {
    expect(codes(validateModel(vectorDoc([], null).model, 'postgresql'))).toEqual(['VECTOR_MISSING_DIMENSION'])
    expect(codes(validateModel(vectorDoc([], 0).model, 'postgresql'))).toEqual(['VECTOR_MISSING_DIMENSION'])
    expect(codes(validateModel(vectorDoc([], 16001).model, 'postgresql'))).toEqual(['VECTOR_MISSING_DIMENSION'])
    expect(codes(validateModel(vectorDoc([], 16000).model, 'postgresql'))).toEqual([])
    // 길이 규칙(MISSING_TYPE_LENGTH)과는 따로다
    expect(validateModel(vectorDoc([], null).model, 'mysql').map((i) => i.code)).not.toContain('MISSING_TYPE_LENGTH')
  })

  it('벡터 인덱스 규칙을 어기면 VECTOR_INDEX_INVALID 오류다', () => {
    const invalid = (index: ErdIndex) => codes(validateModel(vectorDoc([index]).model, 'postgresql'))
    // 연산자 클래스 없음
    expect(invalid(hnsw({ columns: [{ columnId: 'C-emb', order: 'ASC' }] }))).toEqual(['VECTOR_INDEX_INVALID'])
    // IVFFLAT는 vector_l1_ops를 받지 않는다
    expect(invalid(hnsw({ type: 'IVFFLAT', columns: [{ columnId: 'C-emb', order: 'ASC', opclass: 'vector_l1_ops' }] }))).toEqual([
      'VECTOR_INDEX_INVALID',
    ])
    // 키가 VECTOR 컬럼이 아니다
    expect(invalid(hnsw({ columns: [{ columnId: 'C-title', order: 'ASC', opclass: 'vector_l2_ops' }] }))).toEqual(['VECTOR_INDEX_INVALID'])
    // 키 컬럼이 둘이다
    expect(
      invalid(
        hnsw({
          columns: [
            { columnId: 'C-emb', order: 'ASC', opclass: 'vector_l2_ops' },
            { columnId: 'C-title', order: 'ASC', opclass: 'vector_l2_ops' },
          ],
        }),
      ),
    ).toEqual(['VECTOR_INDEX_INVALID'])
    // 유니크
    expect(invalid(hnsw({ unique: true }))).toEqual(['VECTOR_INDEX_INVALID'])
    // HNSW는 vector_l1_ops를 받는다
    expect(invalid(hnsw({ columns: [{ columnId: 'C-emb', order: 'ASC', opclass: 'vector_l1_ops' }] }))).toEqual([])
  })

  it('식 키 벡터 인덱스는 키 컬럼 조건을 보지 않는다 — 유니크만 본다', () => {
    const expression = hnsw({ columns: [], expression: '(embedding::vector(3)) vector_l2_ops' })
    expect(codes(validateModel(vectorDoc([expression]).model, 'postgresql'))).toEqual([])
    expect(codes(validateModel(vectorDoc([{ ...expression, unique: true }]).model, 'postgresql'))).toEqual(['VECTOR_INDEX_INVALID'])
  })

  it('키 컬럼 차원이 2000을 넘으면 VECTOR_INDEX_DIMENSION_LIMIT 경고다 — 2000은 통과', () => {
    const issues = validateModel(vectorDoc([hnsw()], 3072).model, 'postgresql')
    expect(issues).toContainEqual({ level: 'warning', code: 'VECTOR_INDEX_DIMENSION_LIMIT', tableId: 'T-d', columnId: 'C-emb' })
    expect(codes(validateModel(vectorDoc([hnsw()], 2000).model, 'postgresql'))).toEqual([])
    // 인덱스가 없으면 차원이 커도 경고하지 않는다
    expect(codes(validateModel(vectorDoc([], 3072).model, 'postgresql'))).toEqual([])
  })
})

describe('서명·한 줄 표기 — WITH는 인덱스 정의의 일부다', () => {
  it('with가 바뀌면 서명이 달라지고, 키 순서·빈 맵은 같은 서명이다', () => {
    expect(indexSignature(hnsw())).not.toBe(indexSignature(hnsw({ with: { m: '32', ef_construction: '64' } })))
    expect(indexSignature(hnsw())).toBe(indexSignature(hnsw({ with: { ef_construction: '64', m: '16' } })))
    const without = withoutParams(hnsw())
    expect(indexSignature(without)).toBe(indexSignature({ ...without, with: {} }))
  })

  it('한 줄 표기는 종류·연산자 클래스·WITH(적힌 순서)를 싣는다', () => {
    expect(indexDetail(hnsw(), (id) => (id === 'C-emb' ? 'embedding' : id))).toBe(
      'HNSW embedding vector_cosine_ops WITH (m = 16, ef_construction = 64)',
    )
  })

  it('withIndexExtras — with를 덮어쓰고, 빈 맵이면 키째 뺀다', () => {
    const base = { unique: false, expression: null, where: null, include: [] }
    expect(withIndexExtras(hnsw(), { ...base, with: { lists: '50' } }).with).toEqual({ lists: '50' })
    expect('with' in withIndexExtras(hnsw(), { ...base, with: {} })).toBe(false)
    expect('with' in withIndexExtras(hnsw(), base)).toBe(false)
  })

  it('버전 비교와 협업 diff가 WITH 변경을 알아챈다', () => {
    const from = vectorDoc([hnsw()])
    const to = applyChange(from, { type: 'index/set', tableId: 'T-d', indexes: [hnsw({ with: { m: '24', ef_construction: '64' } })] })
    const items = diffDocuments(from, to).items.filter((item) => item.kind === 'index')
    expect(items).toEqual([
      expect.objectContaining({ action: 'update', detail: 'HNSW embedding vector_cosine_ops WITH (m = 24, ef_construction = 64)' }),
    ])
    expect(deriveChanges(from, to)).toEqual([expect.objectContaining({ type: 'index/set', tableId: 'T-d' })])
  })
})

describe('DBMS 전환 — PostgreSQL이 아닌 대상', () => {
  it('VECTOR 컬럼은 맞지 않는 타입으로, 벡터 인덱스 종류와 WITH는 내지 못하는 기능으로 보고한다(값은 그대로)', () => {
    const doc = vectorDoc([hnsw()])
    const { document, report } = convertDocumentDbms(doc, 'postgresql', 'mysql')
    expect(report.unsupported).toEqual([{ tableName: 'documents', columnName: 'embedding', dataType: 'VECTOR' }])
    expect(report.typeChanges.map((change) => change.code)).not.toContain('VECTOR')
    expect(report.unsupportedIndexes).toEqual([
      { tableName: 'documents', indexName: 'ix_documents_embedding', features: ['HNSW', 'OPCLASS', 'WITH'] },
    ])
    expect(document.model.tables[0].columns[2]).toMatchObject({ dataType: 'VECTOR', length: 1536 })
    expect(document.model.tables[0].indexes[0]).toEqual(hnsw())
  })

  it('PostgreSQL 대상이면 보고하지 않는다', () => {
    const doc = vectorDoc([hnsw()])
    const { report } = convertDocumentDbms(doc, 'mysql', 'postgresql')
    expect(report.unsupported).toEqual([])
    expect(report.unsupportedIndexes).toEqual([])
  })
})

describe('DB 동기화 — WITH를 인덱스 정의의 일부로 맞춘다', () => {
  /** DB 측 documents — 컬럼 id는 문서와 다르다(물리명으로 맞춘다) */
  function dbDoc(indexes: ErdIndex[]): EditorDocument {
    const doc = vectorDoc()
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
            columns: table.columns.map((c) => ({ ...c, id: dbId(c.id) })),
            primaryKey: { name: 'documents_pk', columnIds: [dbId('C-id')] },
            indexes: indexes.map((ix) => ({ ...ix, columns: ix.columns.map((c) => ({ ...c, columnId: dbId(c.columnId) })) })),
          },
        ],
      },
    }
  }

  it('DB 벡터 인덱스를 with와 함께 들이고, 다시 돌리면 빈 diff다', () => {
    const current = vectorDoc()
    const first = diffSync(current, dbDoc([hnsw({ id: 'X' })]))
    expect(first.summary.items.filter((item) => item.kind === 'index').map((item) => item.action)).toEqual(['add'])
    const applied = applyChanges(current, first.changes)
    expect(applied.model.tables[0].indexes[0]).toMatchObject({ type: 'HNSW', with: { m: '16', ef_construction: '64' } })
    expect(diffSync(applied, dbDoc([hnsw({ id: 'X' })])).changes).toEqual([])
  })

  it('대소문자만 다르면 바꾸지 않고, 값이 다르면 DB 값으로 갱신한다', () => {
    const current = vectorDoc([hnsw()])
    expect(diffSync(current, dbDoc([hnsw({ id: 'X', with: { M: '16', ef_construction: '64' } })])).changes).toEqual([])
    const changed = diffSync(current, dbDoc([hnsw({ id: 'X', with: { m: '32', ef_construction: '64' } })]))
    expect(changed.summary.items).toEqual([expect.objectContaining({ kind: 'index', action: 'update', name: 'ix_documents_embedding' })])
    expect(applyChanges(current, changed.changes).model.tables[0].indexes[0].with).toEqual({ m: '32', ef_construction: '64' })
  })
})
