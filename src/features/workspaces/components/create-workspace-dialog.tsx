/**
 * 워크스페이스 생성 다이얼로그 (storyboard 02-user §2 S-04)
 *
 * - 이름 필수(공백 불가)·설명 선택 (§3.7)
 * - 개인 소유·OWNER 지정 안내
 * - 성공 → 토스트 + 생성된 상세로 직행 (목록을 거치지 않는다)
 * - 오픈 지점: 사이드바 하단·대시보드·목록 빈 상태 (dialog-store)
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
import { useCreateWorkspace } from '@/features/workspaces/hooks'
import { useCreateWorkspaceDialog } from '@/features/workspaces/dialog-store'
import { errorMessage } from '@/lib/result-code'

function createWorkspaceSchema(nameRequiredMessage: string) {
  return z.object({
    name: z.string().trim().min(1, nameRequiredMessage),
    description: z.string().trim().optional(),
  })
}

type CreateWorkspaceForm = { name: string; description?: string }

export function CreateWorkspaceDialog() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const open = useCreateWorkspaceDialog((state) => state.open)
  const closeDialog = useCreateWorkspaceDialog((state) => state.closeDialog)
  const createMutation = useCreateWorkspace()

  const form = useForm<CreateWorkspaceForm>({
    resolver: zodResolver(createWorkspaceSchema(t('workspace.create.nameRequired'))),
    defaultValues: { name: '', description: '' },
  })

  const handleSubmit = form.handleSubmit((values) => {
    createMutation.mutate(
      { name: values.name, description: values.description || undefined },
      {
        onSuccess: (workspace) => {
          closeDialog()
          form.reset()
          toast.success(t('workspace.create.successToast'))
          if (workspace?.workspaceId) navigate(`/workspaces/${workspace.workspaceId}`)
        },
        onError: (error) => {
          toast.error(errorMessage(error))
        },
      },
    )
  })

  const onOpenChange = (nextOpen: boolean) => {
    if (createMutation.isPending) return
    if (!nextOpen) {
      closeDialog()
      form.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('workspace.create.title')}</DialogTitle>
          <DialogDescription>{t('workspace.create.notice')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('workspace.create.nameLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('workspace.create.namePlaceholder')} autoFocus {...field} />
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
                  <FormLabel>{t('workspace.create.descriptionLabel')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('workspace.create.descriptionPlaceholder')}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {t('workspace.create.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
