/**
 * 빈 상태 (storyboard 00-common §5 — 일러스트 + 제목 + 설명 + CTA)
 */
import type { ReactNode } from 'react'

import { SearchIllustration, TeamIllustration, WorkspaceIllustration } from '@/components/illustrations'

export type EmptyIllustration = 'workspace' | 'team' | 'search'

const ILLUSTRATIONS: Record<EmptyIllustration, ReactNode> = {
  workspace: <WorkspaceIllustration />,
  team: <TeamIllustration />,
  search: <SearchIllustration />,
}

interface EmptyStateProps {
  illustration?: EmptyIllustration
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ illustration = 'search', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-6 py-12 text-center">
      {ILLUSTRATIONS[illustration]}
      <div className="space-y-1">
        <p className="text-base font-medium">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
