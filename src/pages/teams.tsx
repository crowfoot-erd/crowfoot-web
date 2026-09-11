/**
 * S-07 팀 진입 (storyboard 02-user §7)
 * 소속 팀이 있으면 첫 팀 상세로 이동한다 — 목록 탐색은 좌측 팀 사이드바가 담당한다.
 * 빈 상태(소속 팀 없음)일 때만 목록 화면을 렌더해 생성 CTA를 노출한다.
 */
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { CreateTeamDialog, useMyTeams } from '@/features/teams'

export function TeamsPage() {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const teams = useMyTeams()

  if (teams.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }

  if (teams.isError) {
    return <ErrorState onRetry={() => void teams.refetch()} />
  }

  const items = teams.data?.items ?? []
  if (items.length > 0) {
    // 헤더 팀 메뉴 진입 → 첫 팀 상세 선택 (storyboard 02-user §7)
    return <Navigate to={`/teams/${items[0].teamId}`} replace />
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('team.list.title')}</h1>
      <EmptyState
        illustration="team"
        title={t('team.list.empty.title')}
        description={t('team.list.empty.description')}
        action={
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            {t('team.list.empty.cta')}
          </Button>
        }
      />
      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
