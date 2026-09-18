/**
 * 커뮤니티 사이드바 (storyboard 00-common §3.1 — /community/*에서 워크스페이스 트리를 대체)
 * 릴리스 노트·제안 및 신고 게시판 메뉴 + 하단 워크스페이스 복귀 링크.
 * 관리자 메뉴(admin-sidebar)와 동일 구조 — 로그인 사용자 누구나 접근한다(쓰기 권한은 게시판별).
 */
import { Link, NavLink } from 'react-router-dom'
import { ArrowLeft, Megaphone, ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from 'cn'

export function CommunitySidebar() {
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
          {t('shell.sidebar.communityTitle')}
        </p>

        <nav aria-label={t('shell.sidebar.communityTitle')} className="flex flex-col gap-0.5">
          <NavLink to="/community/release-notes" className={menuClass}>
            <ScrollText aria-hidden className="h-4 w-4 text-muted-foreground" />
            {t('shell.sidebar.communityReleaseNotes')}
          </NavLink>
          <NavLink to="/community/feedback" className={menuClass}>
            <Megaphone aria-hidden className="h-4 w-4 text-muted-foreground" />
            {t('shell.sidebar.communityFeedback')}
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
