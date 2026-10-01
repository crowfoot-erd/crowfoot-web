/**
 * 로그인 제공자 상징 아이콘 — 로그인 화면의 「{제공자}로 계속하기」 버튼에 쓴다 (storyboard 01-auth §2).
 *
 * lucide v1은 브랜드 아이콘을 제공하지 않아 경로를 인라인했다(DbmsIcon과 같은 관례 — 의존성 없음).
 * GitHub는 단색 마크라 currentColor로 그려 라이트·다크 테마를 따라가고, Google은 4색 "G"다.
 * 모르는 제공자 코드는 중립 아이콘(Globe)으로 폴백한다 — 코드 테이블이 먼저 늘어나도 깨지지 않게.
 */
import { Globe } from 'lucide-react'

import { cn } from 'cn'

const GITHUB_PATH =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'

/** Google "G" — 조각별 브랜드색 */
const GOOGLE_PARTS: ReadonlyArray<{ color: string; path: string }> = [
  {
    color: '#4285F4',
    path: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z',
  },
  {
    color: '#34A853',
    path: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z',
  },
  {
    color: '#FBBC05',
    path: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z',
  },
  {
    color: '#EA4335',
    path: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z',
  },
]

export function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const code = provider.trim().toLowerCase()
  if (code === 'github') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" data-provider="github" className={cn('shrink-0', className)}>
        <path d={GITHUB_PATH} fill="currentColor" />
      </svg>
    )
  }
  if (code === 'google') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" data-provider="google" className={cn('shrink-0', className)}>
        {GOOGLE_PARTS.map((part) => (
          <path key={part.color} d={part.path} fill={part.color} />
        ))}
      </svg>
    )
  }
  return <Globe aria-hidden className={className} />
}
