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
 */
import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { GripHorizontal, GripVertical, Info, KeyRound, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from 'cn'
import { createColumn, pkToggleChanges, type ColumnPatch } from '@/features/editor/model/changes'
import { DATA_TYPES, dataTypeSpec, isAutoIncrementType, physicalType } from '@/features/editor/model/dbms'
import type { KeyKind } from '@/features/editor/model/keys'
import type { ErdColumn } from '@/features/editor/model/content-schema'
import { isDuplicateTableName } from '@/features/editor/model/validation'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { useEditorCanvas, type RelationHandleId } from './editor-context'
import { CommitInput, CommitSelect } from './inline-inputs'

export type TableNodeData = Record<string, never>
export type TableNodeType = Node<TableNodeData, 'table'>

const DEFAULT_WIDTH = 340
/** 컬럼 그리드 고정 칸(타입·길이·NN·AI·삭제 ≈ 190px)을 감당하는 렌더 하한 —
 *  과거에 좁게 저장된 width도 이름 칸이 안 눌리게 한다 */
const MIN_WIDTH = 300
/** 콘텐츠 자동 폭 — 측정한 텍스트 폭에 더하는 각 행의 고정 칸(그립·PK·타입·길이·NN·AI·삭제·FK 배지) */
const ROW_EXTRAS = 250
const HEADER_EXTRAS = 64
const BAND_EXTRAS = 60
/** 키 행 고정 칸 — UK/IX 배지·삭제 버튼·여백 */
const KEY_EXTRAS = 64
/** 컬럼 그리드 — 그립·PK·이름·타입·길이·NN·AI·삭제 */
const ROW_GRID = '36px 16px minmax(0,1fr) 62px 44px 20px 20px 16px'

/** 노드 렌더 폭 — 저장 폭·측정 콘텐츠 폭·하한 중 최대 (ErdCanvas 겹침 해소도 같은 값 사용) */
export function tableRenderWidth(stored: number | null, contentWidth: number): number {
  return Math.max(stored ?? DEFAULT_WIDTH, contentWidth, MIN_WIDTH)
}

/** 겹침 판정용 높이 추정 — Chrome 실측 기준(컬럼 행 47, 키 행 25):
 *  밴드 28 + 컬럼 툴바 29 + PK 구분선 2 + 컬럼 행 × 47 + 컬럼 추가 버튼 24
 *  + UK/IX 컨테이너(빈 28) + 키 행 × 25 + 테두리. 자동 배치(elkjs) 레이어 간격의 기준이 된다. */
export function estimateTableHeight(columnCount: number, keyRowCount = 0): number {
  return 112 + columnCount * 47 + keyRowCount * 25
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
      style={{ gridTemplateColumns: ROW_GRID }}
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
        className="w-full truncate text-[10px] text-muted-foreground"
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
        <span className="flex items-center justify-center gap-px">
          <CommitInput
            className="w-full text-center text-[10px] text-muted-foreground"
            type="number"
            value={toDisplay(column.precision)}
            onCommit={(value) => patch({ precision: toNumberOrNull(value) })}
            ariaLabel={`${t('model.editor.table.precision')} — ${column.physicalName}`}
            disabled={!canEdit}
          />
          <CommitInput
            className="w-full text-center text-[10px] text-muted-foreground"
            type="number"
            value={toDisplay(column.scale)}
            onCommit={(value) => patch({ scale: toNumberOrNull(value) })}
            ariaLabel={`${t('model.editor.table.scale')} — ${column.physicalName}`}
            disabled={!canEdit}
          />
        </span>
      ) : spec?.length ? (
        <CommitInput
          className="w-full text-center text-[10px] text-muted-foreground"
          type="number"
          value={toDisplay(column.length)}
          onCommit={(value) => patch({ length: toNumberOrNull(value) })}
          ariaLabel={`${t('model.editor.table.length')} — ${column.physicalName}`}
          disabled={!canEdit}
        />
      ) : (
        <span aria-hidden />
      )}

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
      {aiAvailable ? (
        <span className="flex" title={t('model.editor.table.autoIncrement')}>
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
        <span aria-hidden />
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

/* ---------- 테이블 노드 본체 ---------- */

function TableNodeComponent({ id, selected }: NodeProps<TableNodeType>) {
  const { t } = useTranslation()
  const {
    canEdit,
    openTableInfo,
    openKeyInfo,
    nameDisplay,
    reportSize,
    pendingRelation,
    completeRelation,
    openRelationPicker,
  } = useEditorCanvas()
  const table = useEditorStore((s) => s.present.model.tables.find((tb) => tb.id === id))
  const width = useEditorStore((s) => s.present.diagram.nodes[id]?.width ?? null)
  const dbmsId = useEditorCanvas().dbmsId
  const fkKey = useEditorStore((s) =>
    s.present.model.relationships
      .flatMap((r) => (r.childTableId === id ? r.columnMappings.map((m) => m.childColumnId) : []))
      .sort()
      .join(' '),
  )
  const commit = useEditorStore((s) => s.commit)

  const [lastAddedId, setLastAddedId] = useState<string | null>(null)
  const fkColumnIds = useMemo(() => new Set(fkKey.length > 0 ? fkKey.split(' ') : []), [fkKey])

  /** 타입 옵션 — 값은 공용 논리 코드 그대로 두고(저장 계약) 라벨만 대상 DBMS 물리 표기로 */
  const typeOptions = useMemo(
    () => DATA_TYPES.map((type) => ({ value: type.code, label: physicalType(type.code, dbmsId) })),
    [dbmsId],
  )

  /* 콘텐츠 자동 폭 — 이름이 잘리지 않게 은신 미러로 텍스트 폭을 재고 노드 폭에 반영한다.
     문서는 커밋(blur) 시에만 바뀌되, 헤더 물리명 초안(nameDraft)은 타이핑 중에도 미러에
     반영해 노드 폭이 즉시 늘어나게 한다(스토어 쓰기는 없음 — 로컬 상태). */
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [contentWidth, setContentWidth] = useState(0)
  const measureRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    let max = 0
    for (const child of Array.from(root.children)) {
      const el = child as HTMLElement
      max = Math.max(max, el.offsetWidth + Number(el.dataset.extras ?? 0))
    }
    setContentWidth(max)
  }, [table, nameDisplay, nameDraft])

  // 렌더 크기(폭·높이)를 캔버스에 보고 — 겹침 해소 트리거. 높이는 실측(모드 전환·컬럼 증감 반영).
  // 조기 return 전에 훅을 둬 순서를 지킨다
  const renderWidth = tableRenderWidth(width, contentWidth)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    reportSize(id, renderWidth, rootRef.current?.offsetHeight ?? 0)
  }, [id, renderWidth, reportSize, table, nameDisplay])

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

  const addColumn = () => {
    const column = createColumn({ physicalName: nextColumnName(table.columns) })
    commit({ type: 'column/add', tableId: id, column })
    setLastAddedId(column.id)
  }

  const columnById = new Map(table.columns.map((c) => [c.id, c]))
  /** 키 컬럼 물리명 나열 — cascade가 참조를 항상 정리하므로 못 찾는 id는 없다(방어적으로 ?) */
  const namesOf = (columnIds: string[]) =>
    columnIds.map((cid) => columnById.get(cid)?.physicalName ?? '?').join(', ')

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
      style={{ width: displayWidth }}
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
              <span data-extras={ROW_EXTRAS} className="px-1 text-sm font-medium">{column.logicalName}</span>
            ) : (
              <>
                {/* 컬럼명 span은 실제 input(text-sm font-medium)과 같은 폰트로 재고, FK 배지 폭도 함께 계산한다 */}
                <span data-extras={ROW_EXTRAS} className="px-1 text-sm font-medium">
                  {column.physicalName}
                  {fkColumnIds.has(column.id) ? <span className="ml-0.5 px-0.5 text-[9px] font-semibold">FK</span> : null}
                </span>
                {nameDisplay === 'both' ? (
                  <span data-extras={ROW_EXTRAS} className="px-1 text-[9px]">{column.logicalName}</span>
                ) : null}
              </>
            )}
          </Fragment>
        ))}
        {table.uniques.map((unique) => (
          <span key={unique.id} data-extras={KEY_EXTRAS} className="px-1 text-[10px]">{`${unique.name} (${namesOf(unique.columnIds)})`}</span>
        ))}
        {table.indexes.map((index) => (
          <span key={index.id} data-extras={KEY_EXTRAS} className="px-1 text-[10px]">
            {`${index.name} (${index.columns.map((e) => `${columnById.get(e.columnId)?.physicalName ?? '?'} ${e.order}`).join(', ')})`}
          </span>
        ))}
      </div>
      {canEdit ? (
        <NodeResizer
          isVisible={selected}
          minWidth={MIN_WIDTH}
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

      {/* 드래그 핸들 밴드 — 논리명 상시 표시(보기 옵션과 무관·표시 전용, 수정은 정보 다이얼로그) + 이동 그립 */}
      <div
        className={cn(
          'flex h-7 items-center gap-1 rounded-t-md bg-primary/15 px-2',
          selected && 'bg-primary/25',
          canEdit && 'cursor-grab active:cursor-grabbing',
        )}
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
        {zoneRows.map((row, displayIndex) => {
          const above = displayIndex > 0 ? zoneRows[displayIndex - 1].zone : null
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
        {canEdit ? (
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
          target handle id" 경고와 함께 엣지가 아예 안 그려진다. target은 보이지 않는 앵커 역할. */}
      <Handle id="top" type="source" position={Position.Top} isConnectable={canEdit} className={cn('!size-3 !border-2 !border-background !bg-muted-foreground', !canEdit && '!opacity-0')} />
      <Handle id="bottom" type="source" position={Position.Bottom} isConnectable={canEdit} className={cn('!size-3 !border-2 !border-background !bg-muted-foreground', !canEdit && '!opacity-0')} />
      <Handle id="left" type="source" position={Position.Left} isConnectable={canEdit} className={cn('!size-3 !border-2 !border-background !bg-muted-foreground', !canEdit && '!opacity-0')} />
      <Handle id="right" type="source" position={Position.Right} isConnectable={canEdit} className={cn('!size-3 !border-2 !border-background !bg-muted-foreground', !canEdit && '!opacity-0')} />
      <Handle id="top" type="target" position={Position.Top} isConnectable={false} className="pointer-events-none !size-3 !border-0 !bg-transparent" />
      <Handle id="bottom" type="target" position={Position.Bottom} isConnectable={false} className="pointer-events-none !size-3 !border-0 !bg-transparent" />
      <Handle id="left" type="target" position={Position.Left} isConnectable={false} className="pointer-events-none !size-3 !border-0 !bg-transparent" />
      <Handle id="right" type="target" position={Position.Right} isConnectable={false} className="pointer-events-none !size-3 !border-0 !bg-transparent" />
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
