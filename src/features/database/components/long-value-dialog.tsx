/**
 * 긴 값 보기·편집 (09-database-manager/00-data-browser.md §3.7·§5.2)
 *
 * 행 조회에서 잘려 내려온 문자 값을 통째로 읽어 와 보여 준다. 고친 값은 바로 저장하지 않는다 —
 * 다른 변경과 함께 모아 두었다가 [적용]으로 보낸다.
 */
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { databaseErrorMessage } from '@/features/database/errors'
import { useCellValue } from '@/features/database/hooks'
import type { EditValue } from '@/features/database/row-edits'
import { formatNumber } from '@/lib/format'

export interface LongValueDialogProps {
  workspaceId: string
  connectionId: string
  objectName: string
  target: { key: Record<string, string>; column: string; nullable: boolean }
  onClose: () => void
  /** 고친 값을 변경에 담는다 — original은 통째로 읽어 온 편집 전 값이다 */
  onSave: (value: EditValue, original: EditValue) => void
}

export function LongValueDialog({ workspaceId, connectionId, objectName, target, onClose, onSave }: LongValueDialogProps) {
  const { t } = useTranslation()
  const cell = useCellValue(workspaceId, connectionId, objectName, { key: target.key, column: target.column })
  const [draft, setDraft] = useState<string | null>(null)
  const loaded = cell.data
  const value = draft ?? loaded?.value ?? ''

  // 한도를 넘는 값 — 서버는 읽지 않고 전체 길이만 알려 준다(errors의 문구에 길이가 온다)
  const tooLargeError = isApiError(cell.error) && cell.error.resultCode === 'VALUE_TOO_LARGE' ? cell.error : null
  const tooLarge = tooLargeError !== null
  const tooLargeLength = Number(tooLargeError?.errors?.[0]?.message ?? 0)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('database.edit.longValue.title', { column: target.column })}</DialogTitle>
          <DialogDescription>
            {loaded ? t('database.edit.longValue.length', { formatted: formatNumber(value.length) }) : ' '}
          </DialogDescription>
        </DialogHeader>

        {cell.isPending ? (
          <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('common.loading')}
          </p>
        ) : cell.isError || !loaded ? (
          <p role="alert" className="py-4 text-sm text-destructive">
            {tooLarge
              ? t('database.edit.longValue.tooLarge', { formatted: formatNumber(tooLargeLength) })
              : databaseErrorMessage(cell.error)}
          </p>
        ) : (
          <textarea
            value={value}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            rows={16}
            aria-label={t('database.edit.longValue.title', { column: target.column })}
            className="w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          {loaded && target.nullable ? (
            <Button type="button" variant="outline" onClick={() => onSave(null, loaded.value)}>
              {t('database.edit.setNull')}
            </Button>
          ) : null}
          {loaded ? (
            <Button type="button" disabled={draft === null || draft === loaded.value} onClick={() => onSave(value, loaded.value)}>
              {t('database.edit.longValue.save')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
