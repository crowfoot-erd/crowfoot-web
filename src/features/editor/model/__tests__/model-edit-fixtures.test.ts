/**
 * 규칙 일치 시험 — 문서 편집 API(MCP)가 만드는 본체와 에디터가 만드는 본체가 같은지 본다
 * (docs 08-core/17-model-edit.md Section 6)
 *
 * 자료의 원천은 docs 리포의 assets/model-edit-fixtures/ 이고 이 폴더(model-edit-fixtures/)는 사본이다.
 * 사본이 원천과 같은지는 core의 ModelEditFixtureTest가 본다(세 리포가 나란히 있는 로컬에서).
 * `expected`는 core의 편집 엔진이 만든 본체다(id는 이름 기반 자리 표시). 여기서는
 *  1. 그 본체가 에디터 스키마(parseContent)를 통과하는지 — 통과하지 못하면 에디터가 문서를 열지 못한다
 *  2. 같은 요청을 에디터 코드(테이블 생성, 기본 키 토글, 관계 생성…)로 했을 때 같은 본체가 나오는지
 * 를 본다. 에디터의 규칙을 바꿔 이 테스트가 깨지면 자료와 core의 DocumentEditor를 함께 고친다.
 */
import { describe, expect, it } from 'vitest'

import {
  applyChange,
  applyChanges,
  createArea,
  createColumn,
  createTable,
  newId,
  pkToggleChanges,
} from '@/features/editor/model/changes'
import { emptyContent, parseContent } from '@/features/editor/model/content-io'
import type { EditorDocument, ErdContent, ErdTable } from '@/features/editor/model/content-schema'
import { defaultKeyName } from '@/features/editor/model/keys'
import { LOGICAL_NAME_SEPARATOR } from '@/features/editor/model/logical-name'
import { buildRelationship } from '@/features/editor/model/relationship'
import { nextRequirementCode, requirementState } from '@/features/editor/model/requirements'

/** 이 리포의 사본(파일 이름 → 원문) */
const COPY = byFileName(import.meta.glob('./model-edit-fixtures/*.json', { eager: true, query: '?raw', import: 'default' }))
function byFileName(modules: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(modules).map(([path, text]) => [path.split('/').pop() ?? path, text as string]))
}

type Json = Record<string, unknown>
interface ColumnItem { physicalName: string; logicalName?: string; description?: string; dataType: string; length?: number; precision?: number; scale?: number; nullable?: boolean; defaultValue?: string; autoIncrement?: boolean }
interface TableItem { physicalName: string; logicalName?: string; description?: string; columns?: ColumnItem[]; primaryKey?: string[]; uniques?: { name?: string; columns: string[] }[]; indexes?: { name?: string; columns: { name: string; order?: 'ASC' | 'DESC' }[] }[] }
interface RelationshipItem { parent: string; child: string; type?: 'ONE_TO_ONE' | 'ONE_TO_MANY'; identifying?: boolean; parentMultiplicity?: 'EXACTLY_ONE' | 'ZERO_OR_ONE'; childMultiplicity?: 'ZERO_OR_ONE' | 'EXACTLY_ONE' | 'ZERO_OR_MORE' | 'ONE_OR_MORE'; onDelete?: string; onUpdate?: string }
interface AreaItem { name: string; color?: string; description?: string; tables?: string[] }
interface RequirementItem { title: string; description?: string; status?: 'draft' | 'confirmed' | 'dropped'; scope?: 'tables' | 'document'; domain?: string; tables?: string[] }
interface Fixture {
  name: string
  databaseType: string
  editorComparable: boolean
  before: unknown
  steps: { operation: 'schema' | 'requirements' | 'remove'; request: { tables?: TableItem[]; relationships?: RelationshipItem[]; areas?: AreaItem[]; items?: RequirementItem[] } }[]
  expected: unknown
}

const files = Object.keys(COPY).sort()
const load = (file: string): Fixture => JSON.parse(COPY[file]) as Fixture

/** 이름과 설명을 한 칸에 담는 에디터의 표기(논리명-----설명) */
const logical = (name?: string, description?: string) =>
  description ? `${name ?? ''}${LOGICAL_NAME_SEPARATOR}${description}` : (name ?? '')

/** 자료의 요청을 에디터 코드로 실행한다 — 사용자가 화면에서 하는 조작의 순서 그대로 */
function runWithEditor(fixture: Fixture): EditorDocument {
  const base = emptyContent()
  let doc: EditorDocument = { model: base.model, diagram: base.diagram }
  const db = fixture.databaseType
  const tableOf = (name: string): ErdTable => {
    const found = doc.model.tables.find((table) => table.physicalName === name)
    if (!found) throw new Error(`테이블 없음: ${name}`)
    return found
  }
  const columnId = (table: string, column: string): string => {
    const found = tableOf(table).columns.find((c) => c.physicalName === column)
    if (!found) throw new Error(`컬럼 없음: ${table}.${column}`)
    return found.id
  }

  for (const step of fixture.steps) {
    if (step.operation === 'schema') {
      for (const item of step.request.tables ?? []) {
        const table = createTable(item.physicalName, {
          logicalName: logical(item.logicalName, item.description),
          columns: (item.columns ?? []).map((c) =>
            createColumn({
              physicalName: c.physicalName,
              logicalName: logical(c.logicalName, c.description),
              dataType: c.dataType,
              length: c.length ?? null,
              precision: c.precision ?? null,
              scale: c.scale ?? null,
              nullable: c.nullable ?? true,
              defaultValue: c.defaultValue ?? null,
              autoIncrement: c.autoIncrement ?? false,
            }),
          ),
        })
        doc = applyChange(doc, { type: 'table/create', table, position: { x: 0, y: 0 } }, db)
        // 기본 키 — 컬럼의 열쇠를 차례로 켠다. 자동 증가는 열쇠를 켠 뒤에 남아 있어야 하므로 다시 맞춘다
        for (const name of item.primaryKey ?? []) {
          doc = applyChanges(doc, pkToggleChanges(tableOf(item.physicalName), columnId(item.physicalName, name), true), db)
        }
        for (const c of item.columns ?? []) {
          if (c.autoIncrement && (item.primaryKey ?? []).length === 1) {
            doc = applyChange(doc, { type: 'column/patch', tableId: tableOf(item.physicalName).id, columnId: columnId(item.physicalName, c.physicalName), patch: { autoIncrement: true } }, db)
          }
        }
        for (const unique of item.uniques ?? []) {
          const current = tableOf(item.physicalName)
          const columns = unique.columns.map((name) => current.columns.find((c) => c.physicalName === name)!)
          doc = applyChange(doc, {
            type: 'uniqueKey/set',
            tableId: current.id,
            uniques: [...current.uniques, { id: newId(), name: unique.name ?? defaultKeyName(doc.model, current, 'unique', columns), columnIds: columns.map((c) => c.id) }],
          }, db)
        }
        for (const index of item.indexes ?? []) {
          const current = tableOf(item.physicalName)
          const columns = index.columns.map((entry) => current.columns.find((c) => c.physicalName === entry.name)!)
          doc = applyChange(doc, {
            type: 'index/set',
            tableId: current.id,
            indexes: [
              ...current.indexes,
              {
                id: newId(),
                name: index.name ?? defaultKeyName(doc.model, current, 'index', columns),
                columns: index.columns.map((entry, i) => ({ columnId: columns[i].id, order: entry.order ?? 'ASC' })),
              },
            ],
          }, db)
        }
      }
      for (const item of step.request.relationships ?? []) {
        const type = item.type ?? 'ONE_TO_MANY'
        const built = buildRelationship({
          parentTable: tableOf(item.parent),
          childTable: tableOf(item.child),
          type,
          identifying: item.identifying ?? false,
          parentMultiplicity: item.parentMultiplicity ?? 'EXACTLY_ONE',
          childMultiplicity: item.childMultiplicity ?? (type === 'ONE_TO_ONE' ? 'ZERO_OR_ONE' : 'ZERO_OR_MORE'),
          onDelete: item.onDelete as never,
          onUpdate: item.onUpdate as never,
        })
        if (!built.ok) throw new Error(`관계를 만들 수 없다: ${item.parent} → ${item.child}`)
        doc = applyChange(doc, { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns }, db)
      }
      for (const item of step.request.areas ?? []) {
        doc = applyChange(doc, {
          type: 'area/create',
          area: createArea(item.name, { color: (item.color ?? 'default') as never, description: item.description ?? '', tableIds: (item.tables ?? []).map((name) => tableOf(name).id) }),
        }, db)
      }
    } else if (step.operation === 'requirements') {
      for (const item of step.request.items ?? []) {
        const id = newId()
        doc = applyChange(doc, {
          type: 'requirement/create',
          requirement: {
            id,
            code: nextRequirementCode(doc.diagram.requirements),
            areaId: item.domain ? (doc.diagram.areas.find((area) => area.name === item.domain)?.id ?? null) : null,
            scope: item.scope ?? 'tables',
            title: item.title,
            description: item.description ?? '',
            status: item.status ?? 'draft',
            revision: 1,
            appliedRevision: 0,
            tableIds: (item.tables ?? []).map((name) => tableOf(name).id),
          },
        }, db)
        // 편집 API는 테이블을 연결하며 등록한 확정 요구사항을 반영된 것으로 둔다 — 화면에서는 "반영함으로 표시"다
        const created = doc.diagram.requirements.find((r) => r.id === id)!
        if (requirementState(created) === 'PENDING' && created.tableIds.length > 0) {
          doc = applyChange(doc, { type: 'requirement/patch', requirementId: id, patch: { appliedRevision: created.revision } }, db)
        }
      }
    } else {
      throw new Error('삭제 요청은 에디터 코드로 견주지 않는다')
    }
  }
  return doc
}

/** id를 이름 기반 자리 표시로 바꾼다 — core의 ModelEditFixtureTest.normalize와 같은 규칙 */
function normalize(content: ErdContent): unknown {
  const ids = new Map<string, string>()
  for (const table of content.model.tables) {
    ids.set(table.id, `T:${table.physicalName}`)
    for (const column of table.columns) ids.set(column.id, `C:${table.physicalName}.${column.physicalName}`)
    for (const unique of table.uniques) ids.set(unique.id, `U:${unique.name}`)
    for (const index of table.indexes) ids.set(index.id, `I:${index.name}`)
  }
  for (const relationship of content.model.relationships) ids.set(relationship.id, `R:${relationship.fkName}`)
  for (const area of content.diagram.areas) ids.set(area.id, `A:${area.name}`)
  for (const requirement of content.diagram.requirements) ids.set(requirement.id, `Q:${requirement.code}`)
  const replace = (node: unknown): unknown => {
    if (typeof node === 'string') return ids.get(node) ?? node
    if (Array.isArray(node)) return node.map(replace)
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node as Json).map(([key, value]) => [ids.get(key) ?? key, replace(value)]))
    }
    return node
  }
  return replace(content)
}

/** 견줄 부분 — 모델과 그룹, 요구사항. 위치(nodes)는 편집 API가 만들지 않고 에디터가 열 때 채운다 */
function comparable(content: ErdContent): unknown {
  const parsed = parseContent(JSON.stringify(normalize(content)))
  return { model: parsed.model, areas: parsed.diagram.areas, requirements: parsed.diagram.requirements }
}

describe('문서 편집 규칙 일치 시험', () => {
  it('자료가 있다', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  it.each(files)('%s — 기대 본체를 에디터가 연다', (file: string) => {
    const fixture = load(file)
    const parsed = parseContent(JSON.stringify(fixture.expected))
    // 스키마가 모르는 키를 지우지 않는다 — 열고 저장해도 편집 API가 쓴 내용이 남는다
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(fixture.expected)
  })

  it.each(files.filter((file) => load(file).editorComparable))('%s — 에디터 코드로 만든 본체와 같다', (file: string) => {
    const fixture = load(file)
    const built = runWithEditor(fixture)
    const expected = parseContent(JSON.stringify(fixture.expected))
    expect(comparable({ schemaVersion: 1, ...built })).toEqual(comparable(expected))
  })
})
