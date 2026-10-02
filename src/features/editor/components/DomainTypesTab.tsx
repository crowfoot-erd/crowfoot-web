/**
 * 도메인 타입 탭 — 용어 사전 패널의 세 번째 탭 (05-editor/02-ui.md §14·§16, 서버 계약 08-core/16-domain-type.md)
 *
 * 워크스페이스의 도메인 타입을 보고 만들고 고치고 지운다. 그 워크스페이스의 모든 문서가 함께 쓴다.
 * - 목록은 멤버 전체가 본다. 쓰기는 Editor 이상이다
 * - 고치고 나면, 이 문서에 그 도메인 타입을 쓰는 컬럼이 있을 때 전파 미리보기를 바로 띄운다
 * - "컬럼 N"은 지금 연 문서 기준이다. 다른 문서에서 쓰는지는 서버가 알지 못한다
 * - "용어 N"은 이 도메인 타입을 가리키는 사전 용어 수다. 누르면 워크스페이스 사전 탭에서 그 용어만 본다(§4.6)
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { isApiError } from '@/api/client'
import type { WorkspaceTerm } from '@/api/types'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { DomainType, DomainTypeInput } from '@/features/domain-types/api'
import {
  useCreateDomainType,
  useDeleteDomainType,
  useDomainTypes,
  useUpdateDomainType,
} from '@/features/domain-types/hooks'
import { DomainPropagationDialog } from '@/features/editor/components/DomainPropagationDialog'
import { DATA_TYPES, dataTypeSpec, physicalType } from '@/features/editor/model/dbms'
import { domainUsage, findStaleColumns, type StaleColumn } from '@/features/editor/model/domain-type'
import { typeLabel } from '@/features/editor/model/domain-type-format'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { errorMessage } from '@/lib/result-code'
import { cn } from 'cn'

export interface DomainTypesTabProps {
  workspaceId: string
  canEdit: boolean
  /** 문서 대상 DBMS 템플릿 — 타입을 물리 표기로 보여 준다(값은 공용 논리 코드) */
  dbmsId: string
  /** 워크스페이스 사전의 용어 — 도메인 타입마다 그것을 가리키는 용어 수를 센다 */
  terms: readonly WorkspaceTerm[]
  /** 강조할 도메인 타입 — 용어 행에서 넘어왔을 때 */
  focusId: string | null
  /** "용어 N"을 눌렀다 — 워크스페이스 사전 탭에서 그 용어만 보여 준다 */
  onShowTerms: (domainTypeId: string) => void
}

interface FormState {
  name: string
  dataType: string
  length: string
  precision: string
  scale: string
  nullable: boolean
  defaultValue: string
  description: string
}

const EMPTY_FORM: FormState = {
  name: '',
  dataType: 'VARCHAR',
  length: '',
  precision: '',
  scale: '',
  nullable: true,
  defaultValue: '',
  description: '',
}

const toForm = (domainType: DomainType): FormState => ({
  name: domainType.name,
  dataType: domainType.dataType,
  length: domainType.length?.toString() ?? '',
  precision: domainType.precision?.toString() ?? '',
  scale: domainType.scale?.toString() ?? '',
  nullable: domainType.nullable,
  defaultValue: domainType.defaultValue ?? '',
  description: domainType.description ?? '',
})

const toNumber = (raw: string): number | null => {
  if (raw.trim() === '') return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/** 폼 → 요청 — 타입이 받지 않는 길이·정밀도는 비운다 */
function toInput(form: FormState): DomainTypeInput {
  const spec = dataTypeSpec(form.dataType)
  return {
    name: form.name.trim(),
    dataType: form.dataType,
    length: spec?.length ? toNumber(form.length) : null,
    precision: spec?.precision ? toNumber(form.precision) : null,
    scale: spec?.precision ? toNumber(form.scale) : null,
    nullable: form.nullable,
    defaultValue: form.defaultValue.trim() === '' ? null : form.defaultValue.trim(),
    description: form.description.trim() === '' ? null : form.description.trim(),
  }
}

export function DomainTypesTab({ workspaceId, canEdit, dbmsId, terms, focusId, onShowTerms }: DomainTypesTabProps) {
  const { t } = useTranslation()
  const domainTypes = useDomainTypes(workspaceId)
  const create = useCreateDomainType(workspaceId)
  const update = useUpdateDomainType(workspaceId)
  const remove = useDeleteDomainType(workspaceId)
  const present = useEditorStore((s) => s.present)
  const usage = useMemo(() => domainUsage(present), [present])
  const termCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const term of terms) {
      if (term.domainTypeId) counts.set(term.domainTypeId, (counts.get(term.domainTypeId) ?? 0) + 1)
    }
    return counts
  }, [terms])

  /** 편집 중인 대상 — 'new'는 만들기, null은 닫힘 */
  const [editing, setEditing] = useState<DomainType | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<DomainType | null>(null)
  const [propagation, setPropagation] = useState<StaleColumn[] | null>(null)

  const items = domainTypes.data?.items ?? []
  const spec = dataTypeSpec(form.dataType)
  const saving = create.isPending || update.isPending

  // 용어 행에서 넘어온 도메인 타입 — 보이는 자리로 옮긴다
  const focusRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (focusId) focusRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [focusId, items.length])

  const startEdit = (target: DomainType | 'new') => {
    setEditing(target)
    setForm(target === 'new' ? EMPTY_FORM : toForm(target))
    setFormError(null)
  }

  const save = () => {
    const input = toInput(form)
    if (input.name === '') {
      setFormError(t('model.editor.domainType.nameRequired'))
      return
    }
    const onError = (error: unknown) => {
      // 그 사이 다른 사람이 고쳤다 — 목록은 훅이 다시 읽는다. 폼을 닫고 알린다
      if (isApiError(error) && error.resultCode === 'VERSION_CONFLICT') {
        setEditing(null)
        toast.error(t('model.editor.domainType.conflict'))
        return
      }
      setFormError(errorMessage(error))
    }
    if (editing === 'new') {
      create.mutate(input, {
        onSuccess: () => {
          setEditing(null)
          toast.success(t('model.editor.domainType.created', { name: input.name }))
        },
        onError,
      })
      return
    }
    if (!editing) return
    update.mutate(
      { domainTypeId: editing.domainTypeId, input, baseVersion: editing.version },
      {
        onSuccess: (saved) => {
          setEditing(null)
          if (!saved) return
          toast.success(t('model.editor.domainType.updated', { name: saved.name }))
          // 이 문서에 그 도메인 타입을 쓰는 컬럼이 있으면 전파 미리보기를 바로 띄운다
          const stale = canEdit ? findStaleColumns(useEditorStore.getState().present, [saved]) : []
          if (stale.length > 0) setPropagation(stale)
        },
        onError,
      },
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{t('model.editor.domainType.tabHint')}</p>
        {canEdit ? (
          <Button type="button" size="sm" className="h-8 shrink-0 px-2" onClick={() => startEdit('new')}>
            <Plus aria-hidden className="size-3.5" />
            {t('model.editor.domainType.add')}
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 text-sm" data-testid="domain-type-list">
        {domainTypes.isPending ? (
          <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : domainTypes.isError ? (
          <p role="alert" className="px-3 py-4 text-center text-xs text-destructive">
            {errorMessage(domainTypes.error)}
          </p>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('model.editor.domainType.empty')}</p>
        ) : (
          items.map((domainType) => {
            const columns = usage.get(domainType.domainTypeId) ?? 0
            const linkedTerms = termCount.get(domainType.domainTypeId) ?? 0
            const focused = focusId === domainType.domainTypeId
            return (
              <div
                key={domainType.domainTypeId}
                ref={focused ? focusRef : undefined}
                data-testid={`domain-type-row-${domainType.name}`}
                data-focused={focused ? 'true' : undefined}
                className={cn('group grid gap-0.5 rounded-sm px-2 py-1.5', focused && 'bg-violet-500/10 ring-1 ring-violet-500/40')}
              >
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate font-medium">{domainType.name}</span>
                  <code className="shrink-0 font-mono text-[10px] text-muted-foreground">{typeLabel(domainType, dbmsId)}</code>
                  {canEdit ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={t('model.editor.domainType.edit', { name: domainType.name })}
                        title={t('model.editor.domainType.edit', { name: domainType.name })}
                        onClick={() => startEdit(domainType)}
                      >
                        <Pencil aria-hidden className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={t('model.editor.domainType.delete', { name: domainType.name })}
                        title={t('model.editor.domainType.delete', { name: domainType.name })}
                        onClick={() => setDeleting(domainType)}
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                      </Button>
                    </>
                  ) : null}
                </div>
                {domainType.description ? (
                  <p className="truncate text-xs text-muted-foreground">{domainType.description}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                  <span>{domainType.nullable ? t('model.editor.domainType.nullableYes') : t('model.editor.domainType.nullableNo')}</span>
                  {domainType.defaultValue ? (
                    <span>
                      {t('model.editor.domainType.field.defaultValue')} <code className="font-mono">{domainType.defaultValue}</code>
                    </span>
                  ) : null}
                  <span>{t('model.editor.domainType.columnCount', { count: columns })}</span>
                  {linkedTerms > 0 ? (
                    <button
                      type="button"
                      className="rounded-sm text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                      onClick={() => onShowTerms(domainType.domainTypeId)}
                    >
                      {t('model.editor.domainType.termCount', { count: linkedTerms })}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t('model.editor.domainType.usageNote')}</p>

      <Dialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && !saving) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' ? t('model.editor.domainType.addTitle') : t('model.editor.domainType.editTitle')}
            </DialogTitle>
            <DialogDescription>{t('model.editor.domainType.description')}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
            noValidate
          >
            <label className="grid gap-1 text-sm">
              {t('model.editor.domainType.field.name')}
              <Input value={form.name} maxLength={50} autoFocus onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1 text-sm">
                {t('model.editor.domainType.field.dataType')}
                <select
                  value={form.dataType}
                  onChange={(event) => setForm({ ...form, dataType: event.target.value, length: '', precision: '', scale: '' })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {DATA_TYPES.map((type) => (
                    <option key={type.code} value={type.code}>
                      {physicalType(type.code, dbmsId)}
                    </option>
                  ))}
                </select>
              </label>
              {spec?.length ? (
                <label className="grid gap-1 text-sm">
                  {t('model.editor.domainType.field.length')}
                  <Input type="number" inputMode="numeric" value={form.length} onChange={(event) => setForm({ ...form, length: event.target.value })} />
                </label>
              ) : null}
              {spec?.precision ? (
                <>
                  <label className="grid gap-1 text-sm">
                    {t('model.editor.domainType.field.precision')}
                    <Input type="number" inputMode="numeric" value={form.precision} onChange={(event) => setForm({ ...form, precision: event.target.value })} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    {t('model.editor.domainType.field.scale')}
                    <Input type="number" inputMode="numeric" value={form.scale} onChange={(event) => setForm({ ...form, scale: event.target.value })} />
                  </label>
                </>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.nullable} onChange={(event) => setForm({ ...form, nullable: event.target.checked })} />
              {t('model.editor.domainType.field.nullable')}
            </label>
            <label className="grid gap-1 text-sm">
              {t('model.editor.domainType.field.defaultValue')}
              <Input value={form.defaultValue} maxLength={255} onChange={(event) => setForm({ ...form, defaultValue: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              {t('model.editor.domainType.field.description')}
              <Input value={form.description} maxLength={500} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title={t('model.editor.domainType.deleteConfirm.title', { name: deleting?.name ?? '' })}
        description={t('model.editor.domainType.deleteConfirm.description', {
          count: deleting ? (usage.get(deleting.domainTypeId) ?? 0) : 0,
        })}
        confirmLabel={t('common.delete')}
        destructive
        confirming={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.domainTypeId, {
            onSuccess: () => {
              toast.success(t('model.editor.domainType.deleted', { name: deleting.name }))
              setDeleting(null)
            },
            onError: (error) => {
              toast.error(errorMessage(error))
              setDeleting(null)
            },
          })
        }}
      />

      <DomainPropagationDialog
        open={propagation !== null}
        onOpenChange={(next) => {
          if (!next) setPropagation(null)
        }}
        stale={propagation ?? []}
        dbmsId={dbmsId}
      />
    </>
  )
}
