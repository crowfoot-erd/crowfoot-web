/**
 * 문서 공유 링크 다이얼로그 (08-core/02-model.md §1.10 — storyboard 02-user §5A)
 *
 * - 발급: 무제한(기간 제한 없음) 또는 시작·종료일 지정. 링크는 문서당 여러 개 둘 수 있다.
 * - 목록: 각 링크의 공개 주소(/share/{token}) 복사·기간 표시·철회(즉시 무효화).
 * - 공개 주소는 토큰을 아는 누구나 읽기 전용으로 열 수 있다 — 발급은 Editor 이상.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Link2, Loader2, Share2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import type { ModelShare } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { errorMessage } from '@/lib/result-code'
import { formatDateTime } from '@/lib/format'
import { useCreateModelShare, useModelShares, useRevokeModelShare } from '@/features/models/hooks'

export interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  modelId: string
  modelName: string
}

type PeriodMode = 'unlimited' | 'period'

/** datetime-local 값(로컬 시각) → ISO 문자열. 빈 값·해석 불가는 null */
function toIsoOrNull(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 클립보드 복사 — 비보환 컨텍스트(비HTTPS 등)는 임시 textarea 폴백 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

export function ShareDialog({ open, onOpenChange, workspaceId, modelId, modelName }: ShareDialogProps) {
  const { t } = useTranslation()
  const shares = useModelShares(workspaceId, modelId, open)
  const createShare = useCreateModelShare(workspaceId, modelId)
  const revokeShare = useRevokeModelShare(workspaceId, modelId)

  /** 링크 기간 표시 — 무제한 / 시작~종료 / 시작부터 / 종료까지 */
  const periodLabel = (share: ModelShare): string => {
    if (!share.startsAt && !share.endsAt) return t('model.share.period.unlimited')
    if (share.startsAt && share.endsAt) {
      return `${formatDateTime(share.startsAt)} ~ ${formatDateTime(share.endsAt)}`
    }
    if (share.startsAt) return t('model.share.period.from', { at: formatDateTime(share.startsAt) })
    return t('model.share.period.until', { at: formatDateTime(share.endsAt) })
  }

  const [mode, setMode] = useState<PeriodMode>('unlimited')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const issue = () => {
    if (mode === 'period') {
      const start = toIsoOrNull(startsAt)
      const end = toIsoOrNull(endsAt)
      if (!start || !end) {
        toast.error(t('model.share.error.incompletePeriod'))
        return
      }
      if (new Date(end).getTime() < new Date(start).getTime()) {
        toast.error(t('model.share.error.reversedPeriod'))
        return
      }
      createShare.mutate({ startsAt: start, endsAt: end }, {
        onSuccess: () => toast.success(t('model.share.issuedToast')),
        onError: (error) => toast.error(errorMessage(error)),
      })
      return
    }
    createShare.mutate({ startsAt: null, endsAt: null }, {
      onSuccess: () => toast.success(t('model.share.issuedToast')),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const copyLink = async (share: ModelShare) => {
    if (await copyText(shareLink(share.shareToken))) {
      toast.success(t('model.share.copiedToast'))
    } else {
      toast.error(t('model.share.copyFailed'))
    }
  }

  const revoke = (share: ModelShare) => {
    revokeShare.mutate(share.shareId, {
      onSuccess: () => toast.success(t('model.share.revokedToast')),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 aria-hidden className="size-4" />
            {t('model.share.title')}
          </DialogTitle>
          <DialogDescription>
            {t('model.share.description', { name: modelName })}
          </DialogDescription>
        </DialogHeader>

        {/* 발급 — 무제한 / 기간 지정 */}
        <div className="grid gap-3 rounded-md border p-3">
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as PeriodMode)}
            className="grid gap-2"
          >
            <Label className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="unlimited" />
              {t('model.share.period.unlimited')}
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="period" />
              {t('model.share.period.custom')}
            </Label>
          </RadioGroup>

          {mode === 'period' ? (
            <div className="grid grid-cols-2 gap-2 pl-6">
              <div className="grid gap-1">
                <Label htmlFor="share-starts-at" className="text-xs text-muted-foreground">
                  {t('model.share.period.startsAt')}
                </Label>
                <Input
                  id="share-starts-at"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="share-ends-at" className="text-xs text-muted-foreground">
                  {t('model.share.period.endsAt')}
                </Label>
                <Input
                  id="share-ends-at"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 px-2"
              onClick={issue}
              disabled={createShare.isPending}
            >
              {createShare.isPending ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              ) : (
                <Link2 aria-hidden className="size-3.5" />
              )}
              {t('model.share.issue')}
            </Button>
          </div>
        </div>

        {/* 목록 — 최근 발급순 */}
        <div className="grid gap-2" data-testid="share-list">
          {shares.isPending ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              <Loader2 aria-hidden className="mx-auto size-4 animate-spin" />
            </p>
          ) : shares.data && shares.data.items.length > 0 ? (
            shares.data.items.map((share) => (
              <div
                key={share.shareId}
                className="flex items-center gap-2 rounded-md border px-3 py-2"
                data-testid="share-item"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs" data-testid="share-token">
                    {shareLink(share.shareToken)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {periodLabel(share)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void copyLink(share)}
                  aria-label={t('model.share.copy')}
                  title={t('model.share.copy')}
                >
                  <Copy aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => revoke(share)}
                  disabled={revokeShare.isPending}
                  aria-label={t('model.share.revoke')}
                  title={t('model.share.revoke')}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))
          ) : (
            <p className="py-2 text-center text-sm text-muted-foreground">{t('model.share.empty')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 공개 주소 — 현재 오리진 + /share/{token} */
export function shareLink(token: string): string {
  return `${window.location.origin}/share/${token}`
}
