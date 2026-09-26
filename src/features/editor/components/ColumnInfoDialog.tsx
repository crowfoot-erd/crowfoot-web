/**
 * 컬럼 정보 다이얼로그 — 컬럼의 모든 속성 편집 (05-editor/02-ui.md §8.2)
 *
 * 오픈 지점: 컬럼 행 이름 더블클릭(노드 더블클릭 = 테이블 정보와 구분).
 * PK·타입·길이·정밀도·NN·AI·기본값·코멘트 전부 — 노드 인라인 편집과 같은 규칙
 * (PK는 NN 강제·최상단 이동, AI는 PK + 정수 타입만)을 폼으로 노출한다.
 * 확정 시 PK 토글 묶음 + column/patch를 1커밋 스택으로 붙는다.
 * 협업(v1.17): 열려 있는 동안 소속 테이블의 Edit Session Lock을 잡는다(useEditLock) —
 * 컬럼·키 변경은 전부 테이블 귀속이라 락 단위도 테이블이다.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ColumnPatch } from '@/features/editor/model/changes'
import { DATA_TYPES, dataTypeSpec, isAutoIncrementType, physicalType } from '@/features/editor/model/dbms'
import type { ErdColumn } from '@/features/editor/model/content-schema'
import { useEditLock } from '@/features/editor/collab-locks'

export interface ColumnInfoSubmit {
  pk: boolean
  patch: ColumnPatch
}

export interface ColumnInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 대상 컬럼 — null이면 열리지 않는다 */
  column: ErdColumn | null
  /** 소속 테이블 id — Edit Session Lock 대상(컬럼 변경의 락 단위는 테이블) */
  tableId: string | null
  /** 현재 PK 소속 여부 — PK 토글 커밋 판단에 쓴다 */
  isPk: boolean
  /** 소속 테이블의 PK 컬럼 수 — 복합 PK에서는 AI를 제공하지 않는다 */
  pkCount: number
  /** 문서 대상 DBMS — 타입 옵션 라벨을 물리 표기로(값은 공용 논리 코드 유지) */
  dbmsId: string
  onConfirm: (values: ColumnInfoSubmit) => void
}

type ColumnInfoForm = {
  physicalName: string
  logicalName: string
  pk: boolean
  dataType: string
  length: string
  precision: string
  scale: string
  nullable: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

/** 숫자 input 확정 — 빈 값·비숫자는 null로 정규화 */
function toNumberOrNull(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function toDisplay(value: number | null): string {
  return value === null ? '' : String(value)
}

export function ColumnInfoDialog({ open, onOpenChange, column, tableId, isPk, pkCount, dbmsId, onConfirm }: ColumnInfoDialogProps) {
  const { t } = useTranslation()
  // 다이얼로그 수명 락 — 남이 잡았으면(반환값) 확정을 막는다
  const foreignLock = useEditLock('table', tableId, open)
  const locked = foreignLock !== null

  const schema = z.object({
    physicalName: z.string().trim().min(1, t('model.editor.columnInfo.nameRequired')),
    logicalName: z.string().trim(),
    pk: z.boolean(),
    dataType: z.string().min(1),
    length: z.string(),
    precision: z.string(),
    scale: z.string(),
    nullable: z.boolean(),
    autoIncrement: z.boolean(),
    defaultValue: z.string().trim(),
    comment: z.string().trim(),
  })

  const form = useForm<ColumnInfoForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      physicalName: '',
      logicalName: '',
      pk: false,
      dataType: 'VARCHAR',
      length: '',
      precision: '',
      scale: '',
      nullable: true,
      autoIncrement: false,
      defaultValue: '',
      comment: '',
    },
  })

  // 열릴 때마다 대상 컬럼 값으로 초기화
  useEffect(() => {
    if (open && column) {
      form.reset({
        physicalName: column.physicalName,
        logicalName: column.logicalName,
        pk: isPk,
        dataType: column.dataType,
        length: toDisplay(column.length),
        precision: toDisplay(column.precision),
        scale: toDisplay(column.scale),
        nullable: column.nullable,
        autoIncrement: column.autoIncrement,
        defaultValue: column.defaultValue ?? '',
        comment: column.comment ?? '',
      })
    }
  }, [open, column, isPk, form])

  const dataType = form.watch('dataType')
  const pk = form.watch('pk')
  const spec = dataTypeSpec(dataType)
  /** AI는 PK + 정수 타입(INT·BIGINT·SMALLINT) 조합에서만 의미가 있다 */
  // 이 컬럼 외에 다른 PK가 남는지 — 폼에서 PK를 켜도 복합(2개 이상)이면 AI를 제공하지 않는다
  const otherPkCount = pkCount - (isPk ? 1 : 0)
  const aiAvailable = pk && otherPkCount === 0 && isAutoIncrementType(dataType)

  const handleSubmit = form.handleSubmit((values) => {
    if (!column) return
    onConfirm({
      pk: values.pk,
      patch: {
        physicalName: values.physicalName,
        logicalName: values.logicalName,
        dataType: values.dataType,
        length: spec?.length ? toNumberOrNull(values.length) : null,
        precision: spec?.precision ? toNumberOrNull(values.precision) : null,
        scale: spec?.precision ? toNumberOrNull(values.scale) : null,
        // PK는 항상 NN, AI는 성립 조건일 때만 유지
        nullable: values.pk ? false : values.nullable,
        autoIncrement: values.pk && otherPkCount === 0 && isAutoIncrementType(values.dataType) ? values.autoIncrement : false,
        defaultValue: values.defaultValue === '' ? null : values.defaultValue,
        comment: values.comment === '' ? null : values.comment,
      },
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('model.editor.columnInfo.title')}</DialogTitle>
          <DialogDescription>{column?.physicalName}</DialogDescription>
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
              name="physicalName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.columnInfo.physicalName')}</FormLabel>
                  <FormControl>
                    <Input placeholder="order_id" {...field} />
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
                  <FormLabel>{t('model.editor.columnInfo.logicalName')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('model.editor.columnInfo.logicalNamePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="pk"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('model.editor.columnInfo.pk')}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={t('model.editor.columnInfo.pk')} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nullable"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('model.editor.columnInfo.nullable')}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} disabled={pk} aria-label={t('model.editor.columnInfo.nullable')} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="autoIncrement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('model.editor.columnInfo.autoIncrement')}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!aiAvailable} aria-label={t('model.editor.columnInfo.autoIncrement')} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            {pk ? (
              <p className="-mt-2 text-xs text-muted-foreground">{t('model.editor.columnInfo.pkHint')}</p>
            ) : null}
            {!aiAvailable ? (
              <p className="-mt-2 text-xs text-muted-foreground">{t('model.editor.columnInfo.aiHint')}</p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="dataType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('model.editor.columnInfo.dataType')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DATA_TYPES.map((type) => (
                          <SelectItem key={type.code} value={type.code}>
                            {physicalType(type.code, dbmsId)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {spec?.length ? (
                <FormField
                  control={form.control}
                  name="length"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('model.editor.columnInfo.length')}</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="numeric" placeholder="255" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : spec?.precision ? (
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="precision"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('model.editor.columnInfo.precision')}</FormLabel>
                        <FormControl>
                          <Input type="number" inputMode="numeric" placeholder="10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scale"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('model.editor.columnInfo.scale')}</FormLabel>
                        <FormControl>
                          <Input type="number" inputMode="numeric" placeholder="2" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                <span aria-hidden />
              )}
            </div>

            <FormField
              control={form.control}
              name="defaultValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.columnInfo.defaultValue')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('model.editor.columnInfo.defaultValuePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.columnInfo.comment')}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder={t('model.editor.columnInfo.commentPlaceholder')} {...field} />
                  </FormControl>
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
