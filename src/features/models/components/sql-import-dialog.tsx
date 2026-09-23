/**
 * SQL Import 다이얼로그 (05-editor/04-dbms-engineering.md SQL Import v1 — "SQL 가져오기")
 *
 * - DDL 텍스트(직접 입력 또는 .sql 파일 읽기, 1MB 상한) → 미리보기(테이블 요약·skipped 경고)
 *   → 신규 문서 생성. 파싱은 core가 담당한다(커넥션 리버스와 같은 조립기).
 * - [미리보기]는 선택 단계 — 만들어질 테이블 수·관계 수가 생성과 정확히 같은 경로로 계산된다.
 * - 성공 → 요약 토스트 + 문서 목록 갱신 + 리버스와 같은 elk 계층 배치 저장(실패 시 그리드 유지).
 * - 읽지 못한 문장(CREATE INDEX·VIEW…)은 skipped로 돌아온다 — 전체 실패가 아니다.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { FileCode2, FileUp, Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import type { SqlImportResult } from '@/api/types'
import { saveModelContent } from '@/features/editor/api'
import { layoutTablePositions } from '@/features/editor/model/auto-layout'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDatabaseTypes, useSqlImport, useSqlImportPreview } from '@/features/models/hooks'
import { errorMessage } from '@/lib/result-code'

/** .sql 파일 읽기 상한 — 서버 ddl 검증(@Size 1_000_000)과 같은 값 */
const MAX_DDL_BYTES = 1_000_000

export interface SqlImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

interface SqlImportFormValues {
  databaseType: string
  name: string
  description: string
  ddl: string
}

function sqlImportSchema(requiredMessage: string) {
  return z.object({
    databaseType: z.string().min(1, requiredMessage),
    name: z.string(),
    description: z.string(),
    ddl: z.string().trim().min(1, requiredMessage),
  })
}

export function SqlImportDialog({ open, onOpenChange, workspaceId }: SqlImportDialogProps) {
  const { t } = useTranslation()
  const databaseTypes = useDatabaseTypes()
  const previewMutation = useSqlImportPreview(workspaceId)
  const importMutation = useSqlImport(workspaceId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<SqlImportFormValues>({
    resolver: zodResolver(sqlImportSchema(t('sqlImport.fieldRequired'))),
    defaultValues: { databaseType: '', name: '', description: '', ddl: '' },
  })

  const ddl = form.watch('ddl')
  const selectedType = form.watch('databaseType')

  // 종류 목록 도착 후 기본 선택 — 첫 항목 (커넥션 선택 기본값과 같은 관례)
  useEffect(() => {
    if (!open) return
    const first = databaseTypes.data?.items[0]
    if (first && form.getValues('databaseType') === '') {
      form.setValue('databaseType', first.code)
    }
  }, [open, databaseTypes.data, form])

  /** .sql 파일 읽기 — 텍스트로 textarea에 넣는다. 상한 초과는 안내만 하고 끝낸다 */
  const handleFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_DDL_BYTES) {
      toast.warning(t('sqlImport.fileTooLarge'))
      return
    }
    const text = await file.text()
    form.setValue('ddl', text, { shouldValidate: true })
  }

  /** 만들어진 문서 좌표 재배치 — 리버스 다이얼로그와 같은 패턴(실패해도 생성은 성공) */
  const applyAutoLayout = async (result: SqlImportResult) => {
    try {
      const doc = JSON.parse(result.model.content) as EditorDocument
      const positions = await layoutTablePositions(doc)
      if (Object.keys(positions).length === 0) return
      for (const [tableId, position] of Object.entries(positions)) {
        const node = doc.diagram.nodes[tableId]
        if (!node) continue
        node.x = position.x
        node.y = position.y
      }
      await saveModelContent(workspaceId, result.model.modelId, {
        baseVersion: result.model.version,
        content: JSON.stringify(doc),
      })
    } catch {
      // 의도된 무시 — 배치·저장 실패 시 그리드 좌표로 남는다
    }
  }

  const handlePreview = form.handleSubmit((values) => {
    previewMutation.mutate(
      { databaseType: values.databaseType, ddl: values.ddl },
      { onError: (error) => toast.error(errorMessage(error)) },
    )
  })

  const handleSubmit = form.handleSubmit((values) => {
    importMutation.mutate(
      {
        name: values.name.trim() || undefined,
        description: values.description.trim() || undefined,
        databaseType: values.databaseType,
        ddl: values.ddl,
      },
      {
        onSuccess: (result) => {
          if (!result) return
          onOpenChange(false)
          form.reset()
          previewMutation.reset()
          toast.success(
            t('sqlImport.successToast', {
              name: result.model.name,
              tables: result.tableCount,
              relationships: result.relationshipCount,
            }),
          )
          if (result.skipped.length > 0) {
            toast.warning(t('sqlImport.skippedToast', { skipped: result.skipped.join(', ') }))
          }
          void applyAutoLayout(result)
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  })

  const onOpen = (nextOpen: boolean) => {
    if (importMutation.isPending || previewMutation.isPending) return
    onOpenChange(nextOpen)
  }

  const preview = previewMutation.data
  const typeItems = databaseTypes.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      {/* DDL 폼+미리보기 패널로 첫 속한 높은 다이얼로그 — 상한을 두고 안에서 스크롤되게
          (DialogContent 기본은 높이 상한이 없어 짧은 화면에서 푸터가 화면 밖으로 나간다) */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('sqlImport.title')}</DialogTitle>
          <DialogDescription>{t('sqlImport.notice')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="databaseType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('sqlImport.databaseType')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={typeItems.length === 0 ? t('sqlImport.noDatabaseType') : undefined}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {typeItems.map((type) => (
                          <SelectItem key={type.code} value={type.code}>
                            {type.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('sqlImport.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('sqlImport.namePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.description')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('sqlImport.descriptionPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ddl"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t('sqlImport.ddl')}</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileUp aria-hidden className="h-3.5 w-3.5" />
                      {t('sqlImport.readFile')}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".sql,text/plain"
                      className="hidden"
                      aria-label={t('sqlImport.readFile')}
                      onChange={(event) => {
                        void handleFile(event.target.files?.[0])
                        event.target.value = '' // 같은 파일 재선택도 onChange가 오게
                      }}
                    />
                  </div>
                  <FormControl>
                    <Textarea
                      rows={8}
                      spellCheck={false}
                      className="font-mono text-xs"
                      placeholder={t('sqlImport.ddlPlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 미리보기 결과 — 테이블 요약·skipped 경고. [생성]은 미리보기 없이도 가능 */}
            {preview ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm" aria-label={t('sqlImport.previewResult')}>
                <p className="font-medium">
                  {t('sqlImport.previewResult', {
                    tables: preview.tableCount,
                    relationships: preview.relationshipCount,
                  })}
                </p>
                <ul className="mt-2 grid max-h-44 gap-1 overflow-y-auto">
                  {preview.tables.map((table) => (
                    <li key={table.name} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="font-mono">{table.name}</span>
                      {table.comment ? <span className="text-muted-foreground">{table.comment}</span> : null}
                      <span className="text-muted-foreground">
                        {t('sqlImport.columnCount', { count: table.columnCount })}
                      </span>
                      {table.primaryKeyColumns.length > 0 ? (
                        <span className="text-muted-foreground">
                          PK {table.primaryKeyColumns.join(', ')}
                        </span>
                      ) : null}
                      {table.foreignKeyCount > 0 ? (
                        <span className="text-muted-foreground">
                          {t('sqlImport.fkCount', { count: table.foreignKeyCount })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {preview.skipped.length > 0 ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {t('sqlImport.previewSkipped')}: {preview.skipped.join(' · ')}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={previewMutation.isPending || importMutation.isPending || ddl.trim().length === 0 || selectedType.length === 0}
              >
                {previewMutation.isPending ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <FileCode2 aria-hidden />
                )}
                {t('sqlImport.preview')}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpen(false)} disabled={importMutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={importMutation.isPending || typeItems.length === 0}>
                {importMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <FileCode2 aria-hidden />}
                {t('sqlImport.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
