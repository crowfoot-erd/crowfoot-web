/**
 * 사이트 신고 다이얼로그 (08-core/19-site-showcase.md Section 3.7)
 *
 * - 사유는 선택(500자 이하). 같은 사람이 다시 신고해도 성공(멱등)이라 같은 안내를 띄운다
 * - 신고가 3건 쌓이면 서버가 자동으로 숨긴다 — 화면은 목록을 다시 읽을 뿐 따로 알리지 않는다
 */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ShowcaseSite } from '@/features/showcase/api'
import { useReportShowcaseSite } from '@/features/showcase/hooks'
import { errorMessage } from '@/lib/result-code'

const REASON_MAX = 500

export function ReportSiteDialog({
  site,
  onOpenChange,
}: {
  site: ShowcaseSite | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const reportMutation = useReportShowcaseSite()
  const [reason, setReason] = useState('')

  // 열릴 때마다 사유를 비운다
  useEffect(() => {
    if (site) setReason('')
  }, [site])

  const onOpen = (nextOpen: boolean) => {
    if (reportMutation.isPending) return
    if (!nextOpen) onOpenChange(false)
  }

  const submit = () => {
    if (!site) return
    reportMutation.mutate(
      { siteId: site.siteId, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          onOpenChange(false)
          toast.success(t('showcase.report.successToast'))
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <Dialog open={site !== null} onOpenChange={onOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('showcase.report.title')}</DialogTitle>
          <DialogDescription>{t('showcase.report.notice', { title: site?.title ?? '' })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="showcase-report-reason">{t('showcase.report.reason')}</Label>
          <Textarea
            id="showcase-report-reason"
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('showcase.report.reasonPlaceholder')}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpen(false)} disabled={reportMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={reportMutation.isPending}>
            {reportMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t('showcase.report.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
