/**
 * 반영 대기 요구사항의 "바뀐 내용 보기" (05-editor/02-ui.md §21.1, 08-core/17-model-edit.md §2.4)
 *
 * 마지막으로 반영한 내용(이전)과 지금 내용을 나란히 비교한다. 원천은 저장된 문서의 개요다 —
 * 저장하지 않은 편집은 저장한 뒤에 보인다.
 * - 제목: 바뀌었으면 이전 → 지금
 * - 내용: 줄 단위 비교. 더한 줄 +(초록), 지운 줄 −(빨강), 같은 줄은 그대로
 * - 수용 기준·연결된 테이블: 더한 것과 뺀 것
 * - 새 요구사항(반영한 적 없음)은 "새 요구사항", 이전 버전이 정리돼 없으면 그렇다고 알린다
 */
import { useTranslation } from 'react-i18next'

import { cn } from 'cn'
import type { RequirementChanges } from '@/features/editor/api'
import { diffItems, diffLines } from '@/features/editor/model/requirement-diff'

export function RequirementChangesView({
  changes,
  loading,
  failed,
  dirty,
}: {
  changes: RequirementChanges | undefined
  loading: boolean
  failed: boolean
  /** 저장하지 않은 편집이 있다 — 저장된 문서 기준이라고 알린다 */
  dirty: boolean
}) {
  const { t } = useTranslation()

  const hint = dirty ? (
    <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="requirement-changes-unsaved">
      {t('model.requirements.changes.savedOnly')}
    </p>
  ) : null

  if (loading) {
    return (
      <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground" data-testid="requirement-changes">
        {t('model.requirements.changes.loading')}
      </div>
    )
  }
  if (failed || !changes) {
    return (
      <div className="grid gap-1 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground" data-testid="requirement-changes">
        {failed ? t('model.requirements.changes.failed') : t('model.requirements.changes.notSaved')}
        {hint}
      </div>
    )
  }

  const { before, after } = changes
  return (
    <div className="grid gap-2 rounded-md border bg-muted/20 p-2 text-xs" data-testid="requirement-changes">
      <p className="text-muted-foreground">
        {t('model.requirements.changes.revision', { from: changes.appliedRevision, to: changes.revision })}
      </p>
      {hint}
      {changes.isNew ? (
        <p className="font-medium" data-testid="requirement-changes-new">
          {t('model.requirements.changes.isNew')}
          <span className="ml-1 font-normal text-muted-foreground">{t('model.requirements.changes.isNewHint')}</span>
        </p>
      ) : !changes.beforeKnown || !before ? (
        <p className="text-muted-foreground" data-testid="requirement-changes-unknown">
          {t('model.requirements.changes.unknown')}
        </p>
      ) : (
        <>
          {before.title !== after.title ? (
            <Field label={t('model.requirements.changes.title')} testId="requirement-changes-title">
              <span className="line-through text-red-700 dark:text-red-400">{before.title}</span>
              <span aria-hidden className="mx-1 text-muted-foreground">→</span>
              <span className="text-emerald-700 dark:text-emerald-400">{after.title}</span>
            </Field>
          ) : null}
          {before.status !== after.status ? (
            <Field label={t('model.requirements.changes.status')} testId="requirement-changes-status">
              {statusLabel(t, before.status)} → {statusLabel(t, after.status)}
            </Field>
          ) : null}
          {before.description !== after.description ? (
            <Field label={t('model.requirements.changes.description')} testId="requirement-changes-description">
              <ul className="grid gap-0.5 font-mono">
                {diffLines(before.description, after.description).map((line, index) => (
                  <li
                    key={index}
                    data-kind={line.kind}
                    className={cn(
                      'whitespace-pre-wrap break-words rounded px-1',
                      line.kind === 'add' && 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
                      line.kind === 'remove' && 'bg-red-500/10 text-red-800 line-through dark:text-red-300',
                      line.kind === 'same' && 'text-muted-foreground',
                    )}
                  >
                    <span aria-hidden className="mr-1 inline-block w-3 select-none">
                      {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}
                    </span>
                    {/* 화면 읽기 프로그램에는 기호 대신 말로 */}
                    {line.kind !== 'same' ? (
                      <span className="sr-only">
                        {line.kind === 'add' ? t('model.requirements.changes.added') : t('model.requirements.changes.removed')}:{' '}
                      </span>
                    ) : null}
                    {line.text}
                  </li>
                ))}
              </ul>
            </Field>
          ) : null}
          <ItemsDiff
            label={t('model.requirements.changes.criteria')}
            testId="requirement-changes-criteria"
            before={before.criteria.map((criterion) => criterion.text)}
            after={after.criteria.map((criterion) => criterion.text)}
          />
          <ItemsDiff
            label={t('model.requirements.changes.tables')}
            testId="requirement-changes-tables"
            before={before.tables}
            after={after.tables}
            mono
          />
        </>
      )}
    </div>
  )
}

function statusLabel(t: (key: string) => string, status: string): string {
  return ['draft', 'confirmed', 'dropped'].includes(status) ? t(`model.requirements.status.${status}`) : status
}

function Field({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5" data-testid={testId}>
      <span className="font-semibold text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  )
}

/** 항목 목록의 차이 — 바뀐 것이 없으면 그리지 않는다 */
function ItemsDiff({
  label,
  testId,
  before,
  after,
  mono = false,
}: {
  label: string
  testId: string
  before: string[]
  after: string[]
  mono?: boolean
}) {
  const { t } = useTranslation()
  const { added, removed } = diffItems(before, after)
  if (added.length === 0 && removed.length === 0) return null
  return (
    <Field label={label} testId={testId}>
      <ul className={cn('grid gap-0.5', mono && 'font-mono')}>
        {removed.map((item, index) => (
          <li key={`r${index}`} data-kind="remove" className="break-words text-red-800 line-through dark:text-red-300">
            − <span className="sr-only">{t('model.requirements.changes.removed')}: </span>
            {item}
          </li>
        ))}
        {added.map((item, index) => (
          <li key={`a${index}`} data-kind="add" className="break-words text-emerald-800 dark:text-emerald-300">
            + <span className="sr-only">{t('model.requirements.changes.added')}: </span>
            {item}
          </li>
        ))}
      </ul>
      {mono ? (
        // 테이블은 이전 → 지금 전체도 함께 보여 준다
        <p className="mt-0.5 font-mono text-muted-foreground" data-testid={`${testId}-summary`}>
          {(before.length > 0 ? before.join(', ') : t('model.requirements.changes.none')) +
            ' → ' +
            (after.length > 0 ? after.join(', ') : t('model.requirements.changes.none'))}
        </p>
      ) : null}
    </Field>
  )
}
