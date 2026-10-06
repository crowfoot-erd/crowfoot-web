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
  matchesRequirement,
  nextRequirementCode,
  requirementDomains,
  requirementState,
  requirementsToCsv,
  requirementsToMarkdown,
  untracedTableIds,
  type RequirementExportLabels,
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
      validationExceptions: [],
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

describe('도메인별 정리', () => {
  const sample = () =>
    doc([
      requirement({ id: 'r1', code: 'REQ-001', areaId: 'a-member', title: '가입', description: '이메일은 중복될 수 없다', status: 'confirmed', appliedRevision: 1, tableIds: ['t-users'] }),
      requirement({
        id: 'r2',
        code: 'REQ-002',
        areaId: 'a-member',
        title: '탈퇴',
        status: 'confirmed',
        criteria: [
          { id: 'k1', text: '탈퇴한 회원은 로그인할 수 없다', done: true },
          { id: 'k2', text: '주문 기록은 남는다', done: false },
        ],
      }),
      requirement({ id: 'r3', code: 'REQ-003', areaId: 'a-member', title: '휴면', status: 'dropped' }),
      requirement({ id: 'r4', code: 'REQ-004', scope: 'document', title: '생성 시각', status: 'confirmed' }),
    ])

  it('도메인마다 요구사항, 진행, 근거 없는 테이블을 모은다 — 요구사항이 없는 그룹도 넣는다', () => {
    const domains = requirementDomains(sample())
    expect(domains.map((d) => [d.kind, d.name, d.requirements.map((r) => r.code), d.applied, d.total, d.untracedTableIds])).toEqual([
      // 제외한 요구사항은 다루는 수에서 뺀다
      ['area', '회원', ['REQ-001', 'REQ-002', 'REQ-003'], 1, 2, []],
      // 요구사항이 없는 도메인 — 테이블이 근거 없이 남아 있다
      ['area', '주문', [], 0, 0, ['t-orders']],
      ['document', '', ['REQ-004'], 1, 1, []],
    ])
    expect(domains[0].counts).toMatchObject({ APPLIED: 1, PENDING: 1, DROPPED: 1 })
    expect(domains[0].color).toBe('blue')
  })

  it('미분류는 요구사항이나 그룹 밖의 근거 없는 테이블이 있을 때만 나온다', () => {
    const base = sample()
    expect(requirementDomains(base).some((d) => d.kind === 'unassigned')).toBe(false)

    const loose = createTable('logs', { id: 't-logs', columns: [createColumn({ id: 'c9', physicalName: 'id' })] })
    const withLoose: EditorDocument = { ...base, model: { ...base.model, tables: [...base.model.tables, loose] } }
    const unassigned = requirementDomains(withLoose).find((d) => d.kind === 'unassigned')
    expect(unassigned).toMatchObject({ requirements: [], untracedTableIds: ['t-logs'] })

    // 요구사항이 하나도 없는 문서에는 도메인만 있고 미분류·공통은 없다
    expect(requirementDomains(doc()).map((d) => d.kind)).toEqual(['area', 'area'])
  })

  it('찾기는 코드, 제목, 내용, 테이블 이름을 본다', () => {
    const [target] = sample().diagram.requirements
    const names = new Map([['t-users', 'users']])
    expect(matchesRequirement(target, '', names)).toBe(true)
    expect(matchesRequirement(target, ' req-001 ', names)).toBe(true)
    expect(matchesRequirement(target, '가입', names)).toBe(true)
    expect(matchesRequirement(target, '중복', names)).toBe(true)
    expect(matchesRequirement(target, 'USERS', names)).toBe(true)
    expect(matchesRequirement(target, 'orders', names)).toBe(false)
  })

  const labels: RequirementExportLabels = {
    heading: '요구사항 명세',
    unassigned: '미분류',
    document: '공통',
    state: { APPLIED: '반영됨', PENDING: '반영 대기', UNLINKED: '연결 끊김', LEFTOVER: '정리 필요', DRAFT: '검토 중', DROPPED: '제외' },
    progress: (applied, total) => `반영 ${applied}/${total}`,
    tables: '테이블',
    untraced: '근거 없는 테이블',
    columns: { code: '코드', domain: '도메인', state: '상태', title: '제목', description: '내용', tables: '테이블', criteria: '수용 기준' },
  }

  it('Markdown 명세 — 도메인마다 절, 요구사항마다 상태·내용·테이블', () => {
    expect(requirementsToMarkdown(sample(), '쇼핑몰', labels)).toBe(
      [
        '# 쇼핑몰 — 요구사항 명세',
        '',
        '## 회원 (반영 1/2)',
        '',
        '### REQ-001 가입 — 반영됨',
        '',
        '- 이메일은 중복될 수 없다',
        '',
        '테이블: `users`',
        '',
        '### REQ-002 탈퇴 — 반영 대기',
        '',
        '- [x] 탈퇴한 회원은 로그인할 수 없다',
        '- [ ] 주문 기록은 남는다',
        '',
        '### REQ-003 휴면 — 제외',
        '',
        '## 주문 (반영 0/0)',
        '',
        '> 근거 없는 테이블: `orders`',
        '',
        '## 공통 (반영 1/1)',
        '',
        '### REQ-004 생성 시각 — 반영됨',
        '',
      ].join('\n'),
    )
  })

  it('CSV — 한 행이 요구사항 하나. 쉼표·따옴표·줄바꿈은 따옴표로 감싼다', () => {
    const csv = requirementsToCsv(
      doc([requirement({ id: 'r1', code: 'REQ-001', areaId: 'a-order', title: '주문, "빠른" 주문', description: '한 줄\n두 줄', tableIds: ['t-orders', 't-users'] })]),
      labels,
    )
    expect(csv.startsWith('\uFEFF코드,도메인,상태,제목,내용,테이블,수용 기준\r\n')).toBe(true)
    expect(csv).toContain('REQ-001,주문,검토 중,"주문, ""빠른"" 주문","한 줄\n두 줄",orders users,\r\n')
  })
})

describe('수용 기준', () => {
  const criteria = [{ id: 'k1', text: '이메일 중복을 막는다', done: false }]

  it('없는 요구사항에는 키를 두지 않는다 — 저장하고 다시 열어도 그대로다', () => {
    const saved = serializeContent({
      schemaVersion: 1,
      ...doc([requirement({ id: 'r1' }), requirement({ id: 'r2', code: 'REQ-002', criteria })]),
    })
    const [plain, checked] = parseContent(saved).diagram.requirements
    expect('criteria' in plain).toBe(false)
    expect(checked.criteria).toEqual(criteria)
  })

  it('체크를 바꿔도 개정 번호는 오르지 않는다 — 버전 비교에는 criteria 변경으로 나온다', () => {
    const before = doc([requirement({ id: 'r1', status: 'confirmed', appliedRevision: 1, criteria })])
    const after = applyChange(before, {
      type: 'requirement/patch',
      requirementId: 'r1',
      patch: { criteria: [{ ...criteria[0], done: true }] },
    })
    expect(after.diagram.requirements[0]).toMatchObject({ revision: 1, criteria: [{ id: 'k1', done: true }] })
    expect(diffDocuments(before, after).items).toEqual([
      expect.objectContaining({ kind: 'requirement', action: 'update', detail: 'criteria' }),
    ])
    // 서버 본문을 따라가는 변경에도 수용 기준이 실린다
    expect(deriveChanges(before, after)).toEqual([
      { type: 'requirement/patch', requirementId: 'r1', patch: { criteria: [{ ...criteria[0], done: true }] } },
    ])
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
