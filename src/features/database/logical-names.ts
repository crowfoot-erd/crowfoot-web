/**
 * ERD 문서 읽기 — 논리명과 그룹 (09-database-manager/00-data-browser.md §5.2·§5.6)
 *
 * 데이터 브라우저의 컬럼 머리에 ERD 문서의 논리명을 함께 보여 주고, 문서와 함께 열면 왼쪽 목록을
 * 문서의 그룹으로 나눈다. 문서는 이렇게 고른다.
 * - 에디터의 데이터 보기 탭이면 에디터가 열어 둔 문서(저장 전 편집까지) — 이 파일의 조회를 쓰지 않는다
 * - 주소에 `?model=`이 있으면 그 문서
 * - 아니면 이 커넥션을 원천으로 하는 문서가 워크스페이스에 정확히 하나일 때 그 문서(논리명만 쓴다)
 * 문서를 고를 수 없으면(없거나 둘 이상) 논리명을 보여 주지 않는다. 주소로 고른 문서는 마지막으로 저장된 내용을 읽는다.
 */
import { useQuery } from '@tanstack/react-query'

import { parseContent } from '@/features/editor/model/content-io'
import type { TableColorValue } from '@/features/editor/model/content-schema'
import { fetchModel, fetchModels } from '@/features/models/api'

/** 원천 문서를 찾을 때 훑는 문서 수 — 이보다 많은 워크스페이스에서는 찾지 않는다 */
const LOOKUP_SIZE = 100

/** 테이블 물리명(소문자) → 컬럼 물리명(소문자) → 논리명(원문 — `-----` 분리는 화면에서 한다) */
export type LogicalNames = Map<string, Map<string, string>>

/** 문서의 그룹 하나 — 테이블은 물리명(소문자)으로 갖는다 */
export interface DocumentGroup {
  id: string
  name: string
  color: TableColorValue
  tableNames: Set<string>
}

/** 왼쪽 목록을 나누는 데 쓰는 문서 요약 — 그룹은 문서 순서 그대로다 */
export interface DocumentOutline {
  groups: DocumentGroup[]
  /** 문서에 있는 테이블 전부(물리명 소문자) */
  tableNames: Set<string>
}

/** 데이터 브라우저가 읽는 문서 모양 — 에디터 문서(EditorDocument)와 저장 본문(ErdContent)이 둘 다 맞는다 */
export interface BrowserDocument {
  model: {
    tables: readonly {
      id: string
      physicalName: string
      columns: readonly { physicalName: string; logicalName: string }[]
    }[]
  }
  diagram: {
    areas: readonly {
      id: string
      name: string
      color: TableColorValue
      tableIds: readonly string[]
    }[]
  }
}

export interface DocumentIndex {
  logicalNames: LogicalNames
  outline: DocumentOutline
}

/** 문서에서 논리명 사전을 만든다 — 비어 있거나 물리명과 같은 논리명은 싣지 않는다 */
export function logicalNamesOf(document: BrowserDocument): LogicalNames {
  const names: LogicalNames = new Map()
  for (const table of document.model.tables) {
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

/** 문서의 그룹을 물리명으로 옮긴다 — 지워진 테이블을 가리키는 id는 건너뛴다 */
export function outlineOf(document: BrowserDocument): DocumentOutline {
  const nameById = new Map(
    document.model.tables.map((table) => [table.id, table.physicalName.toLowerCase()]),
  )
  return {
    groups: document.diagram.areas.map((area) => ({
      id: area.id,
      name: area.name,
      color: area.color,
      tableNames: new Set(
        area.tableIds.flatMap((id) => (nameById.has(id) ? [nameById.get(id)!] : [])),
      ),
    })),
    tableNames: new Set(nameById.values()),
  }
}

export function documentIndexOf(document: BrowserDocument): DocumentIndex {
  return { logicalNames: logicalNamesOf(document), outline: outlineOf(document) }
}

/** 저장 본문에서 논리명 사전을 만든다 */
export function buildLogicalNames(rawContent: string | null | undefined): LogicalNames {
  return logicalNamesOf(parseContent(rawContent))
}

/** 객체 하나의 컬럼 논리명 — 없으면 빈 객체 */
export function columnLabelsOf(
  names: LogicalNames | undefined,
  objectName: string,
): Record<string, string> {
  const columns = names?.get(objectName.toLowerCase())
  if (!columns) return {}
  return Object.fromEntries(columns)
}

const EMPTY_INDEX: DocumentIndex = {
  logicalNames: new Map(),
  outline: { groups: [], tableNames: new Set() },
}

/** 저장된 문서를 읽어 논리명과 그룹을 만든다. 그룹은 주소로 문서를 받았을 때만 화면에 쓴다 */
export function useDocumentIndex(
  workspaceId: string,
  connectionId: string,
  modelId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['database', workspaceId, connectionId, 'logical-names', modelId] as const,
    queryFn: async ({ signal }): Promise<DocumentIndex> => {
      let target = modelId
      if (!target) {
        const page = await fetchModels(workspaceId, { page: 1, size: LOOKUP_SIZE }, signal)
        // 다 훑지 못했으면 "하나뿐"이라고 말할 수 없다
        if (page.totalCount > page.items.length) return EMPTY_INDEX
        const sources = page.items.filter((model) => model.sourceConnectionId === connectionId)
        if (sources.length !== 1) return EMPTY_INDEX
        target = sources[0].modelId
      }
      const model = await fetchModel(workspaceId, target, signal)
      // 주소로 받은 문서가 이 커넥션의 문서가 아니면 쓰지 않는다
      if (!model || model.sourceConnectionId !== connectionId) return EMPTY_INDEX
      return documentIndexOf(parseContent(model.content))
    },
    enabled,
    // 논리명은 곁들이는 정보다 — 못 읽어도 화면은 그대로 쓴다
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  })
}
