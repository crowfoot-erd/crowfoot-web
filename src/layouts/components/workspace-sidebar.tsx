/**
 * 좌측 사이드바 — 새 워크스페이스 버튼(최상단 강조) + me/workspaces 트리 (storyboard 00-common §3.1 [2], [4])
 * 목록은 소유(나의 워크스페이스)와 공유받은(멤버로 참여 중) 두 섹션으로 나눠 보여준다 —
 * 섞여 있으면 내가 만든 것인지 초대받은 것인지 식별이 어렵다.
 * 목록·대시보드와 같은 ['workspaces','mine'] 쿼리를 공유한다.
 * 생성 다이얼로그 본체는 AppLayout이 마운트한다(관리자 사이드바로 교체돼도 유지).
 */
import { NavLink } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import { useCreateWorkspaceDialog, useMyWorkspaces } from '@/features/workspaces'
import type { MyWorkspace } from '@/api/types'
import { cn } from 'cn'

export function WorkspaceSidebar() {
  const { t } = useTranslation()
  const workspaces = useMyWorkspaces()
  const openDialog = useCreateWorkspaceDialog((state) => state.openDialog)

  // OWNER = 내가 만든 워크스페이스, 그 외(EDITOR·COMMENTER·VIEWER) = 공유받은 워크스페이스
  const items = workspaces.data?.items ?? []
  const mine = items.filter((workspace) => workspace.myRole === 'OWNER')
  const shared = items.filter((workspace) => workspace.myRole !== 'OWNER')

  return (
    <aside className="hidden w-64 shrink-0 border-r md:block">
      <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] flex-col gap-2 overflow-y-auto p-3">
        <Button type="button" size="sm" className="w-full justify-start" onClick={openDialog}>
          <Plus aria-hidden />
          {t('shell.sidebar.newWorkspace')}
        </Button>

        {workspaces.isPending ? (
          <div className="flex flex-col gap-2 p-1">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        ) : workspaces.isError ? (
          <div className="scale-90">
            <ErrorState onRetry={() => void workspaces.refetch()} />
          </div>
        ) : (
          <>
            <section>
              <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('shell.sidebar.mine')}
              </p>
              <nav aria-label={t('shell.sidebar.mine')} className="flex flex-col gap-0.5">
                {mine.map((workspace) => (
                  <WorkspaceLink key={workspace.workspaceId} workspace={workspace} />
                ))}
              </nav>
            </section>

            {shared.length > 0 ? (
              <section>
                <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('shell.sidebar.shared')}
                </p>
                <nav aria-label={t('shell.sidebar.shared')} className="flex flex-col gap-0.5">
                  {shared.map((workspace) => (
                    <WorkspaceLink key={workspace.workspaceId} workspace={workspace} />
                  ))}
                </nav>
              </section>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}

/** 워크스페이스 링크 행 — 이름 + 기본 배지(소유에만)·내 역할 표기(공유받은에만) */
function WorkspaceLink({ workspace }: { workspace: MyWorkspace }) {
  const { t } = useTranslation()
  const owned = workspace.myRole === 'OWNER'

  return (
    <NavLink
      to={`/workspaces/${workspace.workspaceId}`}
      className={({ isActive }) =>
        cn(
          'flex flex-col gap-1 rounded-md px-2.5 py-2 text-sm transition-colors',
          isActive
            ? 'bg-muted text-foreground'
            : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground',
        )
      }
    >
      <span className="truncate font-medium">{workspace.name}</span>
      <span className="flex items-center gap-1">
        {workspace.isDefault && owned ? (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {t('shell.defaultBadge')}
          </Badge>
        ) : null}
        <span className="text-[10px] text-muted-foreground">
          {t(`common.roleShort.${workspace.myRole}`)}
        </span>
      </span>
    </NavLink>
  )
}
