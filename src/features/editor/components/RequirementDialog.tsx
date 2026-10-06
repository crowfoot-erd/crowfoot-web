/**
 * 요구사항 추가·수정 다이얼로그 (05-editor/02-ui.md §17)
 *
 * 항목은 제목, 내용, 도메인(그룹 또는 미분류), 범위(기능·공통), 상태, 연결할 테이블이다.
 * 코드는 자동으로 붙고 고칠 수 없다. 저장할 때 한 번에 커밋한다(되돌리기 1회).
 * 삭제는 잘못 등록한 항목에만 쓴다 — 빠진 요구사항은 상태를 "제외"로 바꾼다.
 * 수용 기준은 한 줄에 하나다. 기준마다 확인 SQL(값 하나를 돌려주는 SELECT)과 기대값을 붙일 수 있다(v1.36) —
 * 문구가 같은 줄은 id·체크·확인 SQL을 이어받는다. SQL을 비우면 확인을 뗀다.
 */
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { newId, type RequirementPatch } from '@/features/editor/model/changes'
import {
  REQUIREMENT_SCOPES,
  REQUIREMENT_STATUSES,
  type ErdArea,
  type ErdCriterionCheck,
  type ErdRequirement,
  type ErdRequirementCriterion,
  type RequirementScope,
  type RequirementStatus,
} from '@/features/editor/model/content-schema'

export interface RequirementDraft {
  title: string
  description: string
  areaId: string | null
  scope: RequirementScope
  status: RequirementStatus
  tableIds: string[]
  /** 수용 기준 — 없으면 키를 두지 않는다 */
  criteria?: ErdRequirementCriterion[]
}

export interface RequirementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 고칠 요구사항 — null이면 새로 만든다 */
  requirement: ErdRequirement | null
  /** 새로 만들 때 미리 골라 둘 도메인 — 도메인 구역의 "추가"에서 열면 그 도메인이다 */
  defaultAreaId?: string | null
  /** 새로 만들 때 붙을 코드 */
  nextCode: string
  areas: readonly ErdArea[]
  tables: ReadonlyArray<{ id: string; physical: string }>
  onCreate: (draft: RequirementDraft) => void
  onPatch: (requirementId: string, patch: RequirementPatch) => void
  onRemove: (requirementId: string) => void
}

/** 수용 기준의 상한 — 항목 수와 한 항목의 길이, 확인 SQL과 기대값의 길이(코어와 같은 값) */
const CRITERIA_LIMIT = 20
const CRITERION_MAX_LENGTH = 200
const CHECK_SQL_MAX_LENGTH = 4000
const CHECK_EXPECT_MAX_LENGTH = 200

/** 수용 기준 입력을 줄로 나눈다 — 목록 표시를 떼고 빈 줄을 버린다 */
function criteriaLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•*·]\s+/, ''))
    .filter((line) => line.length > 0)
}

const EMPTY: RequirementDraft = { title: '', description: '', areaId: null, scope: 'tables', status: 'draft', tableIds: [] }

export function RequirementDialog({
  open,
  onOpenChange,
  requirement,
  defaultAreaId = null,
  nextCode,
  areas,
  tables,
  onCreate,
  onPatch,
  onRemove,
}: RequirementDialogProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<RequirementDraft>(EMPTY)
  /** 수용 기준 — 한 줄에 하나. 저장할 때 항목으로 바꾼다 */
  const [criteriaText, setCriteriaText] = useState('')
  /** 확인 SQL — 기준 문구별. 문구를 고쳤다가 되돌리면 다시 붙는다 */
  const [checks, setChecks] = useState<Record<string, ErdCriterionCheck>>({})
  /** 확인 SQL 편집을 펼친 기준 문구 */
  const [openChecks, setOpenChecks] = useState<ReadonlySet<string>>(() => new Set())
  const [titleError, setTitleError] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  // 열림·대상 전환 때만 초기화한다 — 열려 있는 동안 문서가 바뀌어도 입력을 덮어쓰지 않는다
  const requirementId = requirement?.id ?? null
  useEffect(() => {
    if (!open) return
    setDraft(
      requirement
        ? {
            title: requirement.title,
            description: requirement.description,
            areaId: requirement.areaId,
            scope: requirement.scope,
            status: requirement.status,
            tableIds: requirement.tableIds,
          }
        : { ...EMPTY, areaId: defaultAreaId },
    )
    setCriteriaText((requirement?.criteria ?? []).map((criterion) => criterion.text).join('\n'))
    setChecks(
      Object.fromEntries(
        (requirement?.criteria ?? []).flatMap((criterion) => (criterion.check ? [[criterion.text, criterion.check]] : [])),
      ),
    )
    setOpenChecks(new Set())
    setTitleError(false)
    setConfirmingRemove(false)
  }, [open, requirementId])

  const set = <K extends keyof RequirementDraft>(key: K, value: RequirementDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const lines = criteriaLines(criteriaText)
  /** 저장할 확인 — SQL이 비어 있으면 없다. 기대값을 비우면 "0" */
  const checkOf = (text: string): ErdCriterionCheck | undefined => {
    const check = checks[text]
    const sql = check?.sql.trim() ?? ''
    if (!check || sql.length === 0) return undefined
    return { sql, expect: check.expect.trim() || '0' }
  }
  const criteriaError =
    lines.length > CRITERIA_LIMIT
      ? t('model.requirements.criteria.tooMany', { max: CRITERIA_LIMIT })
      : lines.some((line) => line.length > CRITERION_MAX_LENGTH)
        ? t('model.requirements.criteria.tooLong', { max: CRITERION_MAX_LENGTH })
        : lines.some((line) => (checks[line]?.sql.trim().length ?? 0) > CHECK_SQL_MAX_LENGTH)
          ? t('model.requirements.checks.dialog.sqlTooLong', { max: CHECK_SQL_MAX_LENGTH })
          : null
  const setCheck = (text: string, patch: Partial<ErdCriterionCheck>) =>
    setChecks((prev) => ({ ...prev, [text]: { ...(prev[text] ?? { sql: '', expect: '0' }), ...patch } }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const title = draft.title.trim()
    if (title.length === 0) {
      setTitleError(true)
      return
    }
    // 공통 요구사항은 테이블에 연결하지 않고 도메인도 없다
    const next: RequirementDraft = {
      ...draft,
      title,
      description: draft.description.trim(),
      areaId: draft.scope === 'document' ? null : draft.areaId,
      tableIds: draft.scope === 'document' ? [] : draft.tableIds,
    }
    if (criteriaError) return
    // 수용 기준 — 같은 문구의 항목은 id와 체크를 이어받는다. 확인 SQL은 지금 입력을 따른다(비우면 뗀다)
    const previous = requirement?.criteria ?? []
    const criteria: ErdRequirementCriterion[] = lines.map((text) => {
      const kept = previous.find((criterion) => criterion.text === text)
      const base: ErdRequirementCriterion = { id: kept?.id ?? newId(), text, done: kept?.done ?? false }
      const check = checkOf(text)
      return check ? { ...base, check } : base
    })
    if (!requirement) {
      onCreate(criteria.length > 0 ? { ...next, criteria } : next)
    } else {
      const patch: RequirementPatch = {}
      if (next.title !== requirement.title) patch.title = next.title
      if (next.description !== requirement.description) patch.description = next.description
      if (next.areaId !== requirement.areaId) patch.areaId = next.areaId
      if (next.scope !== requirement.scope) patch.scope = next.scope
      if (next.status !== requirement.status) patch.status = next.status
      if (next.tableIds.join('\0') !== requirement.tableIds.join('\0')) patch.tableIds = next.tableIds
      if (JSON.stringify(criteria) !== JSON.stringify(previous)) patch.criteria = criteria
      if (Object.keys(patch).length > 0) onPatch(requirement.id, patch)
    }
    onOpenChange(false)
  }

  const areaExists = draft.areaId !== null && areas.some((area) => area.id === draft.areaId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg" data-testid="requirement-dialog">
        <DialogHeader>
          <DialogTitle>
            {requirement ? t('model.requirements.dialog.editTitle') : t('model.requirements.dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{requirement?.code ?? nextCode}</span>
            {requirement ? ` · ${t('model.requirements.revision', { revision: requirement.revision })}` : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="requirement-title">{t('model.requirements.dialog.title')}</Label>
            <Input
              id="requirement-title"
              value={draft.title}
              maxLength={200}
              aria-invalid={titleError}
              onChange={(event) => {
                set('title', event.target.value)
                setTitleError(false)
              }}
            />
            {titleError ? (
              <p className="text-xs text-destructive">{t('model.requirements.dialog.titleRequired')}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="requirement-description">{t('model.requirements.dialog.description')}</Label>
            <Textarea
              id="requirement-description"
              rows={4}
              value={draft.description}
              maxLength={4000}
              onChange={(event) => set('description', event.target.value)}
            />
            {requirement ? (
              <p className="text-[11px] text-muted-foreground">{t('model.requirements.dialog.revisionHint')}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="requirement-criteria">{t('model.requirements.criteria.title')}</Label>
            <Textarea
              id="requirement-criteria"
              rows={3}
              value={criteriaText}
              onChange={(event) => setCriteriaText(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">{t('model.requirements.criteria.hint')}</p>
            {lines.length > 0 ? (
              <div className="grid gap-1 rounded-md border p-2" data-testid="requirement-criterion-checks">
                <p className="text-xs font-medium">{t('model.requirements.checks.dialog.title')}</p>
                <p className="text-[11px] text-muted-foreground">{t('model.requirements.checks.dialog.hint')}</p>
                <ul className="grid gap-1">
                  {lines.map((line, index) => {
                    const expanded = openChecks.has(line)
                    const check = checks[line]
                    const has = (check?.sql.trim().length ?? 0) > 0
                    return (
                      <li key={`${index}:${line}`} data-testid="requirement-criterion-check" className="grid gap-1">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          data-testid="requirement-criterion-check-toggle"
                          onClick={() =>
                            setOpenChecks((prev) => {
                              const next = new Set(prev)
                              if (next.has(line)) next.delete(line)
                              else next.add(line)
                              return next
                            })
                          }
                          className="flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs hover:bg-accent/60"
                        >
                          {expanded ? (
                            <ChevronDown aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{line}</span>
                          {has ? (
                            <span className="flex shrink-0 items-center gap-1 text-[11px] text-sky-700 dark:text-sky-400">
                              <Database aria-hidden className="size-3" />
                              {t('model.requirements.checks.dialog.has')}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[11px] text-muted-foreground">{t('model.requirements.checks.dialog.toggle')}</span>
                          )}
                        </button>
                        {expanded ? (
                          <div className="grid gap-1.5 pb-1 pl-5">
                            <Textarea
                              aria-label={`${t('model.requirements.checks.dialog.sql')} — ${line}`}
                              data-testid="requirement-criterion-sql"
                              rows={3}
                              spellCheck={false}
                              className="font-mono text-xs"
                              placeholder={t('model.requirements.checks.dialog.sqlPlaceholder')}
                              value={check?.sql ?? ''}
                              maxLength={CHECK_SQL_MAX_LENGTH}
                              onChange={(event) => setCheck(line, { sql: event.target.value })}
                            />
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              {t('model.requirements.checks.dialog.expect')}
                              <Input
                                data-testid="requirement-criterion-expect"
                                className="h-7 w-28 font-mono text-xs"
                                value={check?.expect ?? '0'}
                                maxLength={CHECK_EXPECT_MAX_LENGTH}
                                onChange={(event) => setCheck(line, { expect: event.target.value })}
                              />
                            </label>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            {criteriaError ? (
              <p className="text-xs text-destructive" data-testid="requirement-criteria-error">
                {criteriaError}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Choice
              label={t('model.requirements.dialog.scope')}
              options={REQUIREMENT_SCOPES.map((scope) => ({ value: scope, label: t(`model.requirements.scope.${scope}`) }))}
              value={draft.scope}
              onChange={(scope) => set('scope', scope)}
              testId="requirement-scope"
            />
            <Choice
              label={t('model.requirements.dialog.status')}
              options={REQUIREMENT_STATUSES.map((status) => ({ value: status, label: t(`model.requirements.status.${status}`) }))}
              value={draft.status}
              onChange={(status) => set('status', status)}
              testId="requirement-status"
            />
          </div>

          {draft.scope === 'tables' ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="requirement-area">{t('model.requirements.dialog.area')}</Label>
                <select
                  id="requirement-area"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={areaExists ? (draft.areaId ?? '') : ''}
                  onChange={(event) => set('areaId', event.target.value === '' ? null : event.target.value)}
                >
                  <option value="">{t('model.requirements.group.unassigned')}</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t('model.requirements.dialog.tables')}</Label>
                <div
                  className="max-h-44 overflow-y-auto rounded-md border p-1"
                  role="group"
                  aria-label={t('model.requirements.dialog.tables')}
                >
                  {tables.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">{t('model.editor.areaDialog.noTables')}</p>
                  ) : (
                    tables.map((table) => (
                      <label
                        key={table.id}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={draft.tableIds.includes(table.id)}
                          onCheckedChange={(value) =>
                            set(
                              'tableIds',
                              value === true
                                ? [...draft.tableIds, table.id]
                                : draft.tableIds.filter((id) => id !== table.id),
                            )
                          }
                        />
                        <span className="min-w-0 truncate">{table.physical}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t('model.requirements.dialog.documentHint')}</p>
          )}

          <DialogFooter className="sm:justify-between">
            {requirement ? (
              confirmingRemove ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t('model.requirements.removeConfirm')}</span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    data-testid="requirement-remove-confirm"
                    onClick={() => {
                      onRemove(requirement.id)
                      onOpenChange(false)
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmingRemove(true)}>
                  {t('common.delete')}
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('common.save')}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 몇 개 안 되는 선택지 — 버튼 묶음으로 고른다 */
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  testId: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex rounded-md border p-0.5" role="group" aria-label={label} data-testid={testId}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-7 flex-1 rounded-sm px-2 text-xs font-medium',
              value === option.value ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-accent/60',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
