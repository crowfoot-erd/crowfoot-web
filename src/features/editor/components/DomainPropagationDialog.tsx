/**
 * 도메인 타입 전파 미리보기 (05-editor/01-core.md §11.1 전파, 05-editor/02-ui.md §16)
 *
 * 도메인 타입이 바뀐 뒤 그 도메인 타입을 쓰는 컬럼에 반영할지 정한다. 컬럼마다 바뀔 속성의
 * 이전 값과 새 값을 보여 주고, 고른 컬럼에만 전파한다. 고르지 않은 컬럼은 값을 그대로 두고
 * "다르게 쓰기"로 표시해 다시 묻지 않는다. 변경 전체가 Undo 한 번으로 취소된다.
 */
import { useState } from 'react'
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
import { buildPropagationChanges, type StaleColumn } from '@/features/editor/model/domain-type'
import { fieldValueLabel } from '@/features/editor/model/domain-type-format'
import { useEditorStore } from '@/features/editor/store/editor-store'

export interface DomainPropagationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stale: StaleColumn[]
  dbmsId: string
}

export function DomainPropagationDialog({ open, onOpenChange, ...rest }: DomainPropagationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 열릴 때마다 새로 마운트한다 — 그 시점의 대상 컬럼을 전부 고른 상태로 시작한다 */}
      {open ? <PropagationBody onClose={() => onOpenChange(false)} {...rest} /> : null}
    </Dialog>
  )
}

function PropagationBody({ stale, dbmsId, onClose }: Omit<DomainPropagationDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const { t } = useTranslation()
  const commitAll = useEditorStore((s) => s.commitAll)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(stale.map((item) => item.key)))
  const labels = {
    yes: t('model.editor.domainType.value.yes'),
    no: t('model.editor.domainType.value.no'),
    none: t('model.editor.domainType.value.none'),
  }

  const toggle = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }
  const decide = (keys: ReadonlySet<string>) => {
    commitAll(buildPropagationChanges(stale, keys))
    onClose()
  }

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{t('model.editor.domainType.propagation.title')}</DialogTitle>
        <DialogDescription>{t('model.editor.domainType.propagation.description')}</DialogDescription>
      </DialogHeader>

      <ul className="grid gap-2 text-sm">
        {stale.map((item) => (
          <li key={item.key} className="rounded-md border p-2">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={selected.has(item.key)}
                onChange={() => toggle(item.key)}
                aria-label={`${item.tableName}.${item.columnName}`}
              />
              <code className="text-xs">
                {item.tableName}.{item.columnName}
              </code>
              <span className="text-xs font-normal text-muted-foreground">{item.domainType.name}</span>
            </label>
            {item.changes.length === 0 ? (
              <p className="mt-1 pl-6 text-xs text-muted-foreground">{t('model.editor.domainType.propagation.noValueChange')}</p>
            ) : (
              <ul className="mt-1 grid gap-0.5 pl-6 text-xs">
                {item.changes.map((change) => (
                  <li key={change.field} className={change.skipped ? 'text-muted-foreground' : undefined}>
                    {t(`model.editor.domainType.field.${change.field}`)}:{' '}
                    {fieldValueLabel(change.field, change.from, dbmsId, labels)} →{' '}
                    {fieldValueLabel(change.field, change.to, dbmsId, labels)}
                    {change.skipped ? ` (${t('model.editor.domainType.propagation.skipped')})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => decide(new Set())}>
          {t('model.editor.domainType.propagation.skipAll')}
        </Button>
        <Button type="button" onClick={() => decide(selected)} disabled={selected.size === 0}>
          {t('model.editor.domainType.propagation.apply', { count: selected.size })}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
