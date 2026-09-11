/**
 * 빈 상태 일러스트 (storyboard 00-common §5 — unDraw 스타일)
 *
 * unDraw 에셋을 프로젝트에 내장하기 위한 임시 플레이스홀더 일러스트.
 * 토큰 기반(muted) 색만 사용해 라이트/다크 모드 모두 대응된다.
 * TODO: unDraw(co) 라이선스 SVG로 교체 예정
 */
import type { ReactNode } from 'react'

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 200 140"
      role="img"
      aria-label={label}
      className="h-32 w-auto text-muted-foreground/70"
      fill="none"
    >
      {children}
    </svg>
  )
}

/** 워크스페이스 빈 상태 */
export function WorkspaceIllustration() {
  return (
    <Frame label="workspace">
      <rect x="30" y="30" width="86" height="62" rx="8" className="fill-muted" />
      <rect x="84" y="46" width="86" height="62" rx="8" className="fill-background stroke-current" strokeWidth="2" />
      <rect x="100" y="64" width="52" height="6" rx="3" className="fill-current opacity-40" />
      <rect x="100" y="78" width="36" height="6" rx="3" className="fill-current opacity-25" />
      <rect x="46" y="46" width="52" height="6" rx="3" className="fill-current opacity-40" />
      <rect x="46" y="60" width="36" height="6" rx="3" className="fill-current opacity-25" />
    </Frame>
  )
}

/** 팀 빈 상태 */
export function TeamIllustration() {
  return (
    <Frame label="team">
      <circle cx="70" cy="56" r="18" className="fill-muted stroke-current" strokeWidth="2" />
      <circle cx="130" cy="56" r="18" className="fill-background stroke-current" strokeWidth="2" />
      <path d="M46 108c0-16 11-26 24-26s24 10 24 26" className="fill-muted stroke-current" strokeWidth="2" strokeLinejoin="round" />
      <path d="M106 108c0-16 11-26 24-26s24 10 24 26" className="fill-background stroke-current" strokeWidth="2" strokeLinejoin="round" />
    </Frame>
  )
}

/** 검색 결과 없음 */
export function SearchIllustration() {
  return (
    <Frame label="search">
      <circle cx="88" cy="60" r="28" className="fill-muted stroke-current" strokeWidth="3" />
      <line x1="109" y1="81" x2="134" y2="106" className="stroke-current" strokeWidth="6" strokeLinecap="round" />
      <rect x="76" y="48" width="24" height="6" rx="3" className="fill-current opacity-40" />
      <rect x="76" y="60" width="16" height="6" rx="3" className="fill-current opacity-25" />
    </Frame>
  )
}
