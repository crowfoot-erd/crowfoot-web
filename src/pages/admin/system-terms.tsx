/**
 * 시스템 사전 관리 (08-core/01 §4.5 — 관리자 화면)
 *
 * 전 워크스페이스가 공유하는 전역 용어 사전. 등록·편집은 다이얼로그(토큰 자연키
 * upsert), 삭제는 확인 다이얼로그 — 변경은 에디터 추론 캐시까지 즉시 무효화된다.
 * 라벨은 다국어 맵 — 기본 언어(UI 로케일 해석) 1행 + 나머지 언어를 보조로 표시하고
 * 검색은 토큰·모든 언어 라벨을 함께 본다.
 */
import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import { resolveLabel } from '@/features/editor/model/logical-name-inference'
import { useAdminSystemTerms, useDeleteAdminSystemTerm } from '@/features/terms/hooks'
import { SystemTermDialog } from '@/features/terms/components/system-term-dialog'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'

export function AdminSystemTermsPage() {
  const { t, i18n } = useTranslation()
  const terms = useAdminSystemTerms()
  const deleteMutation = useDeleteAdminSystemTerm()

  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SystemTerm | null>(null)
  const [deleting, setDeleting] = useState<SystemTerm | null>(null)

  const items = terms.data?.items ?? []
  const q = query.trim().toLowerCase()
  /** 검색 — 토큰 + 모든 언어 라벨(등록된 언어가 UI와 달라도 찾는다) */
  const filtered = useMemo(
    () =>
      q
        ? items.filter(
            (row) =>
              row.term.toLowerCase().includes(q) ||
              Object.values(row.labels).some((label) => label.toLowerCase().includes(q)),
          )
        : items,
    [items, q],
  )

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
          ) : items.length === 0 ? (
            <div className="p-4">
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
            </div>
          ) : (
            <>
              <div className="border-b px-4 py-3">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('admin.systemTerms.searchPlaceholder')}
                  aria-label={t('admin.systemTerms.searchPlaceholder')}
                  className="h-8 max-w-64"
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">{t('admin.systemTerms.table.term')}</TableHead>
                    <TableHead>{t('admin.systemTerms.table.labels')}</TableHead>
                    <TableHead className="w-36">{t('admin.systemTerms.table.type')}</TableHead>
                    <TableHead className="w-32">{t('admin.systemTerms.table.updatedAt')}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    // 기본 라벨은 UI 언어 해석 + 나머지 언어는 보조 표기
                    const primary = resolveLabel(row.labels, i18n.language)
                    const others = Object.entries(row.labels).filter(
                      ([, label]) => label !== primary,
                    )
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
                          {row.type ?? '-'}
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
