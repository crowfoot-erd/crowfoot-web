/**
 * 팀원 추가 다이얼로그 (storyboard 02-user §8 S-08)
 * 후보 = member-candidates(2자+·300ms 디바운스) — 역할 선택 없음(MEMBER 고정)
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
import { Skeleton } from '@/components/ui/skeleton'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAddTeamMember, useTeamMemberCandidates } from '@/features/teams/hooks'
import { cn } from 'cn'
import { errorMessage } from '@/lib/result-code'

interface AddTeamMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: string
}

export function AddTeamMemberDialog({ open, onOpenChange, teamId }: AddTeamMemberDialogProps) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const debouncedKeyword = useDebouncedValue(keyword, 300)
  const candidates = useTeamMemberCandidates(teamId, debouncedKeyword)
  const addMutation = useAddTeamMember(teamId)

  useEffect(() => {
    if (!open) {
      setKeyword('')
      setSelectedUserId(null)
    }
  }, [open])

  const handleSubmit = () => {
    if (!selectedUserId) return
    addMutation.mutate(selectedUserId, {
      onSuccess: () => {
        toast.success(t('team.members.addDialog.successToast'))
        onOpenChange(false)
      },
      onError: (error) => {
        toast.error(errorMessage(error))
      },
    })
  }

  const trimmed = keyword.trim()
  const items = candidates.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={addMutation.isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('team.members.addDialog.title')}</DialogTitle>
          <DialogDescription>{t('common.searchKeywordHint')}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search aria-hidden className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('team.members.addDialog.searchPlaceholder')}
            className="pl-8"
            aria-label={t('common.search')}
            autoFocus
          />
        </div>

        <div className="max-h-56 overflow-y-auto rounded-lg border p-1">
          {trimmed.length < 2 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">{t('common.searchKeywordHint')}</p>
          ) : candidates.isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : candidates.isError ? (
            <p className="px-1 py-2 text-xs text-destructive">{errorMessage(candidates.error)}</p>
          ) : items.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">{t('team.members.addDialog.noResults')}</p>
          ) : (
            <div role="listbox" aria-label={t('common.search')} className="flex flex-col">
              {items.map((candidate) => {
                const selected = selectedUserId === candidate.userId
                return (
                  <button
                    key={candidate.userId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => setSelectedUserId(candidate.userId)}
                    className={cn(
                      'rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                      selected && 'bg-muted',
                    )}
                  >
                    <span className="block truncate font-medium">{candidate.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{candidate.email}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={addMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!selectedUserId || addMutation.isPending}>
            {addMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t('team.members.addDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
