/**
 * 태그 간 비교 — 버전 기록 다이얼로그 위쪽 줄 (08-core/13-model-versions.md §1.7, 05-editor/02-ui.md 버전 기록).
 *
 * 태그가 붙은 버전이 둘 이상이면 기준 태그와 대상 태그를 골라 비교 화면(버전 뷰어 ?compare)을 새 창으로 연다.
 * 고른 순서와 상관없이 오래된 쪽이 기준이다. 비교 화면에서 두 태그 사이의 마이그레이션 DDL도 받는다.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCompareArrows } from 'lucide-react'

import type { ModelVersionEntry } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTaggedModelVersions, versionRangeComparePath } from '@/features/models'

export interface TagCompareBarProps {
  workspaceId: string
  modelId: string
  /** 다이얼로그가 열려 있을 때만 읽는다 */
  enabled: boolean
}

export function TagCompareBar({ workspaceId, modelId, enabled }: TagCompareBarProps) {
  const tagged = useTaggedModelVersions(workspaceId, modelId, enabled)
  const items = tagged.data ?? []
  if (items.length < 2) return null
  // 태그 목록이 바뀌면(붙이기·지우기) 고른 값을 새 목록 기준으로 다시 잡는다
  return (
    <TagCompareForm
      key={items.map((item) => item.version).join(',')}
      workspaceId={workspaceId}
      modelId={modelId}
      items={items}
    />
  )
}

/** 최신순 태그 목록 — 처음에는 바로 앞 태그(기준) → 가장 최근 태그(대상) */
function TagCompareForm({
  workspaceId,
  modelId,
  items,
}: {
  workspaceId: string
  modelId: string
  items: ModelVersionEntry[]
}) {
  const { t } = useTranslation()
  const [base, setBase] = useState(String(items[1].version))
  const [target, setTarget] = useState(String(items[0].version))
  const same = base === target

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5" data-testid="tag-compare-bar">
      <span className="text-xs font-medium">{t('model.editor.history.tagCompare.title')}</span>
      <TagSelect
        value={base}
        onChange={setBase}
        items={items}
        label={t('model.editor.history.tagCompare.base')}
        testId="tag-compare-base"
      />
      <span aria-hidden className="text-xs text-muted-foreground">
        →
      </span>
      <TagSelect
        value={target}
        onChange={setTarget}
        items={items}
        label={t('model.editor.history.tagCompare.target')}
        testId="tag-compare-target"
      />
      {same ? (
        <Button type="button" size="sm" variant="outline" className="ml-auto h-7 gap-1 px-2 text-xs" disabled>
          <GitCompareArrows aria-hidden className="size-3" />
          {t('model.editor.history.tagCompare.open')}
        </Button>
      ) : (
        <Button asChild type="button" size="sm" variant="outline" className="ml-auto h-7 gap-1 px-2 text-xs">
          <a
            href={versionRangeComparePath(workspaceId, modelId, Number(base), Number(target))}
            target="_blank"
            rel="noreferrer"
            data-testid="tag-compare-open"
          >
            <GitCompareArrows aria-hidden className="size-3" />
            {t('model.editor.history.tagCompare.open')}
          </a>
        </Button>
      )}
    </div>
  )
}

/** 태그 고르기 — 항목은 "태그 · v{N}" */
function TagSelect({
  value,
  onChange,
  items,
  label,
  testId,
}: {
  value: string
  onChange: (next: string) => void
  items: ModelVersionEntry[]
  label: string
  testId: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-32 text-xs" aria-label={label} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.version} value={String(item.version)} className="text-xs">
            <span className="font-mono">{item.tag}</span>
            <span className="ml-1.5 text-muted-foreground">v{item.version}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
