/**
 * 시스템 사전 관리 (08-core/01 §4.5 — 관리자 화면)
 *
 * 전 워크스페이스가 공유하는 전역 용어 사전. 등록·편집은 다이얼로그(토큰 자연키
 * upsert), 삭제는 확인 다이얼로그 — 변경은 에디터 추론 캐시까지 즉시 무효화된다.
 * 라벨은 다국어 맵 — 기본 언어(UI 로케일 해석) 1행 + 나머지 언어를 보조로 표시한다.
 * 목록은 서버 페이징 + 알파벳 이니셜(a-z·#) 인덱스 + keyword 검색(토큰·모든 언어 라벨).
 * 타입은 DBMS별 맵 — 채운 종류만 "종류: 값" 결합으로 보여준다.
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import type { SystemTerm } from '@/api/types'
import { useAdminDatabaseTypes } from '@/features/admin/hooks'
import { resolveLabel } from '@/features/editor/model/logical-name-inference'
import { useAdminSystemTermsPage, useDeleteAdminSystemTerm } from '@/features/terms/hooks'
import { SystemTermDialog } from '@/features/terms/components/system-term-dialog'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'

const ADMIN_PAGE_SIZE = 20

/** 알파벳 인덱스 — 소문자 토큰의 이니셜. '#'은 알파벳 외(숫자 등) */
const ALPHABET = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'] as const

export function AdminSystemTermsPage() {
  const { t, i18n } = useTranslation()
  const databaseTypes = useAdminDatabaseTypes()
  const deleteMutation = useDeleteAdminSystemTerm()

  // 서버 페이징 상태 — 검색어는 디바운스(300ms). letter·keyword가 바뀌면 1페이지로 돌아간다
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [letter, setLetter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const terms = useAdminSystemTermsPage({
    page,
    size: ADMIN_PAGE_SIZE,
    letter: letter ?? undefined,
    keyword: debouncedQuery || undefined,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SystemTerm | null>(null)
  const [deleting, setDeleting] = useState<SystemTerm | null>(null)

  const items = terms.data?.items ?? []
  const totalPages = terms.data?.totalPages ?? 1
  const filtering = letter !== null || debouncedQuery !== ''
  /** 타입 열 결합 표기용 — 코드→표시명(코드 테이블이 원천) */
  const displayNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const dbms of databaseTypes.data?.items ?? []) map.set(dbms.code, dbms.displayName)
    return map
  }, [databaseTypes.data])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (term: SystemTerm) => {
    setEditing(term)
    setDialogOpen(true)
  }

  const handleDelete = () => {
    if (!deleting) return
    deleteMutation.mutate(deleting.termId, {
      onSuccess: () => {
        setDeleting(null)
        toast.success(t('admin.systemTerms.delete.successToast'))
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('admin.systemTerms.title')}</h1>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{t('admin.systemTerms.cardTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('admin.systemTerms.notice')}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={openCreate}>
            <Plus aria-hidden />
            {t('admin.systemTerms.newTerm')}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {terms.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : terms.isError ? (
            <div className="p-4">
              <ErrorState onRetry={() => void terms.refetch()} />
            </div>
          ) : (
            <>
              {/* 검색 — 서버 keyword(토큰·모든 언어 라벨 부분 일치) */}
              <div className="border-b px-4 py-3">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('admin.systemTerms.searchPlaceholder')}
                  aria-label={t('admin.systemTerms.searchPlaceholder')}
                  className="h-8 max-w-64"
                />
              </div>
              {/* 알파벳 인덱스 — 전체·a-z·#(알파벳 외 이니셜) */}
              <div
                role="group"
                aria-label={t('admin.systemTerms.alphabetLabel')}
                className="flex flex-wrap items-center gap-px border-b px-3 py-2"
              >
                <button
                  type="button"
                  data-testid="admin-term-letter-all"
                  aria-pressed={letter === null}
                  onClick={() => {
                    setLetter(null)
                    setPage(1)
                  }}
                  className={
                    letter === null
                      ? 'rounded-sm bg-accent px-2 py-0.5 text-xs font-semibold'
                      : 'rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/60'
                  }
                >
                  {t('admin.systemTerms.alphabetAll')}
                </button>
                {ALPHABET.map((char) => (
                  <button
                    key={char}
                    type="button"
                    data-testid={`admin-term-letter-${char}`}
                    aria-pressed={letter === char}
                    onClick={() => {
                      setLetter(char)
                      setPage(1)
                    }}
                    className={
                      letter === char
                        ? 'rounded-sm bg-accent px-1.5 py-0.5 font-mono text-xs font-semibold uppercase'
                        : 'rounded-sm px-1.5 py-0.5 font-mono text-xs text-muted-foreground uppercase hover:bg-accent/60'
                    }
                  >
                    {char}
                  </button>
                ))}
                <button
                  type="button"
                  data-testid="admin-term-letter-etc"
                  aria-pressed={letter === '#'}
                  onClick={() => {
                    setLetter('#')
                    setPage(1)
                  }}
                  className={
                    letter === '#'
                      ? 'rounded-sm bg-accent px-2 py-0.5 text-xs font-semibold'
                      : 'rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/60'
                  }
                >
                  {t('admin.systemTerms.letterEtc')}
                </button>
              </div>

              {items.length === 0 ? (
                <div className="p-4">
                  {filtering ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {t('admin.systemTerms.noResults')}
                    </p>
                  ) : (
                    <EmptyState
                      illustration="workspace"
                      title={t('admin.systemTerms.empty.title')}
                      description={t('admin.systemTerms.empty.description')}
                      action={
                        <Button type="button" size="sm" onClick={openCreate}>
                          <Plus aria-hidden />
                          {t('admin.systemTerms.newTerm')}
                        </Button>
                      }
                    />
                  )}
                </div>
              ) : (
                <div className={terms.isPlaceholderData ? 'opacity-60' : undefined}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-36">{t('admin.systemTerms.table.term')}</TableHead>
                        <TableHead>{t('admin.systemTerms.table.labels')}</TableHead>
                        <TableHead className="w-48">{t('admin.systemTerms.table.type')}</TableHead>
                        <TableHead className="w-32">{t('admin.systemTerms.table.updatedAt')}</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((row) => {
                        // 기본 라벨은 UI 언어 해석 + 나머지 언어는 보조 표기
                        const primary = resolveLabel(row.labels, i18n.language)
                        const others = Object.entries(row.labels).filter(
                          ([, label]) => label !== primary,
                        )
                        // 타입 — 채운 DBMS만 "표시명: 값" 결합(비면 '-')
                        const typeText =
                          row.types && Object.keys(row.types).length > 0
                            ? Object.entries(row.types)
                                .map(([code, value]) => `${displayNames.get(code) ?? code}: ${value}`)
                                .join(' · ')
                            : null
                        return (
                          <TableRow key={row.termId} data-testid={`system-term-row-${row.term}`}>
                            <TableCell className="font-mono text-xs">{row.term}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm">{primary}</span>
                                {others.length > 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    {others.map(([locale, label]) => `${locale}: ${label}`).join(' · ')}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {typeText ?? '-'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDateTime(row.updatedAt)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEdit(row)}
                                  aria-label={`${t('common.edit')} — ${row.term}`}
                                >
                                  <Pencil aria-hidden className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeleting(row)}
                                  aria-label={`${t('common.delete')} — ${row.term}`}
                                >
                                  <Trash2 aria-hidden className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* 페이징 — 서버가 내린 page/totalPages 그대로 */}
              <div className="flex items-center justify-between gap-2 border-t px-4 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={page <= 1 || terms.isFetching}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  data-testid="admin-term-prev"
                >
                  <ChevronLeft aria-hidden className="size-3.5" />
                  {t('common.pagination.prev')}
                </Button>
                <span
                  data-testid="admin-term-page-status"
                  className="text-xs tabular-nums text-muted-foreground"
                >
                  {t('common.pagination.page', { page, totalPages })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={page >= totalPages || terms.isFetching}
                  onClick={() => setPage((prev) => prev + 1)}
                  data-testid="admin-term-next"
                >
                  {t('common.pagination.next')}
                  <ChevronRight aria-hidden className="size-3.5" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SystemTermDialog open={dialogOpen} onOpenChange={setDialogOpen} term={editing} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('admin.systemTerms.delete.title', { term: deleting?.term ?? '' })}
        description={t('admin.systemTerms.delete.description', { term: deleting?.term ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
