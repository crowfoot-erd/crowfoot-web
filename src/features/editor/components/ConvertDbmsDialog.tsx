/**
 * 다른 DBMS로 복제 다이얼로그 (05-editor/04-dbms-engineering.md §3.5)
 *
 * 문서의 대상 DBMS는 만든 뒤 바꿀 수 없다. 이 다이얼로그는 대상 DBMS만 다른 새 문서를 만든다 — 원본은 그대로다.
 * - 대상: 활성 database_types 중 현재 문서와 다르고 에디터 타입 템플릿이 있는 것
 * - 내용: 다이얼로그를 연 시점의 편집 상태(저장하지 않은 편집 포함)
 * - 미리보기: 변환 검사 결과(표기가 바뀌는 타입·공용 타입으로 정리되는 컬럼·맞지 않는 타입·추가되는 FK 인덱스)
 * - 생성: 문서 생성(메타 POST) → 본체 저장(content PUT) 2단계 — .crown 가져오기와 같다
 */
import { useMemo, useState } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DbmsIcon } from '@/components/dbms-icon'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { saveModelContent } from '@/features/editor/api'
import { serializeContent } from '@/features/editor/model/content-io'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { convertDocumentDbms, hasDbmsTemplate } from '@/features/editor/model/dbms-convert'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { modelEditorPath } from '@/features/models/api'
import { useCreateModel, useDatabaseTypes } from '@/features/models/hooks'
import { errorMessage } from '@/lib/result-code'

/** 문서 이름 길이 상한 — 08-core/02-model.md §1.2 */
const NAME_MAX = 100

export interface ConvertDbmsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  modelName: string
  modelDescription: string | null
  /** 원본 문서의 database_types 코드 */
  databaseType: string
}

export function ConvertDbmsDialog({ open, onOpenChange, ...rest }: ConvertDbmsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 본문은 열릴 때마다 새로 마운트한다 — 그 시점의 편집 상태를 스냅샷으로 잡는다 */}
      {open ? <ConvertDbmsDialogBody onClose={() => onOpenChange(false)} {...rest} /> : null}
    </Dialog>
  )
}

function ConvertDbmsDialogBody({
  onClose,
  workspaceId,
  modelName,
  modelDescription,
  databaseType,
}: Omit<ConvertDbmsDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const { t } = useTranslation()
  const databaseTypes = useDatabaseTypes()
  const createModel = useCreateModel(workspaceId)
  const [snapshot] = useState<EditorDocument>(() => useEditorStore.getState().present)
  const [target, setTarget] = useState('')
  // 이름을 직접 고치기 전까지는 대상 DBMS를 따라 기본 이름을 보여 준다
  const [editedName, setEditedName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const source = databaseType.trim().toLowerCase()
  const targets = useMemo(
    () =>
      (databaseTypes.data?.items ?? []).filter(
        (type) => type.code.trim().toLowerCase() !== source && hasDbmsTemplate(type.code),
      ),
    [databaseTypes.data, source],
  )
  // 아직 고르지 않았으면 첫 후보를 대상으로 삼는다
  const effectiveTarget = target || targets[0]?.code || ''
  const targetLabel = targets.find((type) => type.code === effectiveTarget)?.displayName ?? effectiveTarget
  const defaultName = effectiveTarget
    ? t('model.editor.dbmsConvert.defaultName', { name: modelName, dbms: targetLabel }).slice(0, NAME_MAX)
    : ''
  const name = editedName ?? defaultName

  const result = useMemo(
    () => (effectiveTarget ? convertDocumentDbms(snapshot, databaseType, effectiveTarget) : null),
    [snapshot, databaseType, effectiveTarget],
  )
  const report = result?.report
  const reportEmpty =
    !!report &&
    report.typeChanges.length === 0 &&
    report.normalized.length === 0 &&
    report.unsupported.length === 0 &&
    report.addedIndexes.length === 0 &&
    report.unsupportedIndexes.length === 0

  const handleSubmit = async () => {
    if (!result || !effectiveTarget) return
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setNameError(t('model.editor.dbmsConvert.nameRequired'))
      return
    }
    if (trimmed.length > NAME_MAX) {
      setNameError(t('model.editor.dbmsConvert.nameTooLong'))
      return
    }
    setNameError(null)
    setBusy(true)
    try {
      const created = await createModel.mutateAsync({
        name: trimmed,
        description: modelDescription ?? undefined,
        databaseType: effectiveTarget,
      })
      if (!created) throw new Error('no created model response')
      // 생성 응답의 version을 기준으로 본체를 저장한다(신규 생성이므로 충돌 여지 없음)
      await saveModelContent(workspaceId, created.modelId, {
        baseVersion: created.version,
        content: serializeContent({
          schemaVersion: 1,
          model: result.document.model,
          diagram: result.document.diagram,
        }),
      })
      toast.success(t('model.editor.dbmsConvert.successToast', { name: trimmed }))
      onClose()
      window.open(modelEditorPath(workspaceId, created.modelId), '_blank', 'noopener,noreferrer')
    } catch (error) {
      // 이름 중복(409 DUPLICATED_NAME) 등은 이름 칸 아래에 보여 준다 — 다이얼로그를 닫지 않는다
      setNameError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('model.editor.dbmsConvert.title')}</DialogTitle>
        <DialogDescription>{t('model.editor.dbmsConvert.notice')}</DialogDescription>
      </DialogHeader>

      {databaseTypes.isPending ? (
        <p className="text-sm text-muted-foreground">
          <Loader2 aria-hidden className="mr-1 inline size-4 animate-spin" />
        </p>
      ) : targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('model.editor.dbmsConvert.noTarget')}</p>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="dbms-convert-target">{t('model.editor.dbmsConvert.target')}</Label>
            <Select value={effectiveTarget} onValueChange={setTarget} disabled={busy}>
              <SelectTrigger id="dbms-convert-target" className="w-full">
                <SelectValue placeholder={t('model.editor.dbmsConvert.targetPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {targets.map((type) => (
                  <SelectItem key={type.code} value={type.code}>
                    <span className="flex items-center gap-1.5">
                      <DbmsIcon databaseType={type.code} className="size-3.5" />
                      {type.displayName}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="dbms-convert-name">{t('model.editor.dbmsConvert.name')}</Label>
            <Input
              id="dbms-convert-name"
              value={name}
              maxLength={NAME_MAX}
              disabled={busy}
              aria-invalid={nameError ? true : undefined}
              onChange={(event) => {
                setEditedName(event.target.value)
                setNameError(null)
              }}
            />
            {nameError ? (
              <p role="alert" className="text-sm text-destructive">
                {nameError}
              </p>
            ) : null}
          </div>

          {report ? (
            <section aria-label={t('model.editor.dbmsConvert.report.title')} className="grid gap-3 rounded-md border p-3 text-sm">
              <h3 className="font-medium">{t('model.editor.dbmsConvert.report.title')}</h3>
              {reportEmpty ? (
                <p className="text-muted-foreground">{t('model.editor.dbmsConvert.report.clean')}</p>
              ) : null}

              {report.unsupported.length > 0 ? (
                <div className="grid gap-1" data-testid="dbms-convert-unsupported">
                  <p className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-500">
                    <TriangleAlert aria-hidden className="size-4" />
                    {t('model.editor.dbmsConvert.report.unsupported', { count: report.unsupported.length })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('model.editor.dbmsConvert.report.unsupportedHint')}</p>
                  <ul className="list-disc pl-5">
                    {report.unsupported.map((item) => (
                      <li key={`${item.tableName}.${item.columnName}`}>
                        <code>{`${item.tableName}.${item.columnName}`}</code> — <code>{item.dataType}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {report.unsupportedIndexes.length > 0 ? (
                <div className="grid gap-1" data-testid="dbms-convert-unsupported-indexes">
                  <p className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-500">
                    <TriangleAlert aria-hidden className="size-4" />
                    {t('model.editor.dbmsConvert.report.unsupportedIndexes', { count: report.unsupportedIndexes.length })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('model.editor.dbmsConvert.report.unsupportedIndexesHint')}</p>
                  <ul className="list-disc pl-5">
                    {report.unsupportedIndexes.map((item) => (
                      <li key={`${item.tableName}.${item.indexName}`}>
                        <code>{`${item.tableName}.${item.indexName}`}</code> — {item.features.join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {report.typeChanges.length > 0 ? (
                <div className="grid gap-1" data-testid="dbms-convert-type-changes">
                  <p className="font-medium">{t('model.editor.dbmsConvert.report.typeChanges')}</p>
                  <ul className="list-disc pl-5">
                    {report.typeChanges.map((item) => (
                      <li key={item.code}>
                        <code>{item.fromType}</code> → <code>{item.toType}</code>
                        <span className="text-muted-foreground">
                          {' · '}
                          {t('model.editor.dbmsConvert.report.columnCount', { count: item.columnCount })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {report.normalized.length > 0 ? (
                <div className="grid gap-1" data-testid="dbms-convert-normalized">
                  <p className="font-medium">{t('model.editor.dbmsConvert.report.normalized')}</p>
                  <ul className="list-disc pl-5">
                    {report.normalized.map((item) => (
                      <li key={`${item.tableName}.${item.columnName}`}>
                        <code>{`${item.tableName}.${item.columnName}`}</code> — <code>{item.from}</code> →{' '}
                        <code>{item.to}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {report.addedIndexes.length > 0 ? (
                <div className="grid gap-1" data-testid="dbms-convert-added-indexes">
                  <p className="font-medium">{t('model.editor.dbmsConvert.report.addedIndexes')}</p>
                  <ul className="list-disc pl-5">
                    {report.addedIndexes.map((item) => (
                      <li key={`${item.tableName}.${item.indexName}`}>
                        <code>{item.tableName}</code> — <code>{item.indexName}</code>
                        <span className="text-muted-foreground">{` (${item.columnNames.join(', ')})`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t('model.editor.dbmsConvert.cancel')}
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={busy || !result}>
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {t('model.editor.dbmsConvert.submit')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
