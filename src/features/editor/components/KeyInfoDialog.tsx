/**
 * 키(유니크·인덱스) 정보 다이얼로그 — 이름 + 복합 컬럼 순서 편집 (05-editor/02-ui.md §8.2)
 *
 * 이름은 문서 전체 키 네임스페이스(PK·UK·인덱스·FK)에서 유일해야 한다(keys.ts).
 * 생성 모드에서는 선택 컬럼을 따르는 기본 이름(uk_/idx_ 접두)을 자동으로 채우고,
 * 사용자가 직접 고치면 더 이상 따라가지 않는다. 컬럼 선택은 체크(선택 순서 = 키 컬럼
 * 순서) + 화살표 재정렬로 편집한다. 확정은 목록 전체를 1커밋(uniqueKey/set·index/set).
 * 인덱스(v1.34)는 종류(BTREE·FULLTEXT·SPATIAL)를 고른다. FULLTEXT는 파서(MySQL WITH PARSER — 예: ngram)를
 * 적을 수 있고, FULLTEXT·SPATIAL은 컬럼별 정렬이 의미 없어 정렬 버튼을 숨긴다(저장은 ASC).
 * 특수 인덱스(v1.37): 유니크 인덱스, 키 구성(컬럼 ↔ 식 원문), 컬럼별 연산자 클래스, 조건(WHERE), 포함 컬럼(INCLUDE).
 * 문서 DBMS가 지원하는 항목만 보여 준다(dbms.ts dbmsIndexSupport). 지원하지 않아도 이미 값이 있으면 보여 주고
 * 그대로 저장한다 — 지우는 것은 사용자의 몫이다(DDL 생성기가 경고와 함께 뺀다).
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { stripOuterParens, type KeyKind } from '@/features/editor/model/keys'
import type { ErdColumn, ErdTable, IndexOrder, IndexType } from '@/features/editor/model/content-schema'
import { dbmsIndexSupport } from '@/features/editor/model/dbms'
import { useEditLock } from '@/features/editor/collab-locks'

export interface KeyInfoSubmit {
  name: string
  columnIds: string[]
  /** 인덱스 컬럼별 정렬(ASC/DESC) — 유니크는 순서·정렬이 의미 없어 무시한다 */
  orders: Record<string, IndexOrder>
  /** 인덱스 종류 — 유니크는 무시한다 */
  type: IndexType
  /** 전문 검색 파서 — FULLTEXT일 때만 값이 있다 */
  parser: string | null
  /** 이하 인덱스 전용(v1.37) — 유니크는 무시한다 */
  unique: boolean
  /** 식 인덱스의 키 목록 원문 — 있으면 columnIds는 비어 있다 */
  expression: string | null
  /** 부분 인덱스 조건 — WHERE·바깥 괄호 없는 원문 */
  where: string | null
  /** INCLUDE 컬럼 id(테이블 컬럼 순서) */
  include: string[]
  /** 컬럼별 연산자 클래스 — 빈 값은 담지 않는다 */
  opclasses: Record<string, string>
}

export interface KeyInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: KeyKind
  /** 문서 대상 DBMS 템플릿 id — 인덱스 편집 항목을 정한다(v1.37) */
  dbmsId: string
  /** 편집 대상 키 — null이면 생성 */
  target: {
    name: string
    columnIds: string[]
    orders?: Record<string, IndexOrder>
    type?: IndexType
    parser?: string | null
    unique?: boolean
    expression?: string | null
    where?: string | null
    include?: string[]
    opclasses?: Record<string, string>
  } | null
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
  /** 키 구성 — 식 원문(true) / 컬럼 선택(false). 인덱스 전용(v1.37) */
  expressionMode: boolean
  expression: string
}

export function KeyInfoDialog({
  open,
  onOpenChange,
  kind,
  dbmsId,
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
    columnIds: z.array(z.string()),
    expressionMode: z.boolean(),
    expression: z.string(),
  }).superRefine((values, ctx) => {
    // 식 인덱스는 식 원문, 그 밖에는 컬럼 1개 이상
    if (kind === 'index' && values.expressionMode) {
      if (values.expression.trim() === '') ctx.addIssue({ code: 'custom', path: ['expression'], message: t('model.editor.key.expressionRequired') })
    } else if (values.columnIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['columnIds'], message: t('model.editor.key.columnsRequired') })
    }
  })

  const form = useForm<KeyInfoForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', columnIds: [], expressionMode: false, expression: '' },
  })

  // 사용자가 이름을 직접 고쳤는가 — 고치기 전까지 컬럼 선택을 따라 기본 이름을 채운다
  const [nameEdited, setNameEdited] = useState(false)
  // 인덱스 컬럼별 정렬 — 선택 시 기본 ASC
  const [orders, setOrders] = useState<Record<string, IndexOrder>>({})
  // 인덱스 종류·파서 — 생성 기본은 BTREE, 파서 없음
  const [indexType, setIndexType] = useState<IndexType>('BTREE')
  const [parser, setParser] = useState('')
  // 특수 인덱스(v1.37) — 유니크·조건·포함 컬럼·컬럼별 연산자 클래스
  const [unique, setUnique] = useState(false)
  const [where, setWhere] = useState('')
  const [include, setInclude] = useState<string[]>([])
  const [opclasses, setOpclasses] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      const expression = target?.expression ?? ''
      form.reset({
        name: target?.name ?? '',
        columnIds: target?.columnIds ?? [],
        expressionMode: expression.trim() !== '',
        expression,
      })
      setNameEdited(target !== null)
      setOrders(target?.orders ?? {})
      setIndexType(target?.type ?? 'BTREE')
      setParser(target?.parser ?? '')
      setUnique(target?.unique ?? false)
      setWhere(target?.where ?? '')
      setInclude(target?.include ?? [])
      setOpclasses(target?.opclasses ?? {})
    }
  }, [open, target])

  /** 정렬이 의미 있는 종류인가 — FULLTEXT·SPATIAL·GIN 등은 컬럼별 정렬을 두지 않는다 */
  const orderable = kind === 'index' && indexType === 'BTREE'

  // DBMS가 지원하는 항목만 보인다 — 지원하지 않아도 저장된 값이 있으면 보여 준다(지우지 않는다)
  const support = dbmsIndexSupport(dbmsId)
  const typeOptions = support.types.includes(indexType) ? support.types : [...support.types, indexType]
  const typeUnsupported = !support.types.includes(indexType)
  const hasOpclass = Object.values(target?.opclasses ?? {}).some((value) => value !== '')
  const showUnique = kind === 'index' && (support.unique || (target?.unique ?? false))
  const showExpression = kind === 'index' && (support.expression || (target?.expression ?? '').trim() !== '')
  const showWhere = kind === 'index' && (support.where || (target?.where ?? '').trim() !== '')
  const showInclude = kind === 'index' && (support.include || (target?.include ?? []).length > 0)
  const showOpclass = kind === 'index' && (support.opclass || hasOpclass)

  const columnIds = form.watch('columnIds')
  const expressionMode = kind === 'index' && form.watch('expressionMode')

  // 생성 중 컬럼 선택이 바뀌면 기본 이름을 다시 제안한다 (1개 이상일 때만). 식 인덱스는 컬럼 없는 기본 이름(idx_테이블)
  useEffect(() => {
    if (!open || nameEdited || !table) return
    if (expressionMode) {
      form.setValue('name', suggestName([]))
      return
    }
    if (columnIds.length === 0) return
    const columns = columnIds
      .map((id) => table.columns.find((c) => c.id === id))
      .filter((c): c is ErdColumn => c !== undefined)
    form.setValue('name', suggestName(columns))
  }, [columnIds, expressionMode])

  const toggleInclude = (columnId: string) => {
    setInclude((prev) => (prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId]))
  }

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
    const trimmedParser = parser.trim()
    const isIndex = kind === 'index'
    const useExpression = isIndex && values.expressionMode
    const trimmedWhere = stripOuterParens(where)
    // 키 컬럼별 연산자 클래스 — 식 인덱스·빈 값은 담지 않는다
    const keyOpclasses = useExpression
      ? {}
      : Object.fromEntries(
          values.columnIds.flatMap((id) => {
            const value = (opclasses[id] ?? '').trim()
            return value !== '' ? [[id, value] as const] : []
          }),
        )
    const tableColumnIds = (table?.columns ?? []).map((c) => c.id)
    onConfirm({
      name: values.name.trim(),
      columnIds: useExpression ? [] : values.columnIds,
      // 정렬 없는 종류는 ASC로 저장한다 — DDL에 DESC가 실리지 않게
      orders: orderable && !useExpression ? orders : {},
      type: isIndex ? indexType : 'BTREE',
      parser: isIndex && indexType === 'FULLTEXT' && trimmedParser !== '' ? trimmedParser : null,
      unique: isIndex && unique,
      expression: useExpression ? values.expression.trim() : null,
      where: isIndex && trimmedWhere !== '' ? trimmedWhere : null,
      // 포함 컬럼은 테이블 컬럼 순서 — 키 컬럼과 겹치면 뺀다
      include: isIndex
        ? tableColumnIds.filter((id) => include.includes(id) && (useExpression || !values.columnIds.includes(id)))
        : [],
      opclasses: isIndex ? keyOpclasses : {},
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
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

            {kind === 'index' ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm font-medium">
                  {t('model.editor.key.indexType')}
                  <select
                    data-testid="index-type"
                    value={indexType}
                    onChange={(event) => setIndexType(event.target.value as IndexType)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  >
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                {indexType === 'FULLTEXT' ? (
                  <label className="grid gap-1 text-sm font-medium">
                    {t('model.editor.key.parser')}
                    <Input
                      data-testid="index-parser"
                      value={parser}
                      onChange={(event) => setParser(event.target.value)}
                      placeholder="ngram"
                      className="font-normal"
                    />
                  </label>
                ) : (
                  <span aria-hidden />
                )}
              </div>
            ) : null}
            {kind === 'index' && indexType !== 'BTREE' ? (
              <p className="-mt-2 text-xs text-muted-foreground">{t('model.editor.key.indexTypeHint')}</p>
            ) : null}
            {kind === 'index' && typeUnsupported ? (
              <p className="-mt-2 text-xs text-amber-600 dark:text-amber-500">{t('model.editor.key.unsupportedHint')}</p>
            ) : null}

            {showUnique ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t('model.editor.key.uniqueIndex')}</p>
                  <p className="text-xs text-muted-foreground">{t('model.editor.key.uniqueIndexHint')}</p>
                </div>
                <Switch
                  data-testid="index-unique"
                  checked={unique}
                  onCheckedChange={setUnique}
                  aria-label={t('model.editor.key.uniqueIndex')}
                />
              </div>
            ) : null}

            {showExpression ? (
              <FormField
                control={form.control}
                name="expressionMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('model.editor.key.keyMode')}</FormLabel>
                    <div role="radiogroup" className="flex gap-1" data-testid="index-key-mode">
                      {[false, true].map((mode) => (
                        <Button
                          key={String(mode)}
                          type="button"
                          size="sm"
                          variant={field.value === mode ? 'secondary' : 'ghost'}
                          role="radio"
                          aria-checked={field.value === mode}
                          onClick={() => field.onChange(mode)}
                        >
                          {t(mode ? 'model.editor.key.keyModeExpression' : 'model.editor.key.keyModeColumns')}
                        </Button>
                      ))}
                    </div>
                  </FormItem>
                )}
              />
            ) : null}

            {expressionMode ? (
              <FormField
                control={form.control}
                name="expression"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('model.editor.key.expression')}</FormLabel>
                    <FormControl>
                      <Textarea data-testid="index-expression" rows={2} className="font-mono text-xs" placeholder="lower(nickname)" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{t('model.editor.key.expressionHint')}</p>
                    {!support.expression ? (
                      <p className="text-xs text-amber-600 dark:text-amber-500">{t('model.editor.key.unsupportedHint')}</p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
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
                            {selected && showOpclass ? (
                              <input
                                data-testid="index-opclass"
                                className="h-5 w-24 shrink-0 rounded-sm border border-input bg-background px-1 font-mono text-[10px]"
                                value={opclasses[column.id] ?? ''}
                                onChange={(event) => setOpclasses((prev) => ({ ...prev, [column.id]: event.target.value }))}
                                placeholder={t('model.editor.key.opclass')}
                                aria-label={`${t('model.editor.key.opclass')} — ${column.physicalName}`}
                                title={t('model.editor.key.opclass')}
                              />
                            ) : null}
                            {selected && orderable ? (
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
                  {orderable ? (
                    <p className="text-xs text-muted-foreground">{t('model.editor.key.orderHint')}</p>
                  ) : null}
                  {showOpclass && !support.opclass ? (
                    <p className="text-xs text-amber-600 dark:text-amber-500">{t('model.editor.key.unsupportedHint')}</p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            )}

            {showWhere ? (
              <label className="grid gap-1 text-sm font-medium">
                {t('model.editor.key.where')}
                <Textarea
                  data-testid="index-where"
                  rows={2}
                  value={where}
                  onChange={(event) => setWhere(event.target.value)}
                  placeholder="deleted_at IS NULL"
                  className="font-mono text-xs font-normal"
                />
                <span className="text-xs font-normal text-muted-foreground">{t('model.editor.key.whereHint')}</span>
                {!support.where ? (
                  <span className="text-xs font-normal text-amber-600 dark:text-amber-500">{t('model.editor.key.unsupportedHint')}</span>
                ) : null}
              </label>
            ) : null}

            {showInclude ? (
              <div className="grid gap-1 text-sm">
                <p className="font-medium">{t('model.editor.key.include')}</p>
                <div data-testid="index-include" className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border p-1">
                  {(table?.columns ?? [])
                    .filter((column) => expressionMode || !columnIds.includes(column.id))
                    .map((column) => (
                      <label key={column.id} className="flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-accent">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary"
                          checked={include.includes(column.id)}
                          onChange={() => toggleInclude(column.id)}
                          aria-label={`${t('model.editor.key.include')} — ${column.physicalName}`}
                        />
                        <span className="min-w-0 flex-1 truncate">{column.physicalName}</span>
                      </label>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('model.editor.key.includeHint')}</p>
                {!support.include ? (
                  <p className="text-xs text-amber-600 dark:text-amber-500">{t('model.editor.key.unsupportedHint')}</p>
                ) : null}
              </div>
            ) : null}

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
