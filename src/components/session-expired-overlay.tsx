/**
 * 세션 만료 오버레이 모달 (storyboard 00-common §4.1)
 *
 * 치명 401(AUTH_TOKEN_INVALID·AUTH_SESSION_REVOKED·refresh 실패) 수신 시 표시.
 * 닫기 불가 — [다시 로그인]으로만 해소되며, 이동 시 현재 경로를 ?next=로 보존한다.
 * 다른 탭에서 발생한 만료도 BroadcastChannel로 수신해 동일하게 표시된다.
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { subscribeSessionExpired } from '@/api/client'
import { resultCodeMessage } from '@/lib/result-code'
import { useSessionStore } from '@/stores/session'

export function SessionExpiredOverlay() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const reason = useSessionStore((state) => state.sessionExpiredReason)
  const expireSession = useSessionStore((state) => state.expireSession)
  const clearSession = useSessionStore((state) => state.clearSession)

  // 이벤트(같은 탭 window + 다른 탭 BroadcastChannel)를 스토어로 전달
  useEffect(() => {
    return subscribeSessionExpired(({ resultCode }) => expireSession(resultCode))
  }, [expireSession])

  if (!reason) return null

  const handleLoginAgain = () => {
    // 만료 사유 해제 — 재로그인 후 next로 복귀했을 때 오버레이가 다시 뜨지 않게
    clearSession()
    const next = location.pathname + location.search
    navigate(`/login?next=${encodeURIComponent(next)}`)
  }

  return (
    <Dialog open>
      <DialogContent className="max-w-sm" showCloseButton={false} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('auth.sessionExpired.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{resultCodeMessage(reason)}</p>
        <div className="mt-2 flex justify-end">
          <Button type="button" onClick={handleLoginAgain}>
            {t('auth.sessionExpired.loginAgain')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
