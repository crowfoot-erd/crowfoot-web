/**
 * 버전 비교 사이드바 (08-core/02-model.md §1.11.3 — 버전 뷰어 ?compare=N)
 *
 * 최신 버전 캔버스에 배지를 얹는 대신 이 패널은 "무엇이 달라졌는지" 목록을 맡는다 —
 * 테이블별 그룹핑(SyncDialog DiffPreview 패턴) + 기준 버전에서 사라진 테이블 섹션.
 * 캔버스에 노드가 없는 remove는 여기서만 보인다. kind·action 문구는 버전 기록
 * (history.kind·history.action) 렌더를 그대로 재사용한다.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { diffItemDisplayName } from '@/features/editor/model/doc-diff'
import type { DocumentDiffSummary, DocDiffItem } from '@/features/editor/model/doc-diff'
import type { TableChangeClassification } from '@/features/editor/model/version-compare'

export interface VersionComparePanelProps {
  /** 기준(과거) 버전 번호 — v{from} → v{to} 표기 */
  baseVersion: number
  /** 대상(현재 화면) 버전 번호 */
  targetVersion: number
  diff: DocumentDiffSummary
  classification: TableChangeClassification
}

export function VersionComparePanel({ baseVersion, targetVersion, diff, classification }: VersionComparePanelProps) {
  const { t } = useTranslation()

  const counts = useMemo(() => {
    const acc: Record<string, number> = { add: 0, update: 0, remove: 0, move: 0 }
    for (const item of diff.items) acc[item.action] += 1
    return acc
  }, [diff])

  // 테이블별 그룹핑 — remove 항목의 table은 사라진 테이블 섹션이 대신하므로 여기선 뺀다
  const groups = useMemo(() => {
    const removed = new Set(classification.removed)
    const map = new Map<string, DocDiffItem[]>()
    for (const item of diff.items) {
      if (item.action === 'remove' && removed.has(item.kind === 'table' ? item.name : item.table)) continue
      const table = item.kind === 'table' ? item.name : item.table
      const key = table === '' ? t('model.editor.compare.noTableGroup') : table
      const list = map.get(key)
      if (list) list.push(item)
      else map.set(key, [item])
    }
    return [...map.entries()]
  }, [diff, classification, t])

  return (
    <aside
      data-testid="version-compare-panel"
      aria-label={t('model.editor.compare.title')}
      className="flex w-80 shrink-0 flex-col border-l bg-background"
    >
      <div className="border-b px-3 py-2">
        <p className="text-sm font-semibold">{t('model.editor.compare.title')}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {t('model.editor.compare.range', { from: baseVersion, to: targetVersion })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {diff.layoutOnly
            ? t('model.editor.history.render.layoutOnly')
            : t('model.editor.history.render.counts', counts)}
          {diff.truncated ? ` · ${t('model.editor.history.render.truncated')}` : ''}
        </p>
        {/* layout-only 비교는 배지가 붙을 구조 변경이 없다 — 안내 문구도 그에 맞게 */}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {diff.layoutOnly
            ? t('model.editor.compare.canvasNoteLayoutOnly')
            : t('model.editor.compare.canvasNote', { to: targetVersion })}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t('model.editor.compare.noChanges')}
          </p>
        ) : (
          <ul>
            {groups.map(([table, items]) => (
              <li key={table} className="border-b last:border-b-0">
                <p className="break-all bg-muted/40 px-3 py-1 font-mono text-xs font-medium">{table}</p>
                <ul>
                  {items.map((item, index) => (
                    // 물리명·상세는 줄이지 않고 줄바꿈한다(break-all) — "무엇이 바뀌었는지"를
                    // 말줄임 없이 통째로 보여준다. 상세는 자기 줄에(marker 폭만큼 들여쓰기)
                    <li key={index} className="flex flex-wrap items-baseline gap-x-1.5 px-3 py-1 text-xs">
                      <ItemMarker action={item.action} />
                      <span className="shrink-0">
                        {t(`model.editor.history.kind.${item.kind}`)}{' '}
                        {t(`model.editor.history.action.${item.action}`)}
                      </span>
                      <span className="min-w-0 flex-1 break-all font-mono">{diffItemDisplayName(item)}</span>
                      {item.detail ? (
                        <span className="w-full break-all pl-[18px] text-muted-foreground">— {item.detail}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {classification.removed.length > 0 ? (
          <div className="border-t">
            <p className="px-3 py-1.5 text-xs font-semibold text-destructive">
              {t('model.editor.compare.removedTitle')}
            </p>
            <ul className="pb-1">
              {classification.removed.map((name) => (
                <li key={name} className="flex items-baseline gap-1.5 px-3 py-1 text-xs">
                  <ItemMarker action="remove" />
                  <span className="min-w-0 flex-1 break-all font-mono">{name}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  )
}

/** 항목 행 마커 — [+]/[~]/[−]/[→] (버전 기록 ActionMarker 표기 관례) */
function ItemMarker({ action }: { action: DocDiffItem['action'] }) {
  const label = { add: '+', update: '~', remove: '−', move: '→' }[action] ?? '·'
  const tone =
    action === 'add'
      ? 'text-emerald-600 dark:text-emerald-400'
      : action === 'update'
        ? 'text-amber-600 dark:text-amber-400'
        : action === 'remove'
          ? 'text-destructive'
          : 'text-muted-foreground'
  return (
    <span aria-hidden className={`w-3 shrink-0 text-center font-mono font-semibold ${tone}`}>
      {label}
    </span>
  )
}
