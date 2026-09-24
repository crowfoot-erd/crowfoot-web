/**
 * 용어 사전 패널 — 에디터 좌측 보조 패널 (v1.14, 05-editor/02-ui.md)
 *
 * 워크스페이스 표준 자산으로 승격된 용어 사전의 본체. 두 탭:
 * - 표준 사전: 이 워크스페이스가 등록한 용어(workspace_terms — 문서끼리 공유).
 *   처음에는 빈 목록에서 시작한다 — 비표준 검사는 상시 노출이 아니라 [비표준 검사]
 *   버튼을 누를 때만 문서 물리명 토큰 × 병합 사전을 검사해 결과를 보여준다(term-lint).
 *   등록은 upsert(수정 = 같은 토큰 재등록)이며 타입(데이터 타입)도 함께 지정할 수 있다.
 * - 시스템 사전: 관리자가 등록한 전역 사전(system_terms, 읽기 전용·다국어 labels).
 *   라벨은 UI 언어로 해석해 보여준다. 열람 전용 — 사용자가 시스템 사전을 고치는
 *   진입(수정·재정의 프리필)은 없다. 표준 사전이 토큰을 덮어 쓰고 있으면 배지로 안내한다.
 *
 * 쓰기(폼·삭제·대량 등록·비표준 등록)는 Editor 이상(canEdit), 열람은 멤버 전체.
 * 패널은 열릴 때만 마운트된다(open 아니면 null — 익스플로러와 같은 패턴) — 닫힘 동안
 * 문서 구독·쿼리 비용이 0이다. draft(폼 프리필)는 요청 시 1회 적용 후 클리어된다 —
 * 탭 전환으로 표준 탭이 리마운트돼도 부모가 든 draft가 마운트 직후 적용된다.
 */
import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, ChevronRight, Loader2, ScanSearch, Search, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import type { SystemTerm, WorkspaceTerm } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildTermMap, resolveLabel } from '@/features/editor/model/logical-name-inference'
import { lintNonStandardTerms, type TermLintFinding } from '@/features/editor/model/term-lint'
import { useEditorStore } from '@/features/editor/store/editor-store'
import {
  useDeleteTerm,
  useSystemTerms,
  useUpsertTerm,
  useWorkspaceTerms,
} from '@/features/terms/hooks'
import { errorMessage } from '@/lib/result-code'
import { TermBulkImportDialog } from './TermBulkImportDialog'

/** 등록 폼 타입 제안(datalist) — 자유 입력도 된다, 입력을 막는 목록이 아니다 */
const TYPE_SUGGESTIONS = ['VARCHAR(50)', 'VARCHAR(100)', 'INTEGER', 'DECIMAL(15,2)', 'BOOLEAN', 'DATE', 'TIMESTAMP']

export interface TermDictionaryPanelProps {
  open: boolean
  workspaceId: string
  /** 편집 권한 — 쓰기 affordance만 게이트(목록·검색·비표준 검사는 읽기 전용도 가능) */
  canEdit: boolean
}

export function TermDictionaryPanel({ open, workspaceId, canEdit }: TermDictionaryPanelProps) {
  if (!open) return null
  return <PanelBody workspaceId={workspaceId} canEdit={canEdit} />
}

/** 등록 폼에 실을 프리필 — 요청 시 1회 적용 후 클리어(입력 중인 값을 되돌리지 않는다) */
interface TermDraft {
  term: string
  label: string
  type: string
}

function PanelBody({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const { t, i18n } = useTranslation()
  const terms = useWorkspaceTerms(workspaceId)
  const system = useSystemTerms()

  const [tab, setTab] = useState<'standard' | 'system'>('standard')
  const [standardQuery, setStandardQuery] = useState('')
  const [systemQuery, setSystemQuery] = useState('')
  const [draft, setDraft] = useState<TermDraft | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  /** 병합 사전(표준 > 시스템 언어 해석) — 비표준 검사 기준. 추론 다이얼로그와 같은 쿼리 키를
     쓴다 — 패널에서 등록하면 열려 있는 추론 미리보기도 즉시 갱신된다 */
  const dict = useMemo(
    () => buildTermMap(system.data?.items, terms.data?.items, i18n.language),
    [system.data, terms.data, i18n.language],
  )
  const standardTerms = terms.data?.items ?? []
  /** 시스템 사전에서 표준이 재정의한 토큰 — "재정의됨" 배지 */
  const overridden = useMemo(() => new Set(standardTerms.map((row) => row.term)), [standardTerms])

  return (
    <aside
      data-testid="term-dictionary-panel"
      aria-label={t('model.editor.termDictionary.title')}
      className="flex h-full w-72 shrink-0 flex-col border-r bg-background"
    >
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as 'standard' | 'system')}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b px-2 py-1.5">
          <TabsList className="w-full">
            <TabsTrigger value="standard" className="text-xs">
              {t('model.editor.termDictionary.tabStandard')}
            </TabsTrigger>
            <TabsTrigger value="system" className="text-xs">
              {t('model.editor.termDictionary.tabSystem')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="standard" className="flex min-h-0 flex-1 flex-col">
          <StandardTab
            workspaceId={workspaceId}
            canEdit={canEdit}
            termsStatus={terms}
            dict={dict}
            standardTerms={standardTerms}
            query={standardQuery}
            onQueryChange={setStandardQuery}
            draft={draft}
            onConsumeDraft={setDraft}
            onOpenBulk={() => setBulkOpen(true)}
          />
        </TabsContent>

        <TabsContent value="system" className="flex min-h-0 flex-1 flex-col">
          <SystemTab
            systemStatus={system}
            locale={i18n.language}
            overridden={overridden}
            query={systemQuery}
            onQueryChange={setSystemQuery}
          />
        </TabsContent>
      </Tabs>

      {canEdit ? (
        <TermBulkImportDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          workspaceId={workspaceId}
        />
      ) : null}
    </aside>
  )
}

/* ---------- 표준 사전 탭 ---------- */

function StandardTab({
  workspaceId,
  canEdit,
  termsStatus,
  dict,
  standardTerms,
  query,
  onQueryChange,
  draft,
  onConsumeDraft,
  onOpenBulk,
}: {
  workspaceId: string
  canEdit: boolean
  termsStatus: ReturnType<typeof useWorkspaceTerms>
  dict: ReturnType<typeof buildTermMap>
  standardTerms: readonly WorkspaceTerm[]
  query: string
  onQueryChange: (query: string) => void
  draft: TermDraft | null
  onConsumeDraft: (draft: TermDraft | null) => void
  onOpenBulk: () => void
}) {
  const { t } = useTranslation()
  const deleteMutation = useDeleteTerm(workspaceId)
  const doc = useEditorStore((s) => s.present)
  /** 비표준 검사는 요청 시에만 — 상시 노출하지 않는다(빈 목록 시작 원칙). 결과가 붙은
      상태에서 사전·문서가 바뀌어도 다시 누르면 최신으로 다시 계산된다 */
  const [lintOpen, setLintOpen] = useState(false)
  const [lintCollapsed, setLintCollapsed] = useState(false)
  const findings = useMemo(
    () => (lintOpen ? lintNonStandardTerms(doc, dict) : []),
    [lintOpen, doc, dict],
  )

  const q = query.trim().toLowerCase()
  const filtered = q
    ? standardTerms.filter(
        (row) => row.term.toLowerCase().includes(q) || row.label.toLowerCase().includes(q),
      )
    : standardTerms

  return (
    <>
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('model.editor.termDictionary.searchPlaceholder')}
            aria-label={t('model.editor.termDictionary.searchPlaceholder')}
            className="h-8 pl-8 text-sm"
            data-testid="term-standard-search"
          />
        </div>
        <Button
          type="button"
          variant={lintOpen ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 shrink-0 px-2 text-xs"
          onClick={() => setLintOpen((prev) => !prev)}
          aria-pressed={lintOpen}
          data-testid="term-lint-toggle"
        >
          <ScanSearch aria-hidden className="size-3.5" />
          {t('model.editor.termDictionary.lintButton')}
        </Button>
        {q ? (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {t('model.editor.termDictionary.count', { count: filtered.length })}
          </span>
        ) : null}
      </div>

      {/* 비표준 검사 결과 — 버튼을 눌렀을 때만 렌더. 접기는 패널 보기 상태(문서를 고치지 않는다) */}
      {lintOpen ? (
        <LintSection
          findings={findings}
          collapsed={lintCollapsed}
          onToggle={() => setLintCollapsed((prev) => !prev)}
          canEdit={canEdit}
          onRegister={(token) => onConsumeDraft({ term: token, label: '', type: '' })}
        />
      ) : null}

      {/* 표준 사전 목록 — term 오름차순(서버 정렬). 행 클릭 = 수정 프리필(재등록으로 덮어쓴다) */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1 text-sm">
        {termsStatus.isPending ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
          >
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : termsStatus.isError ? (
          <p
            data-testid="term-standard-error"
            className="px-3 py-4 text-center text-xs text-muted-foreground"
          >
            {t('model.editor.termDictionary.loadFailed')}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {q ? t('model.editor.explorer.noResults') : t('model.editor.termDictionary.empty')}
          </p>
        ) : (
          filtered.map((row) => (
            <div
              key={row.termId}
              data-testid={`term-row-${row.term}`}
              className={
                canEdit
                  ? 'group flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-sm px-2 text-left hover:bg-accent/60'
                  : 'flex h-7 select-none items-center gap-1.5 rounded-sm px-2 text-left'
              }
              onClick={
                canEdit
                  ? () => onConsumeDraft({ term: row.term, label: row.label, type: row.type ?? '' })
                  : undefined
              }
              onKeyDown={
                canEdit
                  ? (event) => {
                      if (event.key === 'Enter')
                        onConsumeDraft({ term: row.term, label: row.label, type: row.type ?? '' })
                    }
                  : undefined
              }
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
            >
              <code className="min-w-0 shrink-0 truncate font-mono text-xs text-muted-foreground">
                {row.term}
              </code>
              <span aria-hidden className="shrink-0 text-muted-foreground">
                →
              </span>
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              {row.type ? (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {row.type}
                </span>
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`${t('common.delete')} — ${row.term}`}
                  title={`${t('common.delete')} — ${row.term}`}
                  disabled={deleteMutation.isPending}
                  onClick={(event) => {
                    event.stopPropagation()
                    deleteMutation.mutate(row.termId, {
                      onError: (error) => toast.error(errorMessage(error)),
                    })
                  }}
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canEdit ? (
        <StandardTabForm
          workspaceId={workspaceId}
          draft={draft}
          onConsumeDraft={onConsumeDraft}
          onOpenBulk={onOpenBulk}
          deletePending={deleteMutation.isPending}
        />
      ) : (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {t('model.editor.termDictionary.viewerNote')}
        </p>
      )}
    </>
  )
}

/** 표준 탭 하단 고정 영역 — 등록 폼 + 대량 등록 버튼. 등록 후 term만 비워 연속 등록을 돕는다 */
function StandardTabForm({
  workspaceId,
  draft,
  onConsumeDraft,
  onOpenBulk,
  deletePending,
}: {
  workspaceId: string
  draft: TermDraft | null
  onConsumeDraft: (draft: TermDraft | null) => void
  onOpenBulk: () => void
  deletePending: boolean
}) {
  const { t } = useTranslation()
  const upsertMutation = useUpsertTerm(workspaceId)

  const form = useForm<{ term: string; label: string; type: string }>({
    resolver: zodResolver(
      z.object({
        term: z
          .string()
          .trim()
          .min(1, t('model.editor.termDictionary.fieldRequired'))
          .refine((v) => !/\s/.test(v), t('model.editor.termDictionary.termPattern')),
        label: z.string().trim().min(1, t('model.editor.termDictionary.fieldRequired')),
        type: z.string().trim().max(100, t('model.editor.termDictionary.typeTooLong')),
      }),
    ),
    defaultValues: { term: '', label: '', type: '' },
  })

  // 프리필은 요청 시 1회 — 적용 후 draft를 클리어해 사용자 입력을 되돌리지 않는다.
  // 탭 전환 리마운트 직후에도 이 effect가 마운트 시점의 draft를 받아 적용한다.
  useEffect(() => {
    if (!draft) return
    form.setValue('term', draft.term, { shouldValidate: false })
    form.setValue('label', draft.label, { shouldValidate: false })
    form.setValue('type', draft.type, { shouldValidate: false })
    form.setFocus('label')
    onConsumeDraft(null)
  }, [draft, form, onConsumeDraft])

  const submit = form.handleSubmit((values) => {
    upsertMutation.mutate(
      { term: values.term.trim(), label: values.label.trim(), type: values.type.trim() || null },
      {
        onSuccess: () => {
          // term만 비운다 — 라벨·타입은 같은 계열이 많아 남겨둔다(연속 등록 UX)
          form.setValue('term', '')
          form.setFocus('term')
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  })

  const pending = upsertMutation.isPending || deletePending

  return (
    <div className="grid gap-2 border-t p-2">
      <Form {...form}>
        {/* form 요소로 감싸 엔터 등록이 된다 */}
        <form className="grid gap-2" onSubmit={submit} noValidate>
          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="term"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs">
                    {t('model.editor.termDictionary.term')}
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="user_id" className="h-8 text-sm" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs">
                    {t('model.editor.termDictionary.label')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('model.editor.termDictionary.labelPlaceholder')}
                      className="h-8 text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {/* 타입(데이터 타입) — 선택. datalist는 제안일 뿐 자유 입력도 된다 */}
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t('model.editor.termDictionary.type')}</FormLabel>
                <FormControl>
                  <Input
                    list="term-type-suggestions"
                    placeholder={t('model.editor.termDictionary.typePlaceholder')}
                    className="h-8 font-mono text-xs"
                    {...field}
                  />
                </FormControl>
                <datalist id="term-type-suggestions">
                  {TYPE_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" className="h-7 px-2" disabled={pending}>
              {upsertMutation.isPending ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              ) : null}
              {t('model.editor.termDictionary.add')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={onOpenBulk}
              data-testid="term-bulk-open"
            >
              {t('model.editor.termDictionary.bulkOpen')}
            </Button>
          </div>
        </form>
      </Form>
      <p className="text-xs text-muted-foreground">{t('model.editor.termDictionary.hint')}</p>
    </div>
  )
}

/* ---------- 비표준 단어 섹션 ---------- */

function LintSection({
  findings,
  collapsed,
  onToggle,
  canEdit,
  onRegister,
}: {
  findings: TermLintFinding[]
  collapsed: boolean
  onToggle: () => void
  canEdit: boolean
  onRegister: (token: string) => void
}) {
  const { t } = useTranslation()

  return (
    <section data-testid="term-lint-section" className="border-b">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex h-7 w-full items-center gap-1 rounded-sm px-2 text-xs font-semibold text-muted-foreground hover:bg-accent/60"
      >
        {collapsed ? (
          <ChevronRight aria-hidden className="size-3" />
        ) : (
          <ChevronDown aria-hidden className="size-3" />
        )}
        <span>{t('model.editor.termDictionary.lintTitle', { count: findings.length })}</span>
      </button>
      {collapsed ? null : (
        <div className="grid gap-1 px-2 pb-2">
          {findings.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('model.editor.termDictionary.lintEmpty')}
            </p>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground">
                {t('model.editor.termDictionary.lintHint')}
              </p>
              {findings.map((finding) => (
                <div
                  key={finding.token}
                  data-testid={`term-lint-${finding.token}`}
                  className="grid gap-0.5 rounded-md border px-2 py-1 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs">
                      {finding.token}
                    </code>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {t('model.editor.termDictionary.lintPlaces', {
                        count: finding.occurrences.length,
                      })}
                    </span>
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px]"
                        onClick={() => onRegister(finding.token)}
                        data-testid={`term-lint-register-${finding.token}`}
                      >
                        {t('model.editor.termDictionary.lintRegister')}
                      </Button>
                    ) : null}
                  </div>
                  {/* 출처 — 테이블 이름이면 테이블물리명, 컬럼이면 테이블.컬럼물리명 */}
                  <ul className="grid gap-0.5 text-[10px] text-muted-foreground">
                    {finding.occurrences.map((occurrence) => (
                      <li key={`${occurrence.tableId}:${occurrence.columnId ?? '-'}`} className="truncate">
                        {occurrence.columnPhysicalName
                          ? `${occurrence.tablePhysicalName}.${occurrence.columnPhysicalName}`
                          : occurrence.tablePhysicalName}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  )
}

/* ---------- 시스템 사전 탭 ---------- */

function SystemTab({
  systemStatus,
  locale,
  overridden,
  query,
  onQueryChange,
}: {
  systemStatus: ReturnType<typeof useSystemTerms>
  locale: string
  overridden: ReadonlySet<string>
  query: string
  onQueryChange: (query: string) => void
}) {
  const { t } = useTranslation()

  const items = systemStatus.data?.items ?? []
  const q = query.trim().toLowerCase()
  /** 검색은 토큰 + 해석 라벨 기준 — 언어를 바꾸면 검색 대상 라벨도 바뀐다 */
  const filtered = q
    ? items.filter((row) => {
        const label = resolveLabel(row.labels, locale)
        return row.term.toLowerCase().includes(q) || label.toLowerCase().includes(q)
      })
    : items

  return (
    <>
      <p className="border-b px-2 py-1.5 text-[10px] text-muted-foreground">
        {t('model.editor.termDictionary.systemHint')}
      </p>
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('model.editor.termDictionary.searchPlaceholder')}
            aria-label={t('model.editor.termDictionary.searchPlaceholder')}
            className="h-8 pl-8 text-sm"
            data-testid="term-system-search"
          />
        </div>
        {q ? (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {t('model.editor.termDictionary.count', { count: filtered.length })}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 text-sm">
        {systemStatus.isPending ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
          >
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : systemStatus.isError ? (
          <p
            data-testid="term-system-error"
            className="px-3 py-4 text-center text-xs text-muted-foreground"
          >
            {t('model.editor.termDictionary.systemLoadFailed')}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {q ? t('model.editor.explorer.noResults') : t('model.editor.termDictionary.systemEmpty')}
          </p>
        ) : (
          filtered.map((row: SystemTerm) => {
            const label = resolveLabel(row.labels, locale)
            return (
              <div
                key={row.termId}
                data-testid={`term-builtin-${row.term}`}
                className="flex h-7 select-none items-center gap-1.5 rounded-sm px-2 text-left"
              >
                <code className="min-w-0 shrink-0 truncate font-mono text-xs text-muted-foreground">
                  {row.term}
                </code>
                <span aria-hidden className="shrink-0 text-muted-foreground">
                  →
                </span>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {row.type ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {row.type}
                  </span>
                ) : null}
                {overridden.has(row.term) ? (
                  <Badge variant="secondary" className="shrink-0 px-1 text-[9px]">
                    {t('model.editor.termDictionary.overridden')}
                  </Badge>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
