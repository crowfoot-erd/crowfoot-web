/**
 * 메모 노드 — 포스트잇 (05-editor/02-ui.md §7, storyboard 02-user §5A)
 *
 * 헤더 밴드(드래그 핸들)에 제목을 표시한다. 밴드 더블클릭 → 편집 다이얼로그(제목 + 강조색 픽커),
 * 본문 textarea 인라인 편집(blur 확정)·폭 리사이즈(드래그 중 폭이 실시간으로 보인다).
 * 위치는 밴드 드래그로 옮기고
 * ErdCanvas가 mouseup에 note/patch로 커밋한다. 밴드 오른쪽 끝 삭제 버튼.
 * 연관 테이블이 지정되면 밴드에 물리명 배지가 붙는다 — 메모를 테이블 위에 드래그해 놓으면
 * ErdCanvas가 연관을 지정하고 메모는 드래그 전 위치로 되돌린다.
 */
import { memo, useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { Table2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from 'cn'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { NoteDialog } from '../NoteDialog'
import { useEditorCanvas } from './editor-context'
import { noteSkin } from './note-skin'

export type NoteNodeData = Record<string, never>
export type NoteNodeType = Node<NoteNodeData, 'note'>

const DEFAULT_WIDTH = 360
const MIN_WIDTH = 120

function NoteNodeComponent({ id, selected }: NodeProps<NoteNodeType>) {
  const { t } = useTranslation()
  const { canEdit } = useEditorCanvas()
  const note = useEditorStore((s) => s.present.diagram.notes.find((n) => n.id === id))
  const linkedTable = useEditorStore((s) =>
    note?.linkedTableId ? s.present.model.tables.find((t) => t.id === note.linkedTableId) : undefined,
  )
  /** 편집 다이얼로그의 연관 후보 — 다이얼로그는 편집 중에만 뜨니 전체 구독해도 부담이 없다 */
  const tables = useEditorStore((s) => s.present.model.tables)
  const commit = useEditorStore((s) => s.commit)

  const [draft, setDraft] = useState(note?.text ?? '')
  const focused = useRef(false)
  /** 편집 다이얼로그 — 밴드 더블클릭으로 연다 */
  const [editing, setEditing] = useState(false)
  /** 리사이즈 라이브 프리뷰 폭 — 드래그 중에도 폭이 마우스를 따라 늘어나게 한다(커밋은 onResizeEnd) */
  const [resizingWidth, setResizingWidth] = useState<number | null>(null)

  // 비포커스 시 외부 값(undo) 반영 — 입력 중 덮어쓰지 않는다
  useEffect(() => {
    if (!focused.current) setDraft(note?.text ?? '')
  }, [note?.text])

  if (!note) return null

  const commitText = () => {
    focused.current = false
    if (draft === note.text) return
    commit({ type: 'note/patch', noteId: id, patch: { text: draft } })
  }

  const skin = noteSkin(note.color)

  return (
    <div
      data-nodekind="note"
      className={cn('relative rounded-md border shadow-sm', skin.box, selected && 'ring-1 ring-amber-400')}
      style={{ ...skin.boxStyle, width: resizingWidth ?? (note.width ?? DEFAULT_WIDTH) }}
    >
      {canEdit ? (
        <NodeResizer
          isVisible={selected}
          minWidth={MIN_WIDTH}
          onResize={(_, params) => setResizingWidth(Math.round(params.width))}
          onResizeEnd={(_, params) => {
            commit({ type: 'note/patch', noteId: id, patch: { width: Math.round(params.width) } })
            setResizingWidth(null)
          }}
        />
      ) : null}
      {/* 리사이즈 중 폭 표시 — 드래그 즉시 값이 보여야 늘리는 폭을 읽을 수 있다 */}
      {resizingWidth !== null ? (
        <span className="nodrag pointer-events-none absolute -top-7 right-0 rounded border bg-popover px-1.5 py-0.5 text-[10px] tabular-nums text-popover-foreground shadow-sm">
          {resizingWidth}px
        </span>
      ) : null}

      {/* 헤더 밴드 — 드래그 핸들 + 제목. 더블클릭하면 편집 다이얼로그가 열린다 */}
      <div
        className={cn(
          'flex h-7 items-center gap-1 rounded-t-md px-2',
          skin.band,
          canEdit && 'cursor-grab active:cursor-grabbing',
        )}
        style={skin.bandStyle}
        title={t('model.editor.note.bandHint')}
        onDoubleClick={() => canEdit && setEditing(true)}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold opacity-80">
          {note.title || t('model.editor.note.untitled')}
        </span>
        {/* 연관 테이블 배지 — 드래그 드롭·편집 다이얼로그로 지정한다 */}
        {linkedTable ? (
          <span
            className="nodrag flex min-w-0 shrink-0 items-center gap-1 rounded-sm bg-black/10 px-1 py-0.5 text-[10px] font-medium opacity-90 dark:bg-white/15"
            title={t('model.editor.note.linkedTable')}
          >
            <Table2 aria-hidden className="size-3 shrink-0" />
            <span className="max-w-28 truncate">{linkedTable.physicalName}</span>
          </span>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            className="nodrag shrink-0 rounded-sm p-0.5 opacity-50 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
            title={t('model.editor.note.remove')}
            aria-label={t('model.editor.note.remove')}
            onClick={(event) => {
              // 밴드 드래그·더블클릭과 분리 — 삭제는 즉시 커밋(undo 1스택)
              event.stopPropagation()
              event.preventDefault()
              commit({ type: 'note/remove', noteId: id })
            }}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>

      <textarea
        className="nodrag nowheel h-auto w-full resize-none bg-transparent p-2 text-xs leading-relaxed outline-none placeholder:opacity-50"
        rows={4}
        value={draft}
        placeholder={canEdit ? t('model.editor.note.placeholder') : ''}
        readOnly={!canEdit}
        aria-label={t('model.editor.note.text')}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={commitText}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(note.text)
            event.currentTarget.blur()
          }
        }}
      />
      <Handle id="top" type="source" position={Position.Top} className="!size-1.5 !border-0 !bg-transparent" />

      {/* 편집 다이얼로그 — 포털로 렌더되므로 노드 밖(body)에 뜬다 */}
      {canEdit ? (
        <NoteDialog
          open={editing}
          onOpenChange={setEditing}
          note={note}
          tables={tables.map((t) => ({ id: t.id, physicalName: t.physicalName }))}
          onColorChange={(color) => commit({ type: 'note/patch', noteId: id, patch: { color } })}
          onTitleConfirm={(title) => commit({ type: 'note/patch', noteId: id, patch: { title } })}
          onLinkConfirm={(tableId) => commit({ type: 'note/patch', noteId: id, patch: { linkedTableId: tableId } })}
        />
      ) : null}
    </div>
  )
}

export const NoteNode = memo(NoteNodeComponent)
