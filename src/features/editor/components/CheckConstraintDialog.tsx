/**
 * CHECK 제약 다이얼로그 — 이름 + 식 편집 (v1.34, 05-editor/01-core.md §9)
 *
 * 이름은 문서 전체 키 네임스페이스(PK·UK·인덱스·FK·CHECK)에서 유일해야 한다(keys.ts).
 * 생성 모드에서는 기본 이름(`ck_테이블_n`)을 채워 둔다. 식은 괄호 안 원문 그대로 저장하고
 * 해석하지 않는다 — 바깥 괄호를 적어 왔으면 한 겹 벗긴다(저장 형식은 바깥 괄호 없이).
 * 확정은 목록 전체를 1커밋(check/set). 협업: 열려 있는 동안 소속 테이블의 Edit Session Lock을 잡는다.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ErdTable } from '@/features/editor/model/content-schema'
import { stripOuterParens } from '@/features/editor/model/keys'
import { useEditLock } from '@/features/editor/collab-locks'

export interface CheckConstraintSubmit {
  name: string
  expression: string
}

export interface CheckConstraintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 편집 대상 — null이면 생성 */
  target: { name: string; expression: string } | null
  table: ErdTable | null
  /** 문서 전체 키 이름(소문자) — 편집 대상 자기 이름은 제외된 상태로 전달된다 */
  existingNames: ReadonlySet<string>
  /** 생성 때 채울 기본 이름 */
  defaultName: string
  onConfirm: (values: CheckConstraintSubmit) => void
}

export function CheckConstraintDialog({
  open,
  onOpenChange,
  target,
  table,
  existingNames,
  defaultName,
  onConfirm,
}: CheckConstraintDialogProps) {
  const { t } = useTranslation()
  const foreignLock = useEditLock('table', table?.id ?? null, open)
  const locked = foreignLock !== null

  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t('model.editor.key.nameRequired'))
      .refine((value) => !existingNames.has(value.toLowerCase()), t('model.editor.key.nameDuplicate')),
    expression: z
      .string()
      .trim()
      .refine((value) => stripOuterParens(value) !== '', t('model.editor.check.expressionRequired')),
  })

  const form = useForm<CheckConstraintSubmit>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', expression: '' },
  })

  useEffect(() => {
    if (open) form.reset({ name: target?.name ?? defaultName, expression: target?.expression ?? '' })
  }, [open, target])

  const handleSubmit = form.handleSubmit((values) => {
    onConfirm({ name: values.name.trim(), expression: stripOuterParens(values.expression) })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(target ? 'model.editor.check.titleEdit' : 'model.editor.check.titleAdd')}</DialogTitle>
          <DialogDescription>{table?.physicalName}</DialogDescription>
        </DialogHeader>
        {locked ? (
          <p data-testid="edit-lock-notice" className="text-xs text-amber-600 dark:text-amber-400">
            {t('model.editor.collab.lockBlocked', { name: foreignLock.userName })}
          </p>
        ) : null}
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.key.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder="ck_table_1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expression"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.check.expression')}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} className="font-mono text-xs" placeholder="price >= 0" {...field} />
                  </FormControl>
                  <FormDescription>{t('model.editor.check.expressionHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={locked}>{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
