/**
 * 도메인 타입 패널 (05-editor/02-ui.md §16, 서버 계약 08-core/16-domain-type.md)
 *
 * 워크스페이스의 도메인 타입을 보고 만들고 고치고 지운다. 그 워크스페이스의 모든 문서가 함께 쓴다.
 * - 목록은 멤버 전체가 본다. 쓰기는 Editor 이상이다
 * - 고치고 나면, 이 문서에 그 도메인 타입을 쓰는 컬럼이 있을 때 전파 미리보기를 바로 띄운다
 * - "쓰는 컬럼 수"는 지금 연 문서 기준이다. 다른 문서에서 쓰는지는 서버가 알지 못한다
 */
import { useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { isApiError } from '@/api/client'
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

export interface DomainTypesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  canEdit: boolean
  /** 문서 대상 DBMS 템플릿 — 타입을 물리 표기로 보여 준다(값은 공용 논리 코드) */
  dbmsId: string
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

export function DomainTypesDialog({ open, onOpenChange, workspaceId, canEdit, dbmsId }: DomainTypesDialogProps) {
  const { t } = useTranslation()
  const domainTypes = useDomainTypes(open ? workspaceId : null)
  const create = useCreateDomainType(workspaceId)
  const update = useUpdateDomainType(workspaceId)
  const remove = useDeleteDomainType(workspaceId)
  const present = useEditorStore((s) => s.present)
  const usage = useMemo(() => domainUsage(present), [present])

  /** 편집 중인 대상 — 'new'는 만들기, null은 목록 */
  const [editing, setEditing] = useState<DomainType | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<DomainType | null>(null)
  const [propagation, setPropagation] = useState<StaleColumn[] | null>(null)

  const items = domainTypes.data?.items ?? []
  const spec = dataTypeSpec(form.dataType)
  const saving = create.isPending || update.isPending

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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('model.editor.domainType.title')}</DialogTitle>
            <DialogDescription>{t('model.editor.domainType.description')}</DialogDescription>
          </DialogHeader>

          {editing ? (
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
                <Input
                  value={form.name}
                  maxLength={50}
                  autoFocus
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
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
          ) : (
            <div className="grid gap-3">
              {canEdit ? (
                <div>
                  <Button type="button" size="sm" onClick={() => startEdit('new')}>
                    <Plus aria-hidden />
                    {t('model.editor.domainType.add')}
                  </Button>
                </div>
              ) : null}
              {domainTypes.isPending ? (
                <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  {t('common.loading')}
                </p>
              ) : domainTypes.isError ? (
                <p role="alert" className="py-4 text-sm text-destructive">
                  {errorMessage(domainTypes.error)}
                </p>
              ) : items.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('model.editor.domainType.empty')}</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-1.5 pr-2 font-medium">{t('model.editor.domainType.field.name')}</th>
                      <th scope="col" className="py-1.5 pr-2 font-medium">{t('model.editor.domainType.field.dataType')}</th>
                      <th scope="col" className="py-1.5 pr-2 font-medium">{t('model.editor.domainType.field.nullable')}</th>
                      <th scope="col" className="py-1.5 pr-2 font-medium">{t('model.editor.domainType.field.defaultValue')}</th>
                      <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t('model.editor.domainType.usage')}</th>
                      <th scope="col" className="w-16 py-1.5">
                        <span className="sr-only">{t('model.editor.domainType.actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((domainType) => (
                      <tr key={domainType.domainTypeId} className="border-b last:border-b-0">
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">{domainType.name}</span>
                          {domainType.description ? (
                            <span className="block text-xs text-muted-foreground">{domainType.description}</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-xs">{typeLabel(domainType, dbmsId)}</td>
                        <td className="py-1.5 pr-2 text-xs">
                          {domainType.nullable ? t('model.editor.domainType.value.yes') : t('model.editor.domainType.value.no')}
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-xs">{domainType.defaultValue ?? ''}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{usage.get(domainType.domainTypeId) ?? 0}</td>
                        <td className="py-1.5 text-right">
                          {canEdit ? (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(domainType)}
                                aria-label={t('model.editor.domainType.edit', { name: domainType.name })}
                                title={t('model.editor.domainType.edit', { name: domainType.name })}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Pencil aria-hidden className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleting(domainType)}
                                aria-label={t('model.editor.domainType.delete', { name: domainType.name })}
                                title={t('model.editor.domainType.delete', { name: domainType.name })}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                              >
                                <Trash2 aria-hidden className="size-3.5" />
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-xs text-muted-foreground">{t('model.editor.domainType.usageNote')}</p>
            </div>
          )}
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
