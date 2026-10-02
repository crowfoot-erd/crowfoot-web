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
import {
  Form,
  FormControl,
  FormDescription,
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
import { splitLogicalName } from '@/features/editor/model/logical-name'
import type { WorkspaceTerm } from '@/api/types'
import type { DomainType } from '@/features/domain-types/api'
import { DOMAIN_FIELDS, type DomainField } from '@/features/editor/model/changes'
import { DATA_TYPES, dataTypeSpec, isAutoIncrementType, physicalType } from '@/features/editor/model/dbms'
import { differingFields, domainValues, linkFor } from '@/features/editor/model/domain-type'
import { typeLabel } from '@/features/editor/model/domain-type-format'
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
  /** 워크스페이스 도메인 타입 목록 — 주면 도메인 타입을 고를 수 있다(§11.1). undefined면 목록을 읽지 못한 것이다 */
  domainTypes?: readonly DomainType[]
  /** 외래 키 컬럼인지 — 외래 키 컬럼에는 도메인 타입을 적용할 수 없다(타입이 부모 컬럼을 따른다) */
  isFk?: boolean
  /** 워크스페이스 사전 — 물리명이 용어와 같고 그 용어가 도메인 타입을 가리키면 "사전 표준"으로 안내한다(§16) */
  terms?: readonly WorkspaceTerm[]
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

export function ColumnInfoDialog({
  open,
  onOpenChange,
  column,
  tableId,
  isPk,
  pkCount,
  dbmsId,
  domainTypes,
  isFk = false,
  terms,
  onConfirm,
}: ColumnInfoDialogProps) {
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

  /** 고른 도메인 타입 id — ''는 쓰지 않음. 목록에 없는 id는 끊긴 연결이다(그대로 두면 연결을 유지한다) */
  const [domainId, setDomainId] = useState('')

  // 열릴 때마다 대상 컬럼 값으로 초기화 — 논리명 "-----" 구분자(05-editor/01-core.md §3.3)는
  // 두 필드로 나눠 보여준다: 논리명 = 앞부분, 코멘트 필드 = 뒷부분(없으면 빈 칸). 코멘트 필드는
  // 이 구분자 설명부 소관이라 content의 comment는 여기서 다루지 않는다(테이블 정보와 같은 규칙).
  useEffect(() => {
    if (open && column) {
      const { name, description } = splitLogicalName(column.logicalName)
      form.reset({
        physicalName: column.physicalName,
        logicalName: name,
        pk: isPk,
        dataType: column.dataType,
        length: toDisplay(column.length),
        precision: toDisplay(column.precision),
        scale: toDisplay(column.scale),
        nullable: column.nullable,
        autoIncrement: column.autoIncrement,
        defaultValue: column.defaultValue ?? '',
        comment: description ?? '',
      })
      setDomainId(column.domain?.id ?? '')
    }
  }, [open, column, isPk, form])

  const selectedDomain = domainTypes?.find((candidate) => candidate.domainTypeId === domainId)
  const domainMissing = domainId !== '' && domainTypes !== undefined && !selectedDomain
  const watched = form.watch()
  /** 폼의 지금 값(도메인 타입이 다루는 여섯 속성) — 제출 값과 같은 정규화를 거친다 */
  const formDomainValues = () => {
    const formSpec = dataTypeSpec(watched.dataType)
    return {
      dataType: watched.dataType,
      length: formSpec?.length ? toNumberOrNull(watched.length) : null,
      precision: formSpec?.precision ? toNumberOrNull(watched.precision) : null,
      scale: formSpec?.precision ? toNumberOrNull(watched.scale) : null,
      nullable: watched.pk ? false : watched.nullable,
      defaultValue: watched.defaultValue.trim() === '' ? null : watched.defaultValue.trim(),
    }
  }
  /** 기본 키 컬럼은 nullable을 따르지 않는다 */
  const domainFields = DOMAIN_FIELDS.filter((field) => !(watched.pk && field === 'nullable'))
  const differing = selectedDomain ? differingFields(formDomainValues(), selectedDomain, domainFields) : []

  /** 사전 표준 — 물리명이 사전의 용어와 같고(대소문자 무시) 그 용어가 가리키는 도메인 타입.
   *  지금 고른 도메인 타입이 그것이면 안내하지 않는다 */
  const standardDomain = (() => {
    if (isFk || !terms || !domainTypes) return undefined
    const name = (watched.physicalName ?? '').trim().toLowerCase()
    if (name === '') return undefined
    const term = terms.find((candidate) => candidate.term.toLowerCase() === name && candidate.domainTypeId)
    const domainType = term ? domainTypes.find((candidate) => candidate.domainTypeId === term.domainTypeId) : undefined
    return domainType && domainType.domainTypeId !== domainId ? domainType : undefined
  })()

  /** 도메인 타입의 값을 폼에 넣는다 — fields를 주면 그 속성만 */
  const fillFromDomain = (domainType: DomainType, fields: readonly DomainField[] = domainFields) => {
    const values = domainValues(domainType)
    for (const field of fields) {
      if (field === 'dataType') form.setValue('dataType', values.dataType)
      else if (field === 'nullable') form.setValue('nullable', values.nullable)
      else if (field === 'defaultValue') form.setValue('defaultValue', values.defaultValue ?? '')
      else form.setValue(field, toDisplay(values[field]))
    }
  }

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
        // 저장은 한 문자열로 합친다 — 설명(코멘트 필드)이 있으면 "논리명-----설명" 원문 형태로
        logicalName: values.comment === '' ? values.logicalName : `${values.logicalName}-----${values.comment}`,
        dataType: values.dataType,
        length: spec?.length ? toNumberOrNull(values.length) : null,
        precision: spec?.precision ? toNumberOrNull(values.precision) : null,
        scale: spec?.precision ? toNumberOrNull(values.scale) : null,
        // PK는 항상 NN, AI는 성립 조건일 때만 유지
        nullable: values.pk ? false : values.nullable,
        autoIncrement: values.pk && otherPkCount === 0 && isAutoIncrementType(values.dataType) ? values.autoIncrement : false,
        defaultValue: values.defaultValue === '' ? null : values.defaultValue,
        // 도메인 타입 연결 — 고른 것이 없으면 푼다. 끊긴 연결을 그대로 두면 건드리지 않는다.
        // 고른 도메인 타입과 값이 다른 속성은 "다르게 쓰기"로 적힌다(맞춘 버전은 지금 버전이 된다)
        ...(domainId === ''
          ? column.domain
            ? { domain: null }
            : {}
          : selectedDomain
            ? { domain: linkFor(selectedDomain, formDomainValues(), domainFields) }
            : {}),
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
                  {/* "-----" 구분자 관례 안내(05-editor/01-core.md §3.3) — 저장은 한 필드 원문 그대로 */}
                  <FormDescription>{t('model.editor.columnInfo.logicalNameSeparatorHint')}</FormDescription>
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

            {/* 도메인 타입 — 고르면 타입·길이·NULL 허용·기본값이 그 값으로 채워진다(§11.1) */}
            {domainTypes !== undefined && (domainTypes.length > 0 || domainId !== '') ? (
              <div className="grid gap-1.5 rounded-md border p-2">
                {standardDomain ? (
                  // 사전이 이 이름의 도메인 타입을 정해 두었다 — 한 번에 맞춘다
                  <div className="flex flex-wrap items-center gap-2 text-xs text-violet-600 dark:text-violet-400" data-testid="domain-standard">
                    <span>{t('model.editor.domainType.standard', { name: standardDomain.name })}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={locked}
                      onClick={() => {
                        setDomainId(standardDomain.domainTypeId)
                        fillFromDomain(standardDomain)
                      }}
                    >
                      {t('model.editor.domainType.standardApply')}
                    </Button>
                  </div>
                ) : null}
                <label className="grid gap-1 text-sm font-medium">
                  {t('model.editor.domainType.label')}
                  <select
                    value={domainId}
                    disabled={isFk || locked}
                    onChange={(event) => {
                      setDomainId(event.target.value)
                      const picked = domainTypes.find((candidate) => candidate.domainTypeId === event.target.value)
                      if (picked) fillFromDomain(picked)
                    }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  >
                    <option value="">{t('model.editor.domainType.none')}</option>
                    {domainMissing ? (
                      <option value={domainId}>
                        {t('model.editor.domainType.missing', { name: column?.domain?.name ?? '' })}
                      </option>
                    ) : null}
                    {domainTypes.map((domainType) => (
                      <option key={domainType.domainTypeId} value={domainType.domainTypeId}>
                        {domainType.name} — {typeLabel(domainType, dbmsId)}
                      </option>
                    ))}
                  </select>
                </label>
                {isFk ? <p className="text-xs text-muted-foreground">{t('model.editor.domainType.fkHint')}</p> : null}
                {domainMissing ? <p className="text-xs text-amber-600 dark:text-amber-400">{t('model.editor.domainType.missingHint')}</p> : null}
                {selectedDomain && column?.domain?.id === selectedDomain.domainTypeId && column.domain.version < selectedDomain.version ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{t('model.editor.domainType.staleHint')}</p>
                ) : null}
                {selectedDomain && differing.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <span data-testid="domain-differs">
                      {t('model.editor.domainType.differs', {
                        fields: differing.map((field) => t(`model.editor.domainType.field.${field}`)).join(', '),
                      })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => fillFromDomain(selectedDomain, differing)}
                    >
                      {t('model.editor.domainType.revert')}
                    </Button>
                  </div>
                ) : null}
              </div>
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
