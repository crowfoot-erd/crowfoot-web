/**
 * 버전 간 비교 뷰 분류 (05-editor/01-core.md §13, 08-core/02-model.md §1.11.3)
 *
 * diffDocuments 결과를 캔버스 배지용 마크와 사이드바 섹션으로 갈라 놓는다 — 순수 함수.
 *
 * · 구조 kind(table·column·primaryKey·uniqueKey·index·relationship)의 add/update만
 *   캔버스 배지가 된다. note·node는 노드가 아니거나(노트) 레이아웃 정보라(node) 사이드바
 *   목록으로만 안내하고, move는 구조 변경이 아니다.
 * · remove는 최신 버전 캔버스에 노드가 없으므로 목록 전용 섹션("사라진 테이블")으로 간다.
 * · 한 테이블에 add와 update가 섞이면 add가 이긴다 — 추가된 테이블의 하위 변경은 add로 뭉친다.
 */
import type { EditorDocument } from '@/features/editor/model/content-schema'
import type { DocumentDiffSummary, DocDiffItem } from '@/features/editor/model/doc-diff'

/** 캔버스 배지 마크 — 배지가 붙는 변경은 추가·변경 두 가지다 */
export type TableChangeMark = 'add' | 'update'

/** 구조 kind — 이 종류만 배지·테이블 분류 대상 */
const STRUCTURAL_KINDS: ReadonlySet<DocDiffItem['kind']> = new Set([
  'table',
  'column',
  'primaryKey',
  'uniqueKey',
  'index',
  'relationship',
])

export interface TableChangeClassification {
  /** 테이블 물리명 → 마크. 구조 변경이 있는 테이블만 들어 있다 */
  byName: Map<string, TableChangeMark>
  /** 기준 버전에만 있던 테이블 물리명 (사라진 테이블 섹션) */
  removed: string[]
}

/** diff 요약 → 테이블별 배지 마크 + 사라진 테이블 목록 */
export function classifyTableChanges(summary: DocumentDiffSummary): TableChangeClassification {
  const byName = new Map<string, TableChangeMark>()
  const removed = new Set<string>()

  for (const item of summary.items) {
    if (!STRUCTURAL_KINDS.has(item.kind)) continue
    const table = item.kind === 'table' ? item.name : item.table
    if (table === '') continue

    if (item.action === 'remove') {
      removed.add(table)
      continue
    }
    if (item.action !== 'add' && item.action !== 'update') continue
    // add 우선 — 이미 add로 마크된 테이블을 update로 깎지 않는다
    if (byName.get(table) !== 'add') byName.set(table, item.action)
  }

  // 사라진 테이블이면 배지 대상에서 뺀다 — 목록 전용 섹션이 알린다
  for (const name of removed) byName.delete(name)
  return { byName, removed: [...removed] }
}

/** 물리명 마크 → 최신 문서의 테이블 id 마크 (TableNode 소비 형태). id는 최신 문서 기준 */
export function toTableIdMarks(
  classification: TableChangeClassification,
  newerDoc: EditorDocument,
): Map<string, TableChangeMark> {
  const marks = new Map<string, TableChangeMark>()
  for (const table of newerDoc.model.tables) {
    const mark = classification.byName.get(table.physicalName)
    if (mark) marks.set(table.id, mark)
  }
  return marks
}
