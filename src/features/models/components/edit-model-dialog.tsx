/**
 * ERD 문서 메타 변경 다이얼로그 (storyboard 02-user §5 — ERD 탭)
 *
 * - 이름·설명만 변경 (1.4 — version은 증가하지 않는다)
 * - PATCH 의미론: description을 비우면 명시적 클리어(null)
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
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
import { useUpdateModel } from '@/features/models/hooks'
import type { ModelSummary } from '@/api/types'
import { errorMessage } from '@/lib/result-code'

export interface EditModelDialogProps {
  model: ModelSummary | null
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

function editModelSchema(nameRequiredMessage: string) {
  return z.object({
    name: z.string().trim().min(1, nameRequiredMessage),
    description: z.string().trim().optional(),
  })
}

type EditModelForm = { name: string; description?: string }

export function EditModelDialog({ model, onOpenChange, workspaceId }: EditModelDialogProps) {
  const { t } = useTranslation()
  const updateMutation = useUpdateModel(workspaceId)
  const open = model !== null

  const form = useForm<EditModelForm>({
    resolver: zodResolver(editModelSchema(t('model.create.nameRequired'))),
    defaultValues: { name: '', description: '' },
  })

  // 열릴 때마다 대상 값으로 리셋
  useEffect(() => {
    if (model) {
      form.reset({ name: model.name, description: model.description ?? '' })
    }
  }, [model, form])

  const handleSubmit = form.handleSubmit((values) => {
    if (!model) return
    updateMutation.mutate(
      {
        modelId: model.modelId,
        body: {
          name: values.name,
          // 빈 입력은 명시적 클리어 — 다이얼로그 폼은 항상 값을 전송한다
          description: values.description?.trim() ? values.description : null,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          toast.success(t('model.edit.successToast'))
        },
        onError: (error) => {
          toast.error(errorMessage(error))
        },
      },
    )
  })

  const onOpen = (nextOpen: boolean) => {
    if (updateMutation.isPending) return
    if (!nextOpen) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('model.edit.title', { name: model?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('model.edit.notice')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.create.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('model.create.namePlaceholder')} {...field} />
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
                  <FormLabel>{t('model.create.description')}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder={t('model.create.descriptionPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpen(false)} disabled={updateMutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
