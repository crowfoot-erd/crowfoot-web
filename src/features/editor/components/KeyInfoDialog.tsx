/**
 * 키(유니크·인덱스) 정보 다이얼로그 — 이름 + 복합 컬럼 순서 편집 (05-editor/02-ui.md §8.2)
 *
 * 이름은 문서 전체 키 네임스페이스(PK·UK·인덱스·FK)에서 유일해야 한다(keys.ts).
 * 생성 모드에서는 선택 컬럼을 따르는 기본 이름(uk_/idx_ 접두)을 자동으로 채우고,
 * 사용자가 직접 고치면 더 이상 따라가지 않는다. 컬럼 선택은 체크(선택 순서 = 키 컬럼
 * 순서) + 화살표 재정렬로 편집한다. 확정은 목록 전체를 1커밋(uniqueKey/set·index/set).
 * 협업(v1.17): 열려 있는 동안 소속 테이블의 Edit Session Lock을 잡는다(useEditLock).
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { KeyKind } from '@/features/editor/model/keys'
import type { ErdColumn, ErdTable, IndexOrder } from '@/features/editor/model/content-schema'
import { useEditLock } from '@/features/editor/collab-locks'

export interface KeyInfoSubmit {
  name: string
  columnIds: string[]
  /** 인덱스 컬럼별 정렬(ASC/DESC) — 유니크는 순서·정렬이 의미 없어 무시한다 */
  orders: Record<string, IndexOrder>
}

export interface KeyInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: KeyKind
  /** 편집 대상 키 — null이면 생성 */
  target: { name: string; columnIds: string[]; orders?: Record<string, IndexOrder> } | null
  table: ErdTable | null
  /** 문서 전체 키 이름(소문자) — 중복 검증. 편집 대상 자기 이름은 제외된 상태로 전달된다 */
  existingNames: ReadonlySet<string>
  /** 선택 컬럼에 대한 기본 이름 제안 — 문서(모델)를 아는 쪽에서 계산해 전달한다 */
  suggestName: (columns: ErdColumn[]) => string
  onConfirm: (values: KeyInfoSubmit) => void
}

type KeyInfoForm = {
  name: string
  columnIds: string[]
}

export function KeyInfoDialog({
  open,
  onOpenChange,
  kind,
  target,
  table,
  existingNames,
  suggestName,
  onConfirm,
}: KeyInfoDialogProps) {
  const { t } = useTranslation()
  // 다이얼로그 수명 락 — 키 변경은 테이블 귀속이라 락 단위도 테이블이다
  const foreignLock = useEditLock('table', table?.id ?? null, open)
  const locked = foreignLock !== null

  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t('model.editor.key.nameRequired'))
      .refine((value) => !existingNames.has(value.toLowerCase()), t('model.editor.key.nameDuplicate')),
    columnIds: z.array(z.string()).min(1, t('model.editor.key.columnsRequired')),
  })

  const form = useForm<KeyInfoForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', columnIds: [] },
  })

  // 사용자가 이름을 직접 고쳤는가 — 고치기 전까지 컬럼 선택을 따라 기본 이름을 채운다
  const [nameEdited, setNameEdited] = useState(false)
  // 인덱스 컬럼별 정렬 — 선택 시 기본 ASC
  const [orders, setOrders] = useState<Record<string, IndexOrder>>({})

  useEffect(() => {
    if (open) {
      form.reset({ name: target?.name ?? '', columnIds: target?.columnIds ?? [] })
      setNameEdited(target !== null)
      setOrders(target?.orders ?? {})
    }
  }, [open, target])

  const columnIds = form.watch('columnIds')

  // 생성 중 컬럼 선택이 바뀌면 기본 이름을 다시 제안한다 (1개 이상일 때만)
  useEffect(() => {
    if (!open || nameEdited || !table || columnIds.length === 0) return
    const columns = columnIds
      .map((id) => table.columns.find((c) => c.id === id))
      .filter((c): c is ErdColumn => c !== undefined)
    form.setValue('name', suggestName(columns))
  }, [columnIds])

  const toggleColumn = (columnId: string) => {
    const current = form.getValues('columnIds')
    form.setValue(
      'columnIds',
      current.includes(columnId) ? current.filter((id) => id !== columnId) : [...current, columnId],
      { shouldValidate: true },
    )
  }

  const moveColumn = (from: number, to: number) => {
    const current = [...form.getValues('columnIds')]
    const [moved] = current.splice(from, 1)
    current.splice(to, 0, moved)
    form.setValue('columnIds', current, { shouldValidate: true })
  }

  const toggleOrder = (columnId: string) => {
    setOrders((prev) => ({ ...prev, [columnId]: prev[columnId] === 'DESC' ? 'ASC' : 'DESC' }))
  }

  const kindLabel = t(kind === 'unique' ? 'model.editor.key.unique' : 'model.editor.key.index')

  const handleSubmit = form.handleSubmit((values) => {
    onConfirm({ name: values.name.trim(), columnIds: values.columnIds, orders })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(target ? 'model.editor.key.titleEdit' : 'model.editor.key.titleAdd', { kind: kindLabel })}</DialogTitle>
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
                    <Input
                      placeholder={kind === 'unique' ? 'uk_table_col1_col2' : 'idx_table_col1_col2'}
                      {...field}
                      onChange={(event) => {
                        setNameEdited(true)
                        field.onChange(event)
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="columnIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.key.columns')}</FormLabel>
                  <FormControl>
                    <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border p-1">
                      {(table?.columns ?? []).map((column) => {
                        const order = field.value.indexOf(column.id)
                        const selected = order >= 0
                        return (
                          <div key={column.id} className="flex items-center gap-2 rounded-sm px-1 py-0.5 text-sm hover:bg-accent">
                            <input
                              type="checkbox"
                              className="size-3.5 accent-primary"
                              checked={selected}
                              onChange={() => toggleColumn(column.id)}
                              aria-label={`${t('model.editor.key.columns')} — ${column.physicalName}`}
                            />
                            {selected ? (
                              <span className="w-4 text-center text-[10px] tabular-nums text-muted-foreground">{order + 1}</span>
                            ) : (
                              <span className="w-4" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1 truncate">{column.physicalName}</span>
                            {selected && kind === 'index' ? (
                              <button
                                type="button"
                                className="w-10 shrink-0 rounded-sm bg-muted px-1 text-[9px] font-semibold tabular-nums text-muted-foreground hover:bg-accent"
                                onClick={() => toggleOrder(column.id)}
                                aria-label={`${t('model.editor.key.order')} — ${column.physicalName}`}
                                title={t('model.editor.key.order')}
                              >
                                {orders[column.id] ?? 'ASC'}
                              </button>
                            ) : null}
                            {selected ? (
                              <span className="flex">
                                <button
                                  type="button"
                                  className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent disabled:opacity-20"
                                  onClick={() => moveColumn(order, order - 1)}
                                  disabled={order === 0}
                                  aria-label={`${t('model.editor.key.moveUp')} — ${column.physicalName}`}
                                >
                                  <ChevronUp aria-hidden className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent disabled:opacity-20"
                                  onClick={() => moveColumn(order, order + 1)}
                                  disabled={order === field.value.length - 1}
                                  aria-label={`${t('model.editor.key.moveDown')} — ${column.physicalName}`}
                                >
                                  <ChevronDown aria-hidden className="size-3.5" />
                                </button>
                              </span>
                            ) : null}
                          </div>
                        )
                      })}
                      {(table?.columns ?? []).length === 0 ? (
                        <p className="px-1 py-2 text-xs text-muted-foreground">{t('model.editor.key.noColumns')}</p>
                      ) : null}
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">{t('model.editor.key.columnsHint')}</p>
                  {kind === 'index' ? (
                    <p className="text-xs text-muted-foreground">{t('model.editor.key.orderHint')}</p>
                  ) : null}
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
