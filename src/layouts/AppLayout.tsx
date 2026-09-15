/**
 * 앱 셸 (storyboard 00-common §3.1 — 헤더·사이드바·본문·footer 4분할, S-03~S-11 공통)
 */
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { LanguageSelect } from '@/components/language-select'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from 'cn'
import { useMe } from '@/features/auth'
import { CreateWorkspaceDialog } from '@/features/workspaces'
import { AdminSidebar } from '@/layouts/components/admin-sidebar'
import { TeamSidebar } from '@/layouts/components/team-sidebar'
import { UserMenu } from '@/layouts/components/user-menu'
import { WorkspaceSidebar } from '@/layouts/components/workspace-sidebar'

export function AppLayout() {
  const { t } = useTranslation()
  const me = useMe()
  const location = useLocation()

  // 관리자 화면(/admin/*)은 관리자 메뉴로, 팀 화면(/teams/*)은 팀 리스트로 사이드바를 교체한다 (storyboard 00-common §3.1)
  const isAdminScreen = location.pathname.startsWith('/admin')
  const isTeamScreen = location.pathname.startsWith('/teams')

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 md:gap-6">
          <Link to="/dashboard" className="flex items-center gap-2 text-base font-semibold">
            <Logo className="size-5" />
            {t('common.appName')}
          </Link>

          <nav aria-label="primary" className="flex items-center gap-1">
            <NavLink to="/workspaces" className={navLinkClass}>
              {t('shell.nav.workspaces')}
            </NavLink>
            <NavLink to="/teams" className={navLinkClass}>
              {t('shell.nav.teams')}
            </NavLink>
            {me.data?.admin ? (
              <NavLink to="/admin/users" className={navLinkClass}>
                {t('shell.nav.admin')}
              </NavLink>
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <LanguageSelect />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {isAdminScreen ? <AdminSidebar /> : isTeamScreen ? <TeamSidebar /> : <WorkspaceSidebar />}
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>

      <footer className="border-t">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center px-4 text-xs text-muted-foreground">
          {t('common.footer')}
        </div>
      </footer>

      {/* 전역 생성 다이얼로그 — 사이드바 교체와 무관하게 항상 마운트(오픈 상태는 전역 스토어 공유) */}
      <CreateWorkspaceDialog />
    </div>
  )
}
