/**
 * 요구사항 — 상태 판정, 코드, 묶음, 연쇄 정리, 개정 번호 (docs 08-core/17-model-edit.md Section 2, 05-editor/02-ui.md Section 17)
 */
import { describe, expect, it } from 'vitest'
import { applyChange, createColumn, createTable } from '@/features/editor/model/changes'
import { deriveChanges } from '@/features/editor/model/collab-merge'
import { parseContent, serializeContent } from '@/features/editor/model/content-io'
import type { EditorDocument, ErdRequirement } from '@/features/editor/model/content-schema'
import { diffDocuments } from '@/features/editor/model/doc-diff'
import {
  countRequirementStates,
  groupRequirements,
  nextRequirementCode,
  requirementState,
  untracedTableIds,
} from '@/features/editor/model/requirements'

const requirement = (overrides: Partial<ErdRequirement> = {}): ErdRequirement => ({
  id: 'r1',
  code: 'REQ-001',
  areaId: null,
  scope: 'tables',
  title: '회원 가입',
  description: '',
  status: 'draft',
  revision: 1,
  appliedRevision: 0,
  tableIds: [],
  ...overrides,
})

function doc(requirements: ErdRequirement[] = []): EditorDocument {
  const users = createTable('users', { id: 't-users', columns: [createColumn({ id: 'c1', physicalName: 'id' })] })
  const orders = createTable('orders', { id: 't-orders', columns: [createColumn({ id: 'c2', physicalName: 'id' })] })
  return {
    model: { tables: [users, orders], relationships: [] },
    diagram: {
      nodes: {
        't-users': { x: 0, y: 0, width: null, color: 'default' },
        't-orders': { x: 500, y: 0, width: null, color: 'default' },
      },
      notes: [],
      areas: [
        { id: 'a-member', name: '회원', description: '', color: 'blue', tableIds: ['t-users'] },
        { id: 'a-order', name: '주문', description: '', color: 'green', tableIds: ['t-orders'] },
      ],
      requirements,
      viewport: null,
    },
  }
}

describe('requirementState', () => {
  it.each([
    [{ status: 'draft' }, 'DRAFT'],
    [{ status: 'confirmed', revision: 1, appliedRevision: 0 }, 'PENDING'],
    [{ status: 'confirmed', revision: 2, appliedRevision: 1, tableIds: ['t-users'] }, 'PENDING'],
    [{ status: 'confirmed', revision: 2, appliedRevision: 2, tableIds: ['t-users'] }, 'APPLIED'],
    [{ status: 'confirmed', revision: 1, appliedRevision: 1, tableIds: [] }, 'UNLINKED'],
    [{ status: 'dropped', tableIds: ['t-users'] }, 'LEFTOVER'],
    [{ status: 'dropped' }, 'DROPPED'],
    [{ scope: 'document', status: 'confirmed' }, 'APPLIED'],
    [{ scope: 'document', status: 'draft' }, 'DRAFT'],
    [{ scope: 'document', status: 'dropped' }, 'DROPPED'],
  ] as const)('%j → %s', (overrides, expected) => {
    expect(requirementState(requirement(overrides as Partial<ErdRequirement>))).toBe(expected)
  })
})

describe('코드와 묶음', () => {
  it('다음 코드는 가장 큰 번호 다음이다 — 빈 번호를 다시 쓰지 않는다', () => {
    expect(nextRequirementCode([])).toBe('REQ-001')
    expect(nextRequirementCode([requirement({ code: 'REQ-002' }), requirement({ id: 'r2', code: 'REQ-010' })])).toBe('REQ-011')
    expect(nextRequirementCode([requirement({ code: 'REQ-999' })])).toBe('REQ-1000')
  })

  it('그룹 순서대로 묶고 미분류와 공통이 뒤에 온다', () => {
    const groups = groupRequirements(
      doc([
        requirement({ id: 'r1', code: 'REQ-003', areaId: 'a-order' }),
        requirement({ id: 'r2', code: 'REQ-002', areaId: 'a-member' }),
        requirement({ id: 'r3', code: 'REQ-001', areaId: 'a-member' }),
        requirement({ id: 'r4', code: 'REQ-004' }),
        requirement({ id: 'r5', code: 'REQ-005', scope: 'document' }),
        requirement({ id: 'r6', code: 'REQ-006', areaId: 'gone' }),
      ]),
    )
    expect(groups.map((group) => [group.kind, group.name, group.requirements.map((r) => r.code)])).toEqual([
      ['area', '회원', ['REQ-001', 'REQ-002']],
      ['area', '주문', ['REQ-003']],
      ['unassigned', '', ['REQ-004', 'REQ-006']],
      ['document', '', ['REQ-005']],
    ])
  })

  it('판정별 수와 근거 없는 테이블', () => {
    const document = doc([
      requirement({ id: 'r1', status: 'confirmed', revision: 1, appliedRevision: 1, tableIds: ['t-users'] }),
      requirement({ id: 'r2', code: 'REQ-002', status: 'confirmed' }),
    ])
    expect(countRequirementStates(document.diagram.requirements)).toMatchObject({ APPLIED: 1, PENDING: 1, DRAFT: 0 })
    expect(untracedTableIds(document)).toEqual(['t-orders'])
  })
})

describe('문서 변경', () => {
  it('제목이나 내용을 고치면 개정 번호가 오른다 — 다른 항목은 오르지 않는다', () => {
    const base = doc([requirement({ status: 'confirmed', revision: 1, appliedRevision: 1, tableIds: ['t-users'] })])
    const retitled = applyChange(base, { type: 'requirement/patch', requirementId: 'r1', patch: { title: '회원 가입과 탈퇴' } }, 'mysql')
    expect(retitled.diagram.requirements[0]).toMatchObject({ revision: 2, appliedRevision: 1 })
    expect(requirementState(retitled.diagram.requirements[0])).toBe('PENDING')

    const moved = applyChange(base, { type: 'requirement/patch', requirementId: 'r1', patch: { areaId: 'a-member', status: 'dropped' } }, 'mysql')
    expect(moved.diagram.requirements[0].revision).toBe(1)

    // 반영함으로 표시 — appliedRevision을 revision에 맞춘다
    const applied = applyChange(retitled, { type: 'requirement/patch', requirementId: 'r1', patch: { appliedRevision: 2 } }, 'mysql')
    expect(requirementState(applied.diagram.requirements[0])).toBe('APPLIED')
  })

  it('테이블을 지우면 연결에서 빠지고, 그룹을 지우면 미분류가 된다', () => {
    const base = doc([requirement({ areaId: 'a-member', tableIds: ['t-users', 't-orders'] })])
    const withoutTable = applyChange(base, { type: 'table/remove', tableId: 't-users' }, 'mysql')
    expect(withoutTable.diagram.requirements[0].tableIds).toEqual(['t-orders'])

    const withoutArea = applyChange(base, { type: 'area/remove', areaId: 'a-member' }, 'mysql')
    expect(withoutArea.diagram.requirements[0].areaId).toBeNull()
  })

  it('추가와 삭제', () => {
    const added = applyChange(doc(), { type: 'requirement/create', requirement: requirement() }, 'mysql')
    expect(added.diagram.requirements).toHaveLength(1)
    const removed = applyChange(added, { type: 'requirement/remove', requirementId: 'r1' }, 'mysql')
    expect(removed.diagram.requirements).toEqual([])
  })
})

describe('저장과 비교', () => {
  it('요구사항은 저장하고 다시 열어도 남는다 — 요구사항이 없는 예전 문서는 빈 배열로 연다', () => {
    const document = doc([requirement({ tableIds: ['t-users'] })])
    const reopened = parseContent(serializeContent({ schemaVersion: 1, ...document }))
    expect(reopened.diagram.requirements).toEqual(document.diagram.requirements)

    const legacy = JSON.parse(serializeContent({ schemaVersion: 1, ...doc() })) as { diagram: Record<string, unknown> }
    delete legacy.diagram.requirements
    expect(parseContent(JSON.stringify(legacy)).diagram.requirements).toEqual([])
  })

  it('버전 비교는 요구사항 변경을 requirement 종류로 보여 주고 레이아웃 변경으로 치지 않는다', () => {
    const from = doc([requirement(), requirement({ id: 'r2', code: 'REQ-002', title: '주문' })])
    const to: EditorDocument = {
      ...from,
      diagram: {
        ...from.diagram,
        requirements: [requirement({ title: '회원 가입과 탈퇴', revision: 2 }), requirement({ id: 'r3', code: 'REQ-003', title: '결제' })],
      },
    }
    const diff = diffDocuments(from, to)
    expect(diff.items.map((item) => [item.kind, item.action, item.name])).toEqual([
      ['requirement', 'update', 'REQ-001'],
      ['requirement', 'remove', 'REQ-002'],
      ['requirement', 'add', 'REQ-003'],
    ])
    expect(diff.layoutOnly).toBe(false)
  })

  it('서버 본문을 따라가는 변경을 만들면 그대로 적용했을 때 서버 본문과 같아진다', () => {
    const mine = doc([requirement(), requirement({ id: 'r2', code: 'REQ-002', title: '주문' })])
    const server = doc([
      requirement({ title: '회원 가입과 탈퇴', revision: 2, status: 'confirmed', tableIds: ['t-users'] }),
      requirement({ id: 'r3', code: 'REQ-003', title: '결제', areaId: 'a-order' }),
    ])
    const merged = deriveChanges(mine, server).reduce((acc, change) => applyChange(acc, change, 'mysql'), mine)
    expect(merged.diagram.requirements).toEqual(server.diagram.requirements)
  })
})
