/**
 * 관리자 사이드바 (storyboard 00-common §3.1 — /admin/*에서 워크스페이스 트리를 대체)
 * 사용자 관리·코드 테이블·감사 로그 메뉴 + 하단 워크스페이스 복귀 링크.
 * 새 워크스페이스 생성은 관리자 화면에서 노출하지 않는다.
 */
import { Link, NavLink } from 'react-router-dom'
import { ArrowLeft, DatabaseZap, ScrollText, Table2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from 'cn'

export function AdminSidebar() {
  const { t } = useTranslation()

  const menuClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-muted text-foreground'
        : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground',
    )

  return (
    <aside className="hidden w-64 shrink-0 border-r md:block">
      <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] flex-col gap-2 overflow-y-auto p-3">
        <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('shell.sidebar.adminTitle')}
        </p>

        <nav aria-label={t('shell.sidebar.adminTitle')} className="flex flex-col gap-0.5">
          <NavLink to="/admin/users" className={menuClass}>
            <Users aria-hidden className="h-4 w-4 text-muted-foreground" />
            {t('shell.sidebar.adminUsers')}
          </NavLink>
          <NavLink to="/admin/codes" className={menuClass}>
            <Table2 aria-hidden className="h-4 w-4 text-muted-foreground" />
            {t('shell.sidebar.adminCodes')}
          </NavLink>
          <NavLink to="/admin/managed" className={menuClass}>
            <DatabaseZap aria-hidden className="h-4 w-4 text-muted-foreground" />
            {t('shell.sidebar.adminManaged')}
          </NavLink>
          <NavLink to="/admin/audit-logs" className={menuClass}>
            <ScrollText aria-hidden className="h-4 w-4 text-muted-foreground" />
            {t('shell.sidebar.adminAuditLogs')}
          </NavLink>
        </nav>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-auto w-full justify-start text-muted-foreground"
          asChild
        >
          <Link to="/workspaces">
            <ArrowLeft aria-hidden />
            {t('shell.sidebar.backToWorkspaces')}
          </Link>
        </Button>
      </div>
    </aside>
  )
}
