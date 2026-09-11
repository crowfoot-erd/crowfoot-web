/**
 * 팀 생성 다이얼로그 (storyboard 02-user §2 S-07)
 * 성공 → 토스트 + 생성된 팀 상세로 직행 (Workspace는 만들어지지 않는다)
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCreateTeam } from '@/features/teams/hooks'
import { errorMessage } from '@/lib/result-code'

function createTeamSchema(nameRequiredMessage: string) {
  return z.object({
    name: z.string().trim().min(1, nameRequiredMessage),
    description: z.string().trim().optional(),
  })
}

type CreateTeamForm = { name: string; description?: string }

interface CreateTeamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateTeamDialog({ open, onOpenChange }: CreateTeamDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createMutation = useCreateTeam()

  const form = useForm<CreateTeamForm>({
    resolver: zodResolver(createTeamSchema(t('team.create.nameRequired'))),
    defaultValues: { name: '', description: '' },
  })

  const handleSubmit = form.handleSubmit((values) => {
    createMutation.mutate(
      { name: values.name, description: values.description || undefined },
      {
        onSuccess: (created) => {
          onOpenChange(false)
          form.reset()
          toast.success(t('team.create.successToast'))
          if (created?.teamId) navigate(`/teams/${created.teamId}`)
        },
        onError: (error) => {
          toast.error(errorMessage(error))
        },
      },
    )
  })

  const handleOpenChange = (nextOpen: boolean) => {
    if (createMutation.isPending) return
    if (!nextOpen) {
      form.reset()
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('team.create.title')}</DialogTitle>
          <DialogDescription>{t('team.create.notice')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('team.create.nameLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('team.create.namePlaceholder')} autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('team.create.descriptionLabel')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('team.create.descriptionPlaceholder')}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={createMutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {t('team.create.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
