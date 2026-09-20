/**
 * 테이블 노드 — 인라인 편집 (05-editor/02-ui.md §8.2, storyboard 02-user §5A)
 *
 * 헤더 물리명·컬럼 행(PK 토글·물리명·타입·길이·NN·AI·삭제)을 모두 노드 안에서 편집한다.
 * 컬럼은 PK 영역 → FK 영역(PK 바로 밑, 하늘 배경) → 일반 영역 순서로 나뉘고
 * 드래그 재정렬은 같은 영역 안에서만 된다 — FK 행에는 그립이 없고 영역을 넘는 드롭은 무시된다.
 * PK 여부는 키 버튼·다이얼로그로만 바뀐다(드래그로 영역을 넘어도 자동 토글 없음).
 * 컬럼 목록 아래 키 영역에 유니크·인덱스(복합 포함)를 표현하고 행 클릭으로 편집한다.
 * 타입 표기는 문서 대상 DBMS를 따른다 — 값은 공용 논리 코드 그대로, 라벨만 물리 표기로.
 * 이름 더블클릭 = 컬럼 정보 다이얼로그(논리명·기본값·코멘트), 노드 더블클릭 = 테이블 정보와 구분.
 * 노드는 자기 테이블만 구독한다(구조 공유로 다른 테이블 편집 시 이 노드는 리렌더 0).
 * 컬럼 추가 시 새 행 물리명 input에 autofocus(DataGrip 그리드 UX).
 * 컬럼 표시 모드(보기 옵션) — 'keys'면 일반 컬럼 행을 감추고 PK·FK만 그린다.
 * 높이는 줄어들고(모드 전환마다 reportSize), 폭은 측정 미러가 전체 컬럼을 재므로 흔들리지 않는다.
 * 관계 그리기 — 점(source 핸들)·엣지 밴드는 그대로 있되, 점을 눌러 끌어 선을 그리는
 * 기능만 꺼 둔다(사용자 요청 — source 핸들 isConnectable=false). 관계 생성 진입은
 * 밴드 클릭 → 오버레이 선택 → 대상 테이블 클릭.
 * 축소(줌아웃) 렌더 — 배율이 TABLE_COMPACT_ZOOM보다 작으면 노드 상단에 논리명·물리명
 * 불투명 라벨 판을 헤더처럼 붙인다(아래 컬럼·키 상세는 그대로 보인다). 노드 크기(footprint)는
 * 그대로라 팬 한계·미니맵·엣지 앵커가 흔들리지 않는다.
 * 강조색 — 정보 다이얼로그에서 프리셋 10색 중 선택(node/color). 헤더 밴드·상자 테두리·축소
 * 라벨 판에 틴트로 얹고 미니맵에도 같은 색이 들어간다. 색은 diagram.nodes에 저장(표현).
 */
import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Handle, NodeResizer, Position, useStore, type Node, type NodeProps } from '@xyflow/react'
import { GripHorizontal, GripVertical, Info, KeyRound, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from 'cn'
import { createColumn, pkToggleChanges, type ColumnPatch } from '@/features/editor/model/changes'
import { DATA_TYPES, dataTypeSpec, isAutoIncrementType, physicalType } from '@/features/editor/model/dbms'
import type { KeyKind } from '@/features/editor/model/keys'
import type { ErdColumn } from '@/features/editor/model/content-schema'
import type { TableColorValue } from '@/features/editor/model/content-schema'
import { isDuplicateTableName } from '@/features/editor/model/validation'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { DiffActionBadge } from '@/components/diff-action-badge'
import { useEditorCanvas, type ColumnDisplayMode, type RelationHandleId } from './editor-context'
import { useCompareHighlight } from './compare-context'
import { tableSkin } from './table-skin'
import { CommitInput, CommitSelect } from './inline-inputs'

export type TableNodeData = Record<string, never>
export type TableNodeType = Node<TableNodeData, 'table'>

const DEFAULT_WIDTH = 370
/** 컬럼 그리드 고정 칸(그립·PK·사이즈·NN·AI·삭제 ≈ 172px + 간격·행 패딩)을 감당하는 렌더 하한 —
 *  과거에 좁게 저장된 width도 이름 칸이 안 눌리게 한다 */
const MIN_WIDTH = 330
/** 타입 칸을 뺀 행 고정 칸 — 그립36·PK16·사이즈64·NN28·AI28·삭제16 + 간격28 + 행 패딩8.
 *  타입 칸은 표가 실제로 쓰는 가장 긴 라벨에 맞춰 가변이라 이름 폭 계산에서는 뺀다. */
const ROW_FIXED_EXTRAS = 224
/** 타입 칸 폭 경계 — 하한은 일반 라벨(TIMESTAMPTZ급), 상한은 UNIQUEIDENTIFIER급 긴 라벨 */
const TYPE_MIN_WIDTH = 74
const TYPE_MAX_WIDTH = 132
const HEADER_EXTRAS = 64
const BAND_EXTRAS = 60
/** 컬럼 그리드 — 그립·PK·이름·타입(가변)·사이즈·NN·AI·삭제. 사이즈(64px) 칸은
 *  DECIMAL(p,s) 두 숫자가 온전히 들어가는 폭이다 */
const rowGridOf = (typeWidth: number) =>
  `36px 16px minmax(0,1fr) ${typeWidth}px 64px 28px 28px 16px`

/** 설정 칸(타입·사이즈·NN) 왼쪽 세로 구분선 — 행마다 이어져 설정 영역을 식별하게 한다.
 *  배경은 실제 입력 상자(사이즈 숫자)에만 준다 — 입력하지 않는 칸까지 물들이지 않는다.
 *  self-stretch + -my-0.5(행 py 보정)로 행 높이를 꽉 채워 위아래 행과 선이 맞닿는다. */
const SETTING_CELL_RULE = 'self-stretch -my-0.5 rounded-none border-l border-border/60'
/** 사이즈 숫자 입력 — 옅은 회색 배경·테두리로 입력란임을 읽히게 하고, number 스피너를 지워
 *  두 자리 숫자가 칸 폭을 다 쓰게 한다. flex-1+min-w-0 — (p,s) 두 상자가 콘텐츠와 무관하게
 *  칸을 정확히 균등 분할한다(입력 요소 고유 폭이 수축을 비틀지 않게). 칸 안 여백은 래퍼가 준다. */
const SIZE_INPUT_RULE =
  'min-w-0 flex-1 rounded-sm border border-border/60 bg-muted/50 text-center text-[10px] text-muted-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

/** 축소 렌더 진입 배율 — 이보다 작으면 컬럼·키 목록을 감추고 논리명·물리명 라벨만 표시한다 */
export const TABLE_COMPACT_ZOOM = 0.5
/** 축소 라벨 폰트 하한 배율 — 배율이 아무리 작아도 라벨 폰트(플로우 px)가 여기서 자란다
 *  없으면 극단 축소에서 라벨이 테이블 상자보다 커진다 */
const COMPACT_LABEL_ZOOM_FLOOR = 0.3
/** 축소 라벨 화면 목표 크기 — 라벨은 줌아웃해도 화면에서 이 크기로 읽힌다.
 *  논리명·물리명 모두 13px — 크기가 아닌 색·굵기(굵게/흐릿)로 위계를 구분한다 */
const COMPACT_LOGICAL_SCREEN_PX = 13
const COMPACT_PHYSICAL_SCREEN_PX = 13

/** 축소 라벨 폰트(플로우 px) — 화면 목표 크기를 배율로 나눠 화면 크기(≈ screenPx)를 유지한다.
 *  배율이 하한보다 작으면 하한 배율 폰트에 머문다(라벨 폭이 상자를 넘지 않게). */
export function compactLabelFontSize(screenPx: number, zoom: number): number {
  return screenPx / Math.max(zoom, COMPACT_LABEL_ZOOM_FLOOR)
}

/** 노드 렌더 폭 — 저장 폭·측정 콘텐츠 폭·하한 중 최대 (ErdCanvas 겹침 해소도 같은 값 사용).
 *  하한은 기본 MIN_WIDTH — 타입 칸이 넓게 측정된 표는 노드가 더 큰 하한을 넘긴다. */
export function tableRenderWidth(stored: number | null, contentWidth: number, minWidth = MIN_WIDTH): number {
  return Math.max(stored ?? DEFAULT_WIDTH, contentWidth, minWidth)
}

/** 겹침 판정용 높이 추정 — Chrome 실측 기준(컬럼 행 47, 키 행 25):
 *  밴드 28 + 컬럼 툴바 29 + PK 구분선 2 + 컬럼 행 × 47 + 컬럼 추가 버튼 24
 *  + UK/IX 컨테이너(빈 28) + 키 행 × 25 + 테두리. 자동 배치(elkjs) 레이어 간격의 기준이 된다. */
export function estimateTableHeight(columnCount: number, keyRowCount = 0): number {
  return 112 + columnCount * 47 + keyRowCount * 25
}

/** 컬럼 표시 모드가 이 영역 행을 그리는지 — 'keys'면 일반 컬럼을 접는다 (PK·FK·UK/IX는 유지) */
export function isZoneVisible(zone: 'pk' | 'fk' | 'general', mode: ColumnDisplayMode): boolean {
  return mode !== 'keys' || zone !== 'general'
}

/** 컬럼 추가 기본 물리명 — 테이블 내에서 고유 보장 (physicalName min(1) 계약) */
function nextColumnName(columns: ErdColumn[]): string {
  const existing = new Set(columns.map((c) => c.physicalName.toLowerCase()))
  for (let i = 1; ; i += 1) {
    const candidate = `column_${i}`
    if (!existing.has(candidate)) return candidate
  }
}

/* ---------- 관계 시작 — 점 근처 클릭 → 캔버스 오버레이 선택 → 대상 테이블 클릭 연결 ---------- */

/** 관계 시작 밴드 — 점(연결 핸들) 근처만 반응하는 클릭 영역. hover 강조도 이 영역만 살짝 */
const RELATION_BANDS: { side: RelationHandleId; className: string }[] = [
  { side: 'top', className: 'left-1/2 top-0 h-2.5 w-24 -translate-x-1/2' },
  { side: 'bottom', className: 'bottom-0 left-1/2 h-2.5 w-24 -translate-x-1/2' },
  { side: 'left', className: 'left-0 top-1/2 w-2.5 h-24 -translate-y-1/2' },
  { side: 'right', className: 'right-0 top-1/2 w-2.5 h-24 -translate-y-1/2' },
]

function toDisplay(value: number | null): string {
  return value === null ? '' : String(value)
}

/** 숫자 input 확정 — 빈 값·비숫자는 null로 정규화 */
function toNumberOrNull(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/* ---------- 키(UK·인덱스) 한 행 ---------- */

interface KeyRowProps {
  kind: KeyKind
  name: string
  /** 복합 키 컬럼 물리명 — 표시 순서 = 키 컬럼 순서 */
  columnNames: string[]
  canEdit: boolean
  onEdit: () => void
  onRemove: () => void
}

function KeyRow({ kind, name, columnNames, canEdit, onEdit, onRemove }: KeyRowProps) {
  const { t } = useTranslation()
  return (
    <div className="group/key flex items-center gap-1 border-t px-1 py-0.5 text-[10px] leading-5">
      <span
        className={cn(
          'shrink-0 rounded-sm px-1 text-[9px] font-semibold',
          kind === 'unique'
            ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
            : 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
        )}
      >
        {kind === 'unique' ? 'UK' : 'IX'}
      </span>
      <button
        type="button"
        className="nodrag flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 text-left hover:bg-accent disabled:pointer-events-none"
        onClick={onEdit}
        disabled={!canEdit}
        title={`${name} (${columnNames.join(', ')})`}
      >
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-muted-foreground">({columnNames.join(', ')})</span>
      </button>
      {canEdit ? (
        <button
          type="button"
          className="nodrag flex size-5 -m-0.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/key:opacity-100"
          onClick={onRemove}
          aria-label={`${t('model.editor.key.remove')} — ${name}`}
        >
          <X aria-hidden className="size-3" />
        </button>
      ) : null}
    </div>
  )
}

/* ---------- 컬럼 한 행 ---------- */

interface ColumnRowProps {
  tableId: string
  column: ErdColumn
  index: number
  isPk: boolean
  isFk: boolean
  /** 행이 속한 영역 — 식별 관계 FK는 PK에 포함되므로 'pk' */
  zone: 'pk' | 'fk' | 'general'
  /** 그립 드래그 가능 여부 — FK 영역 행은 재정렬이 없다 */
  reorderable: boolean
  /** 이 테이블의 PK 컬럼 수 — 복합 PK에서는 AI를 제공하지 않는다 */
  pkCount: number
  canEdit: boolean
  autoFocus: boolean
  onFocusedAuto: () => void
  /** 컬럼 그리드 — 타입 칸 폭은 표가 쓰는 가장 긴 라벨에 맞춘 값 */
  rowGrid: string
  /** 드래그 재정렬 상태 — TableNode가 홀딩. 삽입 위치는 행 위/아래 경계 라인으로 표시한다 */
  isDragging: boolean
  isInsertAbove: boolean
  isInsertBelow: boolean
  onGripDragStart: (columnId: string, event: DragEvent<HTMLSpanElement>) => void
  onRowDragOver: (index: number, event: DragEvent<HTMLElement>) => void
  onRowDrop: (index: number, event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  /** 타입 선택 옵션 — 문서 DBMS의 물리 표기 라벨(값은 공용 논리 코드) */
  typeOptions: { value: string; label: string }[]
}

function ColumnRow({
  tableId,
  column,
  index,
  isPk,
  isFk,
  zone,
  reorderable,
  pkCount,
  canEdit,
  autoFocus,
  onFocusedAuto,
  rowGrid,
  isDragging,
  isInsertAbove,
  isInsertBelow,
  onGripDragStart,
  onRowDragOver,
  onRowDrop,
  onDragEnd,
  typeOptions,
}: ColumnRowProps) {
  const { t } = useTranslation()
  const { nameDisplay, openColumnInfo } = useEditorCanvas()
  const commit = useEditorStore((s) => s.commit)
  const commitAll = useEditorStore((s) => s.commitAll)

  const patch = (next: ColumnPatch) => commit({ type: 'column/patch', tableId, columnId: column.id, patch: next })

  /** PK 토글 — 1커밋 스택 (켜면 NN 강제·최상단 이동, 끄면 AI 해제 + FK면 FK 영역·아니면 일반 블록 이동) */
  const togglePk = () => {
    const { present } = useEditorStore.getState()
    const table = present.model.tables.find((tb) => tb.id === tableId)
    if (!table) return
    const fkIds = new Set(
      present.model.relationships.flatMap((r) =>
        r.childTableId === tableId ? r.columnMappings.map((m) => m.childColumnId) : [],
      ),
    )
    const changes = pkToggleChanges(table, column.id, !isPk, fkIds)
    if (changes.length > 0) commitAll(changes)
  }

  /** 이름 더블클릭 — 컬럼 정보 다이얼로그. 노드 더블클릭(테이블 정보)로 버블링되지 않게 끊는다 */
  const openInfo = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (canEdit) openColumnInfo(tableId, column.id)
  }

  /** AI는 단일 PK + 정수 타입(INT·BIGINT·SMALLINT) 조합에서만 의미가 있다 — 복합 PK는 성립 안 함 */
  const aiAvailable = isPk && pkCount === 1 && isAutoIncrementType(column.dataType)

  const spec = dataTypeSpec(column.dataType)

  return (
    <div
      data-zone={zone}
      className={cn(
        'group/row grid items-center gap-1 border-t px-1 py-0.5 tabular-nums',
        zone === 'pk' && 'bg-amber-500/[0.07]',
        zone === 'fk' && 'bg-sky-500/[0.07]',
        isInsertAbove && 'shadow-[inset_0_2px_0_0_var(--color-blue-500)]',
        isInsertBelow && 'shadow-[inset_0_-2px_0_0_var(--color-blue-500)]',
        isDragging && 'opacity-40',
      )}
      style={{ gridTemplateColumns: rowGrid }}
      onDragOver={(event) => onRowDragOver(index, event)}
      onDrop={(event) => onRowDrop(index, event)}
    >
      <span
        className={cn(
          'nodrag flex h-6 w-9 items-center justify-center rounded-sm',
          canEdit && reorderable
            ? 'cursor-grab text-muted-foreground/30 hover:text-muted-foreground active:cursor-grabbing'
            : 'text-muted-foreground/15',
        )}
        draggable={canEdit && reorderable}
        onDragStart={(event) => onGripDragStart(column.id, event)}
        onDragEnd={onDragEnd}
        title={reorderable ? t('model.editor.table.reorder') : undefined}
      >
        <GripVertical aria-hidden className="size-8" />
      </span>
      <button
        type="button"
        className={cn('nodrag flex size-5 -m-0.5 items-center justify-center rounded-sm hover:bg-accent', isPk ? 'text-amber-500' : 'text-muted-foreground/40')}
        onClick={togglePk}
        disabled={!canEdit}
        aria-pressed={isPk}
        aria-label={`${t('model.editor.table.primaryKey')} — ${column.physicalName}`}
        title={t('model.editor.table.primaryKey')}
      >
        <KeyRound aria-hidden className="size-3" />
      </button>

      {nameDisplay === 'logical' ? (
        <div className="min-w-0" onDoubleClick={openInfo}>
          <CommitInput
            className="min-w-0 text-sm font-medium"
            value={column.logicalName}
            onCommit={(value) => patch({ logicalName: value })}
            ariaLabel={`${t('model.editor.table.columnLogicalName')} — ${column.physicalName}`}
            placeholder={t('model.editor.table.logicalNamePlaceholder')}
            disabled={!canEdit}
            autoFocus={autoFocus}
            onFocused={onFocusedAuto}
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col" onDoubleClick={openInfo}>
          <div className="flex min-w-0 items-center gap-0.5">
            <CommitInput
              className="min-w-0 flex-1 text-sm font-medium"
              value={column.physicalName}
              onCommit={(value) => patch({ physicalName: value })}
              ariaLabel={`${t('model.editor.table.columnName')} — ${column.physicalName}`}
              required
              disabled={!canEdit}
              autoFocus={autoFocus}
              onFocused={onFocusedAuto}
            />
            {isFk ? (
              <span className="shrink-0 rounded-sm bg-sky-500/15 px-0.5 text-[9px] font-semibold text-sky-600 dark:text-sky-400" title={t('model.editor.table.foreignKey')}>
                FK
              </span>
            ) : null}
          </div>
          {nameDisplay === 'both' ? (
            <CommitInput
              className="min-w-0 text-[9px] text-muted-foreground"
              value={column.logicalName}
              onCommit={(value) => patch({ logicalName: value })}
              ariaLabel={`${t('model.editor.table.columnLogicalName')} — ${column.physicalName}`}
              placeholder={canEdit ? t('model.editor.table.logicalNamePlaceholder') : ' '}
              disabled={!canEdit}
            />
          ) : null}
        </div>
      )}

      <CommitSelect
        className={cn(SETTING_CELL_RULE, 'w-full truncate text-[10px] text-muted-foreground')}
        value={column.dataType}
        options={typeOptions}
        onCommit={(value) =>
          patch({
            dataType: value,
            length: null,
            precision: null,
            scale: null,
            // 정수가 아닌 타입으로 바뀌면 AI는 성립하지 않는다
            autoIncrement: column.autoIncrement && isAutoIncrementType(value),
          })
        }
        ariaLabel={`${t('model.editor.table.dataType')} — ${column.physicalName}`}
        disabled={!canEdit}
      />

      {spec?.precision ? (
        <span className={cn('flex items-center gap-1 px-1', SETTING_CELL_RULE)}>
          <CommitInput
            className={SIZE_INPUT_RULE}
            type="number"
            value={toDisplay(column.precision)}
            onCommit={(value) => patch({ precision: toNumberOrNull(value) })}
            ariaLabel={`${t('model.editor.table.precision')} — ${column.physicalName}`}
            placeholder="10" /* 예시 — DECIMAL(10,2) */
            disabled={!canEdit}
          />
          <CommitInput
            className={SIZE_INPUT_RULE}
            type="number"
            value={toDisplay(column.scale)}
            onCommit={(value) => patch({ scale: toNumberOrNull(value) })}
            ariaLabel={`${t('model.editor.table.scale')} — ${column.physicalName}`}
            placeholder="2" /* 예시 — DECIMAL(10,2) */
            disabled={!canEdit}
          />
        </span>
      ) : spec?.length ? (
        <span className={cn('flex items-center px-1', SETTING_CELL_RULE)}>
          <CommitInput
            className={SIZE_INPUT_RULE}
            type="number"
            value={toDisplay(column.length)}
            onCommit={(value) => patch({ length: toNumberOrNull(value) })}
            ariaLabel={`${t('model.editor.table.length')} — ${column.physicalName}`}
            placeholder="255" /* 예시 — VARCHAR(255) */
            disabled={!canEdit}
          />
        </span>
      ) : (
        // 사이즈 없는 타입도 자리는 지킨다 — 설정 영역 배경·구분선이 행마다 이어진다
        <span aria-hidden className={SETTING_CELL_RULE} />
      )}

      <span className={cn('flex items-center justify-center', SETTING_CELL_RULE)}>
        <button
          type="button"
          className={cn(
            'nodrag flex h-5 -my-1 items-center justify-center rounded-sm px-1 text-[9px] font-semibold leading-none transition-colors',
            !column.nullable
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground/35 hover:bg-accent hover:text-muted-foreground',
          )}
          onClick={() => patch({ nullable: !column.nullable })}
          disabled={!canEdit || isPk}
          aria-pressed={!column.nullable}
          aria-label={`${t('model.editor.table.nullable')} — ${column.physicalName}`}
          title={isPk ? t('model.editor.table.nnPkLocked') : t('model.editor.table.nullable')}
        >
          NN
        </button>
      </span>
      {aiAvailable ? (
        <span className={cn('flex items-center justify-center', SETTING_CELL_RULE)} title={t('model.editor.table.autoIncrement')}>
          <button
            type="button"
            className={cn(
              'nodrag flex h-5 -my-1 items-center justify-center rounded-sm px-1 text-[9px] font-semibold leading-none transition-colors',
              column.autoIncrement
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground/35 hover:bg-accent hover:text-muted-foreground',
            )}
            onClick={() => patch({ autoIncrement: !column.autoIncrement })}
            disabled={!canEdit}
            aria-pressed={column.autoIncrement}
            aria-label={`${t('model.editor.table.autoIncrement')} — ${column.physicalName}`}
          >
            AI
          </button>
        </span>
      ) : (
        // AI 없는 타입도 자리는 지킨다 — 구분선이 행마다 이어진다
        <span aria-hidden className={SETTING_CELL_RULE} />
      )}

      <button
        type="button"
        className="nodrag flex size-5 -m-0.5 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100"
        onClick={() => commit({ type: 'column/remove', tableId, columnId: column.id })}
        disabled={!canEdit}
        aria-label={`${t('model.editor.table.removeColumn')} — ${column.physicalName}`}
      >
        <X aria-hidden className="size-3" />
      </button>
    </div>
  )
}

/* ---------- 축소(줌아웃) 렌더 — 논리명·물리명 라벨 ---------- */

/** 축소 라벨 — 컬럼이 읽히지 않는 배율에서 테이블 신원만 또렷하게 보여준다. 노드 상단에
 *  헤더처럼 딱 붙인(바깥 여백 없음, 여백은 안쪽 padding) **불투명 판**에 논리명(굵게)·물리명을
 *  두 줄로 두고, 아래 상세 영역은 **반투명 베일**로 흐리게 한다. 폰트는 화면 크기 기준(플로우
 *  폰트 = 화면 목표 ÷ 배율)이라 줌아웃해도 이름이 화면에서 같은 크기로 읽힌다(긴 이름은
 *  줄임표). 레이어가 클릭을 직접 받는다 — 클릭·드래그는 언제나 이 노드의 선택·이동이 되고
 *  겹친 테이블에서 뒤 객체가 오선택되지 않는다. zoom을 직접 구독해 줌 틱마다 갱신되지만
 *  자식 없는 잎 컴포넌트라 갱신이 가볍다. */
function CompactNameOverlay({
  logicalName,
  physicalName,
  grab,
  color,
}: {
  logicalName: string
  physicalName: string
  /** 이동 가능 계정 — 그립 커서 표시 (드래그 자체는 레이어가 항상 받는다) */
  grab: boolean
  /** 강조색 — 라벨 판 배경 틴트. 'default'면 기본 회색 판 */
  color: TableColorValue
}) {
  const zoom = useStore((s) => s.transform[2])
  const plate = tableSkin(color).plateStyle
  return (
    <div
      data-compact-table
      className={cn('absolute inset-0 z-30 flex select-none flex-col text-left', grab && 'cursor-grab active:cursor-grabbing')}
    >
      {/* 라벨 판 — 불투명 헤더(#ccc보다 연한 밝은 회색 #e5e5e5·다크 #333). 컨테이너가 stretch라 노드 폭 전체를 쓴다.
          색이 지정되면 테마 --card와 혼합한 틴트 판으로 바뀐다(줌아웃에서도 테이블 색이 구분된다) */}
      <div
        className="flex flex-col items-start gap-0.5 rounded-t-md border-b bg-[#e5e5e5] px-3 py-2 dark:bg-[#333]"
        style={plate}
      >
        {logicalName.length > 0 ? (
          <div className="max-w-full truncate font-semibold text-primary" style={{ fontSize: compactLabelFontSize(COMPACT_LOGICAL_SCREEN_PX, zoom) }}>
            {logicalName}
          </div>
        ) : null}
        <div className="max-w-full truncate text-muted-foreground" style={{ fontSize: compactLabelFontSize(COMPACT_PHYSICAL_SCREEN_PX, zoom) }}>
          {physicalName}
        </div>
      </div>
      {/* 아래 상세 — 반투명 베일로 흐리게(투명도 높게). 바닥 굴곡은 노드 모서리에 맞춘다 */}
      <div data-compact-veil className="min-h-0 flex-1 self-stretch rounded-b-md bg-card/75" />
    </div>
  )
}

/* ---------- 테이블 노드 본체 ---------- */

function TableNodeComponent({ id, selected }: NodeProps<TableNodeType>) {
  const { t } = useTranslation()
  const {
    canEdit,
    openTableInfo,
    openKeyInfo,
    nameDisplay,
    columnDisplay,
    reportSize,
    pendingRelation,
    completeRelation,
    openRelationPicker,
  } = useEditorCanvas()
  // 버전 비교 하이라이트 — 비교 모드(?compare=N)가 아니면 null(배지 없음 — 본체 캔버스 불변)
  const compareMark = useCompareHighlight(id)
  const table = useEditorStore((s) => s.present.model.tables.find((tb) => tb.id === id))
  const width = useEditorStore((s) => s.present.diagram.nodes[id]?.width ?? null)
  const color = useEditorStore((s) => s.present.diagram.nodes[id]?.color ?? 'default')
  const dbmsId = useEditorCanvas().dbmsId
  const fkKey = useEditorStore((s) =>
    s.present.model.relationships
      .flatMap((r) => (r.childTableId === id ? r.columnMappings.map((m) => m.childColumnId) : []))
      .sort()
      .join(' '),
  )
  const commit = useEditorStore((s) => s.commit)

  /* 축소 렌더 여부 — boolean 셀렉터라 배율이 임계를 넘는 순간에만 리렌더된다.
     상세 내용은 그대로 두고(footprint·reportSize 불변) 위쪽에 불투명 라벨 판을 얹는다 */
  const compact = useStore((s) => s.transform[2] < TABLE_COMPACT_ZOOM)

  const [lastAddedId, setLastAddedId] = useState<string | null>(null)
  const fkColumnIds = useMemo(() => new Set(fkKey.length > 0 ? fkKey.split(' ') : []), [fkKey])

  /** 타입 옵션 — 값은 공용 논리 코드 그대로 두고(저장 계약) 라벨만 대상 DBMS 물리 표기로.
   *  매핑이 같은 물리 표기로 겹치면(PG의 SMALLINT←TINYINT, Oracle의 TIMESTAMP←TIME·DATETIME)
   *  먼저 등장한 공용 코드만 노출한다 — 같은 타입이므로 선택 결과는 동일하고 드롭다운에
   *  같은 라벨이 두 번 보이지 않는다. */
  const typeOptions = useMemo(() => {
    const seen = new Set<string>()
    return DATA_TYPES
      .map((type) => ({ value: type.code, label: physicalType(type.code, dbmsId) }))
      .filter((option) => (seen.has(option.label) ? false : seen.add(option.label)))
  }, [dbmsId])

  /* 콘텐츠 자동 폭 — 이름이 잘리지 않게 은신 미러로 텍스트 폭을 재고 노드 폭에 반영한다.
     문서는 커밋(blur) 시에만 바뀌되, 헤더 물리명 초안(nameDraft)은 타이핑 중에도 미러에
     반영해 노드 폭이 즉시 늘어나게 한다(스토어 쓰기는 없음 — 로컬 상태).
     타입 칸 폭도 같은 미러로 잰다 — 표가 실제로 쓰는 가장 긴 물리 라벨에 맞춰 늘어나므로
     라벨(TIMESTAMPTZ·UNIQUEIDENTIFIER…)이 잘리지 않는다. */
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [contentWidth, setContentWidth] = useState(0)
  const [typeWidth, setTypeWidth] = useState(TYPE_MIN_WIDTH)
  const measureRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    let max = 0 // 이름(고정 칸만 더함)·헤더·밴드 폭 후보 — 타입 칸은 아래에서 합친다
    let label = 0 // 타입 라벨 최대 폭(px-1 select 패딩 포함 span)
    for (const child of Array.from(root.children)) {
      const el = child as HTMLElement
      if (el.dataset.kind === 'type') {
        label = Math.max(label, el.offsetWidth)
        continue
      }
      max = Math.max(max, el.offsetWidth + Number(el.dataset.extras ?? 0))
    }
    const nextTypeWidth = Math.min(TYPE_MAX_WIDTH, Math.max(TYPE_MIN_WIDTH, label + 2))
    setTypeWidth((prev) => (prev === nextTypeWidth ? prev : nextTypeWidth))
    setContentWidth(max + nextTypeWidth)
  }, [table, nameDisplay, nameDraft, dbmsId])

  // 렌더 크기(폭·높이)를 캔버스에 보고 — 겹침 해소 트리거. 높이는 실측(모드 전환·컬럼 증감 반영).
  // 조기 return 전에 훅을 둬 순서를 지킨다. 타입 칸이 넓은 표는 이름 칸 최소 폭을 지키려고
  // 하한도 함께 올린다(리사이저 하한·렌더 폭이 같은 기준을 쓰게).
  const effectiveMinWidth = Math.max(MIN_WIDTH, ROW_FIXED_EXTRAS + typeWidth + 50)
  const renderWidth = tableRenderWidth(width, contentWidth, effectiveMinWidth)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    reportSize(id, renderWidth, rootRef.current?.offsetHeight ?? 0)
  }, [id, renderWidth, reportSize, table, nameDisplay, columnDisplay])

  /* 리사이즈 라이브 프리뷰 — 커밋은 onResizeEnd지만 드래그 중에도 폭이 마우스를 따라
     늘어나야 얼마나 늘리는지 보인다. 임시 폭은 로컬 상태로만 갖고 reportSize는
     커밋된 renderWidth 기준을 유지한다(리사이즈 중 겹침 해소 리빌드를 만들지 않는다) */
  const [resizingWidth, setResizingWidth] = useState<number | null>(null)
  const displayWidth = resizingWidth ?? renderWidth

  /* 컬럼 드래그 재정렬 — 같은 영역(PK·일반) 안에서만. FK 영역 행은 그립이 아예 없고,
     다른 영역 행 위의 드롭은 무시된다(영역 이동 불가). PK 여부는 키 버튼으로만 바뀐다. */
  const [dragColumnId, setDragColumnId] = useState<string | null>(null)
  const [dragZone, setDragZone] = useState<'pk' | 'general' | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  /* 진행 중 관계 — 소스 테이블은 강조, 진행 중에는 모든 테이블이 클릭으로 확정을 받는다.
     소스 테이블 자신을 클릭하면 자기 참조 관계(같은 테이블 FK)가 된다 */
  const isPendingSource = pendingRelation?.parentId === id
  const isPickingTarget = pendingRelation !== null

  const handleGripDragStart = (columnId: string, event: DragEvent<HTMLSpanElement>) => {
    if (!table) return
    // FK 영역 컬럼은 드래그가 없다 — 그립이 렌더되지 않지만 방어적으로도 끊는다
    const pkSet = new Set(table.primaryKey?.columnIds ?? [])
    if (!pkSet.has(columnId) && fkColumnIds.has(columnId)) return
    event.dataTransfer?.setData('text/plain', columnId)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    setDragZone(pkSet.has(columnId) ? 'pk' : 'general')
    setDragColumnId(columnId)
  }

  /** 드롭 위치 — 행 위쪽 절반이면 그 행 앞(index), 아래 절반이면 뒤(index+1) */
  const dropIndexFromEvent = (index: number, event: DragEvent<HTMLElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    const below = rect.height > 0 && event.clientY - rect.top > rect.height / 2
    return below ? index + 1 : index
  }

  const handleRowDragOver = (index: number, event: DragEvent<HTMLElement>) => {
    if (!dragColumnId || !dragZone) return
    // 드래그 중인 컬럼과 같은 영역의 행만 놓음 허용 — FK 영역에는 어떤 드롭도 안 된다
    if (event.currentTarget.dataset.zone !== dragZone) return
    event.preventDefault()
    event.stopPropagation() // 컨테이너(맨 뒤) 핸들러가 행 위치를 덮어쓰지 않게
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const at = dropIndexFromEvent(index, event)
    setDropAt((prev) => (prev === at ? prev : at))
  }

  const handleRowDrop = (index: number, event: DragEvent<HTMLElement>) => {
    if (!dragColumnId || !dragZone) return
    if (event.currentTarget.dataset.zone !== dragZone) return
    event.preventDefault()
    event.stopPropagation()
    reorderColumn(dragColumnId, dropAt ?? dropIndexFromEvent(index, event))
  }

  /** 컬럼 목록 하단 여백 — 맨 뒤(일반 영역 끝)로. 일반 컬럼 드래그일 때만 */
  const handleListDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!dragColumnId || dragZone !== 'general' || !table) return
    event.preventDefault()
    setDropAt((prev) => (prev === table.columns.length ? prev : table.columns.length))
  }

  const handleListDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!dragColumnId || dragZone !== 'general' || !table) return
    event.preventDefault()
    event.stopPropagation()
    reorderColumn(dragColumnId, table.columns.length)
  }

  const endDrag = () => {
    setDragColumnId(null)
    setDragZone(null)
    setDropAt(null)
  }

  const reorderColumn = (columnId: string, dropIndex: number) => {
    const { present } = useEditorStore.getState()
    const target = present.model.tables.find((tb) => tb.id === id)
    if (target) {
      const from = target.columns.findIndex((c) => c.id === columnId)
      if (from >= 0) {
        // 영역 경계 — 선두 연속 PK 길이와 그 뒤 연속 FK 길이. 드롭 인덱스를 영역 안으로 가둔다
        const pkIdSet = new Set(target.primaryKey?.columnIds ?? [])
        const fkIds = new Set(
          present.model.relationships.flatMap((r) =>
            r.childTableId === id ? r.columnMappings.map((m) => m.childColumnId) : [],
          ),
        )
        let pkLen = 0
        for (const c of target.columns) {
          if (pkIdSet.has(c.id)) pkLen += 1
          else break
        }
        let fkLen = 0
        for (let i = pkLen; i < target.columns.length; i += 1) {
          if (fkIds.has(target.columns[i].id)) fkLen += 1
          else break
        }
        // dropIndex는 원본 배열 기준 — 제거 후 인덱스로 보정한다 (column/move 계약)
        let to = dropIndex > from ? dropIndex - 1 : dropIndex
        if (pkIdSet.has(columnId)) {
          to = Math.min(Math.max(to, 0), pkLen - 1) // 드래그 대상을 뺀 PK 영역 끝
        } else {
          to = Math.min(Math.max(to, pkLen + fkLen), target.columns.length - 1)
        }
        if (to !== from) commit({ type: 'column/move', tableId: id, columnId, toIndex: to })
      }
    }
    endDrag()
  }

  if (!table) return null

  /** 강조색 스킨 — 헤더 밴드·테두리·축소 라벨 판에 얹는다. 'default'면 스타일 없음(기본 렌더) */
  const skin = tableSkin(color)

  const addColumn = () => {
    const column = createColumn({ physicalName: nextColumnName(table.columns) })
    commit({ type: 'column/add', tableId: id, column })
    setLastAddedId(column.id)
  }

  const columnById = new Map(table.columns.map((c) => [c.id, c]))

  const pkIds = new Set(table.primaryKey?.columnIds ?? [])
  /** 영역별 행 분류 — 표시 순서 = PK → FK(PK 바로 밑) → 일반. index는 원본 배열 기준(드래그 드롭 위치).
   *  파싱 시점 정규화(content-io)로 데이터가 이미 이 순서지만, 순서가 흐트러져 저장된 문서에 대비해
   *  렌더에서도 영역 순서를 가둔다(stable sort — 영역 안 순서는 유지). */
  const ZONE_RANK: Record<'pk' | 'fk' | 'general', number> = { pk: 0, fk: 1, general: 2 }
  const zoneRows: { zone: 'pk' | 'fk' | 'general'; column: ErdColumn; index: number }[] = table.columns
    .map((column, index) => ({
      zone: pkIds.has(column.id)
        ? ('pk' as const)
        : fkColumnIds.has(column.id)
          ? ('fk' as const)
          : ('general' as const),
      column,
      index,
    }))
    .sort((a, b) => ZONE_RANK[a.zone] - ZONE_RANK[b.zone])
  /** 키만 보기 — 일반 컬럼 행을 감춘다. 높이는 줄지만 폭은 측정 미러(전체 컬럼)가 정하므로
   *  모드를 전환해도 노드 폭이 흔들리지 않는다 */
  const visibleRows = zoneRows.filter((row) => isZoneVisible(row.zone, columnDisplay))

  return (
    <div
      ref={rootRef}
      data-nodekind="table"
      className={cn(
        'relative flex h-full flex-col rounded-md border bg-card text-card-foreground shadow-sm',
        selected && 'border-primary ring-1 ring-primary',
        // 진행 중 관계의 소스 — 하늘색 강조
        isPendingSource && 'border-sky-500 ring-2 ring-sky-500/60',
      )}
      style={{ width: displayWidth, ...skin.borderStyle }}
      // 버튼·셀렉트의 연속 클릭(NN 토글 등)이 노드 더블클릭(테이블 정보)로 새지 않게 차단.
      // 이름 더블클릭(컬럼 정보)은 input이라 그대로 통과시킨다.
      onDoubleClickCapture={(event) => {
        if ((event.target as HTMLElement).closest('button, select')) event.stopPropagation()
      }}
    >
      {/* 자동 폭 측정용 미러 — 레이아웃에 영향 없는 은신 절대 배치, data-extras = 행 고정 칸 */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex w-max flex-col items-start whitespace-pre"
      >
        <span data-extras={BAND_EXTRAS} className="px-2 text-xs font-medium">{table.logicalName}</span>
        <span data-extras={HEADER_EXTRAS} className="px-1 text-xs font-semibold">{nameDraft ?? table.physicalName}</span>
        {table.columns.map((column) => (
          <Fragment key={column.id}>
            {nameDisplay === 'logical' ? (
              <span data-extras={ROW_FIXED_EXTRAS} className="px-1 text-sm font-medium">{column.logicalName}</span>
            ) : (
              <>
                {/* 컬럼명 span은 실제 input(text-sm font-medium)과 같은 폰트로 재고, FK 배지 폭도 함께 계산한다.
                    extras는 타입 칸을 뺀 고정 칸 — 타입 칸 폭은 effect에서 합친다 */}
                <span data-extras={ROW_FIXED_EXTRAS} className="px-1 text-sm font-medium">
                  {column.physicalName}
                  {fkColumnIds.has(column.id) ? <span className="ml-0.5 px-0.5 text-[9px] font-semibold">FK</span> : null}
                </span>
                {nameDisplay === 'both' ? (
                  <span data-extras={ROW_FIXED_EXTRAS} className="px-1 text-[9px]">{column.logicalName}</span>
                ) : null}
              </>
            )}
            {/* 타입 라벨 폭 — select(px-1·text-[10px])와 같은 꾸밈. 표에서 가장 긴 라벨에
                타입 칸을 맞춘다(TIMESTAMPTZ·UNIQUEIDENTIFIER가 잘리지 않게) */}
            <span data-kind="type" className="px-1 text-[10px]">{physicalType(column.dataType, dbmsId)}</span>
          </Fragment>
        ))}
        {/* UK·IX 이름은 자동 폭 계산에서 뺀다 — 긴 키 이름(예: uk_a_b_c (col1, col2, col3))이
            상자 폭을 실제 컬럼보다 훨씬 크게 부풀려, 모든 행의 이름↔타입 사이에 커다란 빈칸을
            만든다. KeyRow는 truncate + title 툴팁이라 좁아도 정보를 잃지 않는다. */}
      </div>
      {canEdit ? (
        <NodeResizer
          isVisible={selected}
          minWidth={effectiveMinWidth}
          onResize={(_, params) => setResizingWidth(Math.round(params.width))}
          onResizeEnd={(_, params) => {
            commit({ type: 'node/resize', tableId: id, width: Math.round(params.width) })
            setResizingWidth(null)
          }}
        />
      ) : null}
      {/* 리사이즈 중 폭 표시 — 드래그 즉시 값이 보여야 늘리는 폭을 읽을 수 있다 */}
      {resizingWidth !== null ? (
        <span className="nodrag pointer-events-none absolute -top-7 right-0 rounded border bg-popover px-1.5 py-0.5 text-[10px] tabular-nums text-popover-foreground shadow-sm">
          {resizingWidth}px
        </span>
      ) : null}

      {/* 버전 비교 배지 — 최신 버전 캔버스에서 변경된 테이블 우상단 +/~ 마커 */}
      {compareMark ? <DiffActionBadge action={compareMark} className="-top-2 -right-2 z-10" /> : null}

      {/* 드래그 핸들 밴드 — 논리명 상시 표시(보기 옵션과 무관·표시 전용, 수정은 정보 다이얼로그) + 이동 그립.
          강조색이 지정되면 밴드 배경을 색 틴트로 덮는다(선택 강조 bg-primary/25 대신 링이 선택을 알린다) */}
      <div
        className={cn(
          'flex h-7 items-center gap-1 rounded-t-md px-2',
          color === 'default' && 'bg-primary/15',
          color === 'default' && selected && 'bg-primary/25',
          canEdit && 'cursor-grab active:cursor-grabbing',
        )}
        style={skin.bandStyle}
        title={t('model.editor.table.dragHandle')}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary/80">{table.logicalName}</span>
        <GripHorizontal aria-hidden className="size-3.5 shrink-0 text-primary/60" />
      </div>

      {/* 물리명 헤더 — 항상 표시·편집 (보기 옵션 영향 없음) */}
      <div className="nodrag flex items-center gap-0.5 border-b bg-muted/60 px-1 py-1">
        <CommitInput
          className="min-w-0 flex-1 text-xs font-semibold"
          value={table.physicalName}
          onCommit={(value) => {
            // 문서 내 다른 테이블과 물리명이 겹치면 확정하지 않는다 — 안내 후 초안 되돌림
            if (isDuplicateTableName(useEditorStore.getState().present.model, id, value)) {
              toast.error(t('model.editor.table.nameDuplicate', { name: value }))
              return false
            }
            commit({ type: 'table/patch', tableId: id, patch: { physicalName: value } })
          }}
          onDraftChange={setNameDraft}
          ariaLabel={t('model.editor.table.physicalName')}
          required
          disabled={!canEdit}
          placeholder="table_name"
        />
        <button
          type="button"
          className="nodrag flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
          onClick={() => openTableInfo(id)}
          disabled={!canEdit}
          aria-label={t('model.editor.table.info')}
          title={t('model.editor.table.info')}
        >
          <Info aria-hidden className="size-3.5" />
        </button>
      </div>

      <div className="nodrag flex-1 overflow-y-auto" onDragOver={handleListDragOver} onDrop={handleListDrop}>
        {/* PK 영역 → FK 영역(PK 바로 밑, 하늘) → 일반 영역 순서로 그린다.
            구분선은 영역이 바뀌는 지점 — 위쪽 영역 색(PK 끝=주황, FK 끝=하늘) */}
        {visibleRows.map((row, displayIndex) => {
          const above = displayIndex > 0 ? visibleRows[displayIndex - 1].zone : null
          const { zone, column, index } = row
          return (
            <Fragment key={column.id}>
            {above !== null && above !== zone ? (
              <div className={cn('border-t-2', above === 'pk' ? 'border-amber-500/50' : 'border-sky-500/40')} aria-hidden />
            ) : null}
            <ColumnRow
              tableId={id}
              column={column}
              index={index}
              isPk={zone === 'pk'}
              isFk={fkColumnIds.has(column.id)}
              zone={zone}
              reorderable={zone !== 'fk'}
              pkCount={pkIds.size}
              canEdit={canEdit}
              autoFocus={lastAddedId === column.id}
              onFocusedAuto={() => setLastAddedId(null)}
              rowGrid={rowGridOf(typeWidth)}
              isDragging={dragColumnId === column.id}
              isInsertAbove={dropAt === index}
              isInsertBelow={dropAt === index + 1}
              onGripDragStart={handleGripDragStart}
              onRowDragOver={handleRowDragOver}
              onRowDrop={handleRowDrop}
              onDragEnd={endDrag}
              typeOptions={typeOptions}
            />
            </Fragment>
          )
        })}
        {/* 키만 보기에서는 컬럼 추가 버튼을 숨긴다 — 새 컬럼은 일반이라 이 모드에선 안 보이므로 */}
        {canEdit && columnDisplay === 'all' ? (
          <button
            type="button"
            className="nodrag flex w-full items-center gap-1 border-t px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={addColumn}
          >
            <Plus aria-hidden className="size-3" />
            {t('model.editor.table.addColumn')}
          </button>
        ) : null}

        {/* 키 영역 — 유니크·인덱스(복합 포함). 행 클릭 = 편집 다이얼로그, X = 삭제.
            읽기 전용은 존재하는 행만 표시한다(추가 버튼 없음). */}
        {canEdit || table.uniques.length > 0 || table.indexes.length > 0 ? (
          <div className="border-t bg-muted/30">
            {table.uniques.map((unique) => (
              <KeyRow
                key={unique.id}
                kind="unique"
                name={unique.name}
                columnNames={unique.columnIds.map((cid) => columnById.get(cid)?.physicalName ?? '?')}
                canEdit={canEdit}
                onEdit={() => openKeyInfo(id, unique.id, 'unique')}
                onRemove={() =>
                  commit({ type: 'uniqueKey/set', tableId: id, uniques: table.uniques.filter((u) => u.id !== unique.id) })
                }
              />
            ))}
            {table.indexes.map((index) => (
              <KeyRow
                key={index.id}
                kind="index"
                name={index.name}
                columnNames={index.columns.map((entry) => `${columnById.get(entry.columnId)?.physicalName ?? '?'} ${entry.order}`)}
                canEdit={canEdit}
                onEdit={() => openKeyInfo(id, index.id, 'index')}
                onRemove={() =>
                  commit({ type: 'index/set', tableId: id, indexes: table.indexes.filter((i) => i.id !== index.id) })
                }
              />
            ))}
            {canEdit ? (
              <div className="flex items-center gap-1 px-1 py-1">
                <button
                  type="button"
                  className="nodrag flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => openKeyInfo(id, null, 'unique')}
                >
                  <Plus aria-hidden className="size-3" />
                  {t('model.editor.key.addUnique')}
                </button>
                <button
                  type="button"
                  className="nodrag flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => openKeyInfo(id, null, 'index')}
                >
                  <Plus aria-hidden className="size-3" />
                  {t('model.editor.key.addIndex')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 축소 렌더 — 노드 상단에 논리명·물리명 불투명 판, 아래 상세엔 반투명 베일(z-30).
          레이어가 클릭을 받아 이 노드가 선택·이동된다 — 겹친 뒤 객체 오선택 방지 */}
      {compact ? (
        <CompactNameOverlay grab={canEdit} logicalName={table.logicalName} physicalName={table.physicalName} color={color} />
      ) : null}

      {/* 관계 시작 — 점 근처 밴드 클릭으로 캔버스 오버레이 선택기를 연다. 진행 중 관계가 있으면 치운다(클릭 확정 방해 없게) */}
      {canEdit && !pendingRelation
        ? RELATION_BANDS.map(({ side, className }) => (
            <div
              key={side}
              data-relation-band={side}
              title={t('model.editor.relation.startMenu')}
              className={cn(
                'nodrag absolute z-20 cursor-pointer rounded-sm transition-colors hover:bg-primary/25',
                className,
              )}
              onClick={(event) => {
                event.stopPropagation() // 노드 클릭(연결 확정)과 구분
                openRelationPicker(id, side)
              }}
            />
          ))
        : null}

      {/* 관계 확정 — 진행 중에는 노드 전체를 덮는 투명 레이어로 클릭을 받는다.
          컬럼 input·타입 select 위를 눌러도 편집이 아니라 연결로 취급되게. */}
      {isPickingTarget ? (
        <div
          data-relation-target
          className="absolute inset-0 z-40 cursor-crosshair"
          onClick={(event) => {
            event.stopPropagation()
            completeRelation(id)
          }}
        />
      ) : null}

      {/* 관계선 엣지는 자식→부모 방향 — RF가 target 노드에서 target 타입 핸들을 찾으므로 각 면에
          source·target을 겹쳐 놓는다(같은 id·위치). source만 있으면 "Couldn't create edge for
          target handle id" 경고와 함께 엣지가 아예 안 그려진다.
          점은 보이는 마커로 그대로 두되 드래그로 선을 그리는 기능은 꺼 둔다(사용자 요청) —
          isConnectable=false면 RF가 연결을 시작하지 않는다. target은 보이지 않는 앵커 역할. */}
      <Handle id="top" type="source" position={Position.Top} isConnectable={false} className={cn('!size-3 !border-2 !border-background !bg-muted-foreground', !canEdit && '!opacity-0')} />
      <Handle id="bottom" type="source" position={Position.Bottom} isConnectable={false} className={cn('!size-3 !border-2 !border-background !bg-muted-foreground', !canEdit && '!opacity-0')} />
      <Handle id="left" type="source" position={Position.Left} isConnectable={false} className={cn('!size-3 !border-2 !border-background !bg-muted-foreground', !canEdit && '!opacity-0')} />
      <Handle id="right" type="source" position={Position.Right} isConnectable={false} className={cn('!size-3 !border-2 !border-background !bg-muted-foreground', !canEdit && '!opacity-0')} />
      <Handle id="top" type="target" position={Position.Top} isConnectable={false} className="pointer-events-none !size-3 !border-0 !bg-transparent" />
      <Handle id="bottom" type="target" position={Position.Bottom} isConnectable={false} className="pointer-events-none !size-3 !border-0 !bg-transparent" />
      <Handle id="left" type="target" position={Position.Left} isConnectable={false} className="pointer-events-none !size-3 !border-0 !bg-transparent" />
      <Handle id="right" type="target" position={Position.Right} isConnectable={false} className="pointer-events-none !size-3 !border-0 !bg-transparent" />
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
