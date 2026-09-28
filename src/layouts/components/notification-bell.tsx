/**
 * 알림 벨 (storyboard 00-common §3.1 [12] — v1.22, 계약 08-core/11-notification.md §6)
 * 안읽음 숫자 배지(9+ 캡, 0이면 숨김) — 미읽음 카운트를 30초 폴링한다(로그인 상태에서만).
 * 클릭 → 드롭다운 최근 10건(유형 문구·문서명·상대 시각·안읽음 점). 행 클릭 = 읽음 처리 후
 * 해당 문서로 이동, 하단 "모두 읽음"·"전체 보기"(S-14 /notifications).
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { NotificationItem } from '@/api/types'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/features/notifications'
import { timeAgo } from '@/lib/time-ago'

const DROPDOWN_SIZE = 10

export function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const unread = useUnreadNotificationCount()
  const notifications = useNotifications(1, DROPDOWN_SIZE, open)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const count = unread.data ?? 0

  /** 행 클릭 — 읽음 처리(PATCH) 후 문서로 이동. 타인 id·직전 삭제 404는 조용히 무시하고 이동하지 않는다 */
  const openNotification = (item: NotificationItem) => {
    markRead.mutate(item.id, {
      onSuccess: () => {
        setOpen(false)
        navigate(`/workspaces/${item.workspaceId}/models/${item.modelId}`)
      },
    })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('shell.notifications.bell')}
          className="relative"
        >
          <Bell aria-hidden className="h-4 w-4" />
          {count > 0 ? (
            <span
              data-testid="notification-badge"
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
            >
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-2 py-1.5 text-sm font-medium">{t('shell.notifications.title')}</div>
        {notifications.isPending ? (
          <div className="flex flex-col gap-2 px-2 py-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : notifications.isError ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t('common.loadFailed')}
          </div>
        ) : notifications.data && notifications.data.items.length > 0 ? (
          <div className="max-h-80 overflow-y-auto">
            {notifications.data.items.map((item) => (
              <DropdownMenuItem key={item.id} className="flex-col items-start gap-0.5 py-2" onSelect={() => openNotification(item)}>
                <span className="flex w-full items-center gap-1.5 text-sm">
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full ${item.read ? 'bg-transparent border border-muted-foreground/40' : 'bg-primary'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`shell.notifications.type.${item.type}`, {
                      actor: item.actorDisplayName ?? '',
                      model: item.modelName,
                    })}
                  </span>
                </span>
                <span className="pl-3 text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ) : (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t('shell.notifications.empty')}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={count === 0 || markAll.isPending}
          onSelect={() => markAll.mutate()}
          className="gap-1.5"
        >
          <CheckCheck aria-hidden className="h-4 w-4" />
          {t('shell.notifications.markAll')}
        </DropdownMenuItem>
        {/* 전체 보기 — 드롭다운을 닫고 S-14로(메뉴 액션과 경합하지 않게 링크는 asChild) */}
        <DropdownMenuItem asChild>
          <Link to="/notifications" onClick={() => setOpen(false)} className="justify-center">
            {t('shell.notifications.viewAll')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
