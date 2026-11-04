/**
 * 문서-데이터베이스 연결 해지 확인 — 공용 레이어 (08-core/02-model.md §1.17)
 *
 * ERD 탭 행 메뉴와 에디터 도구 메뉴가 같은 이 컴포넌트로 해지한다(최초 연결 다이얼로그와 같은 구조).
 * 문서의 연결만 끊는다 — 커넥션·데이터베이스·데이터는 남는다고 확인 문구에 적는다.
 */
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { ModelSummary } from '@/api/types'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDisconnectModel } from '@/features/models/hooks'
import { errorMessage } from '@/lib/result-code'

export interface DisconnectDatabaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  model: Pick<ModelSummary, 'modelId' | 'name'>
}

export function DisconnectDatabaseDialog({
  open,
  onOpenChange,
  workspaceId,
  model,
}: DisconnectDatabaseDialogProps) {
  const { t } = useTranslation()
  const disconnect = useDisconnectModel(workspaceId)

  const run = () => {
    disconnect.mutate(model.modelId, {
      onSuccess: () => {
        onOpenChange(false)
        toast.success(t('model.disconnect.successToast', { name: model.name }))
      },
      onError: (error) => {
        toast.error(errorMessage(error))
      },
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('model.disconnect.title')}
      description={t('model.disconnect.description', { model: model.name })}
      confirmLabel={t('model.disconnect.confirm')}
      destructive
      confirming={disconnect.isPending}
      onConfirm={run}
    />
  )
}
