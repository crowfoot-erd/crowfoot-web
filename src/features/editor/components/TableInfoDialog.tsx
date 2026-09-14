/**
 * 테이블 정보 다이얼로그 — 논리명·물리명·설명 (05-editor/02-ui.md §8.2)
 *
 * 오픈 지점: 노드 헤더 ⓘ·노드 더블클릭·컨텍스트 메뉴. 확정 시 table/patch 1커밋.
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
import type { TablePatch } from '@/features/editor/model/changes'
import type { ErdTable } from '@/features/editor/model/content-schema'

export interface TableInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 대상 테이블 — null이면 열리지 않는다 */
  table: ErdTable | null
  onCommit: (tableId: string, patch: TablePatch) => void
  /** 다른 테이블과 물리명이 겹치는지 — true면 저장을 차단한다 */
  isDuplicateName: (tableId: string, physicalName: string) => boolean
}

type TableInfoForm = {
  physicalName: string
  logicalName: string
  description: string
}

export function TableInfoDialog({ open, onOpenChange, table, onCommit, isDuplicateName }: TableInfoDialogProps) {
  const { t } = useTranslation()

  const schema = z.object({
    physicalName: z.string().trim().min(1, t('model.editor.tableInfo.nameRequired')),
    logicalName: z.string().trim(),
    description: z.string().trim(),
  })

  const form = useForm<TableInfoForm>({
    resolver: zodResolver(schema),
    defaultValues: { physicalName: '', logicalName: '', description: '' },
  })

  // 열릴 때마다 대상 테이블 값으로 초기화
  useEffect(() => {
    if (open && table) {
      form.reset({
        physicalName: table.physicalName,
        logicalName: table.logicalName,
        description: table.comment ?? '',
      })
    }
  }, [open, table, form])

  const handleSubmit = form.handleSubmit((values) => {
    if (!table) return
    // 다른 테이블과 물리명이 겹치면 저장하지 않는다 — 필드에 인라인 안내
    if (isDuplicateName(table.id, values.physicalName)) {
      form.setError('physicalName', { message: t('model.editor.table.nameDuplicate', { name: values.physicalName }) })
      return
    }
    onCommit(table.id, {
      physicalName: values.physicalName,
      logicalName: values.logicalName,
      comment: values.description === '' ? null : values.description,
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('model.editor.tableInfo.title')}</DialogTitle>
          <DialogDescription>{table?.physicalName}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="physicalName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.tableInfo.physicalName')}</FormLabel>
                  <FormControl>
                    <Input placeholder="orders" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="logicalName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.tableInfo.logicalName')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('model.editor.tableInfo.logicalNamePlaceholder')} {...field} />
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
                  <FormLabel>{t('model.editor.tableInfo.comment')}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder={t('model.editor.tableInfo.commentPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
