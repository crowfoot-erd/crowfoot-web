/**
 * 공개 화면의 머리와 바닥 — 랜딩과 공유 문서 목록이 함께 쓴다 (04-front/storyboard/00-common.md S-00)
 *
 * 머리: 로고, 사용 가이드(새 창), 테마, 언어, 로그인 또는 사용자 메뉴. 바닥: 저작권, 버전, 사용 가이드, 약관.
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LanguageSelect } from '@/components/language-select'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/layouts/components/user-menu'
import { currentLanguage } from '@/lib/i18n'
import { APP_VERSION } from '@/lib/version'
import { useSessionStore } from '@/stores/session'

/** 지금 언어의 공개 경로 — ko는 접두가 없다 */
export function publicPath(path: string): string {
  return currentLanguage() === 'ko' ? path : `/${currentLanguage()}${path}`
}

export function PublicHeader() {
  const { t } = useTranslation()
  const authenticated = useSessionStore((state) => state.status) === 'authenticated'
  const guideHref = publicPath('/guide')
  return (
    <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
      <Link to={publicPath('/')} className="flex items-center gap-2 text-lg font-semibold">
        <Logo className="size-6" />
        {t('common.appName')}
        <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
          {t('common.appTagline')}
        </span>
      </Link>
      {/* 언어·테마는 행동 버튼 왼쪽 — 인증 상태 — 앱 셸과 같은 사용자 메뉴(정보·로그아웃)를 헤더에 둔다 */}
      <div className="flex items-center gap-1">
        {/* 사용 가이드 — 로그인하지 않아도 어떤 기능이 있는지 볼 수 있다(/guide) */}
        <Button asChild variant="ghost" size="sm">
          <a href={guideHref} target="_blank" rel="noopener noreferrer" data-testid="landing-guide-link">
            {t('guide.title')}
          </a>
        </Button>
        <ThemeToggle />
        <LanguageSelect />
        {authenticated ? (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard">{t('landing.cta.dashboard')}</Link>
            </Button>
            <UserMenu />
          </>
        ) : (
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">{t('landing.cta.login')}</Link>
          </Button>
        )}
      </div>
    </header>
  )
}

export function PublicFooter() {
  const { t } = useTranslation()
  const guideHref = publicPath('/guide')
  return (
    <footer className="border-t">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-3">
          <span>{t('common.footer')}</span>
          {/* 현재 버전 — 첫 방문에서도 지금 몇 버전인지 알 수 있게 (v1.17) */}
          <span data-testid="landing-current-version" className="tabular-nums">
            {t('landing.footer.currentVersion', { version: APP_VERSION })}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <a href={guideHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {t('landing.footer.guide')}
          </a>
          <Link to="/terms" className="hover:underline">
            {t('landing.footer.terms')}
          </Link>
          <span>{t('landing.footer.opensource')}</span>
        </span>
      </div>
    </footer>
  )
}
