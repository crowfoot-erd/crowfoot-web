/**
 * 도메인 타입과 컬럼 — 적용·다르게 쓰기·전파 (05-editor/01-core.md §11.1)
 */
import { describe, expect, it } from 'vitest'

import type { DomainType } from '@/features/domain-types/api'
import { applyChanges, createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent, parseContent, serializeContent } from '@/features/editor/model/content-io'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import {
  applyDomainPatch,
  buildPropagationChanges,
  domainUsage,
  findStaleColumns,
  linkFor,
  linkStatus,
} from '@/features/editor/model/domain-type'

const email = (overrides: Partial<DomainType> = {}): DomainType => ({
  domainTypeId: '11',
  workspaceId: '7',
  name: '이메일',
  dataType: 'VARCHAR',
  length: 191,
  precision: null,
  scale: null,
  nullable: false,
  defaultValue: null,
  description: null,
  version: 1,
  updatedAt: '2026-10-02T00:00:00Z',
  ...overrides,
})

/** users(PK id, email, backup_email) */
function fixture(): EditorDocument {
  const users = createTable('users', {
    id: 't-users',
    columns: [
      createColumn({ id: 'c-id', physicalName: 'id', dataType: 'BIGINT', nullable: false }),
      createColumn({ id: 'c-email', physicalName: 'email', dataType: 'TEXT', nullable: true }),
      createColumn({ id: 'c-backup', physicalName: 'backup_email', dataType: 'TEXT', nullable: true }),
    ],
    primaryKey: { name: 'users_pk', columnIds: ['c-id'] },
  })
  const base = emptyContent()
  return applyChanges({ model: base.model, diagram: base.diagram }, [{ type: 'table/create', table: users, position: { x: 0, y: 0 } }])
}

const users = (doc: EditorDocument) => doc.model.tables[0]
const column = (doc: EditorDocument, id: string) => users(doc).columns.find((c) => c.id === id)!

/** 두 컬럼에 도메인 타입을 적용한 문서 */
function applied(domainType = email()): EditorDocument {
  const doc = fixture()
  return applyChanges(doc, [
    { type: 'column/patch', tableId: 't-users', columnId: 'c-email', patch: applyDomainPatch(domainType, users(doc), 'c-email') },
    { type: 'column/patch', tableId: 't-users', columnId: 'c-backup', patch: applyDomainPatch(domainType, users(doc), 'c-backup') },
  ])
}

describe('적용', () => {
  it('다루는 속성이 도메인 타입의 값으로 바뀌고 연결이 기록된다', () => {
    const doc = applied()

    expect(column(doc, 'c-email')).toMatchObject({
      dataType: 'VARCHAR',
      length: 191,
      nullable: false,
      domain: { id: '11', name: '이메일', version: 1, overrides: [] },
    })
    expect(linkStatus(column(doc, 'c-email'), [email()])).toBe('synced')
    expect(domainUsage(doc).get('11')).toBe(2)
  })

  it('기본 키 컬럼은 nullable을 따르지 않는다', () => {
    const doc = fixture()
    const patch = applyDomainPatch(email({ dataType: 'BIGINT', length: null, nullable: true }), users(doc), 'c-id')

    expect(patch).not.toHaveProperty('nullable')
    expect(patch.dataType).toBe('BIGINT')
  })

  it('연결 정보는 저장하고 다시 읽어도 그대로다 — 연결이 없는 컬럼은 예전 문서와 같다', () => {
    const doc = applied()
    const reread = parseContent(serializeContent({ schemaVersion: 1, model: doc.model, diagram: doc.diagram }))

    expect(reread.model.tables[0].columns[1].domain).toEqual({ id: '11', name: '이메일', version: 1, overrides: [] })
    expect(reread.model.tables[0].columns[0].domain ?? null).toBeNull()
  })
})

describe('다르게 쓰기', () => {
  it('도메인 타입이 다루는 속성을 직접 고치면 overrides에 들어간다 — 다루지 않는 속성은 아니다', () => {
    let doc = applied()
    doc = applyChanges(doc, [
      { type: 'column/patch', tableId: 't-users', columnId: 'c-email', patch: { length: 320, comment: '로그인 주소' } },
    ])

    expect(column(doc, 'c-email').domain?.overrides).toEqual(['length'])
    expect(linkStatus(column(doc, 'c-email'), [email()])).toBe('overridden')
    // 같은 값으로 "고친" 것은 다르게 쓰기가 아니다
    doc = applyChanges(doc, [{ type: 'column/patch', tableId: 't-users', columnId: 'c-backup', patch: { length: 191 } }])
    expect(column(doc, 'c-backup').domain?.overrides).toEqual([])
  })

  it('폼에서 고른 값으로 연결 정보를 만들면 도메인 타입과 다른 속성이 overrides가 된다', () => {
    const link = linkFor(
      email(),
      { dataType: 'VARCHAR', length: 320, precision: null, scale: null, nullable: true, defaultValue: null },
      ['dataType', 'length', 'precision', 'scale', 'nullable', 'defaultValue'],
    )
    expect(link).toEqual({ id: '11', name: '이메일', version: 1, overrides: ['length', 'nullable'] })
  })

  it('연결을 풀면 값은 그대로다', () => {
    const doc = applyChanges(applied(), [{ type: 'column/patch', tableId: 't-users', columnId: 'c-email', patch: { domain: null } }])

    expect(column(doc, 'c-email').domain).toBeNull()
    expect(column(doc, 'c-email')).toMatchObject({ dataType: 'VARCHAR', length: 191 })
    expect(linkStatus(column(doc, 'c-email'), [email()])).toBe('none')
  })
})

describe('전파', () => {
  /** email은 길이를 다르게 쓴다. 도메인 타입은 길이 191→255, 기본값 추가로 버전 2가 됐다 */
  function staleDoc() {
    const doc = applyChanges(applied(), [
      { type: 'column/patch', tableId: 't-users', columnId: 'c-email', patch: { length: 320 } },
    ])
    const next = email({ version: 2, length: 255, defaultValue: "''" })
    return { doc, next, stale: findStaleColumns(doc, [next]) }
  }

  it('맞춘 버전보다 새로운 도메인 타입을 쓰는 컬럼을 찾는다 — 다르게 쓰는 속성은 건너뜀으로 표시한다', () => {
    const { doc, next, stale } = staleDoc()

    expect(stale.map((item) => item.key)).toEqual(['t-users/c-email', 't-users/c-backup'])
    expect(stale[0].changes).toEqual([
      { field: 'length', from: 320, to: 255, skipped: true },
      { field: 'defaultValue', from: null, to: "''", skipped: false },
    ])
    expect(stale[1].changes).toEqual([
      { field: 'length', from: 191, to: 255, skipped: false },
      { field: 'defaultValue', from: null, to: "''", skipped: false },
    ])
    expect(linkStatus(column(doc, 'c-email'), [next])).toBe('stale')
    // 버전이 같으면 묻지 않는다
    expect(findStaleColumns(doc, [email()])).toEqual([])
  })

  it('전파한다 — 다르게 쓰지 않는 속성만 바뀌고 버전이 오른다', () => {
    const { doc, next, stale } = staleDoc()
    const after = applyChanges(doc, buildPropagationChanges(stale, new Set(stale.map((item) => item.key))))

    expect(column(after, 'c-email')).toMatchObject({ length: 320, defaultValue: "''", domain: { version: 2, overrides: ['length'] } })
    expect(column(after, 'c-backup')).toMatchObject({ length: 255, defaultValue: "''", domain: { version: 2, overrides: [] } })
    expect(findStaleColumns(after, [next])).toEqual([])
  })

  it('전파하지 않는다 — 값은 그대로 두고 달라진 속성을 overrides에 넣어 다시 묻지 않는다', () => {
    const { doc, next, stale } = staleDoc()
    const after = applyChanges(doc, buildPropagationChanges(stale, new Set()))

    expect(column(after, 'c-backup')).toMatchObject({ length: 191, defaultValue: null, domain: { version: 2, overrides: ['length', 'defaultValue'] } })
    expect(findStaleColumns(after, [next])).toEqual([])
    expect(linkStatus(column(after, 'c-backup'), [next])).toBe('overridden')
  })

  it('일부만 고를 수 있다', () => {
    const { doc, stale } = staleDoc()
    const after = applyChanges(doc, buildPropagationChanges(stale, new Set(['t-users/c-backup'])))

    expect(column(after, 'c-backup').length).toBe(255)
    expect(column(after, 'c-email').defaultValue).toBeNull()
    expect(column(after, 'c-email').domain?.overrides).toEqual(['length', 'defaultValue'])
  })

  it('이름만 바뀐 도메인 타입은 값 변경 없이 연결의 이름과 버전만 맞춘다', () => {
    const doc = applied()
    const renamed = email({ version: 2, name: '이메일 주소' })
    const stale = findStaleColumns(doc, [renamed])
    expect(stale[0].changes).toEqual([])

    const after = applyChanges(doc, buildPropagationChanges(stale, new Set(stale.map((item) => item.key))))
    expect(column(after, 'c-email').domain).toEqual({ id: '11', name: '이메일 주소', version: 2, overrides: [] })
  })

  it('목록에 없는 도메인 타입은 끊긴 연결이다 — 전파 대상이 아니다. 목록을 읽지 못했으면 끊김으로 보지 않는다', () => {
    const doc = applied()

    expect(linkStatus(column(doc, 'c-email'), [])).toBe('missing')
    expect(findStaleColumns(doc, [])).toEqual([])
    expect(linkStatus(column(doc, 'c-email'), undefined)).toBe('synced')
  })
})
