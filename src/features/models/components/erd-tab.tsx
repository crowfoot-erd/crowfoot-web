/**
 * ERD 탭 (storyboard 02-user §5 — 워크스페이스 상세 첫 번째 탭)
 *
 * - 문서(모델) 목록 — 이름·DB 종류·캔버스 크기·버전·생성자·최근 수정, keyword 검색(300ms 디바운스)
 * - 문서 열기는 모든 멤버 — 이름·돋보기로 새 창 전체 화면(에디터 셸)에 띄운다
 * - 생성·메타 변경은 Editor 이상, 삭제는 Owner 전용 (1.2·1.4·1.6 최소 역할)
 */
import { useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'
import type { ModelSummary } from '@/api/types'
import {
  CreateModelDialog,
  EditModelDialog,
  modelEditorPath,
  useDeleteModel,
  useModels,
} from '@/features/models'

export interface ErdTabProps {
  workspaceId: string
  canCreate: boolean
  isOwner: boolean
}

export function ErdTab({ workspaceId, canCreate, isOwner }: ErdTabProps) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ModelSummary | null>(null)
  const [deleting, setDeleting] = useState<ModelSummary | null>(null)
  const debouncedKeyword = useDebouncedValue(keyword)
  const models = useModels(workspaceId, debouncedKeyword.trim())
  const deleteMutation = useDeleteModel(workspaceId)

  const handleDelete = () => {
    if (!deleting) return
    deleteMutation.mutate(deleting.modelId, {
      onSuccess: () => {
        setDeleting(null)
        toast.success(t('model.delete.successToast', { name: deleting.name }))
      },
      onError: (error) => {
        toast.error(errorMessage(error))
      },
    })
  }

  /** 문서 열기 — 새 창 전체 화면, 앱 셸 없이 */
  const openModel = (model: ModelSummary) => {
    window.open(modelEditorPath(workspaceId, model.modelId), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search aria-hidden className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('model.list.searchPlaceholder')}
            className="h-9 w-64 pl-8"
            aria-label={t('model.list.searchPlaceholder')}
          />
        </div>
        {canCreate ? (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            {t('model.list.newDocument')}
          </Button>
        ) : null}
      </div>

      {models.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : models.isError ? (
        <ErrorState onRetry={() => void models.refetch()} />
      ) : (models.data?.items.length ?? 0) > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('model.list.columns.document')}</TableHead>
              <TableHead>{t('model.list.columns.databaseType')}</TableHead>
              <TableHead>{t('model.list.columns.canvas')}</TableHead>
              <TableHead>{t('model.list.columns.version')}</TableHead>
              <TableHead>{t('model.list.columns.createdBy')}</TableHead>
              <TableHead>{t('model.list.columns.updatedAt')}</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(models.data?.items ?? []).map((model) => (
              <TableRow key={model.modelId}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left font-medium underline-offset-4 hover:underline"
                    onClick={() => openModel(model)}
                  >
                    {model.name}
                  </button>
                  {model.description ? (
                    <p className="text-xs text-muted-foreground">{model.description}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {model.databaseType}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {model.canvasWidth}×{model.canvasHeight}
                </TableCell>
                <TableCell className="text-muted-foreground">v{model.version}</TableCell>
                <TableCell>{model.createdBy?.name ?? t('common.system')}</TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(model.updatedAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openModel(model)}
                      aria-label={t('model.list.open', { name: model.name })}
                    >
                      <Search aria-hidden className="h-4 w-4" />
                    </Button>
                    {canCreate ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(model)}
                        aria-label={t('model.edit.title', { name: model.name })}
                      >
                        <Pencil aria-hidden className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {isOwner ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(model)}
                        aria-label={t('model.delete.title', { name: model.name })}
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          illustration="workspace"
          title={t('model.list.empty.title')}
          description={t('model.list.empty.description')}
          action={
            canCreate ? (
              <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden />
                {t('model.list.empty.cta')}
              </Button>
            ) : undefined
          }
        />
      )}

      <CreateModelDialog open={createOpen} onOpenChange={setCreateOpen} workspaceId={workspaceId} />
      <EditModelDialog model={editing} onOpenChange={(open) => !open && setEditing(null)} workspaceId={workspaceId} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('model.delete.title', { name: deleting?.name ?? '' })}
        description={t('model.delete.description', { name: deleting?.name ?? '' })}
        confirmLabel={t('model.delete.confirm')}
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
