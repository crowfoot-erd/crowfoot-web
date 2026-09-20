/**
 * 버전 비교 하이라이트 컨텍스트 (08-core/02-model.md §1.11.3 — ?compare=N)
 *
 * 버전 뷰어가 EditorShell 바깥에서 Provider로 감싼다 — 에디터 본체(EditorCanvas·
 * EditorCanvasContext)는 비교 모드를 모른다. 값은 tableId → 마크 지도고, 비교 모드가
 * 아니면 null(기본값)이라 TableNode는 배지를 그리지 않는다.
 *
 * 지도 참조는 호출부(viewer)가 useMemo로 1회 생성한다 — TableNode는 memo 컴포넌트라
 * 지도가 매 렌더마다 새로 만들어지면 전 노드가 재평가된다.
 */
import { createContext, useContext } from 'react'

import type { TableChangeMark } from '@/features/editor/model/version-compare'

export const CompareHighlightContext = createContext<ReadonlyMap<string, TableChangeMark> | null>(null)

/** 이 테이블 노드의 비교 마크 — 비교 모드가 아니거나 대상이 아니면 null */
export function useCompareHighlight(tableId: string): TableChangeMark | null {
  return useContext(CompareHighlightContext)?.get(tableId) ?? null
}
