/**
 * 팀 사이드바 (storyboard 00-common §3.1 — /teams/*에서 워크스페이스 트리를 대체)
 * 새 팀 버튼(최상단) + 내가 소유한 팀 / 소속 팀 두 섹션 — 목록(S-07)과 같은 ['teams'] 쿼리를 공유한다.
 */
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import { CreateTeamDialog, useMyTeams } from '@/features/teams'
import { cn } from 'cn'

export function TeamSidebar() {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const teams = useMyTeams()

  const items = teams.data?.items ?? []
  const owned = items.filter((team) => team.isOwner)
  const joined = items.filter((team) => !team.isOwner)

  return (
    <aside className="hidden w-64 shrink-0 border-r md:block">
      <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] flex-col gap-2 overflow-y-auto p-3">
        <Button type="button" size="sm" className="w-full justify-start" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden />
          {t('shell.sidebar.newTeam')}
        </Button>

        <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('shell.sidebar.teamsTitle')}
        </p>

        {teams.isPending ? (
          <div className="flex flex-col gap-2 p-1">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        ) : teams.isError ? (
          <div className="scale-90">
            <ErrorState onRetry={() => void teams.refetch()} />
          </div>
        ) : (
          <nav aria-label={t('shell.sidebar.teamsTitle')} className="flex flex-col gap-3">
            <TeamSection label={t('shell.sidebar.ownedTeams')} teams={owned} />
            <TeamSection label={t('shell.sidebar.joinedTeams')} teams={joined} />
            {items.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">{t('shell.sidebar.noTeams')}</p>
            ) : null}
          </nav>
        )}
      </div>

      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </aside>
  )
}

function TeamSection({ label, teams }: { label: string; teams: Array<{ teamId: string; name: string; memberCount: number }> }) {
  const { t } = useTranslation()

  if (teams.length === 0) return null

  return (
    <section className="flex flex-col gap-0.5">
      <p className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground">{label}</p>
      {teams.map((team) => (
        <NavLink
          key={team.teamId}
          to={`/teams/${team.teamId}`}
          className={({ isActive }) =>
            cn(
              'flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
              isActive
                ? 'bg-muted text-foreground'
                : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground',
            )
          }
        >
          <span className="truncate font-medium">{team.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {t('common.memberCount', { count: team.memberCount })}
          </span>
        </NavLink>
      ))}
    </section>
  )
}
