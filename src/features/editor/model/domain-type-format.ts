/**
 * 도메인 타입 표기 — 타입 라벨과 속성 값 (05-editor/02-ui.md §16)
 */
import type { DomainField } from '@/features/editor/model/changes'
import { physicalType } from '@/features/editor/model/dbms'

/** 타입 표기 — 문서의 대상 DBMS 기준 물리 타입에 길이·정밀도를 붙인다 */
export function typeLabel(
  value: { dataType: string; length: number | null; precision: number | null; scale: number | null },
  dbmsId: string,
): string {
  const base = physicalType(value.dataType, dbmsId)
  if (value.length != null) return `${base}(${value.length})`
  if (value.precision != null) return `${base}(${value.precision},${value.scale ?? 0})`
  return base
}

/** 속성 값 하나의 표기 — 전파 미리보기의 "이전 → 새" */
export function fieldValueLabel(
  field: DomainField,
  value: string | number | boolean | null,
  dbmsId: string,
  labels: { yes: string; no: string; none: string },
): string {
  if (field === 'nullable') return value ? labels.yes : labels.no
  if (value === null || value === '') return labels.none
  if (field === 'dataType') return physicalType(String(value), dbmsId)
  return String(value)
}
