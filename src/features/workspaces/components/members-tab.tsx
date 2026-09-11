/**
 * S-06 워크스페이스 멤버 탭 (storyboard 02-user §6)
 *
 * - 부여 행 표 (USER/TEAM 구분) — 팀 행은 팀 상세로 링크
 * - 변경 액션(추가·역할 변경·회수)은 Owner만 — 비Owner는 읽기 전용
 * - OWNER 부여·변경 선택지 없음 (02-workspace §5)
 * - 검색은 프론트 필터 (후보 검색 서버 API와 다름)
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, Search, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { isApiError } from '@/api/client'
import type { Membership } from '@/api/types'
import { AddMemberDialog } from '@/features/workspaces/components/add-member-dialog'
import { WORKSPACE_ROLES } from '@/features/workspaces/api'
import { useDeleteMembership, useMemberships, useUpdateMembership } from '@/features/workspaces/hooks'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'

interface MembersTabProps {
  workspaceId: string
  workspaceName: string
  isOwner: boolean
}

/** 표시 대상 이름 — USER는 사용자명, TEAM은 팀명 */
function granteeName(membership: Membership): string {
  return membership.user?.name ?? membership.team?.name ?? '-'
}

export function MembersTab({ workspaceId, workspaceName, isOwner }: MembersTabProps) {
  const { t } = useTranslation()
  const memberships = useMemberships(workspaceId)
  const updateMutation = useUpdateMembership(workspaceId)
  const deleteMutation = useDeleteMembership(workspaceId)
  const [filter, setFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<Membership | null>(null)

  const items = memberships.data?.items ?? []
  const normalizedFilter = filter.trim().toLowerCase()
  const filtered = normalizedFilter
    ? items.filter((membership) => {
        const haystack = [
          membership.user?.name,
          membership.user?.email,
          membership.team?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalizedFilter)
      })
    : items

  /** MEMBERSHIP_NOT_FOUND 등 — 안내 후 목록 재조회 (§3.6) */
  const handleMutationError = (error: unknown) => {
    toast.error(errorMessage(error))
    if (isApiError(error) && error.resultCode === 'MEMBERSHIP_NOT_FOUND') {
      void memberships.refetch()
    }
  }

  const handleRoleChange = (membership: Membership, role: (typeof WORKSPACE_ROLES)[number]) => {
    updateMutation.mutate(
      { membershipId: membership.membershipId, role },
      {
        onSuccess: () => toast.success(t('workspace.members.roleChangedToast')),
        onError: handleMutationError,
      },
    )
  }

  const handleRevoke = () => {
    if (!revokeTarget) return
    deleteMutation.mutate(revokeTarget.membershipId, {
      onSuccess: () => {
        toast.success(t('workspace.members.revokeSuccess'))
        setRevokeTarget(null)
      },
      onError: (error) => {
        setRevokeTarget(null)
        handleMutationError(error)
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {t('workspace.members.title')}
          {memberships.data ? ` (${memberships.data.totalCount})` : ''}
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              aria-hidden
              className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('workspace.members.searchPlaceholder')}
              className="w-56 pl-8"
              aria-label={t('common.search')}
            />
          </div>
          {isOwner ? (
            <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus aria-hidden />
              {t('workspace.members.addButton')}
            </Button>
          ) : null}
        </div>
      </div>

      {memberships.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : memberships.isError ? (
        <ErrorState onRetry={() => void memberships.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration="search"
          title={t('workspace.members.empty')}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t('workspace.members.table.granteeType')}</TableHead>
                <TableHead>{t('workspace.members.table.grantee')}</TableHead>
                <TableHead className="w-28">{t('workspace.members.table.role')}</TableHead>
                <TableHead className="w-32">{t('workspace.members.table.grantedBy')}</TableHead>
                <TableHead className="w-28">{t('workspace.members.table.grantedAt')}</TableHead>
                {isOwner ? (
                  <TableHead className="w-12">
                    <span className="sr-only">{t('workspace.members.table.actions')}</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((membership) => (
                <TableRow key={membership.membershipId}>
                  <TableCell>
                    <Badge variant="outline">{t(`common.granteeType.${membership.granteeType}`)}</Badge>
                  </TableCell>
                  <TableCell>
                    {membership.team ? (
                      <Link
                        to={`/teams/${membership.team.teamId}`}
                        className="font-medium underline-offset-3 hover:underline"
                        title={t('workspace.members.teamLink')}
                      >
                        {membership.team.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{membership.user?.name ?? '-'}</span>
                    )}
                    {membership.team ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({t('common.memberCount', { count: membership.team.memberCount })})
                      </span>
                    ) : membership.user ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">{membership.user.email}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={membership.role === 'OWNER' ? 'default' : 'secondary'}>
                      {t(`common.roleShort.${membership.role}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {membership.grantedBy?.name ?? t('workspace.members.grantedOnCreation')}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(membership.grantedAt)}
                  </TableCell>
                  {isOwner && membership.role !== 'OWNER' ? (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.members.table.actions')}
                          >
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{t('workspace.members.changeRole')}</DropdownMenuLabel>
                          {WORKSPACE_ROLES.map((role) => (
                            <DropdownMenuItem
                              key={role}
                              disabled={role === membership.role || updateMutation.isPending}
                              onSelect={() => handleRoleChange(membership, role)}
                            >
                              {t(`common.roleShort.${role}`)}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setRevokeTarget(membership)}
                          >
                            {t('workspace.members.revoke')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : isOwner ? (
                    <TableCell className="text-xs text-muted-foreground">
                      {t('workspace.members.ownerNotice')}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {memberships.data && memberships.data.items.length > 0 ? (
        <p className="text-xs text-muted-foreground">{t('workspace.members.addDialog.teamGrantNotice')}</p>
      ) : null}

      {isOwner ? (
        <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} workspaceId={workspaceId} />
      ) : null}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title={t('workspace.members.revokeTitle')}
        description={t('workspace.members.revokeDescription', {
          name: revokeTarget ? granteeName(revokeTarget) : workspaceName,
        })}
        confirmLabel={t('workspace.members.revoke')}
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={handleRevoke}
      />
    </div>
  )
}
