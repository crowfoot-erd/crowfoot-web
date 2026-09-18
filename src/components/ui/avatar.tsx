/**
 * 아바타 — 제공자 프로필 사진(GitHub)이 있으면 이미지, 없으면 이름 첫 글자 이니셜 원.
 * 외부 이미지는 로드 실패(onError) 시 이니셜로 돌아가고, https:// 스킴만 허용한다.
 * 크기·색은 className으로 정한다(기본은 presence 칩의 primary 조합).
 */
import { useState } from 'react'

import { cn } from 'cn'

/** 이니셜 — 첫 글자(서로게이트 안전). 빈 이름 방어 */
export const initialOf = (name: string): string => [...name.trim()][0]?.toUpperCase() ?? '?'

interface AvatarProps {
  name: string
  avatarUrl?: string | null
  className?: string
}

export function Avatar({ name, avatarUrl, className }: AvatarProps) {
  // 실패한 URL만 기억 — URL이 바뀌면(다른 사용자·갱신) 다시 이미지를 시도한다
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (avatarUrl && avatarUrl.startsWith('https://') && failedUrl !== avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setFailedUrl(avatarUrl)}
        className={cn('rounded-full bg-muted object-cover', className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground',
        className,
      )}
    >
      {initialOf(name)}
    </span>
  )
}
