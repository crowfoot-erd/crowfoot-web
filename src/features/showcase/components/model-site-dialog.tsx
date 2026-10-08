/**
 * 문서의 "만든 사이트" 다이얼로그 (08-core/19-site-showcase.md Section 6) — 문서 목록 행의 사이트 아이콘이 연다(v1.41).
 * 등록·고치기·다시 가져오기·삭제는 안의 ModelSiteSection이 한다. 편집자 미만은 읽기만 한다.
 */
import { useTranslation } from 'react-i18next'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ModelSummary } from '@/api/types'
import { ModelSiteSection } from '@/features/showcase/components/model-site-section'

export interface ModelSiteDialogProps {
  model: ModelSummary | null
  onOpenChange: (open: boolean) => void
  workspaceId: string
  canEdit: boolean
}

export function ModelSiteDialog({ model, onOpenChange, workspaceId, canEdit }: ModelSiteDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={model !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg" data-testid="model-site-dialog">
        <DialogHeader>
          <DialogTitle>{t('model.site.dialogTitle', { name: model?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('model.site.notice')}</DialogDescription>
        </DialogHeader>
        {model ? <ModelSiteSection workspaceId={workspaceId} modelId={model.modelId} canEdit={canEdit} embedded /> : null}
      </DialogContent>
    </Dialog>
  )
}
