/**
 * ERD 논리명 찾기 (09-database-manager/00-data-browser.md §5.2)
 *
 * 데이터 브라우저의 컬럼 머리에 ERD 문서의 논리명을 함께 보여 준다. 문서는 이렇게 고른다.
 * - 에디터에서 들어왔으면 주소의 `?model=`이 가리키는 문서
 * - 아니면 이 커넥션을 원천으로 하는 문서가 워크스페이스에 정확히 하나일 때 그 문서
 * 문서를 고를 수 없으면(없거나 둘 이상) 논리명을 보여 주지 않는다. 마지막으로 저장된 내용을 읽는다.
 */
import { useQuery } from '@tanstack/react-query'

import { parseContent } from '@/features/editor/model/content-io'
import { fetchModel, fetchModels } from '@/features/models/api'

/** 원천 문서를 찾을 때 훑는 문서 수 — 이보다 많은 워크스페이스에서는 찾지 않는다 */
const LOOKUP_SIZE = 100

/** 테이블 물리명(소문자) → 컬럼 물리명(소문자) → 논리명 */
export type LogicalNames = Map<string, Map<string, string>>

/** 문서 본체에서 논리명 사전을 만든다 — 비어 있거나 물리명과 같은 논리명은 싣지 않는다 */
export function buildLogicalNames(rawContent: string | null | undefined): LogicalNames {
  const names: LogicalNames = new Map()
  for (const table of parseContent(rawContent).model.tables) {
    const columns = new Map<string, string>()
    for (const column of table.columns) {
      const logical = column.logicalName.trim()
      if (logical && logical.toLowerCase() !== column.physicalName.toLowerCase()) {
        columns.set(column.physicalName.toLowerCase(), logical)
      }
    }
    if (columns.size > 0) names.set(table.physicalName.toLowerCase(), columns)
  }
  return names
}

/** 객체 하나의 컬럼 논리명 — 없으면 빈 객체 */
export function columnLabelsOf(names: LogicalNames | undefined, objectName: string): Record<string, string> {
  const columns = names?.get(objectName.toLowerCase())
  if (!columns) return {}
  return Object.fromEntries(columns)
}

export function useLogicalNames(workspaceId: string, connectionId: string, modelId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['database', workspaceId, connectionId, 'logical-names', modelId] as const,
    queryFn: async ({ signal }): Promise<LogicalNames> => {
      let target = modelId
      if (!target) {
        const page = await fetchModels(workspaceId, { page: 1, size: LOOKUP_SIZE }, signal)
        // 다 훑지 못했으면 "하나뿐"이라고 말할 수 없다
        if (page.totalCount > page.items.length) return new Map()
        const sources = page.items.filter((model) => model.sourceConnectionId === connectionId)
        if (sources.length !== 1) return new Map()
        target = sources[0].modelId
      }
      const model = await fetchModel(workspaceId, target, signal)
      // 주소로 받은 문서가 이 커넥션의 문서가 아니면 쓰지 않는다
      if (!model || model.sourceConnectionId !== connectionId) return new Map()
      return buildLogicalNames(model.content)
    },
    enabled,
    // 논리명은 곁들이는 정보다 — 못 읽어도 화면은 그대로 쓴다
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  })
}
