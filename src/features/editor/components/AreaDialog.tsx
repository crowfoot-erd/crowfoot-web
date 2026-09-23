/**
 * 주제 영역 편집 다이얼로그 — 이름·설명·강조색·멤버 테이블 (05-editor/02-ui.md §6, v1.13)
 *
 * 오픈 지점: 영역 헤더 설정 버튼·컨텍스트 메뉴. 이름·설명 확정은 area/patch 1커밋,
 * 강조색 스와치와 멤버 체크는 클릭 즉시 커밋(테이블 정보 다이얼로그 관례) — 다이얼로그가
 * 열린 채 캔버스·익스플로러가 바로 반응한다. 멤버 목록의 표시 이름은 익스플로러와 같은
 * 규칙(물리 우선, 논리명이 다를 때 옆에)이라 보는 모드와 어긋나지 않는다.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import type { AreaPatch } from '@/features/editor/model/changes'
import {
  TABLE_COLORS,
  TABLE_COLOR_HEX,
  type ErdArea,
  type TableColorValue,
} from '@/features/editor/model/content-schema'

export interface AreaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 대상 영역 — null이면 열리지 않는다 */
  area: ErdArea | null
  /** 멤버 체크 목록 재료 — 문서 전체 테이블(체크로 포함/제외) */
  tables: Array<{ id: string; physical: string; logical: string }>
  /** 강조색 확정 — 스와치 클릭 즉시 호출(1커밋) */
  onColorChange: (areaId: string, color: TableColorValue) => void
  onCommit: (areaId: string, patch: AreaPatch) => void
}

type AreaInfoForm = {
  name: string
  description: string
}

export function AreaDialog({ open, onOpenChange, area, tables, onColorChange, onCommit }: AreaDialogProps) {
  const { t } = useTranslation()

  const schema = z.object({
    name: z.string().trim().min(1, t('model.editor.areaDialog.nameRequired')),
    description: z.string().trim(),
  })

  const form = useForm<AreaInfoForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })

  // 열릴 때마다 대상 영역 값으로 초기화
  useEffect(() => {
    if (open && area) {
      form.reset({ name: area.name, description: area.description })
    }
  }, [open, area, form])

  const handleSubmit = form.handleSubmit((values) => {
    if (!area) return
    onCommit(area.id, { name: values.name, description: values.description })
    onOpenChange(false)
  })

  /** 멤버 토글 — 체크 즉시 커밋(색 스와치 관례). 순서는 문서 테이블 순서를 따른다 */
  const toggleMember = (tableId: string, checked: boolean) => {
    if (!area) return
    const next = checked
      ? [...area.tableIds, tableId]
      : area.tableIds.filter((id) => id !== tableId)
    onCommit(area.id, { tableIds: next })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('model.editor.areaDialog.title')}</DialogTitle>
          <DialogDescription>{area?.name}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.areaDialog.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('model.editor.area.defaultName')} {...field} />
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
                  <FormLabel>{t('model.editor.areaDialog.description')}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder={t('model.editor.areaDialog.descriptionPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* 강조색 — 프리셋 10색 + 기본(무색). 클릭 즉시 커밋이라 닫지 않고 박스가 바로 변한다 */}
            <FormItem>
              <FormLabel>{t('model.editor.areaDialog.color')}</FormLabel>
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t('model.editor.areaDialog.color')}
              >
                <button
                  type="button"
                  className={cn(
                    'size-6 rounded-md border border-input bg-background hover:ring-1 hover:ring-primary/40',
                    area?.color === 'default' && 'ring-2 ring-primary ring-offset-1',
                  )}
                  aria-label={t('model.editor.tableInfo.colorDefault')}
                  aria-pressed={area?.color === 'default'}
                  title={t('model.editor.tableInfo.colorDefault')}
                  onClick={() => area && onColorChange(area.id, 'default')}
                />
                {TABLE_COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={cn(
                      'size-6 rounded-md border border-black/10 hover:ring-1 hover:ring-primary/40 dark:border-white/10',
                      area?.color === preset && 'ring-2 ring-primary ring-offset-1',
                    )}
                    style={{ backgroundColor: TABLE_COLOR_HEX[preset] }}
                    aria-label={t('model.editor.areaDialog.color')}
                    aria-pressed={area?.color === preset}
                    onClick={() => area && onColorChange(area.id, preset)}
                  />
                ))}
              </div>
            </FormItem>
            {/* 멤버 테이블 — 체크 즉시 포함/제외. 표시 이름은 익스플로러와 같은 규칙(물리 우선 + 논리 묵게) */}
            <FormItem>
              <div className="flex items-baseline justify-between">
                <FormLabel>{t('model.editor.areaDialog.tables')}</FormLabel>
                <span className="text-[10px] text-muted-foreground">{t('model.editor.areaDialog.tablesHint')}</span>
              </div>
              <div className="max-h-52 overflow-y-auto rounded-md border p-1" role="group" aria-label={t('model.editor.areaDialog.tables')}>
                {tables.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">{t('model.editor.areaDialog.noTables')}</p>
                ) : (
                  tables.map((table) => {
                    const memberIds = new Set(area?.tableIds ?? [])
                    const checked = memberIds.has(table.id)
                    return (
                      <label
                        key={table.id}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-accent"
                      >
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleMember(table.id, value === true)} />
                        <span className="min-w-0 truncate">{table.physical}</span>
                        {table.logical && table.logical !== table.physical ? (
                          <span className="min-w-0 truncate text-[10px] text-muted-foreground">{table.logical}</span>
                        ) : null}
                      </label>
                    )
                  })
                )}
              </div>
            </FormItem>
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
