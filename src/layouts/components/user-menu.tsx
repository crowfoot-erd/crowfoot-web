/**
 * 사용자 드롭다운 (storyboard 00-common §3.1 [6]~[8])
 * 내 정보(이메일·가입일·연결 계정 배지) · 로그아웃(즉시 실행)
 * 관리자 메뉴는 코드 테이블 링크 대신 /admin/* 좌측 사이드바로 노출한다.
 */
import { ChevronDown, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useLogout, useMe } from '@/features/auth'
import { formatDate } from '@/lib/format'

export function UserMenu() {
  const { t } = useTranslation()
  const me = useMe()
  const logout = useLogout()

  if (me.isPending) {
    return <Skeleton className="h-8 w-8 rounded-full" aria-label={t('common.loading')} />
  }

  const profile = me.data
  if (!profile) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" className="gap-2 px-2">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          >
            {profile.name.charAt(0)}
          </span>
          <span className="hidden max-w-32 truncate text-sm md:inline">{profile.name}</span>
          <ChevronDown aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{profile.name}</p>
          <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {profile.providers.map((provider) => (
              <Badge key={provider} variant="secondary" className="text-[10px]">
                {t(`common.provider.${provider}`, { defaultValue: provider })}
              </Badge>
            ))}
            {profile.admin ? (
              <Badge variant="outline" className="text-[10px]">
                {t('common.admin')}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('shell.userMenu.joinedAt')}: {formatDate(profile.createdAt)}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            logout.mutate()
          }}
        >
          <LogOut aria-hidden />
          {t('shell.userMenu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
