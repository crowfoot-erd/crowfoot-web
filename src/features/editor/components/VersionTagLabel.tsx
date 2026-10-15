/**
 * 버전 태그 표시 — 버전 번호 옆의 배지(이름)와 설명 (08-core/13-model-versions.md §1.7).
 * 버전 기록 다이얼로그 행과 버전 뷰어 머리가 함께 쓴다. 태그가 없으면 그리지 않는다.
 */
import { Tag } from 'lucide-react'

import type { ModelVersionEntry } from '@/api/types'
import { Badge } from '@/components/ui/badge'

export function VersionTagLabel({ entry }: { entry: Pick<ModelVersionEntry, 'tag' | 'tagDescription'> }) {
  if (!entry.tag) return null
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs" data-testid="version-tag">
      <Badge
        variant="outline"
        className="h-4 shrink-0 gap-0.5 border-emerald-500/50 px-1.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
      >
        <Tag aria-hidden className="size-2.5" />
        {entry.tag}
      </Badge>
      {entry.tagDescription ? (
        <span className="truncate text-muted-foreground" title={entry.tagDescription}>
          {entry.tagDescription}
        </span>
      ) : null}
    </span>
  )
}
