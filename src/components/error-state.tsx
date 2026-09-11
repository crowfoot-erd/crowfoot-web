/**
 * 데이터 로딩 실패 상태 (storyboard 00-common §4.1 패턴 B — 안내 문구 + 재시도)
 */
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <TriangleAlert aria-hidden className="h-10 w-10 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">{message ?? t('errors.loadFailed')}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden />
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  )
}
