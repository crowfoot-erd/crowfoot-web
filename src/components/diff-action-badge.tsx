/**
 * 변경 액션 배지 — add(+)/update(~)/remove(−) 공용 마커 (버전 비교 뷰 캔버스 배지)
 *
 * 색 표기는 SyncDialog·버전 기록의 ActionMarker 관례를 따른다(emerald/amber/destructive).
 * 마커 문자(+~−)·aria-레이블은 i18n(model.editor.compare.mark*)이 맡는다.
 * SyncDialog·VersionHistoryDialog의 private 복제본은 그대로 둔다(본 컴포넌트는 캔버스 배지용).
 */
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export type DiffAction = 'add' | 'update' | 'remove'

/** 캔버스 테이블 노드 우상단 배지 — className으로 위치를 받는다(호출부 자유) */
export function DiffActionBadge({ action, className }: { action: DiffAction; className?: string }) {
  const { t } = useTranslation()
  const label = action === 'add' ? '+' : action === 'update' ? '~' : '−'
  return (
    <span
      data-compare={action}
      aria-label={t(`model.editor.compare.mark.${action}`)}
      className={cn(
        'nodrag pointer-events-none absolute flex size-5 items-center justify-center rounded-full border-2 border-background font-mono text-[11px] font-bold leading-none shadow-sm',
        action === 'add' && 'bg-emerald-500 text-white',
        action === 'update' && 'bg-amber-500 text-white',
        action === 'remove' && 'bg-destructive text-white',
        className,
      )}
    >
      {label}
    </span>
  )
}
