/**
 * S-02 OAuth2 콜백 (storyboard 01-auth §3)
 *
 * mount 1회 자동 처리:
 * 1. 쿼리 파싱 — code·state 모두 없으면 조용히 /login
 * 2. provider = sessionStorage 읽고 즉시 제거 (없으면 무효 진입 오류)
 * 3. POST 교환 1회 (재시도 없음)
 * 4. 성공 → Access 메모리 저장 → replaceState로 쿼리 제거 → next||/
 * 5. 실패 → resultCode별 오류 + 다시 로그인
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { isApiError, setAccessToken } from '@/api/client'
import { exchangeOAuthCode } from '@/features/auth'
import { consumeOAuthNext, consumeOAuthProvider } from '@/features/auth'
import { resultCodeMessage } from '@/lib/result-code'
import { useSessionStore } from '@/stores/session'

type CallbackState = 'processing' | 'failed'

export function AuthCallbackPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const signIn = useSessionStore((state) => state.signIn)
  const [state, setState] = useState<CallbackState>('processing')
  const [failureCode, setFailureCode] = useState<string>('AUTH_STATE_INVALID')

  // mount 1회 — StrictMode 이중 실행 방지
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    const stateParam = params.get('state')

    const finishLogin = (accessToken: string) => {
      setAccessToken(accessToken)
      signIn()
      // code·state가 주소창·히스토리에 남지 않게
      window.history.replaceState(null, '', location.pathname)
      const next = consumeOAuthNext()
      navigate(next && next.startsWith('/') ? next : '/', { replace: true })
    }

    // 1. 무효 진입 — 조용히 로그인으로
    if (!code && !stateParam) {
      navigate('/login', { replace: true })
      return
    }
    // 하나만 없음 → 오류
    if (!code || !stateParam) {
      setFailureCode('AUTH_STATE_INVALID')
      setState('failed')
      return
    }

    // 2. provider 복원 — 읽은 즉시 제거
    const provider = consumeOAuthProvider()
    if (!provider) {
      setFailureCode('AUTH_STATE_INVALID')
      setState('failed')
      return
    }

    // 3. 교환 1회
    void exchangeOAuthCode(provider, code, stateParam)
      .then((result) => {
        if (result?.accessToken) {
          finishLogin(result.accessToken)
        } else {
          setFailureCode('AUTH_PROVIDER_ERROR')
          setState('failed')
        }
      })
      .catch((error: unknown) => {
        setFailureCode(isApiError(error) ? error.resultCode : 'AUTH_PROVIDER_ERROR')
        setState('failed')
      })
  }, [location.pathname, location.search, navigate, signIn])

  if (state === 'processing') {
    return (
      <div role="status" aria-live="polite" className="flex min-h-svh flex-col items-center justify-center gap-4">
        <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('auth.callback.processing')}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <TriangleAlert aria-hidden className="h-10 w-10 text-muted-foreground/60" />
      <h1 className="text-lg font-semibold">{t('auth.callback.failedTitle')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{resultCodeMessage(failureCode)}</p>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link to="/login">{t('auth.callback.backToLogin')}</Link>
      </Button>
    </div>
  )
}
