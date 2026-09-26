/**
 * 원격 커서 레이어 — 참가자 화살표·이름표 (05-editor/02-ui.md §커서 오버레이, v1.17)
 *
 * 커서 좌표는 발신 시점의 flow 좌표(screenToFlowPosition)라 뷰포트(팬·줌)와 무관하다 —
 * 이 레이어가 RF transform을 구독해 화면좌표로 되돌려 그린다. 사람별 색은 userId 해시
 * 프리셋(participantColor)이라 모든 클라이언트에서 같은 사람이 같은 색으로 보인다.
 * 포인터 이벤트는 전부 통과시킨다(pointer-events-none) — 보이기만 하는 레이어다.
 */
import { useStore } from '@xyflow/react'

import { cn } from 'cn'
import type { RemoteCursorState } from '@/features/editor/collab'
import { participantColor } from '@/features/editor/collab-presence'

export interface RemoteCursorLayerProps {
  cursors: RemoteCursorState[]
}

export function RemoteCursorLayer({ cursors }: RemoteCursorLayerProps) {
  // [tx, ty, zoom] — 팬·줌마다 재계산해 커서가 캔버스에 붙어 따라온다
  const transform = useStore((s) => s.transform)
  const [tx, ty, zoom] = transform

  if (cursors.length === 0) return null
  return (
    <div data-testid="remote-cursor-layer" className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {cursors.map((remote) => {
        const color = participantColor(remote.userId)
        // flow → 래퍼 상대 화면좌표. 이름표가 오른쪽으로 삐져나가면 왼쪽으로 뒤집는다
        const x = remote.cursor.x * zoom + tx
        const y = remote.cursor.y * zoom + ty
        const flip = x > (document.documentElement?.clientWidth ?? 1200) - 160
        return (
          <div
            key={remote.userId}
            data-testid="remote-cursor"
            className="absolute"
            style={{ left: x, top: y, color }}
          >
            {/* 커서 화살표 — 시스템 커서와 같은 실루엣 */}
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 drop-shadow-sm" fill="currentColor">
              <path d="M1 1l5.5 13 1.9-5.6L14 6.5 1 1z" />
            </svg>
            <span
              className={cn(
                'absolute top-3 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm',
                flip ? 'right-2' : 'left-2',
              )}
              style={{ backgroundColor: color }}
            >
              {remote.name}
              {remote.cursor.dragging ? ' ✥' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
