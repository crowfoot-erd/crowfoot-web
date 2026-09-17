/**
 * 메모 겹침 해소 (05-editor/02-ui.md §7)
 *
 * 메모는 주석이라 테이블·다른 메모 위에 포개지지 않는다 — 어느 쪽이 움직였든 메모가 물러난다.
 * 테이블끼리는 기존 겹침 해소(ErdCanvas, 크기 보고 트리거)가 밀어내고, 메모가 끼어 있으면
 * 무조건 메모 쪽이 비켜난다(테이블은 문서의 뼈대라 제자리를 지킨다).
 * 메모 높이는 본문 textarea가 4줄로 고정이라 사실상 상수 — 마운트 후 실측(sizeReports)이
 * 있으면 그 값을, 없으면 추정치(NOTE_ESTIMATED_HEIGHT)를 쓴다.
 */
import { NOTE_ESTIMATED_HEIGHT } from './canvas-bounds'
import type { EditorDocument } from './content-schema'
import { estimateTableHeight, tableRenderWidth } from '../components/canvas/TableNode'

/** 겹침 해소 후 최소 간격 — 테이블끼리 밀어내는 간격(ErdCanvas GAP)과 같다 */
export const NOTE_OVERLAP_GAP = 32

/** 겹침 판정 대상 사각형 — 테이블·메모 통일 모양 */
export interface ObjectRect {
  id: string
  kind: 'table' | 'note'
  x: number
  y: number
  w: number
  h: number
}

/** 두 사각형이 x·y 모두 겹치는가 */
export function rectsOverlap(a: ObjectRect, b: ObjectRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** 문서 전체 객체 사각형 — 테이블(실측 > 추정) 다음 메모(폭 저장값·높이 실측 > 추정) 문서 순서 */
export function objectRects(
  doc: EditorDocument,
  sizeReports: Record<string, { w: number; h: number }> = {},
): ObjectRect[] {
  const tables: ObjectRect[] = doc.model.tables.flatMap((table) => {
    const layout = doc.diagram.nodes[table.id]
    if (!layout) return []
    const size = sizeReports[table.id] ?? {
      w: tableRenderWidth(layout.width ?? null, 0),
      h: estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length),
    }
    return [{ id: table.id, kind: 'table' as const, x: layout.x, y: layout.y, w: size.w, h: size.h }]
  })
  const notes: ObjectRect[] = doc.diagram.notes.map((note) => ({
    id: note.id,
    kind: 'note' as const,
    x: note.x,
    y: note.y,
    w: note.width ?? 360,
    h: sizeReports[note.id]?.h ?? NOTE_ESTIMATED_HEIGHT,
  }))
  return tables.concat(notes)
}

/** 메모를 놓을 자리가 비었는지 — 아니면 오른쪽/아래 중 이동량이 작은 쪽으로 밀어낸다.
 *  방향을 +x/+y로 고정해 장애물이 연쇄돼도 수렴한다(왼쪽·위로 밀면 진동할 수 있다).
 *  자리가 이미 비었으면 좌표를 그대로 돌려준다(무조건 이동하지 않는다). */
export function placeNoteFree(
  note: { x: number; y: number; w: number; h: number },
  obstacles: ObjectRect[],
  gap = NOTE_OVERLAP_GAP,
): { x: number; y: number } {
  let { x, y } = note
  const self: ObjectRect = { id: '', kind: 'note', x, y, w: note.w, h: note.h }
  const guardMax = obstacles.length * 4 + 8
  for (let guard = 0; guard <= guardMax; guard += 1) {
    let pushX = 0
    let pushY = 0
    for (const o of obstacles) {
      self.x = x
      self.y = y
      if (!rectsOverlap(self, o)) continue
      pushX = Math.max(pushX, o.x + o.w + gap - x)
      pushY = Math.max(pushY, o.y + o.h + gap - y)
    }
    if (pushX === 0 && pushY === 0) break
    if (pushX <= pushY) x += pushX
    else y += pushY
  }
  return { x: Math.round(x), y: Math.round(y) }
}
