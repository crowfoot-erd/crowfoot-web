/**
 * S-03 워크스페이스 진입 (storyboard 02-user §2)
 * 마지막으로 선택한 워크스페이스(기억이 없거나 이미 없어졌으면 목록의 첫 항목) 상세로 이동한다 —
 * 탐색은 좌측 워크스페이스 사이드바가 담당한다. 빈 상태일 때만 목록 화면을 렌더해 생성 CTA를 노출한다.
 */
import { Navigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { useMyWorkspaces, useCreateWorkspaceDialog } from '@/features/workspaces'
import { getLastWorkspaceId } from '@/lib/last-workspace'

export function WorkspacesPage() {
  const { t } = useTranslation()
  const workspaces = useMyWorkspaces()
  const openCreateDialog = useCreateWorkspaceDialog((state) => state.openDialog)

  if (workspaces.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  }

  if (workspaces.isError) {
    return <ErrorState onRetry={() => void workspaces.refetch()} />
  }

  const items = workspaces.data?.items ?? []
  if (items.length > 0) {
    // 마지막 선택 기억 → 없으면 목록 첫 항목 (삭제된 워크스페이스는 find 실패로 자동 폴백)
    const last = getLastWorkspaceId()
    const target = items.find((workspace) => workspace.workspaceId === last) ?? items[0]
    return <Navigate to={`/workspaces/${target.workspaceId}`} replace />
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('workspace.list.title')}</h1>
      <EmptyState
        illustration="workspace"
        title={t('workspace.list.empty.title')}
        description={t('workspace.list.empty.description')}
        action={
          <Button type="button" size="sm" onClick={openCreateDialog}>
            <Plus aria-hidden />
            {t('workspace.list.empty.cta')}
          </Button>
        }
      />
    </div>
  )
}
