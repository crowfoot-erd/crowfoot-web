/**
 * 캔버스 컨텍스트 메뉴 (05-editor/02-ui.md §8.1, storyboard 02-user §5A)
 *
 * 빈 영역 = 엔터티·메모 생성(우클릭한 화면 좌표를 캔버스 좌표로 변환해 그 위치에 생성),
 * 테이블 노드 = 정보·삭제, 메모 노드 = 삭제, 관계선 = 편집·삭제.
 * 대상 판별은 이벤트 타깃의 DOM(nodekind·react-flow 래퍼 data-id)으로 하고,
 * 생성 위치는 메뉴 항목 선택 시점에 screenToFlowPosition으로 변환한다.
 * 편집 권한이 없으면 메뉴 자체를 제공하지 않는다(브라우저 기본 메뉴).
 */
import { useRef, useState } from 'react'
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui'
import { BoxSelect, Info, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from 'cn'

export interface CanvasPoint {
  x: number
  y: number
}

export type ContextMenuAction =
  | { type: 'createTable'; position: CanvasPoint }
  | { type: 'createNote'; position: CanvasPoint }
  | { type: 'createArea'; position: CanvasPoint }
  | { type: 'tableInfo'; tableId: string }
  | { type: 'removeTable'; tableId: string }
  | { type: 'removeNote'; noteId: string }
  | { type: 'areaInfo'; areaId: string }
  | { type: 'removeArea'; areaId: string }
  | { type: 'editRelationship'; relationshipId: string }
  | { type: 'removeRelationship'; relationshipId: string }

interface CanvasContextMenuProps {
  /** 화면 좌표 → 캔버스(flow) 좌표 */
  toFlow: (point: CanvasPoint) => CanvasPoint
  onAction: (action: ContextMenuAction) => void
  children: React.ReactNode
}

type MenuTarget =
  | { kind: 'canvas' }
  | { kind: 'table'; tableId: string }
  | { kind: 'note'; noteId: string }
  | { kind: 'area'; areaId: string }
  | { kind: 'relationship'; relationshipId: string }

/** 우클릭 타깃 분류 — 노드 루트 data-nodekind + react-flow 래퍼 data-id */
function resolveTarget(target: HTMLElement): MenuTarget {
  const nodeKind = target.closest('[data-nodekind]')?.getAttribute('data-nodekind')
  if (nodeKind === 'table' || nodeKind === 'note' || nodeKind === 'area') {
    const flowNode = target.closest('.react-flow__node')
    const id = flowNode?.getAttribute('data-id')
    if (id) {
      if (nodeKind === 'table') return { kind: 'table', tableId: id }
      if (nodeKind === 'note') return { kind: 'note', noteId: id }
      return { kind: 'area', areaId: id }
    }
  }
  const edge = target.closest('.react-flow__edge')
  if (edge) {
    const id = edge.getAttribute('data-id')
    if (id) return { kind: 'relationship', relationshipId: id }
  }
  return { kind: 'canvas' }
}

export function CanvasContextMenu({ toFlow, onAction, children }: CanvasContextMenuProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState<MenuTarget>({ kind: 'canvas' })
  const screenRef = useRef<CanvasPoint>({ x: 0, y: 0 })

  const handleContextMenu = (event: React.MouseEvent) => {
    screenRef.current = { x: event.clientX, y: event.clientY }
    setTarget(resolveTarget(event.target as HTMLElement))
  }

  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>
        <div className="h-full w-full" onContextMenu={handleContextMenu}>
          {children}
        </div>
      </ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          className="z-50 w-44 origin-(--radix-context-menu-content-transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          {target.kind === 'canvas' ? (
            <>
              <ContextMenuPrimitive.Item
                className={ITEM_CLASS}
                onSelect={() => onAction({ type: 'createTable', position: toFlow(screenRef.current) })}
              >
                <Plus aria-hidden />
                {t('model.editor.contextMenu.createTable')}
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Item
                className={ITEM_CLASS}
                onSelect={() => onAction({ type: 'createNote', position: toFlow(screenRef.current) })}
              >
                <StickyNote aria-hidden />
                {t('model.editor.contextMenu.createNote')}
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Item
                className={ITEM_CLASS}
                onSelect={() => onAction({ type: 'createArea', position: toFlow(screenRef.current) })}
              >
                <BoxSelect aria-hidden />
                {t('model.editor.contextMenu.createArea')}
              </ContextMenuPrimitive.Item>
            </>
          ) : null}

          {target.kind === 'table' ? (
            <>
              <ContextMenuPrimitive.Item
                className={ITEM_CLASS}
                onSelect={() => onAction({ type: 'tableInfo', tableId: target.tableId })}
              >
                <Info aria-hidden />
                {t('model.editor.contextMenu.tableInfo')}
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
              <ContextMenuPrimitive.Item
                className={cn(ITEM_CLASS, 'text-destructive focus:bg-destructive/10 focus:text-destructive')}
                onSelect={() => onAction({ type: 'removeTable', tableId: target.tableId })}
              >
                <Trash2 aria-hidden />
                {t('model.editor.contextMenu.removeTable')}
              </ContextMenuPrimitive.Item>
            </>
          ) : null}

          {target.kind === 'note' ? (
            <ContextMenuPrimitive.Item
              className={cn(ITEM_CLASS, 'text-destructive focus:bg-destructive/10 focus:text-destructive')}
              onSelect={() => onAction({ type: 'removeNote', noteId: target.noteId })}
            >
              <Trash2 aria-hidden />
              {t('model.editor.contextMenu.removeNote')}
            </ContextMenuPrimitive.Item>
          ) : null}

          {target.kind === 'area' ? (
            <>
              <ContextMenuPrimitive.Item
                className={ITEM_CLASS}
                onSelect={() => onAction({ type: 'areaInfo', areaId: target.areaId })}
              >
                <Pencil aria-hidden />
                {t('model.editor.contextMenu.areaInfo')}
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
              <ContextMenuPrimitive.Item
                className={cn(ITEM_CLASS, 'text-destructive focus:bg-destructive/10 focus:text-destructive')}
                onSelect={() => onAction({ type: 'removeArea', areaId: target.areaId })}
              >
                <Trash2 aria-hidden />
                {t('model.editor.contextMenu.removeArea')}
              </ContextMenuPrimitive.Item>
            </>
          ) : null}

          {target.kind === 'relationship' ? (
            <>
              <ContextMenuPrimitive.Item
                className={ITEM_CLASS}
                onSelect={() => onAction({ type: 'editRelationship', relationshipId: target.relationshipId })}
              >
                <Pencil aria-hidden />
                {t('model.editor.contextMenu.editRelationship')}
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
              <ContextMenuPrimitive.Item
                className={cn(ITEM_CLASS, 'text-destructive focus:bg-destructive/10 focus:text-destructive')}
                onSelect={() => onAction({ type: 'removeRelationship', relationshipId: target.relationshipId })}
              >
                <Trash2 aria-hidden />
                {t('model.editor.contextMenu.removeRelationship')}
              </ContextMenuPrimitive.Item>
            </>
          ) : null}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}

const ITEM_CLASS =
  'flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'
