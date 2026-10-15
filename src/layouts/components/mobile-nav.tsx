/**
 * 폰 메뉴 서랍 (storyboard 00-common §3.1, v1.46) — md 미만에서 머리의 메뉴 버튼(☰)으로 왼쪽에서 연다.
 *
 * 폰에서는 사이드바(aside)가 보이지 않고 머리에 메뉴를 다 담을 폭도 없다. 그래서 서랍 하나에
 * 주 메뉴(워크스페이스·팀·커뮤니티·관리자·사용 가이드·시작 페이지)와 지금 화면의 사이드바(관리자 메뉴 등),
 * 테마·언어 설정을 모은다. 주소가 바뀌면(메뉴를 누르면) 닫는다.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Menu, X } from 'lucide-react'

import { LanguageSelect } from '@/components/language-select'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'

export interface MobileNavProps {
  /** 관리자에게만 관리자 메뉴를 보인다 */
  admin: boolean
  /** 지금 화면의 사이드바 내용(서랍용) */
  sidebar: ReactNode
}

export function MobileNav({ admin, sidebar }: MobileNavProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  // 메뉴를 눌러 주소가 바뀌면 서랍을 닫는다
  useEffect(() => {
    setOpen(false)
  }, [location.pathname, location.search])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
      isActive
        ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
        : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground',
    )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label={t('shell.nav.menu')} data-testid="mobile-nav-open">
          <Menu aria-hidden />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 md:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-80 flex-col border-r bg-background shadow-lg outline-none data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left md:hidden"
          data-testid="mobile-nav"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <DialogPrimitive.Title asChild>
              <Link to="/dashboard" className="flex items-center gap-2 text-base font-semibold">
                <Logo className="size-5" />
                {t('common.appName')}
              </Link>
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{t('shell.nav.menu')}</DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t('common.close')}>
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            <nav aria-label="primary-mobile" className="flex flex-col gap-0.5">
              <NavLink to="/workspaces" className={linkClass}>
                {t('shell.nav.workspaces')}
              </NavLink>
              <NavLink to="/teams" className={linkClass}>
                {t('shell.nav.teams')}
              </NavLink>
              <NavLink to="/community" className={linkClass}>
                {t('shell.nav.community')}
              </NavLink>
              {admin ? (
                <NavLink to="/admin/users" className={linkClass}>
                  {t('shell.nav.admin')}
                </NavLink>
              ) : null}
              <a href="/guide" target="_blank" rel="noopener noreferrer" className={linkClass({ isActive: false })}>
                {t('guide.title')}
              </a>
              <Link to="/" className={linkClass({ isActive: false })}>
                {t('shell.nav.home')}
              </Link>
            </nav>

            <div className="border-t pt-3">{sidebar}</div>
          </div>

          <div className="flex shrink-0 items-center gap-1 border-t px-3 py-2">
            <ThemeToggle />
            <LanguageSelect />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
