/**
 * 메모 ↔ 테이블 연관 — 드래그 드롭 판정 (05-editor/02-ui.md §7)
 *
 * 메모를 테이블 위로 가져다 놓으면(drag stop) 그 테이블과 연관으로 지정한다.
 * 판정은 메모 박스 중심점이 테이블 AABB 안에 들어왔는지로 본다 — 노트 높이는 내용량에
 * 따라 가변이라 실측 대신 표준 높이 추정치를 쓰고, 밴드(좌상단)만으로 판정하면
 * "테이블에 얹혔다"는 직관과 어긋나기 때문에 중심점을 쓴다.
 * 연관이 지정되면 메모는 드래그 전 위치로 되돌아간다(테이블 위에 올려 두면 테이블을 가린다).
 */
import type { RouterBox } from '../components/canvas/edge-router'

/** 메모 표준 높이 추정치 — 밴드 28 + 본문 4행 여백 포함. 판정용 근사값이다 */
export const NOTE_DROP_HEIGHT = 130

/** 드롭 판정용 메모 박스 — 좌상단 좌표와 저장된 폭 */
export interface NoteDropRect {
  x: number
  y: number
  width: number
}

/** 드롭 대상 후보 — 테이블 id와 렌더 추정 박스 */
export interface TableDropBox {
  id: string
  box: RouterBox
}

/** 메모 중심점을 포함한 테이블을 찾는다 — 여러 개면 문서 순서상 첫 번째 */
export function findNoteDropTarget(note: NoteDropRect, tables: TableDropBox[]): string | null {
  const cx = note.x + note.width / 2
  const cy = note.y + NOTE_DROP_HEIGHT / 2
  const hit = tables.find(({ box }) => cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h)
  return hit?.id ?? null
}
