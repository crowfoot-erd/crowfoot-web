/**
 * ERD 탭 (storyboard 02-user §5 — 워크스페이스 상세 첫 번째 탭)
 *
 * - 문서(모델) 목록 — 이름·DB 종류·캔버스 크기·버전·생성자·최근 수정, keyword 검색(300ms 디바운스)
 * - 목록은 offset 페이징(20/page, ?page= URL — notifications 관례). 문서 수백 건 라이브러리 대응
 * - 문서 열기는 모든 멤버 — 이름·돋보기로 새 창 전체 화면(에디터 셸)에 띄운다
 * - 생성·메타 변경은 Editor 이상, 삭제는 Owner 전용 (1.2·1.4·1.6 최소 역할)
 * - 데이터베이스 최초 연결(1.14)은 미연결 문서에만 — Editor 이상 행 액션(Link2).
 *   연결된 문서는 DB 종류 배지에 링크 표시로 구분한다
 */
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Ellipsis, Link2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DbmsIcon } from '@/components/dbms-icon'
import { dbmsLabel } from '@/features/editor/model/dbms'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'
import type { ModelSummary } from '@/api/types'
import { DatabaseImportButton } from '@/features/connections'
import {
  ConnectDatabaseDialog,
  CreateModelDialog,
  EditModelDialog,
  ImportCrownButton,
  modelEditorPath,
  SqlImportButton,
  TemplateStartButton,
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [keyword, setKeyword] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ModelSummary | null>(null)
  const [deleting, setDeleting] = useState<ModelSummary | null>(null)
  const [connecting, setConnecting] = useState<ModelSummary | null>(null)
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
  const debouncedKeyword = useDebouncedValue(keyword)
  const models = useModels(workspaceId, debouncedKeyword.trim(), page)
  const deleteMutation = useDeleteModel(workspaceId)

  /** 페이지 이동 — ?tab= 등 다른 파라미터는 보존(함수형 갱신), 1페이지는 파라미터를 지운다 */
  const setPage = (nextPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nextPage <= 1) next.delete('page')
      else next.set('page', String(nextPage))
      return next
    })
  }

  /** 마지막 페이지의 문서를 지워 현재 페이지가 빈 경우 마지막 유효 페이지로 당긴다 */
  useEffect(() => {
    if (models.data && models.data.items.length === 0 && page > 1) {
      setPage(Math.max(1, models.data.totalPages))
    }
  })

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
            onChange={(event) => {
              setKeyword(event.target.value)
              // 검색어가 바뀌면 결과 묶음도 달라진다 — 페이지를 1로 되돌린다
              if (page > 1) setPage(1)
            }}
            placeholder={t('model.list.searchPlaceholder')}
            className="h-9 w-64 pl-8"
            aria-label={t('model.list.searchPlaceholder')}
          />
        </div>
        {canCreate ? (
          <div className="flex items-center gap-2">
            <ImportCrownButton workspaceId={workspaceId} />
            <DatabaseImportButton workspaceId={workspaceId} />
            <SqlImportButton workspaceId={workspaceId} />
            <TemplateStartButton workspaceId={workspaceId} />
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              {t('model.list.newDocument')}
            </Button>
          </div>
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
        <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('model.list.columns.document')}</TableHead>
              <TableHead>{t('model.list.columns.databaseType')}</TableHead>
              <TableHead>{t('model.list.columns.version')}</TableHead>
              <TableHead>{t('model.list.columns.createdBy')}</TableHead>
              <TableHead>{t('model.list.columns.updatedAt')}</TableHead>
              <TableHead className="w-36" />
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
                  {/* 긴 설명이 표 폭을 넘겨 가로 스크롤을 내지 않도록 한 줄로 자른다 — 전문은 문서 편집에서 */}
                  {model.description ? (
                    <p className="max-w-md truncate text-xs text-muted-foreground">{model.description}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <DbmsIcon databaseType={model.databaseType} className="size-3" />
                    {dbmsLabel(model.databaseType)}
                    {/* 원천 커넥션 연결 표시 — 리버스 생성 또는 최초 연결(1.14)된 문서 */}
                    {model.sourceConnectionId ? (
                      <span title={t('model.connect.connected')} className="inline-flex">
                        <Link2 aria-hidden className="size-3 text-emerald-600 dark:text-emerald-400" />
                      </span>
                    ) : null}
                  </Badge>
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
                    {/* 그 밖의 행 작업은 메뉴로 묶는다 — 삭제가 다른 아이콘 옆에 늘 떠 있지 않게 하고,
                        아이콘만으로는 알기 어려운 작업에 글자 이름을 붙인다.
                        데이터베이스 최초 연결(1.14)은 미연결 문서에만 — 연결되면 DB 동기화(에디터)로 전환된다 */}
                    {canCreate || isOwner ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t('model.list.actions', { name: model.name })}
                          >
                            <Ellipsis aria-hidden className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          {canCreate && model.sourceConnectionId === null ? (
                            <DropdownMenuItem onSelect={() => setConnecting(model)}>
                              <Link2 aria-hidden />
                              {t('model.list.menu.connect')}
                            </DropdownMenuItem>
                          ) : null}
                          {canCreate ? (
                            <DropdownMenuItem onSelect={() => setEditing(model)}>
                              <Pencil aria-hidden />
                              {t('model.list.menu.edit')}
                            </DropdownMenuItem>
                          ) : null}
                          {isOwner ? (
                            <>
                              {canCreate ? <DropdownMenuSeparator /> : null}
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(model)}>
                                <Trash2 aria-hidden />
                                {t('model.list.menu.delete')}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {/* 문서가 한 페이지(20)를 넘는 워크스페이스만 — 총 건수 + 이전/다음 (notifications 관례) */}
        {models.data && models.data.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t('common.total', { count: models.data.totalCount })}</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('common.pagination.prev')}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('common.pagination.page', { page: models.data.page, totalPages: models.data.totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('common.pagination.next')}
                disabled={page >= models.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
        </>
      ) : (
        <EmptyState
          illustration="workspace"
          title={t('model.list.empty.title')}
          description={t('model.list.empty.description')}
          action={
            canCreate ? (
              // 빈 상태 보조 CTA — 새 문서와 나란히 "템플릿으로 시작"을 제시한다
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden />
                  {t('model.list.empty.cta')}
                </Button>
                <TemplateStartButton workspaceId={workspaceId} />
              </div>
            ) : undefined
          }
        />
      )}

      <CreateModelDialog open={createOpen} onOpenChange={setCreateOpen} workspaceId={workspaceId} />
      <EditModelDialog
        model={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        workspaceId={workspaceId}
        canEdit={canCreate}
      />
      {/* 최초 연결 다이얼로그 — 공용 컴포넌트(에디터 툴바와 같은 것)를 행 액션에서도 쓴다 */}
      {connecting ? (
        <ConnectDatabaseDialog
          open
          onOpenChange={(open) => !open && setConnecting(null)}
          workspaceId={workspaceId}
          model={connecting}
        />
      ) : null}
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
