/**
 * ERD 문서 생성 다이얼로그 (storyboard 02-user §5 — ERD 탭)
 *
 * - 이름 필수·설명 선택·데이터베이스 종류(코드 테이블 드롭다운) — 캔버스 크기는 폐지(#123, 에디터가 무한 캔버스)
 * - 성공 → 토스트 + 목록 갱신 (에디터 진입은 2단계)
 * - 오픈 지점: ERD 탭 헤더·빈 상태 CTA
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateModel, useDatabaseTypes } from '@/features/models/hooks'
import { errorMessage } from '@/lib/result-code'

export interface CreateModelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

function createModelSchema(nameRequiredMessage: string) {
  return z.object({
    name: z.string().trim().min(1, nameRequiredMessage),
    description: z.string().trim().optional(),
    databaseType: z.string().min(1, nameRequiredMessage),
  })
}

type CreateModelForm = {
  name: string
  description?: string
  databaseType: string
}

export function CreateModelDialog({ open, onOpenChange, workspaceId }: CreateModelDialogProps) {
  const { t } = useTranslation()
  const databaseTypes = useDatabaseTypes()
  const createMutation = useCreateModel(workspaceId)

  const form = useForm<CreateModelForm>({
    resolver: zodResolver(createModelSchema(t('model.create.nameRequired'))),
    defaultValues: {
      name: '',
      description: '',
      databaseType: '',
    },
  })

  // 코드 목록 도착 후 기본 선택 — 아직 미선택이면 첫 항목(postgresql)
  useEffect(() => {
    const codes = databaseTypes.data?.items.map((type) => type.code) ?? []
    if (codes.length > 0 && !codes.includes(form.getValues('databaseType'))) {
      form.setValue('databaseType', codes[0])
    }
  }, [databaseTypes.data, form])

  const handleSubmit = form.handleSubmit((values) => {
    createMutation.mutate(
      {
        name: values.name,
        description: values.description || undefined,
        databaseType: values.databaseType,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          form.reset()
          toast.success(t('model.create.successToast'))
        },
        onError: (error) => {
          toast.error(errorMessage(error))
        },
      },
    )
  })

  const onOpen = (nextOpen: boolean) => {
    if (createMutation.isPending) return
    if (!nextOpen) {
      onOpenChange(false)
      form.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('model.create.title')}</DialogTitle>
          <DialogDescription>{t('model.create.notice')}</DialogDescription>
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
            <FormField
              control={form.control}
              name="databaseType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.create.databaseType')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('model.create.databaseTypePlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(databaseTypes.data?.items ?? []).map((type) => (
                        <SelectItem key={type.code} value={type.code}>
                          {type.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpen(false)} disabled={createMutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
