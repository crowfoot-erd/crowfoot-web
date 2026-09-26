/**
 * 템플릿 갤러리 다이얼로그 (04-front/02-workspace.md §5 "템플릿으로 시작" — 08-core/09-templates.md)
 *
 * - 공개 목록(무인증) 카드: 이름·설명·DBMS 배지·테이블/관계 수·수정일. 본문은 오지 않는다.
 *   카드 표기는 한국어 단일(template-display 표시맵 — 현지화 문서도 한국어로, 문서 자체는 그대로).
 * - 미리보기는 그 문서의 활성 공유 링크(shareToken)가 있을 때만 — 기존 공개 뷰어(/share/{token})를
 *   새 탭으로 연다. 링크 없는 템플릿은 미리보기 없이 복제만 가능하다.
 * - 복제: 카드 선택 → 이름(기본=원본 이름, 대상 워크스페이스 내 중복이면 409) → 생성된 문서를
 *   새 창 에디터로 연다. content는 서버가 한 트랜잭션으로 통째로 복사한다(레이아웃 포함).
 */
import { ExternalLink, LayoutTemplate, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { TemplateSummary } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'
import { modelEditorPath } from '@/features/models/api'
import { useCloneFromTemplate, useTemplates } from '@/features/models/hooks'
import { templateDisplay } from '@/features/models/template-display'
import { cn } from 'cn'

export interface TemplateGalleryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

export function TemplateGalleryDialog({ open, onOpenChange, workspaceId }: TemplateGalleryDialogProps) {
  const { t } = useTranslation()
  const templates = useTemplates()
  const cloneMutation = useCloneFromTemplate(workspaceId)
  const [selected, setSelected] = useState<TemplateSummary | null>(null)
  const [name, setName] = useState('')

  // 카드 선택 시 이름 기본값은 카드에 보인 한국어 이름 — 그대로 쓰거나 고쳐 쓴다(409 완화)
  useEffect(() => {
    setName(selected ? templateDisplay(selected).name : '')
  }, [selected])

  const close = (nextOpen: boolean) => {
    if (cloneMutation.isPending) return
    if (!nextOpen) setSelected(null)
    onOpenChange(nextOpen)
  }

  const handleClone = () => {
    if (!selected) return
    cloneMutation.mutate(
      { templateModelId: selected.modelId, name: name.trim() || undefined },
      {
        onSuccess: (model) => {
          if (!model) return
          close(false)
          toast.success(t('model.templates.successToast', { name: model.name }))
          window.open(modelEditorPath(workspaceId, model.modelId), '_blank', 'noopener,noreferrer')
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const items = templates.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('model.templates.title')}</DialogTitle>
          <DialogDescription>{t('model.templates.notice')}</DialogDescription>
        </DialogHeader>

        {templates.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : templates.isError ? (
          <p className="text-sm text-muted-foreground">{t('model.templates.error')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('model.templates.empty')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2" role="list">
            {items.map((template) => {
              const isSelected = selected?.modelId === template.modelId
              const display = templateDisplay(template)
              return (
                <div
                  key={template.modelId}
                  role="listitem"
                  // 카드 전체가 선택 영역 — 버튼이 아니어도 목록 선택 패턴으로 스크린리더 접근
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => setSelected(template)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelected(template)
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
                    'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected && 'border-primary bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {template.databaseType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(template.updatedAt)}</span>
                  </div>
                  <p className="font-medium">{display.name}</p>
                  {display.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{display.description}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {t('model.templates.counts', {
                      tables: template.tableCount,
                      relationships: template.relationshipCount,
                    })}
                  </p>
                  {template.shareToken ? (
                    <a
                      href={`/share/${template.shareToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      // 카드 선택과 분리된 동작 — 전파를 끊어 미리보기 클릭이 선택을 바꾸지 않게 한다
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink aria-hidden className="size-3" />
                      {t('model.templates.preview')}
                    </a>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {selected ? (
          <DialogFooter className="items-center gap-2 sm:gap-0">
            <label className="flex flex-1 items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">{t('model.templates.nameLabel')}</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={templateDisplay(selected).name}
                aria-label={t('model.templates.nameLabel')}
                className="h-8"
              />
            </label>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={cloneMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={handleClone} disabled={cloneMutation.isPending || name.trim().length === 0}>
              {cloneMutation.isPending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <LayoutTemplate aria-hidden />
              )}
              {t('model.templates.clone')}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
