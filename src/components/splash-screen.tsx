/**
 * 부트스트랩 스플래시 (storyboard 00-common §3.2 — 로그인 상태 확인 중 / 서버 오류+재시도)
 */
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface SplashScreenProps {
  error?: boolean
  onRetry?: () => void
}

export function SplashScreen({ error = false, onRetry }: SplashScreenProps) {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-svh flex-col items-center justify-center gap-4"
    >
      <div className="flex items-center gap-2 text-lg font-semibold">
        <span aria-hidden className="text-primary">✳</span>
        {t('common.appName')}
      </div>
      {error ? (
        <>
          <p className="text-sm text-muted-foreground">{t('errors.bootstrapFailed')}</p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <Loader2 aria-hidden className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="sr-only">{t('common.loading')}</span>
        </>
      )}
    </div>
  )
}
