/**
 * 요구사항 — 상태 판정, 코드 붙이기, 묶어 보기 (docs 08-core/17-model-edit.md Section 2, 05-editor/02-ui.md Section 17)
 *
 * 저장하는 값은 status·revision·appliedRevision·tableIds뿐이다. 반영됨·반영 대기 같은 판정은 읽을 때 계산한다.
 * 같은 규칙을 core의 개요 조회(DocumentOutline)가 Java로 갖고 있다 — 한쪽을 바꾸면 다른 쪽도 바꾼다.
 */
import type { EditorDocument, ErdRequirement } from '@/features/editor/model/content-schema'

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
