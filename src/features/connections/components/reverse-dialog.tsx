/**
 * 리버스 엔지니어링 다이얼로그 (storyboard 02-user §7 — "DB에서 가져오기")
 *
 * - 커넥션 선택 + 문서 이름(기본 {커넥션 이름} ERD)·설명(선택) → 신규 문서 생성
 * - 오픈 지점 2곳이 같은 다이얼로그를 쓴다: ERD 탭 헤더 "DB에서 가져오기"·커넥션 행 "문서로 가져오기"
 * - 성공 → 요약 토스트(테이블 n·관계 m) + 문서 목록 갱신. skipped가 있으면 함께 안내
 * - 생성 직후 content의 그리드 좌표를 elkjs 계층형 배치로 다시 잡아 저장한다 —
 *   관계 방향(부모→자식)이 읽히는 배치로 열리게 (실패 시 그리드 그대로 유지)
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { DatabaseZap, Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import type { ReverseEngineeringResult } from '@/api/types'
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
import { useConnections, useReverseEngineer } from '@/features/connections/hooks'
import { errorMessage } from '@/lib/result-code'

export interface ReverseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** 사전 선택 커넥션 — 커넥션 행에서 열 때. 없으면 첫 항목 */
  presetConnectionId?: string
}

interface ReverseFormValues {
  connectionId: string
  modelName: string
  description: string
}

function reverseSchema(requiredMessage: string) {
  return z.object({
    connectionId: z.string().min(1, requiredMessage),
    modelName: z.string().trim().min(1, requiredMessage),
    description: z.string(),
  })
}

export function ReverseDialog({ open, onOpenChange, workspaceId, presetConnectionId }: ReverseDialogProps) {
  const { t } = useTranslation()
  const connections = useConnections(workspaceId)
  const reverseMutation = useReverseEngineer(workspaceId)

  const form = useForm<ReverseFormValues>({
    resolver: zodResolver(reverseSchema(t('reverse.fieldRequired'))),
    defaultValues: { connectionId: '', modelName: '', description: '' },
  })

  const selectedId = form.watch('connectionId')

  // 커넥션 목록 도착 후 기본 선택 — preset이 우선, 없으면 첫 항목
  useEffect(() => {
    if (!open) return
    const items = connections.data?.items ?? []
    if (items.length === 0) return
    const current = form.getValues('connectionId')
    if (presetConnectionId && items.some((c) => c.connectionId === presetConnectionId)) {
      if (current !== presetConnectionId) form.setValue('connectionId', presetConnectionId)
    } else if (!items.some((c) => c.connectionId === current)) {
      form.setValue('connectionId', items[0].connectionId)
    }
  }, [open, connections.data, presetConnectionId, form])

  // 문서 이름 기본값 — 커넥션 선택이 바뀌면 {커넥션 이름} ERD로 다시 채운다
  useEffect(() => {
    if (!open) return
    const selected = connections.data?.items.find((c) => c.connectionId === selectedId)
    if (selected) {
      form.setValue('modelName', t('reverse.defaultModelName', { name: selected.name }))
    }
  }, [selectedId, connections.data, open, form, t])

  /** 가져온 문서 좌표 재배치 — 서버는 그리드 좌표로 내려온다. 실패해도 문서 생성은
   *  성공 상태라 조용히 넘어간다(그리드 배치 유지, 에디터 자동 배치 버튼으로 복구 가능) */
  const applyAutoLayout = async (result: ReverseEngineeringResult) => {
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

  const handleSubmit = form.handleSubmit((values) => {
    reverseMutation.mutate(
      {
        connectionId: values.connectionId,
        body: {
          modelName: values.modelName.trim(),
          description: values.description.trim() || undefined,
        },
      },
      {
        onSuccess: (result) => {
          if (!result) return
          onOpenChange(false)
          form.reset()
          toast.success(
            t('reverse.successToast', {
              name: result.model.name,
              tables: result.tableCount,
              relationships: result.relationshipCount,
            }),
          )
          if (result.skipped.length > 0) {
            toast.warning(t('reverse.skippedToast', { skipped: result.skipped.join(', ') }))
          }
          void applyAutoLayout(result)
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  })

  const onOpen = (nextOpen: boolean) => {
    if (reverseMutation.isPending) return
    onOpenChange(nextOpen)
  }

  const items = connections.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('reverse.title')}</DialogTitle>
          <DialogDescription>{t('reverse.notice')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="connectionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('reverse.connection')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={items.length === 0 ? t('reverse.noConnection') : undefined}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {items.map((connection) => (
                        <SelectItem key={connection.connectionId} value={connection.connectionId}>
                          {connection.name} ({connection.host}:{connection.port})
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
              name="modelName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('reverse.modelName')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('reverse.modelNamePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.description')}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder={t('reverse.descriptionPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpen(false)} disabled={reverseMutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={reverseMutation.isPending || items.length === 0}>
                {reverseMutation.isPending ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <DatabaseZap aria-hidden />
                )}
                {t('reverse.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
