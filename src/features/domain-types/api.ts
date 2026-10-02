/**
 * 워크스페이스 도메인 타입 API (08-core/16-domain-type.md Section 3)
 *
 * 도메인 타입은 여러 컬럼이 함께 쓰는 타입 정의다. 워크스페이스의 모든 ERD 문서가 함께 쓴다.
 */
import { apiDelete, apiGetList, apiPost, apiPut } from '@/api/client'

export interface DomainType {
  domainTypeId: string
  workspaceId: string
  name: string
  /** 공용 논리 타입 코드 — 문서 컬럼의 dataType과 같은 코드 체계 */
  dataType: string
  length: number | null
  precision: number | null
  scale: number | null
  /** NULL 허용 기본값 */
  nullable: boolean
  defaultValue: string | null
  description: string | null
  /** 고칠 때마다 1씩 오른다 — 문서의 컬럼이 맞춘 버전과 견준다 */
  version: number
  updatedAt: string
}

export interface DomainTypeInput {
  name: string
  dataType: string
  length: number | null
  precision: number | null
  scale: number | null
  nullable: boolean
  defaultValue: string | null
  description: string | null
}

const base = (workspaceId: string) => `/api/v1/core/workspaces/${workspaceId}/domain-types`

export function fetchDomainTypes(workspaceId: string, signal?: AbortSignal) {
  return apiGetList<DomainType>(base(workspaceId), undefined, signal)
}

export function createDomainType(workspaceId: string, input: DomainTypeInput) {
  return apiPost<DomainType>(base(workspaceId), input)
}

/** 고치기 — baseVersion이 지금 버전과 다르면 409 VERSION_CONFLICT(그 사이 다른 사람이 고쳤다) */
export function updateDomainType(workspaceId: string, domainTypeId: string, input: DomainTypeInput, baseVersion: number) {
  return apiPut<DomainType>(`${base(workspaceId)}/${domainTypeId}`, { ...input, baseVersion })
}

export function deleteDomainType(workspaceId: string, domainTypeId: string) {
  return apiDelete(`${base(workspaceId)}/${domainTypeId}`)
}
