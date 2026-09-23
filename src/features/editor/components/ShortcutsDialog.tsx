/**
 * 단축키 치트시트 — 에디터 단축키 요약 도움말 (05-editor/02-ui.md §9)
 *
 * 오픈 지점: Ctrl/Cmd+/ (EditorShell keydown — 입력 요소 포커스 중에도 동작하는
 * 유일한 단축키. 도움말은 편집을 방해하지 않는다)과 툴바 Keyboard 버튼.
 * 내용은 §9의 v1 구현 블록과 1:1 — 단축키가 늘면 이 표와 스펙을 함께 갱신한다.
 * canEdit=false면 편집 그룹을 흐리게 하고 각주로 이유를 밝힌다.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 편집 권한 — false면 편집 단축키 그룹을 흐리게 표시한다 */
  canEdit: boolean
}

/** 키캡 — 토큰 하나. 조합은 '+' 구분자로 잇는다 */
function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

interface ShortcutRow {
  /** 키캡 토큰 — 물리 키라 번역하지 않는다. 번역이 필요한 표기(우클릭)는 keysLabel로 */
  keys?: string[]
  /** 키캡 전체를 번역 텍스트로 표시(마우스 동작 등) */
  keysLabel?: string
  labelKey: string
  /** 이 행이 편집 권한을 필요로 하는가 — 그룹 단위 대신 행 단위 판정도 가능하게 */
  requiresEdit?: boolean
}

interface ShortcutGroup {
  titleKey: string
  rows: ShortcutRow[]
}

/** §9 v1 구현 블록 순서 — 편집 → 선택·탐색 → 이동 → 캔버스 */
const GROUPS: ShortcutGroup[] = [
  {
    titleKey: 'model.editor.shortcuts.group.editing',
    rows: [
      { keys: ['Ctrl / ⌘', 'Z'], labelKey: 'model.editor.shortcuts.row.undo', requiresEdit: true },
      { keys: ['Ctrl / ⌘', 'Shift', 'Z / Y'], labelKey: 'model.editor.shortcuts.row.redo', requiresEdit: true },
      { keys: ['Ctrl / ⌘', 'S'], labelKey: 'model.editor.shortcuts.row.save' },
      { keys: ['Ctrl / ⌘', 'C'], labelKey: 'model.editor.shortcuts.row.copy', requiresEdit: true },
      { keys: ['Ctrl / ⌘', 'V'], labelKey: 'model.editor.shortcuts.row.paste', requiresEdit: true },
      { keys: ['Ctrl / ⌘', 'D'], labelKey: 'model.editor.shortcuts.row.duplicate', requiresEdit: true },
    ],
  },
  {
    titleKey: 'model.editor.shortcuts.group.navigation',
    rows: [
      { keys: ['Ctrl / ⌘', 'F'], labelKey: 'model.editor.shortcuts.row.search' },
      { keys: ['Ctrl / ⌘', 'A'], labelKey: 'model.editor.shortcuts.row.selectAll' },
      { keys: ['Esc'], labelKey: 'model.editor.shortcuts.row.deselect' },
      { keys: ['Shift', 'Click'], labelKey: 'model.editor.shortcuts.row.rangeSelect' },
      { keys: ['Ctrl / ⌘', '/'], labelKey: 'model.editor.shortcuts.row.help' },
    ],
  },
  {
    titleKey: 'model.editor.shortcuts.group.move',
    rows: [
      { keys: ['↑ ↓ ← →'], labelKey: 'model.editor.shortcuts.row.nudge', requiresEdit: true },
      { keys: ['Shift', '↑ ↓ ← →'], labelKey: 'model.editor.shortcuts.row.nudgeFast', requiresEdit: true },
    ],
  },
  {
    titleKey: 'model.editor.shortcuts.group.canvas',
    rows: [
      { keys: ['Space', 'Drag'], labelKey: 'model.editor.shortcuts.row.pan' },
      { keysLabel: 'model.editor.shortcuts.keys.rightClick', labelKey: 'model.editor.shortcuts.row.contextMenu' },
      { keys: ['Delete'], labelKey: 'model.editor.shortcuts.row.delete', requiresEdit: true },
    ],
  },
]

export function ShortcutsDialog({ open, onOpenChange, canEdit }: ShortcutsDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('model.editor.shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('model.editor.shortcuts.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto py-2">
          {GROUPS.map((group) => (
            <section key={group.titleKey} className="grid gap-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(group.titleKey)}
              </h3>
              <ul className="grid gap-1">
                {group.rows.map((row) => {
                  const muted = row.requiresEdit === true && !canEdit
                  return (
                    <li
                      key={row.labelKey}
                      className={`flex items-center justify-between gap-4 rounded-md px-1 py-0.5 ${muted ? 'opacity-50' : ''}`}
                    >
                      <span className="text-sm">{t(row.labelKey)}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {row.keys
                          ? row.keys.map((token, index) => (
                              <span key={`${row.labelKey}:${index}`} className="flex items-center gap-1">
                                {index > 0 ? <span aria-hidden className="text-[10px] text-muted-foreground">+</span> : null}
                                <Kbd>{token}</Kbd>
                              </span>
                            ))
                          : row.keysLabel
                            ? <Kbd>{t(row.keysLabel)}</Kbd>
                            : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        {!canEdit ? (
          <p className="text-xs text-muted-foreground">{t('model.editor.shortcuts.readOnlyNote')}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
