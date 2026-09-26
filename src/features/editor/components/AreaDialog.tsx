/**
 * 주제 영역 편집 다이얼로그 — 이름·설명·강조색·멤버 테이블 (05-editor/02-ui.md §6, v1.13)
 *
 * 오픈 지점: 영역 헤더 설정 버튼·컨텍스트 메뉴. 이름·설명 확정은 area/patch 1커밋,
 * 강조색 스와치와 멤버 체크는 클릭 즉시 커밋(테이블 정보 다이얼로그 관례) — 다이얼로그가
 * 열린 채 캔버스·익스플로러가 바로 반응한다. 멤버 목록의 표시 이름은 익스플로러와 같은
 * 규칙(물리 우선, 논리명이 다를 때 옆에)이라 보는 모드와 어긋나지 않는다.
 * 협업(v1.17): 열려 있는 동안 영역 Edit Session Lock을 잡는다(useEditLock) — 남이
 * 편집 중이면 확정·색·멤버 변경이 막히고 보유자 안내가 뜬다.
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
import { useEditLock } from '@/features/editor/collab-locks'

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
  // 다이얼로그 수명 락 — 남이 잡았으면(반환값) 확정·색·멤버 변경을 막는다
  const foreignLock = useEditLock('area', area?.id ?? null, open)
  const locked = foreignLock !== null

  const schema = z.object({
    name: z.string().trim().min(1, t('model.editor.areaDialog.nameRequired')),
    description: z.string().trim(),
  })

  const form = useForm<AreaInfoForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })

  // 열림/대상 전환 시에만 폼을 초기화한다. 색·멤버는 즉시 커밋이라 present가 계속 바뀌는데
  // (area 참조가 매번 새로 만들어지는데) 그때마다 reset하면 아직 저장 전인 이름·설명 입력이
  // 문서값(기본 이름)으로 되돌려진다 — 생성 직후 색을 고르고 이름을 저장하면 이름이 사라지는 버그.
  const areaId = area?.id ?? null
  useEffect(() => {
    if (open && area) {
      form.reset({ name: area.name, description: area.description })
    }
  }, [open, areaId, form])

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
            {/* 강조색 — 프리셋 10색 + 기본(무색). 클릭 즉시 커밋이라 닫지 않고 박스가 바로 변한다.
                남의 락이면 즉시 커밋 경로도 잠긴다 */}
            <FormItem>
              <FormLabel>{t('model.editor.areaDialog.color')}</FormLabel>
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t('model.editor.areaDialog.color')}
              >
                <button
                  type="button"
                  disabled={locked}
                  className={cn(
                    'size-6 rounded-md border border-input bg-background hover:ring-1 hover:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60',
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
                    disabled={locked}
                    className={cn(
                      'size-6 rounded-md border border-black/10 hover:ring-1 hover:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10',
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
                        <Checkbox checked={checked} disabled={locked} onCheckedChange={(value) => toggleMember(table.id, value === true)} />
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
              <Button type="submit" disabled={locked}>{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
