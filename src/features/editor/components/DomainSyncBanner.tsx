/**
 * 도메인 타입 전파 알림 띠 (05-editor/02-ui.md §16)
 *
 * 이 문서에 "맞춘 뒤에 도메인 타입이 바뀐 컬럼"이 있으면 캔버스 위에 띠를 띄운다.
 * 편집 권한이 없으면 띄우지 않는다. 닫아도 결정한 것은 아니다 — 문서를 다시 열면 또 뜬다.
 */
import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useDomainTypes } from '@/features/domain-types/hooks'
import { DomainPropagationDialog } from '@/features/editor/components/DomainPropagationDialog'
import { findStaleColumns } from '@/features/editor/model/domain-type'
import { useEditorStore } from '@/features/editor/store/editor-store'

export function DomainSyncBanner({ workspaceId, canEdit, dbmsId }: { workspaceId: string | null; canEdit: boolean; dbmsId: string }) {
  const { t } = useTranslation()
  const domainTypes = useDomainTypes(canEdit ? workspaceId : null)
  const present = useEditorStore((s) => s.present)
  const stale = useMemo(
    () => (domainTypes.data ? findStaleColumns(present, domainTypes.data.items) : []),
    [present, domainTypes.data],
  )
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)

  if (!canEdit || stale.length === 0) return null
  return (
    <>
      {dismissed ? null : (
        <div
          role="status"
          className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md"
        >
          {t('model.editor.domainType.banner.message', { count: stale.length })}
          <Button type="button" size="sm" className="h-7" onClick={() => setOpen(true)}>
            {t('model.editor.domainType.banner.review')}
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t('model.editor.domainType.banner.dismiss')}
            title={t('model.editor.domainType.banner.dismiss')}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      )}
      <DomainPropagationDialog open={open} onOpenChange={setOpen} stale={stale} dbmsId={dbmsId} />
    </>
  )
}
