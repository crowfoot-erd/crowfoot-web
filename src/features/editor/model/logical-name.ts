/**
 * 논리명 "-----" 구분자 관례 — 논리명·설명 분리 (05-editor/01-core.md §3.3, 2026-09-28)
 *
 * 논리명 필드에는 `논리명-----설명` 형태로 설명을 함께 기록할 수 있다(DB COMMENT 관례 입력).
 * 첫 번째 구분자를 기준으로 1회만 분리한다 — 앞부분이 논리명(표기·중복 비교·추론 후보 판정의
 * 원천), 뒷부분이 설명(원문 보존). 저장값은 항상 한 문자열 그대로고 DDL·리버스도 원문을
 * 주고받는다 — 분리는 화면 표기 전용 해석이다.
 */

/** 구분자 — 하이픈 5개 */
export const LOGICAL_NAME_SEPARATOR = '-----'

export interface LogicalNameParts {
  /** 논리명 — 구분자 앞부분(공백 제거). 구분자가 없으면 원문 전체 */
  name: string
  /** 설명 — 구분자 뒷부분(공백 제거). 없으면 null */
  description: string | null
}

/** 논리명 원문을 논리명·설명으로 분리한다 (첫 구분자 1회, 이후 구분자는 설명의 일부).
 *  픽스처처럼 논리명이 비어 있는 객체도 안전하게 통과시킨다(빈 논리명 취급). */
export function splitLogicalName(value: string | null | undefined): LogicalNameParts {
  const raw = value ?? ''
  const index = raw.indexOf(LOGICAL_NAME_SEPARATOR)
  if (index < 0) return { name: raw, description: null }
  const name = raw.slice(0, index).trim()
  const description = raw.slice(index + LOGICAL_NAME_SEPARATOR.length).trim()
  return { name, description: description.length > 0 ? description : null }
}

/** 화면 표기용 논리명 — 구분자 앞부분만 (설명은 정보 다이얼로그에서 열람·편집) */
export function displayLogicalName(value: string | null | undefined): string {
  return splitLogicalName(value).name
}
