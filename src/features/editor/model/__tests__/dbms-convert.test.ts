/**
 * 대상 DBMS 전환 — 변환 규칙과 검사 결과 (05-editor/04-dbms-engineering.md §3.5)
 */
import { describe, expect, it } from 'vitest'

import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import type { EditorDocument, ErdRelationship, ErdTable } from '@/features/editor/model/content-schema'
import { convertDocumentDbms, hasDbmsTemplate } from '@/features/editor/model/dbms-convert'

function documentOf(tables: ErdTable[], relationships: ErdRelationship[] = []): EditorDocument {
  const base = emptyContent()
  return { model: { ...base.model, tables, relationships }, diagram: base.diagram }
}

function rel(init: Partial<ErdRelationship>): ErdRelationship {
  return {
    id: 'r1',
    name: 'fk',
    parentTableId: 'parent',
    childTableId: 'child',
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'EXACTLY_ONE',
    childMultiplicity: 'ONE_OR_MORE',
    fkName: 'fk_child_parent',
    columnMappings: [],
    onDelete: 'NO_ACTION',
    onUpdate: 'NO_ACTION',
    ...init,
  }
}

/** 부모(member)·자식(orders) + 비식별 1:N — 자식 FK 컬럼에는 인덱스가 없다(MySQL 문서의 모습) */
function parentChild(): { doc: EditorDocument; child: ErdTable } {
  const parentId = createColumn({ id: 'p-id', physicalName: 'id', dataType: 'BIGINT', nullable: false })
  const parent = createTable('member', {
    id: 'parent',
    columns: [parentId],
    primaryKey: { name: 'member_pk', columnIds: ['p-id'] },
  })
  const childId = createColumn({ id: 'c-id', physicalName: 'id', dataType: 'BIGINT', nullable: false })
  const fk = createColumn({ id: 'c-fk', physicalName: 'member_id', dataType: 'BIGINT', nullable: false })
  const child = createTable('orders', {
    id: 'child',
    columns: [childId, fk],
    primaryKey: { name: 'orders_pk', columnIds: ['c-id'] },
  })
  const relationship = rel({ columnMappings: [{ parentColumnId: 'p-id', childColumnId: 'c-fk' }] })
  return { doc: documentOf([parent, child], [relationship]), child }
}

describe('convertDocumentDbms — 컬럼 타입', () => {
  it('공용 타입 코드는 그대로 두고, 표기가 바뀌는 타입을 코드별로 보고한다', () => {
    const table = createTable('event', {
      columns: [
        createColumn({ physicalName: 'a', dataType: 'DATETIME' }),
        createColumn({ physicalName: 'b', dataType: 'DATETIME' }),
        createColumn({ physicalName: 'c', dataType: 'VARCHAR', length: 100 }),
        createColumn({ physicalName: 'd', dataType: 'BOOLEAN' }),
      ],
    })
    const { document, report } = convertDocumentDbms(documentOf([table]), 'mysql', 'postgresql')

    // 저장 값(공용 코드·길이)은 바뀌지 않는다
    expect(document.model.tables[0].columns.map((c) => c.dataType)).toEqual([
      'DATETIME',
      'DATETIME',
      'VARCHAR',
      'BOOLEAN',
    ])
    expect(document.model.tables[0].columns[2].length).toBe(100)
    // MySQL DATETIME → PostgreSQL TIMESTAMP(2컬럼), MySQL TINYINT(1) → PostgreSQL BOOLEAN(1컬럼). VARCHAR는 같다
    expect(report.typeChanges).toEqual([
      { code: 'BOOLEAN', fromType: 'TINYINT(1)', toType: 'BOOLEAN', columnCount: 1 },
      { code: 'DATETIME', fromType: 'DATETIME', toType: 'TIMESTAMP', columnCount: 2 },
    ])
    expect(report.normalized).toEqual([])
    expect(report.unsupported).toEqual([])
  })

  it('원본 방언 표기는 공용 코드로 정리하고 길이·정밀도를 옮긴다', () => {
    const table = createTable('account', {
      columns: [
        createColumn({ physicalName: 'no', dataType: 'INTEGER' }), // PostgreSQL 표기 → INT
        createColumn({ physicalName: 'amount', dataType: 'DECIMAL(15,2)' }),
        createColumn({ physicalName: 'memo', dataType: 'VARCHAR', length: 50 }),
      ],
    })
    const { document, report } = convertDocumentDbms(documentOf([table]), 'postgresql', 'mysql')
    const [no, amount, memo] = document.model.tables[0].columns

    expect(no.dataType).toBe('INT')
    expect(amount).toMatchObject({ dataType: 'DECIMAL', precision: 15, scale: 2 })
    expect(memo).toMatchObject({ dataType: 'VARCHAR', length: 50 })
    expect(report.normalized).toEqual([
      { tableName: 'account', columnName: 'no', from: 'INTEGER', to: 'INT' },
      { tableName: 'account', columnName: 'amount', from: 'DECIMAL(15,2)', to: 'DECIMAL' },
    ])
  })

  it('타입 값에 인자가 없으면 컬럼에 있던 길이를 지킨다', () => {
    const table = createTable('t', {
      columns: [createColumn({ physicalName: 'code', dataType: 'VARCHAR2', length: 20 })], // Oracle 표기
    })
    const { document, report } = convertDocumentDbms(documentOf([table]), 'oracle', 'mysql')
    expect(document.model.tables[0].columns[0]).toMatchObject({ dataType: 'VARCHAR', length: 20 })
    expect(report.normalized).toEqual([{ tableName: 't', columnName: 'code', from: 'VARCHAR2', to: 'VARCHAR' }])
  })

  it('해석하지 못한 타입 값은 그대로 두고 경고로 보고한다', () => {
    const table = createTable('place', {
      columns: [
        createColumn({ physicalName: 'geo', dataType: 'GEOMETRY' }),
        createColumn({ physicalName: 'name', dataType: 'VARCHAR', length: 30 }),
      ],
    })
    const { document, report } = convertDocumentDbms(documentOf([table]), 'mysql', 'postgresql')

    expect(document.model.tables[0].columns[0].dataType).toBe('GEOMETRY')
    expect(report.unsupported).toEqual([{ tableName: 'place', columnName: 'geo', dataType: 'GEOMETRY' }])
    expect(report.normalized).toEqual([])
  })
})

describe('convertDocumentDbms — FK 인덱스 정책', () => {
  it('대상이 FK 인덱스를 자동으로 만들지 않으면 비식별 1:N의 FK 인덱스를 보충한다', () => {
    const { doc } = parentChild()
    const { document, report } = convertDocumentDbms(doc, 'mysql', 'postgresql')
    const orders = document.model.tables.find((t) => t.id === 'child')!

    expect(orders.indexes).toHaveLength(1)
    expect(orders.indexes[0].columns).toEqual([{ columnId: 'c-fk', order: 'ASC' }])
    expect(orders.indexes[0].name).toBe('idx_orders_member_id')
    expect(report.addedIndexes).toEqual([
      { tableName: 'orders', indexName: 'idx_orders_member_id', columnNames: ['member_id'] },
    ])
  })

  it('FK 선두 컬럼을 덮는 인덱스가 이미 있으면 보충하지 않는다', () => {
    const { doc } = parentChild()
    const withIndex: EditorDocument = {
      ...doc,
      model: {
        ...doc.model,
        tables: doc.model.tables.map((t) =>
          t.id === 'child'
            ? { ...t, indexes: [{ id: 'ix1', name: 'idx_mine', columns: [{ columnId: 'c-fk', order: 'ASC' as const }], type: 'BTREE', parser: null }] }
            : t,
        ),
      },
    }
    const { document, report } = convertDocumentDbms(withIndex, 'mysql', 'postgresql')

    expect(document.model.tables.find((t) => t.id === 'child')!.indexes).toHaveLength(1)
    expect(report.addedIndexes).toEqual([])
  })

  it('대상이 FK 인덱스를 자동으로 만드는 DBMS면 보충하지 않고, 기존 인덱스도 지우지 않는다', () => {
    const { doc } = parentChild()
    const withIndex: EditorDocument = {
      ...doc,
      model: {
        ...doc.model,
        tables: doc.model.tables.map((t) =>
          t.id === 'child'
            ? { ...t, indexes: [{ id: 'ix1', name: 'idx_orders_member_id', columns: [{ columnId: 'c-fk', order: 'ASC' as const }], type: 'BTREE', parser: null }] }
            : t,
        ),
      },
    }
    const toMysql = convertDocumentDbms(withIndex, 'postgresql', 'mysql')
    expect(toMysql.document.model.tables.find((t) => t.id === 'child')!.indexes).toHaveLength(1)
    expect(toMysql.report.addedIndexes).toEqual([])

    const plain = convertDocumentDbms(parentChild().doc, 'postgresql', 'mysql')
    expect(plain.document.model.tables.find((t) => t.id === 'child')!.indexes).toHaveLength(0)
  })

  it('식별 관계와 1:1 관계에는 인덱스를 보충하지 않는다', () => {
    const { doc } = parentChild()
    const identifying: EditorDocument = {
      ...doc,
      model: { ...doc.model, relationships: [{ ...doc.model.relationships[0], identifying: true }] },
    }
    const oneToOne: EditorDocument = {
      ...doc,
      model: { ...doc.model, relationships: [{ ...doc.model.relationships[0], type: 'ONE_TO_ONE' }] },
    }
    expect(convertDocumentDbms(identifying, 'mysql', 'postgresql').report.addedIndexes).toEqual([])
    expect(convertDocumentDbms(oneToOne, 'mysql', 'postgresql').report.addedIndexes).toEqual([])
  })
})

describe('convertDocumentDbms — 그 밖', () => {
  it('원본 문서를 바꾸지 않는다', () => {
    const { doc } = parentChild()
    const snapshot = JSON.stringify(doc)
    convertDocumentDbms(doc, 'mysql', 'postgresql')
    expect(JSON.stringify(doc)).toBe(snapshot)
  })

  it('테이블·관계·배치의 id와 개수는 그대로다', () => {
    const { doc } = parentChild()
    const { document } = convertDocumentDbms(doc, 'mysql', 'postgresql')
    expect(document.model.tables.map((t) => t.id)).toEqual(doc.model.tables.map((t) => t.id))
    expect(document.model.relationships).toEqual(doc.model.relationships)
    expect(document.diagram).toBe(doc.diagram)
  })
})

describe('hasDbmsTemplate', () => {
  it('에디터에 타입 템플릿이 있는 코드만 전환 대상이 된다', () => {
    expect(hasDbmsTemplate('mysql')).toBe(true)
    expect(hasDbmsTemplate('postgresql')).toBe(true)
    expect(hasDbmsTemplate('mariadb')).toBe(false)
  })
})
