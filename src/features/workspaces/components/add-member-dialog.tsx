/**
 * 멤버 추가 다이얼로그 (storyboard 02-user §6 S-06)
 *
 * - 부여 대상 토글: 개인(membership-candidates 서버 검색) | 팀(팀 목록 + 프론트 필터)
 * - 검색 2자 이상 + 300ms 디바운스 (개인)
 * - 역할: EDITOR/COMMENTER/VIEWER — OWNER 없음
 */
import { useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { WORKSPACE_ROLES, type CreateMembershipInput } from '@/features/workspaces/api'
import { useCreateMembership, useMembershipCandidates } from '@/features/workspaces/hooks'
import { useMyTeams } from '@/features/teams'
import { cn } from 'cn'
import { errorMessage } from '@/lib/result-code'

type GranteeTab = 'USER' | 'TEAM'
type GrantRole = (typeof WORKSPACE_ROLES)[number]

interface SelectedUser {
  type: 'USER'
  userId: string
  label: string
}

interface SelectedTeam {
  type: 'TEAM'
  teamId: string
  label: string
}

type Selection = SelectedUser | SelectedTeam | null

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

export function AddMemberDialog({ open, onOpenChange, workspaceId }: AddMemberDialogProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState<GranteeTab>('USER')
  const [keyword, setKeyword] = useState('')
  const [selection, setSelection] = useState<Selection>(null)
  const [role, setRole] = useState<GrantRole>('EDITOR')

  const debouncedKeyword = useDebouncedValue(keyword, 300)
  const userCandidates = useMembershipCandidates(workspaceId, debouncedKeyword)
  const teams = useMyTeams(false)
  const createMutation = useCreateMembership(workspaceId)

  // 닫힐 때 상태 초기화
  useEffect(() => {
    if (!open) {
      setTarget('USER')
      setKeyword('')
      setSelection(null)
      setRole('EDITOR')
    }
  }, [open])

  // 팀 탭 전환 시 선택 해제 (대상 종류가 달라진다)
  useEffect(() => {
    setSelection(null)
  }, [target])

  const handleSubmit = () => {
    if (!selection) return
    const body: CreateMembershipInput =
      selection.type === 'USER'
        ? { granteeType: 'USER', userId: selection.userId, role }
        : { granteeType: 'TEAM', teamId: selection.teamId, role }

    createMutation.mutate(body, {
      onSuccess: () => {
        toast.success(t('workspace.members.addDialog.successToast'))
        onOpenChange(false)
      },
      onError: (error) => {
        toast.error(errorMessage(error))
      },
    })
  }

  const renderCandidates = () => {
    if (target === 'USER') {
      const trimmed = keyword.trim()
      if (trimmed.length < 2) {
        return <p className="px-1 py-2 text-xs text-muted-foreground">{t('common.searchKeywordHint')}</p>
      }
      if (userCandidates.isPending) {
        return (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )
      }
      if (userCandidates.isError) {
        return <p className="px-1 py-2 text-xs text-destructive">{errorMessage(userCandidates.error)}</p>
      }
      const candidates = userCandidates.data?.items ?? []
      if (candidates.length === 0) {
        return <p className="px-1 py-2 text-xs text-muted-foreground">{t('workspace.members.addDialog.noResults')}</p>
      }
      return (
        <div role="listbox" aria-label={t('workspace.members.addDialog.searchUsers')} className="flex flex-col">
          {candidates.map((candidate) => {
            const selected = selection?.type === 'USER' && selection.userId === candidate.userId
            return (
              <button
                key={candidate.userId}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => setSelection({ type: 'USER', userId: candidate.userId, label: candidate.name })}
                className={cn(
                  'flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                  selected && 'bg-muted',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{candidate.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{candidate.email}</span>
                </span>
                {selected ? <span className="text-xs text-primary">{role}</span> : null}
              </button>
            )
          })}
        </div>
      )
    }

    // 팀 후보 — 팀 목록 + 프론트 필터 (1단계 계약에 팀 후보 API 없음)
    if (teams.isPending) {
      return (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )
    }
    if (teams.isError) {
      return <p className="px-1 py-2 text-xs text-destructive">{errorMessage(teams.error)}</p>
    }
    const trimmed = keyword.trim().toLowerCase()
    const candidates = (teams.data?.items ?? []).filter(
      (team) => !trimmed || team.name.toLowerCase().includes(trimmed),
    )
    if (candidates.length === 0) {
      return <p className="px-1 py-2 text-xs text-muted-foreground">{t('workspace.members.addDialog.noResults')}</p>
    }
    return (
      <div role="listbox" aria-label={t('workspace.members.addDialog.searchTeams')} className="flex flex-col">
        {candidates.map((team) => {
          const selected = selection?.type === 'TEAM' && selection.teamId === team.teamId
          return (
            <button
              key={team.teamId}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => setSelection({ type: 'TEAM', teamId: team.teamId, label: team.name })}
              className={cn(
                'flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                selected && 'bg-muted',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{team.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t('common.memberCount', { count: team.memberCount })}
                </span>
              </span>
              {selected ? <span className="text-xs text-primary">{role}</span> : null}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={createMutation.isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('workspace.members.addDialog.title')}</DialogTitle>
          <DialogDescription>{t('workspace.members.addDialog.teamGrantNotice')}</DialogDescription>
        </DialogHeader>

        <Tabs value={target} onValueChange={(value) => setTarget(value as GranteeTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="USER" className="flex-1">
              {t('workspace.members.addDialog.targetUser')}
            </TabsTrigger>
            <TabsTrigger value="TEAM" className="flex-1">
              {t('workspace.members.addDialog.targetTeam')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search aria-hidden className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={
              target === 'USER'
                ? t('workspace.members.addDialog.searchUsers')
                : t('workspace.members.addDialog.searchTeams')
            }
            className="pl-8"
            aria-label={t('common.search')}
          />
        </div>

        <div className="max-h-56 overflow-y-auto rounded-lg border p-1">{renderCandidates()}</div>

        <Separator />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t('workspace.members.addDialog.role')}</p>
          <RadioGroup
            value={role}
            onValueChange={(value) => setRole(value as GrantRole)}
            className="grid grid-cols-3 gap-2"
          >
            {WORKSPACE_ROLES.map((item) => (
              <Label
                key={item}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[button[data-state=checked]]:border-primary"
              >
                <RadioGroupItem value={item} />
                {t(`common.roleShort.${item}`)}
              </Label>
            ))}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">{t('workspace.members.addDialog.roleHint')}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!selection || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t('workspace.members.addDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
