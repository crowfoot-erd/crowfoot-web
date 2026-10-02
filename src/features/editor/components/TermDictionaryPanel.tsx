/**
 * 용어 사전 패널 — 에디터 좌측 보조 패널 (v1.14, 05-editor/02-ui.md)
 *
 * 워크스페이스 표준 자산으로 승격된 용어 사전의 본체. 두 탭:
 * - 워크스페이스 사전: 이 워크스페이스가 등록한 용어(workspace_terms — 문서끼리 공유).
 *   등록·수정은 상단 검색창 옆 [등록] 버튼·행 클릭으로 여는 다이얼로그(TermUpsertDialog)에서
 *   받는다 — upsert(수정 = 같은 토큰 재등록)라 한 폼이고, 타입(데이터 타입)은
 *   문서의 DB 종류 1가지 기준으로만 입력받아 그 키 하나짜리 맵으로 저장한다.
 * - 시스템 사전: 관리자가 등록한 전역 사전(system_terms, 읽기 전용·다국어 labels).
 *   라벨은 UI 언어로 해석해 보여준다. 열람 전용 — 사용자가 시스템 사전을 고치는
 *   진입(수정·재정의 프리필)은 없다. 워크스페이스 사전이 토큰을 덮어 쓰고 있으면 배지로 안내한다.
 *   목록은 서버 페이징 + 알파벳 이니셜(a-z·#) 인덱스 + keyword 검색(토큰·labels 값).
 *
 * 행의 타입 접미는 문서의 DB 종류(databaseType — database_types 코드)에 맞는 값을
 * 보여준다.
 *
 * 쓰기(등록·수정 다이얼로그·삭제)는 Editor 이상(canEdit), 열람은 멤버 전체.
 * 패널은 열릴 때만 마운트된다(open 아니면 null — 익스플로러와 같은 패턴) —
 * 닫힘 동안 문서 구독·쿼리 비용이 0이다.
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { SystemTerm, WorkspaceTerm } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { resolveLabel } from '@/features/editor/model/logical-name-inference'
import {
  useDeleteTerm,
  useSystemTermsPage,
  useWorkspaceTerms,
} from '@/features/terms/hooks'
import { useDomainTypes } from '@/features/domain-types/hooks'
import { DomainTypesTab } from '@/features/editor/components/DomainTypesTab'
import { templateIdForDatabase } from '@/features/editor/model/dbms'
import { errorMessage } from '@/lib/result-code'
import { TermUpsertDialog } from './TermUpsertDialog'

/** 알파벳 인덱스 — 소문자 토큰의 이니셜. '#'은 알파벳 외(숫자 등) */
const ALPHABET = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'] as const

/** 시스템 사전 탭 페이지 크기 — 서버 상한(100)보다 작은 패널에 맞는 값 */
const SYSTEM_PAGE_SIZE = 20

export interface TermDictionaryPanelProps {
  open: boolean
  workspaceId: string
  /** 문서의 DB 종류(database_types 코드) — 타입 접미·등록 다이얼로그 타입의 저장 키 */
  databaseType: string
  /** 편집 권한 — 쓰기 affordance만 게이트(목록·검색은 읽기 전용도 가능) */
  canEdit: boolean
  /** 고른 탭 — 주면 밖에서 정한다(「도구」 메뉴의 "도메인 타입"이 이 패널의 탭을 연다). 없으면 패널이 기억한다 */
  tab?: TermPanelTab
  onTabChange?: (tab: TermPanelTab) => void
}

/** 패널의 탭 — 워크스페이스 사전·도메인 타입·시스템 사전 */
export type TermPanelTab = 'standard' | 'domain' | 'system'

export function TermDictionaryPanel({ open, ...rest }: TermDictionaryPanelProps) {
  if (!open) return null
  return <PanelBody {...rest} />
}

function PanelBody({ workspaceId, databaseType, canEdit, tab: tabProp, onTabChange }: Omit<TermDictionaryPanelProps, 'open'>) {
  const { t, i18n } = useTranslation()
  const terms = useWorkspaceTerms(workspaceId)

  const [innerTab, setInnerTab] = useState<TermPanelTab>('standard')
  const tab = tabProp ?? innerTab
  const setTab = (next: TermPanelTab) => {
    setInnerTab(next)
    onTabChange?.(next)
  }
  // 용어와 도메인 타입 사이를 오간다(§14) — 용어 행의 도메인 타입 이름 → 도메인 타입 탭의 그 항목,
  // 도메인 타입 행의 "용어 N" → 워크스페이스 사전 탭에서 그 용어만
  const [focusDomainId, setFocusDomainId] = useState<string | null>(null)
  const [domainFilter, setDomainFilter] = useState<string | null>(null)
  const showDomain = (domainTypeId: string) => {
    setFocusDomainId(domainTypeId)
    setTab('domain')
  }
  const showTermsOf = (domainTypeId: string) => {
    setDomainFilter(domainTypeId)
    setTab('standard')
  }
  const [standardQuery, setStandardQuery] = useState('')
  const [systemQuery, setSystemQuery] = useState('')

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
        onValueChange={(value) => setTab(value as TermPanelTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b px-2 py-1.5">
          <TabsList className="w-full">
            <TabsTrigger value="standard" className="text-xs">
              {t('model.editor.termDictionary.tabStandard')}
            </TabsTrigger>
            <TabsTrigger value="domain" className="text-xs">
              {t('model.editor.domainType.menu')}
            </TabsTrigger>
            <TabsTrigger value="system" className="text-xs">
              {t('model.editor.termDictionary.tabSystem')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="standard" className="flex min-h-0 flex-1 flex-col">
          <StandardTab
            workspaceId={workspaceId}
            databaseType={databaseType}
            canEdit={canEdit}
            termsStatus={terms}
            standardTerms={standardTerms}
            query={standardQuery}
            onQueryChange={setStandardQuery}
            domainFilter={domainFilter}
            onClearDomainFilter={() => setDomainFilter(null)}
            onShowDomain={showDomain}
          />
        </TabsContent>

        <TabsContent value="domain" className="flex min-h-0 flex-1 flex-col">
          <DomainTypesTab
            workspaceId={workspaceId}
            canEdit={canEdit}
            dbmsId={templateIdForDatabase(databaseType)}
            terms={standardTerms}
            focusId={focusDomainId}
            onShowTerms={showTermsOf}
          />
        </TabsContent>

        <TabsContent value="system" className="flex min-h-0 flex-1 flex-col">
          <SystemTab
            databaseType={databaseType}
            locale={i18n.language}
            overridden={overridden}
            query={systemQuery}
            onQueryChange={setSystemQuery}
          />
        </TabsContent>
      </Tabs>
    </aside>
  )
}

/* ---------- 워크스페이스 사전 탭 ---------- */

function StandardTab({
  workspaceId,
  databaseType,
  canEdit,
  termsStatus,
  standardTerms,
  query,
  onQueryChange,
  domainFilter,
  onClearDomainFilter,
  onShowDomain,
}: {
  workspaceId: string
  databaseType: string
  canEdit: boolean
  termsStatus: ReturnType<typeof useWorkspaceTerms>
  standardTerms: readonly WorkspaceTerm[]
  query: string
  onQueryChange: (query: string) => void
  /** 이 도메인 타입을 가리키는 용어만 본다 — null이면 전체 */
  domainFilter: string | null
  onClearDomainFilter: () => void
  /** 용어 행의 도메인 타입 이름을 눌렀다 */
  onShowDomain: (domainTypeId: string) => void
}) {
  const { t } = useTranslation()
  const deleteMutation = useDeleteTerm(workspaceId)

  /** 등록·수정 다이얼로그 상태 — mode가 폼 제목·토스트를 정한다. 타입은 문서의 DB 종류
      값 하나만 오간다 — initial.types에 기존 DBMS별 맵 전체를 실어 다른 종류 값이
      지워지지 않게 한다 */
  const [upsert, setUpsert] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    initial: { term: string; label: string; type: string; types: Record<string, string> | null; domainTypeId?: string | null }
  }>({ open: false, mode: 'create', initial: { term: '', label: '', type: '', types: null } })
  const openCreate = () =>
    setUpsert({ open: true, mode: 'create', initial: { term: '', label: '', type: '', types: null } })
  const openEdit = (row: WorkspaceTerm) =>
    setUpsert({
      open: true,
      mode: 'edit',
      initial: {
        term: row.term,
        label: row.label,
        type: row.types?.[databaseType] ?? '',
        types: row.types ?? null,
        domainTypeId: row.domainTypeId ?? null,
      },
    })

  // 용어가 가리키는 도메인 타입의 이름 — 행의 타입 접미 자리에 보여 준다(§4.6)
  const domainTypes = useDomainTypes(workspaceId)
  const domainNameOf = useMemo(
    () => new Map((domainTypes.data?.items ?? []).map((item) => [item.domainTypeId, item.name] as const)),
    [domainTypes.data],
  )

  const q = query.trim().toLowerCase()
  const scoped = domainFilter ? standardTerms.filter((row) => row.domainTypeId === domainFilter) : standardTerms
  const filtered = q
    ? scoped.filter(
        (row) => row.term.toLowerCase().includes(q) || row.label.toLowerCase().includes(q),
      )
    : scoped

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
        {q ? (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {t('model.editor.termDictionary.count', { count: filtered.length })}
          </span>
        ) : null}
        {canEdit ? (
          /* 등록(다이얼로그) — 검색창 옆 상단. 폼은 다이얼로그로 옮겨 패널은 목록에 집중한다 */
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 px-2"
            onClick={openCreate}
            data-testid="term-upsert-open"
          >
            <Plus aria-hidden className="size-3.5" />
            {t('model.editor.termDictionary.add')}
          </Button>
        ) : null}
      </div>

      {domainFilter ? (
        <div className="flex items-center gap-2 border-b bg-violet-500/10 px-2 py-1 text-xs" data-testid="term-domain-filter">
          <span className="min-w-0 flex-1 truncate">
            {t('model.editor.termDictionary.domainFilter', { name: domainNameOf.get(domainFilter) ?? domainFilter })}
          </span>
          <button type="button" className="shrink-0 underline underline-offset-2" onClick={onClearDomainFilter}>
            {t('model.editor.termDictionary.showAll')}
          </button>
        </div>
      ) : null}
      {/* 워크스페이스 사전 목록 — term 오름차순(서버 정렬). 행 클릭 = 수정 다이얼로그(재등록으로 덮어쓴다) */}
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
              onClick={canEdit ? () => openEdit(row) : undefined}
              onKeyDown={
                canEdit
                  ? (event) => {
                      if (event.key === 'Enter') openEdit(row)
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
              {row.domainTypeId && domainNameOf.has(row.domainTypeId) ? (
                // 도메인 타입을 가리키는 용어 — 타입 표기 대신 도메인 타입 이름. 누르면 도메인 타입 탭의 그 항목으로 간다
                <button
                  type="button"
                  className="shrink-0 rounded-sm bg-violet-500/15 px-1 text-[10px] font-medium text-violet-600 hover:bg-violet-500/25 dark:text-violet-400"
                  data-testid={`term-domain-${row.term}`}
                  title={t('model.editor.domainType.badge', { name: domainNameOf.get(row.domainTypeId) })}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (row.domainTypeId) onShowDomain(row.domainTypeId)
                  }}
                >
                  {domainNameOf.get(row.domainTypeId)}
                </button>
              ) : row.types?.[databaseType] ? (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {row.types[databaseType]}
                </span>
              ) : null}
              {canEdit ? (
                <>
                  {/* 수정 진입 — 연필 아이콘(행 클릭과 같은 동작) */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={`${t('common.edit')} — ${row.term}`}
                    title={`${t('common.edit')} — ${row.term}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      openEdit(row)
                    }}
                  >
                    <Pencil aria-hidden className="size-3.5" />
                  </Button>
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
                </>
              ) : null}
            </div>
          ))
        )}
      </div>

      {!canEdit ? (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {t('model.editor.termDictionary.viewerNote')}
        </p>
      ) : null}

      {canEdit ? (
        <TermUpsertDialog
          open={upsert.open}
          onOpenChange={(nextOpen) => setUpsert((prev) => ({ ...prev, open: nextOpen }))}
          workspaceId={workspaceId}
          databaseType={databaseType}
          mode={upsert.mode}
          initial={upsert.initial}
        />
      ) : null}
    </>
  )
}

/* ---------- 시스템 사전 탭 ---------- */

function SystemTab({
  databaseType,
  locale,
  overridden,
  query,
  onQueryChange,
}: {
  databaseType: string
  locale: string
  overridden: ReadonlySet<string>
  query: string
  onQueryChange: (query: string) => void
}) {
  const { t } = useTranslation()

  // 서버 페이징 상태 — 검색어는 디바운스(300ms)해 요청 수를 줄인다.
  // letter·keyword가 바뀌면 항상 1페이지로 돌아간다
  const [page, setPage] = useState(1)
  const [letter, setLetter] = useState<string | null>(null)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const systemStatus = useSystemTermsPage({
    page,
    size: SYSTEM_PAGE_SIZE,
    letter: letter ?? undefined,
    keyword: debouncedQuery || undefined,
  })
  const items = systemStatus.data?.items ?? []
  const totalPages = systemStatus.data?.totalPages ?? 1
  const filtering = letter !== null || debouncedQuery !== ''

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
      </div>

      {/* 알파벳 인덱스 — 전체·a-z·#(알파벳 외 이니셜). 선택 시 그 이니셜 토큰만 1페이지부터 */}
      <div
        role="group"
        aria-label={t('model.editor.termDictionary.alphabetLabel')}
        className="flex flex-wrap items-center gap-px border-b px-1 py-1"
      >
        <button
          type="button"
          data-testid="term-letter-all"
          aria-pressed={letter === null}
          onClick={() => {
            setLetter(null)
            setPage(1)
          }}
          className={
            letter === null
              ? 'rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-semibold'
              : 'rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent/60'
          }
        >
          {t('model.editor.termDictionary.alphabetAll')}
        </button>
        {ALPHABET.map((char) => (
          <button
            key={char}
            type="button"
            data-testid={`term-letter-${char}`}
            aria-pressed={letter === char}
            onClick={() => {
              setLetter(char)
              setPage(1)
            }}
            className={
              letter === char
                ? 'rounded-sm bg-accent px-1 py-0.5 font-mono text-[10px] font-semibold uppercase'
                : 'rounded-sm px-1 py-0.5 font-mono text-[10px] text-muted-foreground uppercase hover:bg-accent/60'
            }
          >
            {char}
          </button>
        ))}
        <button
          type="button"
          data-testid="term-letter-etc"
          aria-pressed={letter === '#'}
          onClick={() => {
            setLetter('#')
            setPage(1)
          }}
          className={
            letter === '#'
              ? 'rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-semibold'
              : 'rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent/60'
          }
        >
          {t('model.editor.termDictionary.letterEtc')}
        </button>
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
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {filtering
              ? t('model.editor.explorer.noResults')
              : t('model.editor.termDictionary.systemEmpty')}
          </p>
        ) : (
          // 페이지 전환 중에도 이전 페이지를 보여준다(keepPreviousData) — 흐리게 표시
          <div className={systemStatus.isPlaceholderData ? 'opacity-60' : undefined}>
            {items.map((row: SystemTerm) => {
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
                  {row.types?.[databaseType] ? (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {row.types[databaseType]}
                    </span>
                  ) : null}
                  {overridden.has(row.term) ? (
                    <Badge variant="secondary" className="shrink-0 px-1 text-[9px]">
                      {t('model.editor.termDictionary.overridden')}
                    </Badge>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 페이징 — 서버가 내린 page/totalPages 그대로. 1페이지면 이전이, 끝 페이지면 다음이 막힌다 */}
      <div className="flex items-center justify-between gap-2 border-t px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px]"
          disabled={page <= 1 || systemStatus.isFetching}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          data-testid="term-system-prev"
        >
          <ChevronLeft aria-hidden className="size-3" />
          {t('common.pagination.prev')}
        </Button>
        <span
          data-testid="term-system-page-status"
          className="text-[10px] tabular-nums text-muted-foreground"
        >
          {t('common.pagination.page', { page, totalPages })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px]"
          disabled={page >= totalPages || systemStatus.isFetching}
          onClick={() => setPage((prev) => prev + 1)}
          data-testid="term-system-next"
        >
          {t('common.pagination.next')}
          <ChevronRight aria-hidden className="size-3" />
        </Button>
      </div>
    </>
  )
}
