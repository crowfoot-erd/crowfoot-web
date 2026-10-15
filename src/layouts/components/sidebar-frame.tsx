/**
 * 사이드바 틀 (storyboard 00-common §3.1) — 데스크톱(md 이상)은 왼쪽 고정 aside,
 * 폰의 메뉴 서랍(MobileNav)에서는 같은 내용을 틀 없이 쌓는다. 사이드바 내용은 하나로 두고 틀만 바꾼다.
 */
import type { ReactNode } from 'react'

export function SidebarFrame({ inDrawer = false, children }: { inDrawer?: boolean; children: ReactNode }) {
  if (inDrawer) return <div className="flex flex-col gap-2">{children}</div>
  return (
    <aside className="hidden w-64 shrink-0 border-r md:block">
      <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] flex-col gap-2 overflow-y-auto p-3">{children}</div>
    </aside>
  )
}
