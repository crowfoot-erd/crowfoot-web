/**
 * 요구사항 — 상태 판정, 코드 붙이기, 묶어 보기 (docs 08-core/17-model-edit.md Section 2, 05-editor/02-ui.md Section 17)
 *
 * 저장하는 값은 status·revision·appliedRevision·tableIds뿐이다. 반영됨·반영 대기 같은 판정은 읽을 때 계산한다.
 * 같은 규칙을 core의 개요 조회(DocumentOutline)가 Java로 갖고 있다 — 한쪽을 바꾸면 다른 쪽도 바꾼다.
 */
import type { ErdChange } from '@/features/editor/model/changes'
import type { EditorDocument, ErdArea, ErdRequirement } from '@/features/editor/model/content-schema'

export type RequirementState = 'APPLIED' | 'PENDING' | 'UNLINKED' | 'LEFTOVER' | 'DRAFT' | 'DROPPED'

export const REQUIREMENT_STATES: readonly RequirementState[] = ['APPLIED', 'PENDING', 'UNLINKED', 'LEFTOVER', 'DRAFT', 'DROPPED']

/** 문서당 요구사항 상한 */
export const REQUIREMENT_LIMIT = 500

/** 상태 판정 — 공통 요구사항(scope=document)은 테이블 연결을 보지 않는다 */
export function requirementState(requirement: ErdRequirement): RequirementState {
  const hasTables = requirement.tableIds.length > 0
  if (requirement.scope === 'document') {
    if (requirement.status === 'confirmed') return 'APPLIED'
    return requirement.status === 'dropped' ? 'DROPPED' : 'DRAFT'
  }
  if (requirement.status === 'dropped') return hasTables ? 'LEFTOVER' : 'DROPPED'
  if (requirement.status === 'confirmed') {
    if (requirement.appliedRevision < requirement.revision) return 'PENDING'
    return hasTables ? 'APPLIED' : 'UNLINKED'
  }
  return 'DRAFT'
}

/** 다음 코드 — 문서에 있는 가장 큰 번호 다음(REQ-001 형식). 지운 번호를 다시 쓰지 않도록 제외한 항목도 센다 */
export function nextRequirementCode(requirements: readonly ErdRequirement[]): string {
  let max = 0
  for (const requirement of requirements) {
    const matched = /^REQ-(\d{3,})$/.exec(requirement.code)
    if (matched) max = Math.max(max, Number(matched[1]))
  }
  return `REQ-${String(max + 1).padStart(3, '0')}`
}

/** 어떤 요구사항에도 연결되지 않은 테이블 — "근거 없는 테이블" */
export function untracedTableIds(doc: EditorDocument): string[] {
  const traced = new Set(doc.diagram.requirements.flatMap((requirement) => requirement.tableIds))
  return doc.model.tables.filter((table) => !traced.has(table.id)).map((table) => table.id)
}

/**
 * 도메인 그룹 자동 배치(v1.39) — 도메인이 있는 요구사항에 연결된 테이블 가운데 어느 그룹에도 없는 것을 그 도메인 그룹에 넣는 변경.
 * 다른 그룹에 있는 테이블은 옮기지 않는다. 넣을 테이블이 없으면 null.
 * 같은 규칙을 core의 편집 API(DocumentEditor.placeInRequirementArea)가 Java로 갖고 있다 — 08-core/17-model-edit.md Section 2.2
 */
export function requirementAreaPlacement(doc: EditorDocument, areaId: string | null, tableIds: readonly string[]): ErdChange | null {
  const area = areaId === null ? undefined : doc.diagram.areas.find((candidate) => candidate.id === areaId)
  if (!area) return null
  const grouped = new Set(doc.diagram.areas.flatMap((candidate) => candidate.tableIds))
  const known = new Set(doc.model.tables.map((table) => table.id))
  const added = [...new Set(tableIds)].filter((tableId) => known.has(tableId) && !grouped.has(tableId))
  if (added.length === 0) return null
  return { type: 'area/patch', areaId: area.id, patch: { tableIds: [...area.tableIds, ...added] } }
}

/** 판정별 수 — 도구 모음 배지(반영 대기)와 패널 필터가 쓴다 */
export function countRequirementStates(requirements: readonly ErdRequirement[]): Record<RequirementState, number> {
  const counts: Record<RequirementState, number> = { APPLIED: 0, PENDING: 0, UNLINKED: 0, LEFTOVER: 0, DRAFT: 0, DROPPED: 0 }
  for (const requirement of requirements) counts[requirementState(requirement)] += 1
  return counts
}

export interface RequirementGroup {
  /** 그룹 id — 미분류는 'unassigned', 공통은 'document' */
  key: string
  kind: 'area' | 'unassigned' | 'document'
  /** 그룹(도메인) 이름 — 미분류·공통은 빈 문자열(화면이 번역 문구를 쓴다) */
  name: string
  requirements: ErdRequirement[]
}

/**
 * 도메인(그룹)별 묶음 — 순서는 그룹의 순서, 그 뒤에 미분류와 공통. 묶음 안은 코드 오름차순.
 * 요구사항이 없는 그룹은 넣지 않는다.
 */
export function groupRequirements(doc: EditorDocument, visible: (requirement: ErdRequirement) => boolean = () => true): RequirementGroup[] {
  const byCode = (a: ErdRequirement, b: ErdRequirement) => a.code.localeCompare(b.code, undefined, { numeric: true })
  const shown = doc.diagram.requirements.filter(visible)
  const areaIds = new Set(doc.diagram.areas.map((area) => area.id))
  const groups: RequirementGroup[] = []
  for (const area of doc.diagram.areas) {
    const members = shown.filter((r) => r.scope === 'tables' && r.areaId === area.id).sort(byCode)
    if (members.length > 0) groups.push({ key: area.id, kind: 'area', name: area.name, requirements: members })
  }
  // 없는 그룹을 가리키는 요구사항(정리되지 않은 참조)도 미분류로 보인다
  const unassigned = shown.filter((r) => r.scope === 'tables' && (r.areaId === null || !areaIds.has(r.areaId))).sort(byCode)
  if (unassigned.length > 0) groups.push({ key: 'unassigned', kind: 'unassigned', name: '', requirements: unassigned })
  const common = shown.filter((r) => r.scope === 'document').sort(byCode)
  if (common.length > 0) groups.push({ key: 'document', kind: 'document', name: '', requirements: common })
  return groups
}

/** 도메인 하나의 요구사항과 진행 상황 — 요구사항 화면이 도메인별로 정리해 보여 준다 (05-editor/02-ui.md §21) */
export interface RequirementDomain {
  /** 그룹 id — 미분류는 'unassigned', 공통은 'document' */
  key: string
  kind: 'area' | 'unassigned' | 'document'
  /** 그룹(도메인) 이름 — 미분류·공통은 빈 문자열(화면이 번역 문구를 쓴다) */
  name: string
  color: ErdArea['color']
  /** 이 도메인의 요구사항 전부(제외 포함) — 코드 오름차순 */
  requirements: ErdRequirement[]
  counts: Record<RequirementState, number>
  /** 다루는 요구사항 수 — 제외를 뺀 것 */
  total: number
  /** 그 가운데 ERD에 반영된 수 */
  applied: number
  /** 이 도메인(그룹)에 속한 테이블 — 미분류는 어느 그룹에도 없는 테이블, 공통은 없다 */
  tableIds: string[]
  /** 그 가운데 어떤 요구사항에도 연결되지 않은 테이블 */
  untracedTableIds: string[]
}

/**
 * 도메인별 정리 — 순서는 그룹의 순서, 그 뒤에 미분류와 공통.
 * 요구사항이 없는 그룹도 넣는다(요구사항이 빠진 도메인이 보이게). 미분류는 요구사항이나 근거 없는 테이블이 있을 때,
 * 공통은 요구사항이 있을 때만 넣는다.
 */
export function requirementDomains(doc: EditorDocument): RequirementDomain[] {
  const byCode = (a: ErdRequirement, b: ErdRequirement) => a.code.localeCompare(b.code, undefined, { numeric: true })
  const all = doc.diagram.requirements
  const areaIds = new Set(doc.diagram.areas.map((area) => area.id))
  const tableIds = new Set(doc.model.tables.map((table) => table.id))
  const untraced = new Set(untracedTableIds(doc))
  const build = (
    key: string,
    kind: RequirementDomain['kind'],
    name: string,
    color: ErdArea['color'],
    members: ErdRequirement[],
    tables: string[],
  ): RequirementDomain => {
    const counts = countRequirementStates(members)
    return {
      key,
      kind,
      name,
      color,
      requirements: [...members].sort(byCode),
      counts,
      total: members.length - counts.DROPPED - counts.LEFTOVER,
      applied: counts.APPLIED,
      tableIds: tables,
      untracedTableIds: tables.filter((tableId) => untraced.has(tableId)),
    }
  }
  const domains: RequirementDomain[] = []
  const inArea = new Set<string>()
  for (const area of doc.diagram.areas) {
    const tables = area.tableIds.filter((tableId) => tableIds.has(tableId))
    for (const tableId of tables) inArea.add(tableId)
    domains.push(
      build(area.id, 'area', area.name, area.color, all.filter((r) => r.scope === 'tables' && r.areaId === area.id), tables),
    )
  }
  const loose = doc.model.tables.map((table) => table.id).filter((tableId) => !inArea.has(tableId))
  const unassigned = all.filter((r) => r.scope === 'tables' && (r.areaId === null || !areaIds.has(r.areaId)))
  if (unassigned.length > 0 || (all.length > 0 && loose.some((tableId) => untraced.has(tableId)))) {
    domains.push(build('unassigned', 'unassigned', '', 'default', unassigned, loose))
  }
  const common = all.filter((r) => r.scope === 'document')
  if (common.length > 0) domains.push(build('document', 'document', '', 'default', common, []))
  return domains
}

/** 찾기 — 코드, 제목, 내용, 연결된 테이블 이름에서 찾는다(대소문자 무시). 빈 검색어는 모두 맞는다 */
export function matchesRequirement(
  requirement: ErdRequirement,
  query: string,
  tableName: ReadonlyMap<string, string>,
): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return true
  const haystack = [
    requirement.code,
    requirement.title,
    requirement.description,
    ...requirement.tableIds.map((tableId) => tableName.get(tableId) ?? ''),
  ]
    .join('\n')
    .toLowerCase()
  return haystack.includes(needle)
}

/** 내보내기에 쓰는 문구 — 화면의 번역 문구를 그대로 넘긴다 */
export interface RequirementExportLabels {
  heading: string
  unassigned: string
  document: string
  state: Record<RequirementState, string>
  progress: (applied: number, total: number) => string
  tables: string
  untraced: string
  columns: { code: string; domain: string; state: string; title: string; description: string; tables: string; criteria: string }
}

const domainLabel = (domain: RequirementDomain, labels: RequirementExportLabels) =>
  domain.kind === 'area' ? domain.name : domain.kind === 'unassigned' ? labels.unassigned : labels.document

/** 요구사항 명세 — Markdown. 도메인마다 절을 나누고, 요구사항마다 상태, 내용, 연결된 테이블을 적는다 */
export function requirementsToMarkdown(doc: EditorDocument, documentName: string, labels: RequirementExportLabels): string {
  const tableName = new Map(doc.model.tables.map((table) => [table.id, table.physicalName]))
  const lines: string[] = [`# ${documentName} — ${labels.heading}`, '']
  for (const domain of requirementDomains(doc)) {
    lines.push(`## ${domainLabel(domain, labels)} (${labels.progress(domain.applied, domain.total)})`, '')
    for (const requirement of domain.requirements) {
      lines.push(`### ${requirement.code} ${requirement.title} — ${labels.state[requirementState(requirement)]}`, '')
      const body = requirement.description
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^[-•*·]\s+/, ''))
        .filter((line) => line.length > 0)
      for (const line of body) lines.push(`- ${line}`)
      if (body.length > 0) lines.push('')
      const criteria = requirement.criteria ?? []
      for (const criterion of criteria) lines.push(`- [${criterion.done ? 'x' : ' '}] ${criterion.text}`)
      if (criteria.length > 0) lines.push('')
      if (requirement.tableIds.length > 0) {
        lines.push(`${labels.tables}: ${requirement.tableIds.map((id) => `\`${tableName.get(id) ?? id}\``).join(', ')}`, '')
      }
    }
    if (domain.untracedTableIds.length > 0) {
      lines.push(`> ${labels.untraced}: ${domain.untracedTableIds.map((id) => `\`${tableName.get(id) ?? id}\``).join(', ')}`, '')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** 요구사항 목록 — CSV(엑셀이 한글을 읽도록 BOM을 붙인다). 한 행이 요구사항 하나 */
export function requirementsToCsv(doc: EditorDocument, labels: RequirementExportLabels): string {
  const tableName = new Map(doc.model.tables.map((table) => [table.id, table.physicalName]))
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const { columns } = labels
  const rows: string[][] = [
    [columns.code, columns.domain, columns.state, columns.title, columns.description, columns.tables, columns.criteria],
  ]
  for (const domain of requirementDomains(doc)) {
    for (const requirement of domain.requirements) {
      rows.push([
        requirement.code,
        domainLabel(domain, labels),
        labels.state[requirementState(requirement)],
        requirement.title,
        requirement.description,
        requirement.tableIds.map((id) => tableName.get(id) ?? id).join(' '),
        (requirement.criteria ?? []).map((criterion) => `[${criterion.done ? 'x' : ' '}] ${criterion.text}`).join('\n'),
      ])
    }
  }
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}
