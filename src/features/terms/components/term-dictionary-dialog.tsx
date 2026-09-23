/**
 * 워크스페이스 용어 사전 관리 다이얼로그 (08-core/01-workspace.md §4)
 *
 * 논리명 자동 추론의 커스텀 사전 — 물리명 토큰(term) → 논리명 라벨(label) 목록·등록·삭제.
 * 등록은 upsert다: 같은 term이면 라벨이 바뀐다(수정 = 재등록). term은 물리명 토큰이라
 * 공백을 금지하고(서버도 같은 규칙), 전체 이름(user_id)을 등록하면 토큰 결합보다 우선한다.
 * 본문은 다이얼로그가 열려 있을 때만 마운트된다 — 목록 쿼리·폼 상태가 열림에만 산다.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useDeleteTerm, useUpsertTerm, useWorkspaceTerms } from '@/features/terms/hooks'
import { errorMessage } from '@/lib/result-code'

export interface TermDictionaryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

export function TermDictionaryDialog({ open, onOpenChange, workspaceId }: TermDictionaryDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('model.editor.termDictionary.title')}</DialogTitle>
          <DialogDescription>{t('model.editor.termDictionary.description')}</DialogDescription>
        </DialogHeader>
        {open ? <TermDictionaryBody workspaceId={workspaceId} /> : null}
      </DialogContent>
    </Dialog>
  )
}

interface TermFormValues {
  term: string
  label: string
}

function TermDictionaryBody({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const terms = useWorkspaceTerms(workspaceId)
  const upsertMutation = useUpsertTerm(workspaceId)
  const deleteMutation = useDeleteTerm(workspaceId)
  const pending = upsertMutation.isPending || deleteMutation.isPending

  const form = useForm<TermFormValues>({
    resolver: zodResolver(
      z.object({
        term: z
          .string()
          .trim()
          .min(1, t('model.editor.termDictionary.fieldRequired'))
          .refine((v) => !/\s/.test(v), t('model.editor.termDictionary.termPattern')),
        label: z.string().trim().min(1, t('model.editor.termDictionary.fieldRequired')),
      }),
    ),
    defaultValues: { term: '', label: '' },
  })

  const submit = form.handleSubmit((values) => {
    upsertMutation.mutate(
      { term: values.term.trim(), label: values.label.trim() },
      {
        onSuccess: () => {
          // term만 비워 연속 등록을 돕는다 — 라벨은 같은 계열이 많아 남겨둔다
          form.setValue('term', '')
          form.setFocus('term')
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  })

  return (
    <div className="grid gap-4 py-2">
      <Form {...form}>
        {/* 등록 폼 — form 요소로 감싸 엔터 등록이 된다 */}
        <form className="grid gap-2" onSubmit={submit} noValidate>
          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="term"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.termDictionary.term')}</FormLabel>
                  <FormControl>
                    <Input placeholder="user_id" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.termDictionary.label')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('model.editor.termDictionary.labelPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type="submit" size="sm" className="h-7 w-fit px-2" disabled={pending}>
            {upsertMutation.isPending ? (
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
            ) : null}
            {t('model.editor.termDictionary.add')}
          </Button>
        </form>
      </Form>

      {/* 목록 — term 오름차순(서버 정렬). 수정은 같은 term 재등록으로 */}
      <div className="grid max-h-72 gap-1 overflow-y-auto">
        {terms.isPending ? (
          <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : terms.isError ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('model.editor.termDictionary.loadFailed')}
          </p>
        ) : (terms.data?.items.length ?? 0) === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('model.editor.termDictionary.empty')}
          </p>
        ) : (
          terms.data?.items.map((term) => (
            <div
              key={term.termId}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {term.term}
              </code>
              <span aria-hidden className="text-muted-foreground">
                →
              </span>
              <span className="min-w-0 flex-1 truncate">{term.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label={`${t('common.delete')} — ${term.term}`}
                title={`${t('common.delete')} — ${term.term}`}
                disabled={pending}
                onClick={() =>
                  deleteMutation.mutate(term.termId, {
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                <Trash2 aria-hidden className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('model.editor.termDictionary.hint')}</p>
    </div>
  )
}
