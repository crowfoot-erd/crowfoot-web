/**
 * 에디터 객체 검색 — 모델 익스플로러 상단 검색의 순수 계산 (05-editor/02-ui.md §11)
 *
 * 대상은 구현 객체만: 테이블·컬럼·관계·메모 × 논리명·물리명·comment(메모는 title·text).
 * 대소문자를 무시하는 부분 일치고, 결과 순서는 문서 순서를 그대로 따른다(안정 — Enter 순회가
 * 결과가 흔들리지 않게). 컬럼 히트의 포커스 대상은 부모 테이블이다(컬럼 단독 줌은 캔버스에 없다).
 */
import type { EditorDocument } from '@/features/editor/model/content-schema'

export type ObjectHitKind = 'table' | 'column' | 'relationship' | 'note'

export interface ObjectHit {
  kind: ObjectHitKind
  /** 선택·포커스 대상 객체 id — column 히트면 부모 테이블 id */
  targetId: string
  /** column 히트일 때만 — 테이블 내 컬럼 id */
  columnId?: string
}

/** 문자열이 쿼리를 포함하는지(대소문자 무시) — null·undefined는 빈 문자열로 본다 */
function includes(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? '').toLowerCase().includes(needle)
}

/** 문서에서 쿼리에 걸리는 객체를 문서 순서대로 모은다 — 빈 쿼리면 빈 배열 */
export function searchObjects(doc: EditorDocument, rawQuery: string): ObjectHit[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return []

  const hits: ObjectHit[] = []
  for (const table of doc.model.tables) {
    const tableMatches =
      includes(table.logicalName, query) ||
      includes(table.physicalName, query) ||
      includes(table.comment, query)
    if (tableMatches) hits.push({ kind: 'table', targetId: table.id })

    for (const column of table.columns) {
      if (
        includes(column.logicalName, query) ||
        includes(column.physicalName, query) ||
        includes(column.comment, query)
      ) {
        hits.push({ kind: 'column', targetId: table.id, columnId: column.id })
      }
    }
  }
  for (const rel of doc.model.relationships) {
    if (includes(rel.name, query) || includes(rel.fkName, query)) {
      hits.push({ kind: 'relationship', targetId: rel.id })
    }
  }
  for (const note of doc.diagram.notes) {
    if (includes(note.title, query) || includes(note.text, query)) {
      hits.push({ kind: 'note', targetId: note.id })
    }
  }
  return hits
}
