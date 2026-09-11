/**
 * S-12 대시보드 = 랜딩 `/` (storyboard 02-user §2 S-12)
 *
 * - mount 병렬 2호출(me/workspaces·teams) — 한쪽 실패 시 전체 에러 상태
 * - 요약 카드 3개: 워크스페이스·팀·멤버로 참여(myRole!=='OWNER' 프론트 계산)
 * - 바로가기 6개 + 전체 보기, 내 팀 4개
 */
import { Link } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { useMe } from '@/features/auth'
import { useMyWorkspaces, useCreateWorkspaceDialog } from '@/features/workspaces'
import { useMyTeams } from '@/features/teams'
import { formatNumber } from '@/lib/format'

const SHORTCUT_LIMIT = 6
const TEAM_LIMIT = 4

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{formatNumber(value)}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const { t } = useTranslation()
  const me = useMe()
  const workspaces = useMyWorkspaces()
  const teams = useMyTeams()
  const openCreateDialog = useCreateWorkspaceDialog((state) => state.openDialog)

  const isLoading = workspaces.isPending || teams.isPending
  const hasError = workspaces.isError || teams.isError

  const myWorkspaces = workspaces.data?.items ?? []
  const joinedAsMember = myWorkspaces.filter((workspace) => workspace.myRole !== 'OWNER').length
  const shortcuts = myWorkspaces.slice(0, SHORTCUT_LIMIT)
  const hiddenCount = Math.max(0, myWorkspaces.length - SHORTCUT_LIMIT)
  const myTeams = (teams.data?.items ?? []).slice(0, TEAM_LIMIT)

  if (hasError) {
    return (
      <ErrorState
        onRetry={() => {
          void workspaces.refetch()
          void teams.refetch()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 인사 + 새 워크스페이스 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {t('dashboard.greeting', { name: me.data?.name ?? '' })}
        </h1>
        <Button type="button" onClick={openCreateDialog}>
          <Plus aria-hidden />
          {t('dashboard.newWorkspace')}
        </Button>
      </div>

      {/* 요약 카드 3개 */}
      <div className="grid gap-4 sm:grid-cols-3">
        {isLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <>
            <StatCard
              label={t('dashboard.cards.workspaces')}
              value={workspaces.data?.totalCount ?? myWorkspaces.length}
            />
            <StatCard label={t('dashboard.cards.teams')} value={teams.data?.totalCount ?? myTeams.length} />
            <StatCard
              label={t('dashboard.cards.joinedAsMember')}
              value={joinedAsMember}
              hint={t('dashboard.joinedAsMemberHint')}
            />
          </>
        )}
      </div>

      {/* 워크스페이스 바로가기 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('dashboard.shortcuts')}</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/workspaces">{t('dashboard.viewAll')}</Link>
          </Button>
        </div>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : myWorkspaces.length === 0 ? (
          <EmptyState
            illustration="workspace"
            title={t('dashboard.empty.workspaces.title')}
            description={t('dashboard.empty.workspaces.description')}
            action={
              <Button type="button" size="sm" onClick={openCreateDialog}>
                <Plus aria-hidden />
                {t('dashboard.newWorkspace')}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map((workspace) => (
              <Link key={workspace.workspaceId} to={`/workspaces/${workspace.workspaceId}`}>
                <Card className="h-full transition-colors hover:border-foreground/25">
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <p className="truncate font-medium">{workspace.name}</p>
                    <p className="line-clamp-1 min-h-4 text-xs text-muted-foreground">
                      {workspace.description ?? t('common.none')}
                    </p>
                    <div className="mt-auto flex items-center gap-1">
                      {workspace.isDefault ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {t('shell.defaultBadge')}
                        </Badge>
                      ) : null}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t('common.memberCount', { count: workspace.memberCount })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {hiddenCount > 0 ? (
              <Link to="/workspaces">
                <Card className="h-full border-dashed transition-colors hover:border-foreground/25">
                  <CardContent className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                    +{formatNumber(hiddenCount)}
                  </CardContent>
                </Card>
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {/* 내 팀 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('dashboard.myTeams')}</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/teams">{t('dashboard.viewAll')}</Link>
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : myTeams.length === 0 ? (
          <EmptyState
            illustration="team"
            title={t('dashboard.empty.teams.title')}
            description={t('dashboard.empty.teams.description')}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {myTeams.map((team) => (
              <Link key={team.teamId} to={`/teams/${team.teamId}`}>
                <Card className="transition-colors hover:border-foreground/25">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Users aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{team.name}</span>
                    {team.isOwner ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {t('team.list.ownerBadge')}
                      </Badge>
                    ) : null}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {t('common.memberCount', { count: team.memberCount })}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
