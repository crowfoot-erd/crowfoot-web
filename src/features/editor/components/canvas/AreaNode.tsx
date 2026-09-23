/**
 * 주제 영역 노드 — 배경 박스 (05-editor/02-ui.md §6, v1.13)
 *
 * 테이블을 묶어 보이게 하는 표현 계층의 박스다 — 멤버 테이블은 별도 노드로 위에 떠 있고
 * 이 박스는 배경(zIndex 0)이다. 배경은 알파 틴트로 채운다: RF 구조상 관계선 레이어가
 * 노드 아래에 있어 불투명 배경이면 선이 가려지기 때문이다(틴트면 선이 비쳐 보인다).
 * 색·접힘·멤버 수는 스토어 직접 구독으로 렌더한다(NoteNode 패턴) — 표시 레이어
 * 재빌드와 무관하게 즉시 반영되고, nodesEqual 확장도 필요 없다.
 * 위치·크기 이동은 RF 로컬 좌표로 부드럽게 움직이고 mouseup에 area/patch 1커밋(undo 1스택).
 * 영역 드래그의 멤버 동반 이동은 ErdCanvas가 드래그 종료에 합산 커밋한다.
 */
import { memo, useState } from 'react'
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from 'cn'
import { AREA_MIN_HEIGHT, AREA_MIN_WIDTH } from '@/features/editor/model/areas'
import { TABLE_COLOR_HEX } from '@/features/editor/model/content-schema'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { useEditorCanvas } from './editor-context'

export type AreaNodeData = Record<string, never>
export type AreaNodeType = Node<AreaNodeData, 'area'>

const MIN_WIDTH = AREA_MIN_WIDTH
const MIN_HEIGHT = AREA_MIN_HEIGHT

function AreaNodeComponent({ id, selected }: NodeProps<AreaNodeType>) {
  const { t } = useTranslation()
  const { canEdit, openAreaEdit } = useEditorCanvas()
  const area = useEditorStore((s) => s.present.diagram.areas.find((a) => a.id === id))
  const commit = useEditorStore((s) => s.commit)
  /** 살아 있는 멤버 수 — 캔버스와 무관하게 문서 기준으로 센다(숨김은 표시 문제일 뿐) */
  const memberCount = useEditorStore((s) => {
    const target = s.present.diagram.areas.find((a) => a.id === id)
    if (!target) return 0
    const alive = new Set(s.present.model.tables.map((table) => table.id))
    return target.tableIds.filter((tableId) => alive.has(tableId)).length
  })

  /** 리사이즈 라이브 프리뷰 — 드래그 중 크기가 마우스를 따라 보인다(커밋은 onResizeEnd) */
  const [resizing, setResizing] = useState<{ w: number; h: number } | null>(null)

  if (!area) return null

  // 'default'는 키가 없다 — 중성 틴트 클래스로 폴백(table-skin과 같은 규칙)
  const tint = area.color === 'default' ? undefined : TABLE_COLOR_HEX[area.color]
  const boxStyle = tint
    ? {
        backgroundColor: `color-mix(in srgb, ${tint} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${tint} 45%, transparent)`,
      }
    : undefined

  const toggleCollapsed = () => {
    commit({ type: 'area/patch', areaId: id, patch: { collapsed: !area.collapsed } })
  }

  return (
    <div
      data-nodekind="area"
      className={cn(
        'relative flex flex-col rounded-lg border-2 border-dashed',
        tint ? '' : 'border-border/60 bg-muted/20',
        canEdit && 'cursor-grab active:cursor-grabbing',
        selected && tint && 'border-solid',
      )}
      style={{ ...boxStyle, width: resizing?.w ?? area.width, height: resizing?.h ?? area.height }}
      title={area.description || undefined}
    >
      {canEdit ? (
        <NodeResizer
          isVisible={selected}
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          onResize={(_, params) => setResizing({ w: Math.round(params.width), h: Math.round(params.height) })}
          onResizeEnd={(_, params) => {
            commit({
              type: 'area/patch',
              areaId: id,
              patch: { width: Math.round(params.width), height: Math.round(params.height) },
            })
            setResizing(null)
          }}
        />
      ) : null}

      {/* 헤더 밴드 — 이름·멤버 수·접기·설정. 배경 틴트보다 진하게 반전시켜 영역 라벨로 읽히게 한다 */}
      <div
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 rounded-t-[5px] px-2',
          tint ? '' : 'bg-muted/50',
          area.collapsed && 'rounded-b-[5px]',
        )}
        style={tint ? { backgroundColor: `color-mix(in srgb, ${tint} 22%, transparent)` } : undefined}
      >
        {canEdit ? (
          <button
            type="button"
            className="nodrag shrink-0 rounded-sm p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
            title={area.collapsed ? t('model.editor.area.expand') : t('model.editor.area.collapse')}
            aria-label={area.collapsed ? t('model.editor.area.expand') : t('model.editor.area.collapse')}
            aria-expanded={!area.collapsed}
            onClick={(event) => {
              event.stopPropagation()
              toggleCollapsed()
            }}
          >
            {area.collapsed ? <ChevronRight aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
          </button>
        ) : (
          <ChevronRight aria-hidden className="size-4 shrink-0 opacity-40" />
        )}
        <span className="min-w-0 flex-1 truncate text-base font-bold text-foreground/80">{area.name}</span>
        <span
          className="nodrag shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground/60 dark:bg-white/15"
          title={t('model.editor.area.memberCount')}
        >
          {memberCount}
        </span>
        {canEdit ? (
          <button
            type="button"
            className="nodrag shrink-0 rounded-sm p-0.5 opacity-50 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
            title={t('model.editor.area.edit')}
            aria-label={t('model.editor.area.edit')}
            onClick={(event) => {
              event.stopPropagation()
              openAreaEdit(id)
            }}
          >
            <Settings2 aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>
      {/* 본체는 비어 있다 — 멤버 테이블이 위에 떠 있는 배경일 뿐이다 */}
    </div>
  )
}

export const AreaNode = memo(AreaNodeComponent)
