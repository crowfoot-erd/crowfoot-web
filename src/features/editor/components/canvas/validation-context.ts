/**
 * 검증 하이라이트 컨텍스트 (05-editor/05-validation.md §4.2 캔버스 링)
 *
 * compare-context와 같은 구조 — EditorShell이 검증 패널이 열려 있을 때만 Provider로
 * 감싼다. 값은 tableId → 등급 지도(error가 warning보다 우선, info는 캔버스 표시 없음)고,
 * 패널이 닫혀 있으면 null이라 TableNode는 링을 그리지 않는다(과도한 상시 표시 방지).
 * 지도 참조는 호출부(EditorShell)가 useMemo로 1회 생성한다 — TableNode는 memo 컴포넌트라
 * 지도가 매 렌더 새로 만들어지면 전 노드가 재평가된다.
 */
import { createContext, useContext } from 'react'

import type { ValidationLevel } from '@/features/editor/model/validation'

export const ValidationHighlightContext = createContext<ReadonlyMap<string, ValidationLevel> | null>(null)

/** 이 테이블 노드의 검증 등급 — 패널이 닫혀 있거나 문제가 없으면 null */
export function useValidationRing(tableId: string): ValidationLevel | null {
  return useContext(ValidationHighlightContext)?.get(tableId) ?? null
}
