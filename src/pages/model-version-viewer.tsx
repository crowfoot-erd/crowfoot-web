/**
 * 버전 기록 뷰어 (08-core/02-model.md §1.11 — /workspaces/{ws}/models/{id}/history/{version})
 *
 * - 해당 시점 스냅샷을 읽기 전용 캔버스로 연다 — 본체는 EditorShell(publicView) 재사용
 * - 헤더는 문서명·v{N}·메모·작성자·일시, 현재 버전이면 "현재" 배지
 * - 되돌리기(복원): 과거 content를 "새 버전으로" 저장한다 — 과거 버전은 불변. 현재 버전
 *   복원은 같은 내용을 다시 저장하는 것이라 노출하지 않는다. baseVersion은 문서 상세
 *   version(복원 시점 최신)을 쓰고, 충돌(409)은 안내 후 문서에서 다시 시도하게 한다.
 * - modelId는 합성 식별자(history-{id}-v{N}) — 실제 id면 에디터 스토어 수화가
 *   진짜 문서로 착각해 엉뚱한 문서를 그린다(share-viewer `share-{token}` 관례).
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import type { Model } from '@/api/types'
import { isApiError } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'
import { EditorShell } from '@/features/editor'
import { modelEditorPath, useModel, useModelVersionDetail, useRestoreModelVersion } from '@/features/models'
import { useMyWorkspaces } from '@/features/workspaces'

/** 스냅샷 상세 → EditorShell이 받는 Model 모양 — modelId는 버전 식별 합성어로 대체 */
function toViewerModel(model: Model, version: number, content: string): Model {
  return {
    ...model,
    modelId: `history-${model.modelId}-v${version}`,
    workspaceId: '', // 읽기 전용 화면 — 저장·임시 저장·협업 경로가 없다
    sourceConnectionId: null, // 버전 뷰어 — DB 동기화 없음
    version,
    content,
  }
}

export function ModelVersionViewerPage() {
  const { t } = useTranslation()
  const { workspaceId = '', modelId = '', version: versionParam = '' } = useParams()
  const version = Number(versionParam)
  const navigate = useNavigate()

  const model = useModel(workspaceId, modelId)
  const detail = useModelVersionDetail(workspaceId, modelId, version, Number.isFinite(version))
  const myWorkspaces = useMyWorkspaces()
  const restore = useRestoreModelVersion(workspaceId, modelId)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const myRole = myWorkspaces.data?.items.find((ws) => ws.workspaceId === workspaceId)?.myRole
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  const invalidVersion = !Number.isFinite(version) || version < 0

  const confirmRestore = () => {
    if (!model.data) return
    restore.mutate(
      { version, baseVersion: model.data.version },
      {
        onSuccess: (result) => {
          toast.success(t('model.editor.history.restored', { version: result?.version ?? version }))
          navigate(modelEditorPath(workspaceId, modelId))
        },
        onError: (error) => {
          // 409 — 복원 사이 남이 저장했다. 안내 후 문서로 가서 최신 상태로 다시 시도한다
          toast.error(errorMessage(error))
          if (isApiError(error) && error.resultCode === 'VERSION_CONFLICT') setConfirmOpen(false)
        },
      },
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      {model.isPending || detail.isPending ? (
        // 문서 메타 + 스냅샷 상세(content) 조회 — 전체 화면 중앙 스피너 (model-viewer 관례)
        <div
          role="status"
          aria-live="polite"
          data-testid="editor-loading"
          className="flex flex-1 flex-col items-center justify-center gap-4"
        >
          <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      ) : model.isError || !model.data ? (
        <div className="flex flex-1 items-center justify-center">
          <ErrorState onRetry={() => void model.refetch()} />
        </div>
      ) : invalidVersion || detail.isError || !detail.data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">{t('model.editor.history.notFound')}</p>
          <Button asChild variant="outline" size="sm">
            <Link to={modelEditorPath(workspaceId, modelId)}>
              <ArrowLeft aria-hidden />
              {t('model.editor.history.backToDoc')}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold">{model.data.name}</h1>
                <Badge variant="outline" className="font-mono text-[10px]">v{detail.data.version}</Badge>
                {detail.data.version === model.data.version ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {t('model.editor.history.current')}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="font-mono text-[10px]">
                  {model.data.databaseType}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  detail.data.createdBy?.name ?? t('common.system'),
                  formatDateTime(detail.data.createdAt),
                ].join(' · ')}
              </p>
              {detail.data.memo ? <p className="truncate text-xs font-medium">{detail.data.memo}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canEdit && detail.data.version !== model.data.version ? (
                <Button type="button" size="sm" onClick={() => setConfirmOpen(true)} disabled={restore.isPending}>
                  <RotateCcw aria-hidden />
                  {t('model.editor.history.restore')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate(modelEditorPath(workspaceId, modelId))}
              >
                <ArrowLeft aria-hidden />
                {t('model.editor.history.backToDoc')}
              </Button>
            </div>
          </header>
          <EditorShell
            model={toViewerModel(model.data, detail.data.version, detail.data.content)}
            canEdit={false}
            publicView
          />
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('model.editor.history.restoreConfirmTitle')}
        description={t('model.editor.history.restoreConfirmDescription', {
          version: detail.data?.version ?? version,
        })}
        confirmLabel={t('model.editor.history.restore')}
        confirming={restore.isPending}
        onConfirm={confirmRestore}
      />
    </div>
  )
}
