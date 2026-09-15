/**
 * Crowfoot 로고 타일 — 관계선 까마귀발 마크(public/logo.svg, 원본은 .github/profile/logo.svg).
 * SVG 자체에 라운드 배경이 있어 테마와 무관하게 앱 아이콘처럼 놓인다 — 크기만 className으로.
 */
export function Logo({ className = 'size-6' }: { className?: string }) {
  return <img src="/logo.svg" alt="" aria-hidden className={className} />
}
