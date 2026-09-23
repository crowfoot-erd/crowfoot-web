/**
 * 캔버스 컨텍스트 메뉴 (05-editor/02-ui.md §8.1, storyboard 02-user §5A)
 *
 * 빈 영역 = 엔터티·메모 생성(우클릭한 화면 좌표를 캔버스 좌표로 변환해 그 위치에 생성),
 * 테이블 노드 = 정보·그룹 소속·삭제, 메모 노드 = 삭제, 관계선 = 편집·삭제.
 * 그룹(주제 영역)은 캔버스 객체가 아니라 논리 소속이라 여기서 만들고 뺀다 — 우클릭한
 * 테이블이 선택 상태면 **선택 전체**가 대상(다중 선택 → 그룹 생성), 아니면 그 테이블만.
 * 한 테이블은 한 그룹에만 소속한다 — 대상이 이미 그룹에 있으면 '그룹에 추가'가 잠기고,
 * 섞인 선택에서는 미소속 테이블만 추가된다.
 * 대상 판별은 이벤트 타깃의 DOM(nodekind·react-flow 래퍼 data-id)으로 하고,
 * 생성 위치는 메뉴 항목 선택 시점에 screenToFlowPosition으로 변환한다.
 * 편집 권한이 없으면 메뉴 자체를 제공하지 않는다(브라우저 기본 메뉴).
 */
import { useRef, useState } from 'react'
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui'
import { Expand, FolderPlus, FolderMinus, FolderPen, Info, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from 'cn'
import { TABLE_COLOR_HEX } from '@/features/editor/model/content-schema'

export interface CanvasPoint {
  x: number
  y: number
}

export type ContextMenuAction =
  | { type: 'createTable'; position: CanvasPoint }
  | { type: 'createNote'; position: CanvasPoint }
  | { type: 'createGroup'; tableIds: string[] }
  | { type: 'addToGroup'; areaId: string; tableIds: string[] }
  | { type: 'removeFromGroup'; areaId: string; tableIds: string[] }
  | { type: 'editGroup'; areaId: string }
  | { type: 'exitGroupView' }
  | { type: 'tableInfo'; tableId: string }
  | { type: 'removeTable'; tableId: string }
  | { type: 'removeNote'; noteId: string }
  | { type: 'editRelationship'; relationshipId: string }
  | { type: 'removeRelationship'; relationshipId: string }

/** 그룹 서브메뉴 재료 — 멤버 id까지 넘겨 소속/미소속을 여기서 가린다 */
export interface ContextMenuGroup {
  id: string
  name: string
  color: string
  tableIds: readonly string[]
}

interface CanvasContextMenuProps {
  /** 화면 좌표 → 캔버스(flow) 좌표 */
  toFlow: (point: CanvasPoint) => CanvasPoint
  /** 현재 선택된 테이블 id — 우클릭 타깃이 선택 상태면 이 전체가 그룹 조작 대상 */
  selectedTableIds: readonly string[]
  groups: readonly ContextMenuGroup[]
  /** 보기 필터로 들어가 있는 그룹 이름 — null이면 전체 보기(돌아가기 항목이 없다) */
  activeAreaName: string | null
  onAction: (action: ContextMenuAction) => void
  children: React.ReactNode
}

type MenuTarget =
  | { kind: 'canvas' }
  | { kind: 'table'; tableId: string }
  | { kind: 'note'; noteId: string }
  | { kind: 'relationship'; relationshipId: string }

/** 우클릭 타깃 분류 — 노드 루트 data-nodekind + react-flow 래퍼 data-id */
function resolveTarget(target: HTMLElement): MenuTarget {
  const nodeKind = target.closest('[data-nodekind]')?.getAttribute('data-nodekind')
  if (nodeKind === 'table' || nodeKind === 'note') {
    const flowNode = target.closest('.react-flow__node')
    const id = flowNode?.getAttribute('data-id')
    if (id) {
      if (nodeKind === 'table') return { kind: 'table', tableId: id }
      return { kind: 'note', noteId: id }
    }
  }
  const edge = target.closest('.react-flow__edge')
  if (edge) {
    const id = edge.getAttribute('data-id')
    if (id) return { kind: 'relationship', relationshipId: id }
  }
  return { kind: 'canvas' }
}

const SUB_ITEM_CLASS =
  'flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'

/** 그룹 서브메뉴 행 — 색 점으로 어떤 그룹인지 읽게 한다 */
function GroupRow({ group }: { group: ContextMenuGroup }) {
  const hex = group.color === 'default' ? undefined : TABLE_COLOR_HEX[group.color as keyof typeof TABLE_COLOR_HEX]
  return (
    <>
      <span
        aria-hidden
        className={cn('size-2.5 shrink-0 rounded-full border border-foreground/20', !hex && 'bg-muted-foreground/20')}
        style={hex ? { backgroundColor: hex } : undefined}
      />
      <span className="truncate">{group.name}</span>
    </>
  )
}

export function CanvasContextMenu({ toFlow, selectedTableIds, groups, activeAreaName, onAction, children }: CanvasContextMenuProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState<MenuTarget>({ kind: 'canvas' })
  const screenRef = useRef<CanvasPoint>({ x: 0, y: 0 })

  const handleContextMenu = (event: React.MouseEvent) => {
    screenRef.current = { x: event.clientX, y: event.clientY }
    setTarget(resolveTarget(event.target as HTMLElement))
  }

  /** 그룹 조작 대상 — 우클릭한 테이블이 선택 상태면 선택 전체, 아니면 그 테이블만 */
  const groupTargets =
    target.kind === 'table'
      ? selectedTableIds.includes(target.tableId)
        ? [...selectedTableIds]
        : [target.tableId]
      : []
  const targetSet = new Set(groupTargets)
  /** 한 테이블은 한 그룹에 — 이미 소속인 대상은 '그룹에 추가' 경로에 들어가지 않는다 */
  const groupedIds = new Set(groups.flatMap((g) => g.tableIds))
  const ungroupedTargets = groupTargets.filter((id) => !groupedIds.has(id))
  const allGrouped = groupTargets.length > 0 && ungroupedTargets.length === 0
  const addableGroups = allGrouped ? [] : groups
  const removableGroups = groups.filter((g) => g.tableIds.some((id) => targetSet.has(id)))
  /** 우클릭한 테이블의 소속 그룹 — 문서 순서 첫 그룹(렌더 색을 고정하는 그룹)을 편집한다 */
  const targetGroup =
    target.kind === 'table' ? groups.find((g) => g.tableIds.includes(target.tableId)) : undefined

  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>
        <div className="h-full w-full" onContextMenu={handleContextMenu}>
          {children}
        </div>
      </ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          className="z-50 w-44 origin-(--radix-context-menu-content-transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-in-0 data-closed:zoom-out-95"
        >
          {target.kind === 'canvas' ? (
            <>
              {/* 그룹 보기 중 — 전체 보기로 돌아가는 길을 메뉴 첫 항목으로 밝힌다(폴더 재클릭 외
                  유일한 복귀 수단이라 불직관하다는 피드백). '그룹에서 제외'(멤버 제거)와 달리
                  이쪽은 보기 전환 — 문구로 둘을 구분한다 */}
              {activeAreaName !== null ? (
                <>
                  <ContextMenuPrimitive.Item
                    className={SUB_ITEM_CLASS}
                    onSelect={() => onAction({ type: 'exitGroupView' })}
                  >
                    <Expand aria-hidden />
                    {t('model.editor.contextMenu.exitGroupView')}
                  </ContextMenuPrimitive.Item>
                  <ContextMenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
                </>
              ) : null}
              <ContextMenuPrimitive.Item
                className={SUB_ITEM_CLASS}
                onSelect={() => onAction({ type: 'createTable', position: toFlow(screenRef.current) })}
              >
                <Plus aria-hidden />
                {t('model.editor.contextMenu.createTable')}
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Item
                className={SUB_ITEM_CLASS}
                onSelect={() => onAction({ type: 'createNote', position: toFlow(screenRef.current) })}
              >
                <StickyNote aria-hidden />
                {t('model.editor.contextMenu.createNote')}
              </ContextMenuPrimitive.Item>
            </>
          ) : null}

          {target.kind === 'table' ? (
            <>
              <ContextMenuPrimitive.Item
                className={SUB_ITEM_CLASS}
                onSelect={() => onAction({ type: 'tableInfo', tableId: target.tableId })}
              >
                <Info aria-hidden />
                {t('model.editor.contextMenu.tableInfo')}
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
              <ContextMenuPrimitive.Item
                className={SUB_ITEM_CLASS}
                onSelect={() => onAction({ type: 'createGroup', tableIds: groupTargets })}
              >
                <FolderPlus aria-hidden />
                {t('model.editor.contextMenu.createGroup')}
              </ContextMenuPrimitive.Item>
              {groups.length > 0 ? (
                <ContextMenuPrimitive.Sub>
                  {/* 대상 전체가 이미 그룹 소속이면 잠긴다 — 그룹에서 제외로만 이동할 수 있다 */}
                  <ContextMenuPrimitive.SubTrigger className={SUB_ITEM_CLASS} disabled={allGrouped}>
                    <FolderPlus aria-hidden />
                    {t('model.editor.contextMenu.addToGroup')}
                  </ContextMenuPrimitive.SubTrigger>
                  <ContextMenuPrimitive.Portal>
                    <ContextMenuPrimitive.SubContent className="z-50 w-40 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
                      {addableGroups.map((group) => (
                        <ContextMenuPrimitive.Item
                          key={group.id}
                          className={SUB_ITEM_CLASS}
                          onSelect={() => onAction({ type: 'addToGroup', areaId: group.id, tableIds: ungroupedTargets })}
                        >
                          <GroupRow group={group} />
                        </ContextMenuPrimitive.Item>
                      ))}
                    </ContextMenuPrimitive.SubContent>
                  </ContextMenuPrimitive.Portal>
                </ContextMenuPrimitive.Sub>
              ) : null}
              {removableGroups.length > 0 ? (
                <ContextMenuPrimitive.Sub>
                  <ContextMenuPrimitive.SubTrigger className={SUB_ITEM_CLASS}>
                    <FolderMinus aria-hidden />
                    {t('model.editor.contextMenu.removeFromGroup')}
                  </ContextMenuPrimitive.SubTrigger>
                  <ContextMenuPrimitive.Portal>
                    <ContextMenuPrimitive.SubContent className="z-50 w-40 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
                      {removableGroups.map((group) => (
                        <ContextMenuPrimitive.Item
                          key={group.id}
                          className={SUB_ITEM_CLASS}
                          onSelect={() => onAction({ type: 'removeFromGroup', areaId: group.id, tableIds: groupTargets })}
                        >
                          <GroupRow group={group} />
                        </ContextMenuPrimitive.Item>
                      ))}
                    </ContextMenuPrimitive.SubContent>
                  </ContextMenuPrimitive.Portal>
                </ContextMenuPrimitive.Sub>
              ) : null}
              {/* 그룹 편집 — 우클릭한 테이블의 소속 그룹(문서 순서 첫 그룹) 설정을 연다. 미소속이면 잠긴다 */}
              <ContextMenuPrimitive.Item
                className={SUB_ITEM_CLASS}
                disabled={!targetGroup}
                onSelect={() => targetGroup && onAction({ type: 'editGroup', areaId: targetGroup.id })}
              >
                <FolderPen aria-hidden />
                {t('model.editor.contextMenu.editGroup')}
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
              <ContextMenuPrimitive.Item
                className={cn(SUB_ITEM_CLASS, 'text-destructive focus:bg-destructive/10 focus:text-destructive')}
                onSelect={() => onAction({ type: 'removeTable', tableId: target.tableId })}
              >
                <Trash2 aria-hidden />
                {t('model.editor.contextMenu.removeTable')}
              </ContextMenuPrimitive.Item>
            </>
          ) : null}

          {target.kind === 'note' ? (
            <ContextMenuPrimitive.Item
              className={cn(SUB_ITEM_CLASS, 'text-destructive focus:bg-destructive/10 focus:text-destructive')}
              onSelect={() => onAction({ type: 'removeNote', noteId: target.noteId })}
            >
              <Trash2 aria-hidden />
              {t('model.editor.contextMenu.removeNote')}
            </ContextMenuPrimitive.Item>
          ) : null}

          {target.kind === 'relationship' ? (
            <>
              <ContextMenuPrimitive.Item
                className={SUB_ITEM_CLASS}
                onSelect={() => onAction({ type: 'editRelationship', relationshipId: target.relationshipId })}
              >
                <Pencil aria-hidden />
                {t('model.editor.contextMenu.editRelationship')}
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
              <ContextMenuPrimitive.Item
                className={cn(SUB_ITEM_CLASS, 'text-destructive focus:bg-destructive/10 focus:text-destructive')}
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
