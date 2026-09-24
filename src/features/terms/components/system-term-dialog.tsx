/**
 * 시스템 사전 용어 등록/편집 다이얼로그 (08-core/01 §4.5 — 관리자)
 *
 * - 토큰은 전역 자연키 — 같은 토큰을 다시 등록하면 덮어쓴다(upsert)
 * - 라벨은 언어→라벨 맵 — ko/en/ja/zh 후보 중 최소 1개 언어를 채운다(에디터는
 *   UI 언어 → en → ko → 첫 값 폴백으로 해석한다)
 * - 타입(데이터 타입)은 DBMS 종류별로 따로 입력한다 — 활성 database_types 칸마다
 *   (키 = 코드 테이블이 원천이라 종류를 추가하면 칸이 자동으로 늘어난다)
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
import type { SystemTerm } from '@/api/types'
import { useAdminDatabaseTypes } from '@/features/admin/hooks'
import { useUpsertAdminSystemTerm } from '@/features/terms/hooks'
import { errorMessage } from '@/lib/result-code'

/** 라벨 입력 후보 로케일 — 웹 UI 로케일(ko/en)보다 넓게 고정한다 */
const LABEL_LOCALES = ['ko', 'en', 'ja', 'zh'] as const

interface SystemTermFormValues {
  term: string
  ko: string
  en: string
  ja: string
  zh: string
  types: Record<string, string>
}

/** zod 팩토리 — 에러 문구를 i18n로 주입한다(instance-dialog 패턴) */
function systemTermSchema(
  fieldRequired: string,
  termPattern: string,
  labelRequired: string,
  tooLong: string,
) {
  return z
    .object({
      term: z.string().trim().min(1, fieldRequired).refine((v) => !/\s/.test(v), termPattern),
      ko: z.string().trim().max(100, tooLong),
      en: z.string().trim().max(100, tooLong),
      ja: z.string().trim().max(100, tooLong),
      zh: z.string().trim().max(100, tooLong),
      types: z.record(
        z.string(),
        z.string().trim().max(100, tooLong),
      ),
    })
    .superRefine((values, ctx) => {
      // 라벨은 최소 1개 언어 — 비면 대표 입력(ko)에 안내한다
      if (LABEL_LOCALES.every((locale) => values[locale] === '')) {
        ctx.addIssue({ code: 'custom', path: ['ko'], message: labelRequired })
      }
    })
}

export interface SystemTermDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 편집 대상 — null이면 등록 */
  term: SystemTerm | null
}

export function SystemTermDialog({ open, onOpenChange, term }: SystemTermDialogProps) {
  const { t } = useTranslation()
  const upsertMutation = useUpsertAdminSystemTerm()
  const databaseTypes = useAdminDatabaseTypes()
  const editing = term !== null

  const form = useForm<SystemTermFormValues>({
    resolver: zodResolver(
      systemTermSchema(
        t('admin.systemTerms.dialog.fieldRequired'),
        t('admin.systemTerms.dialog.termPattern'),
        t('admin.systemTerms.dialog.labelRequired'),
        t('admin.systemTerms.dialog.tooLong'),
      ),
    ),
    defaultValues: { term: '', ko: '', en: '', ja: '', zh: '', types: {} },
  })

  // 열릴 때 폼 시드 — 편집이면 기존 라벨·타입 맵, 등록이면 초기화
  useEffect(() => {
    if (!open) return
    form.reset(
      term
        ? {
            term: term.term,
            ko: term.labels.ko ?? '',
            en: term.labels.en ?? '',
            ja: term.labels.ja ?? '',
            zh: term.labels.zh ?? '',
            types: term.types ?? {},
          }
        : { term: '', ko: '', en: '', ja: '', zh: '', types: {} },
    )
  }, [open, term, form])

  const pending = upsertMutation.isPending
  // 활성 DBMS만 입력칸으로 노출한다 — 비활성 전환돼도 기존 값은 서버가 보존한다
  const activeTypes = (databaseTypes.data?.items ?? []).filter((dbms) => dbms.isActive)

  // DBMS 목록 도착·변경 시 칸별 기본값('')을 확정한다 — 미입력 칸이 undefined로
  // 남으면 레코드 값 검증(문자열)에 걸려 제출이 막힌다. 폼은 열림 때만 마운트라
  // reset 이후 목록이 이미 도착해 있어도 이 effect가 칸을 확정한다
  useEffect(() => {
    for (const dbms of activeTypes) {
      if (form.getValues(`types.${dbms.code}`) === undefined) {
        form.setValue(`types.${dbms.code}`, '')
      }
    }
  }, [activeTypes, form])

  const handleSubmit = form.handleSubmit((values) => {
    // 채운 언어만 맵으로 — 빈 칸은 키 자체를 보내지 않는다(기존 언어 제거 = 빈 칸 저장)
    const labels = Object.fromEntries(
      LABEL_LOCALES.filter((locale) => values[locale] !== '').map((locale) => [
        locale,
        values[locale],
      ]),
    )
    // 타입도 같은 규칙 — 채운 종류만(그 종류 값을 지운다 = 빈 칸 저장)
    const types = Object.fromEntries(
      Object.entries(values.types ?? {}).filter(([, value]) => value.trim() !== ''),
    )
    upsertMutation.mutate(
      { term: values.term.trim(), labels, types: Object.keys(types).length > 0 ? types : null },
      {
        onSuccess: () => {
          onOpenChange(false)
          toast.success(
            editing
              ? t('admin.systemTerms.dialog.updateSuccess')
              : t('admin.systemTerms.dialog.createSuccess'),
          )
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  })

  const onOpen = (nextOpen: boolean) => {
    if (pending) return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t('admin.systemTerms.dialog.editTitle')
              : t('admin.systemTerms.dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('admin.systemTerms.dialog.notice')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="term"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.systemTerms.dialog.term')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('admin.systemTerms.dialog.termPlaceholder')}
                      className="font-mono"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">
                {t('admin.systemTerms.dialog.labelsHint')}
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {LABEL_LOCALES.map((locale) => (
                  <FormField
                    key={locale}
                    control={form.control}
                    name={locale}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t(`admin.systemTerms.dialog.locale.${locale}`)}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </fieldset>
            {/* 타입 — DBMS 종류별 입력(활성 database_types). 채운 종류만 맵으로 저장된다 */}
            {activeTypes.map((dbms) => (
              <FormField
                key={dbms.code}
                control={form.control}
                name={`types.${dbms.code}`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('admin.systemTerms.dialog.typeForDbms', { dbms: dbms.displayName })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('admin.systemTerms.dialog.typePlaceholder')}
                        className="font-mono text-sm"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpen(false)} disabled={pending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {editing ? t('common.save') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
