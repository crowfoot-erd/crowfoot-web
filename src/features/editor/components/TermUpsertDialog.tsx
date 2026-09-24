/**
 * 워크스페이스 사전 용어 등록·수정 다이얼로그 (용어 사전 패널 — v1.14)
 *
 * 패널 하단 인라인 폼을 대신하는 등록·수정 레이어 — [등록] 버튼(빈 폼)·행 클릭(기존 값
 * 프리필)·비표준 등록(토큰만 프리필)으로 열린다. 수정은 같은 토큰 재등록(upsert)이라
 * 등록·수정이 같은 폼이다. 타입(데이터 타입)은 문서의 DB 종류 1가지 기준으로 입력받는다
 * (모든 DBMS 칸을 놓지 않는다 — 관리 화면의 시스템 사전만 DBMS별 입력이다). 서버는
 * types 맵을 통째로 치환하므로 제출 시 기존 맵에 문서 종류 키만 갱신해 보낸다.
 */
import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
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
import { useUpsertTerm } from '@/features/terms/hooks'
import { errorMessage } from '@/lib/result-code'

/** 타입 제안(datalist) — 자유 입력도 된다, 입력을 막는 목록이 아니다 */
const TYPE_SUGGESTIONS = ['VARCHAR(50)', 'VARCHAR(100)', 'INTEGER', 'DECIMAL(15,2)', 'BOOLEAN', 'DATE', 'TIMESTAMP']

export interface TermUpsertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** 문서의 DB 종류(database_types 코드) — 타입 값의 저장 키 */
  databaseType: string
  /** 다이얼로그 모드 — 프리필 여부로 판별하지 않는다(비표준 등록은 토큰이 실린 채 등록) */
  mode: 'create' | 'edit'
  /** 열릴 때 폼에 실을 초기값 — types는 수정 대행의 기존 DBMS별 맵 전체(병합 보존용) */
  initial: { term: string; label: string; type: string; types: Record<string, string> | null }
}

export function TermUpsertDialog({ open, onOpenChange, workspaceId, databaseType, mode, initial }: TermUpsertDialogProps) {
  const { t } = useTranslation()
  const editing = mode === 'edit'

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
    defaultValues: initial,
  })

  // 열릴 때 초기값으로 시드 — 다음 열림까지 입력값이 남지 않는다
  useEffect(() => {
    if (!open) return
    form.reset(initial)
  }, [open, initial, form])

  const pending = upsertMutation.isPending

  const handleSubmit = form.handleSubmit((values) => {
    // 서버는 types 맵을 통째로 치환한다 — 이 다이얼로그는 문서 종류 키 하나만 편집하므로
    // 기존 맵에 그 키만 갱신해 보낸다(다른 종류 키의 값을 지우지 않는다). 키가 하나도
    // 남지 않으면 null(전체 타입 제거)
    const merged: Record<string, string> = { ...(initial.types ?? {}) }
    const type = values.type.trim()
    if (type) {
      merged[databaseType] = type
    } else {
      delete merged[databaseType]
    }
    upsertMutation.mutate(
      {
        term: values.term.trim(),
        label: values.label.trim(),
        types: Object.keys(merged).length > 0 ? merged : null,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          toast.success(
            editing
              ? t('model.editor.termDictionary.updateSuccess')
              : t('model.editor.termDictionary.createSuccess'),
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
              ? t('model.editor.termDictionary.editTitle')
              : t('model.editor.termDictionary.addTitle')}
          </DialogTitle>
          <DialogDescription>{t('model.editor.termDictionary.hint')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="term"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.termDictionary.term')}</FormLabel>
                  <FormControl>
                    <Input placeholder="user_id" className="font-mono" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.termDictionary.label')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('model.editor.termDictionary.labelPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* 타입(데이터 타입) — 문서의 DB 종류 기준 1칸, 선택. datalist는 제안일 뿐 자유 입력도 된다 */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('model.editor.termDictionary.type')}</FormLabel>
                  <FormControl>
                    <Input
                      list="term-type-suggestions"
                      placeholder={t('model.editor.termDictionary.typePlaceholder')}
                      className="font-mono text-sm"
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpen(false)} disabled={pending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {t('model.editor.termDictionary.add')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
