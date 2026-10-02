/**
 * 복사·붙여넣기·복제 명령 — 단축키(EditorShell)와 우클릭 메뉴(ErdCanvas)가 함께 쓴다 (05-editor/02-ui.md §8·§9)
 *
 * 스토어를 읽고 커밋하는 얇은 층이다. 재구성 규칙은 clipboard.ts에 있다.
 */
import { copyToClipboard, pasteFromClipboard, type CopyResult } from '@/features/editor/model/clipboard'
import { currentViewCenter } from '@/features/editor/model/view-center'
import { useEditorStore } from '@/features/editor/store/editor-store'

/**
 * 우클릭 대상의 범위 — 대상이 선택 상태면 선택 전체, 아니면 그 객체만(그룹 메뉴와 같은 규칙).
 * 대상이 없으면(단축키) 선택 전체다.
 */
export function clipboardTargets(targetId?: string): string[] {
  const { selectedIds } = useEditorStore.getState()
  if (!targetId) return selectedIds
  return selectedIds.includes(targetId) ? selectedIds : [targetId]
}

export function copySelection(targetId?: string): CopyResult {
  const { present, modelId } = useEditorStore.getState()
  return copyToClipboard(present, clipboardTargets(targetId), modelId)
}

/** 붙여넣고 붙여넣은 객체를 선택한다 — 붙여넣은 것이 없으면 false */
export function pasteClipboard(copyLabel: string, anchor?: { x: number; y: number }): boolean {
  const { present, modelId, commitAll, setSelection, databaseType } = useEditorStore.getState()
  const pasted = pasteFromClipboard(present, copyLabel, databaseType, {
    modelId,
    anchor: anchor ?? null,
    center: currentViewCenter(),
  })
  if (!pasted) return false
  commitAll(pasted.changes)
  setSelection(pasted.selectedIds)
  return true
}

/** 복제 — 복사하고 곧바로 붙여넣는다(원본에서 32px 치우친 자리) */
export function duplicateSelection(copyLabel: string, targetId?: string): CopyResult {
  const result = copySelection(targetId)
  if (result.copied) pasteClipboard(copyLabel)
  return result
}
