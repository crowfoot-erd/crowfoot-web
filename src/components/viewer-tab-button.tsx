/**
 * 뷰어 하단 탭 바 버튼 (v1.21 후속 — 공개 뷰어·에디터 화면이 같은 디자인을 쓴다)
 *
 * 활성 탭은 primary 필(bg-primary/10), 배지는 댓글 수 칩(좋아요는 합산하지 않는다 —
 * 섹션 헤더 [♥ n] 칩이 담당).
 * role=tab 부모(nav role=tablist) 안에서.
 */
export function ViewerTabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {label}
      {badge !== undefined ? (
        <span
          className={`rounded-full px-1.5 text-xs tabular-nums ${
            active ? 'bg-primary/15' : 'bg-muted'
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}
