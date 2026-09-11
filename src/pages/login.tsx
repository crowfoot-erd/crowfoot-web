/**
 * S-01 로그인 (storyboard 01-auth §2)
 *
 * - providers 공개 API로 버튼 동적 생성 (활성 제공자만)
 * - 클릭 → sessionStorage에 provider·next 저장 → 풀페이지 이동(302, fetch 금지)
 * - 상태: 로딩(스켈레톤 2) / 실패(문구+재시도) / 0건 안내
 * - 이미 인증 상태면 next||/ 로 이동
 * - 우하단 언어·테마 토글
 */
import { Navigate, useSearchParams } from 'react-router-dom'
import { Globe, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LanguageSelect } from '@/components/language-select'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProviders } from '@/features/auth'
import { startOAuthLogin } from '@/features/auth'
import { useSessionStore } from '@/stores/session'

// lucide v1은 브랜드 아이콘(Github 등)을 제공하지 않는다 — 중립 아이콘 사용
const PROVIDER_ICONS: Record<string, typeof Globe> = { github: Globe, google: Globe }

export function LoginPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const status = useSessionStore((state) => state.status)
  const providers = useProviders()
  const nextParam = searchParams.get('next') ?? undefined

  // 이미 로그인 상태 — 로그인 화면을 다시 보지 않는다
  if (status === 'authenticated') {
    return <Navigate to={nextParam && nextParam.startsWith('/') ? nextParam : '/'} replace />
  }

  const handleClickProvider = (code: string) => {
    startOAuthLogin(code, nextParam)
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 text-2xl font-semibold">
          <span aria-hidden className="text-primary">
            ✳
          </span>
          {t('common.appName')}
        </div>
        <h1 className="text-lg font-medium">{t('auth.login.title')}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t('auth.login.description')}</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3" aria-busy={providers.isPending}>
        {providers.isPending ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : providers.isError ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-sm text-muted-foreground">{t('auth.login.loadFailed')}</p>
            <ErrorState message={undefined} onRetry={() => void providers.refetch()} />
          </div>
        ) : providers.data && providers.data.items.length > 0 ? (
          providers.data.items.map((provider) => {
            const Icon = PROVIDER_ICONS[provider.code] ?? Globe
            return (
              <Button
                key={provider.code}
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => handleClickProvider(provider.code)}
              >
                <Icon aria-hidden />
                {t('auth.login.continueWith', { provider: provider.displayName })}
              </Button>
            )
          })
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-medium">{t('auth.login.noProviders.title')}</p>
            <p className="text-sm text-muted-foreground">{t('auth.login.noProviders.description')}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => void providers.refetch()}
            >
              <RefreshCw aria-hidden />
              {t('common.retry')}
            </Button>
          </div>
        )}
      </div>

      <div className="fixed bottom-4 right-4 flex items-center gap-1">
        <ThemeToggle />
        <LanguageSelect />
      </div>
    </div>
  )
}
