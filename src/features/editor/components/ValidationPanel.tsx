/**
 * 설계 검증 패널 — 에디터 좌측 3번째 패널 (v1.20, 05-editor/05-validation.md §4)
 *
 * ERD 린터(validateModel) 결과를 등급별로 보여주고 행 클릭으로 대상 테이블에 포커스한다.
 * - 요약 행(등급별 칩, role="status") + 등급 필터(세션 상태) + 테이블 그룹 목록.
 * - 정렬은 등급 → 테이블(문서 순서) → Rule ID. 같은 테이블의 연속 문제는 그룹 헤더로 묶는다.
 * - 클릭 → 선택 + 포커스 이동(익스플로러 focusTable과 같은 방식 — 스토어 좌표에서
 *   뷰포트를 계산해 setViewport). 관계 규칙은 자식 테이블로 이동한다.
 * - 패널을 열 때 감사로 검증 실행 1회를 남긴다(validation-runs, Editor 멤버십 — 역할은
 *   서버가 재검증). 디바운스 재계산마다 보내지 않는다(§5).
 * - 패널은 열릴 때만 마운트된다(open 아니면 null — 익스플로러·용어사전과 같은 패턴).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from 'cn'
import type { ErdRelationship, ErdTable } from '@/features/editor/model/content-schema'
import { viewportCenteredOn, type CanvasExtent } from '@/features/editor/model/canvas-bounds'
import { recordValidationRun } from '@/features/models/api'
import type { ValidationIssue, ValidationLevel } from '@/features/editor/model/validation'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { estimateTableHeight, tableRenderWidth } from '@/features/editor/model/table-size'

/** 포커스 클램프용 extent·줌 하한 — 익스플로러(ModelExplorerPanel)와 같은 값 */
const FOCUS_EXTENT: CanvasExtent = [
  [-1e9, -1e9],
  [1e9, 1e9],
]
const FOCUS_MIN_ZOOM = 0.6

/** 등급 정렬 순위·표기 재료 — error → warning → info */
const LEVELS: readonly ValidationLevel[] = ['error', 'warning', 'info']
const LEVEL_RANK: Record<ValidationLevel, number> = { error: 0, warning: 1, info: 2 }

export interface ValidationPanelProps {
  open: boolean
  /** 에디터 셸이 디바운스 재계산한 결과 — 패널은 순수하게 소비만 한다 */
  issues: ValidationIssue[]
  /** 감사 전송 여부 — Editor 멤버십(Viewer 열람은 전송 없음, 역할은 서버가 재검증) */
  canReport: boolean
  workspaceId: string
  modelId: string
}

export function ValidationPanel(props: ValidationPanelProps) {
  if (!props.open) return null
  return (
    <PanelBody
      issues={props.issues}
      canReport={props.canReport}
      workspaceId={props.workspaceId}
      modelId={props.modelId}
    />
  )
}

function PanelBody({ issues, canReport, workspaceId, modelId }: Omit<ValidationPanelProps, 'open'>) {
  const { t } = useTranslation()
  const rf = useReactFlow()
  const setSelection = useEditorStore((s) => s.setSelection)
  const tables = useEditorStore((s) => s.present.model.tables)
  const relationships = useEditorStore((s) => s.present.model.relationships)
  const [levels, setLevels] = useState<ReadonlySet<ValidationLevel>>(() => new Set(LEVELS))

  const counts = useMemo(
    () => ({
      error: issues.filter((issue) => issue.level === 'error').length,
      warning: issues.filter((issue) => issue.level === 'warning').length,
      info: issues.filter((issue) => issue.level === 'info').length,
    }),
    [issues],
  )

  /** 감사 1회 전송 — 패널 열림(마운트) 시점의 건수. ref 세티넬은 StrictMode 이중
   *  마운트(개발 모드 setup→cleanup→setup, ref는 유지)에서도 1회로 묶는다.
   *  실패해도 검증 사용을 막지 않는다(§1 — 흐름 차단 없음) */
  const reportedRef = useRef(false)
  useEffect(() => {
    if (!canReport || reportedRef.current) return
    reportedRef.current = true
    void recordValidationRun(workspaceId, modelId, {
      errorCount: counts.error,
      warningCount: counts.warning,
      infoCount: counts.info,
    }).catch(() => {})
  }, [canReport, counts, workspaceId, modelId])

  /* ---------- 포커스 — 대상 테이블을 화면 중심으로 (익스플로러와 같은 식) ---------- */

  const focusTable = useCallback(
    (tableId: string) => {
      const state = useEditorStore.getState()
      const table = state.present.model.tables.find((tb) => tb.id === tableId)
      const layout = state.present.diagram.nodes[tableId]
      if (!table || !layout) return
      const w = tableRenderWidth(layout.width ?? null, 0)
      const h = estimateTableHeight(table.columns.length, table.uniques.length + table.indexes.length)
      const el = document.querySelector('.react-flow')
      const size = el
        ? { width: el.clientWidth, height: el.clientHeight }
        : { width: window.innerWidth || 1200, height: window.innerHeight || 800 }
      const zoom = Math.max(rf.getViewport().zoom, FOCUS_MIN_ZOOM)
      rf.setViewport(
        viewportCenteredOn({ x: layout.x + w / 2, y: layout.y + h / 2 }, zoom, size, FOCUS_EXTENT),
        { duration: 200 },
      )
    },
    [rf],
  )

  /* ---------- 목록 조립 — 등급 → 테이블(문서 순서) → Rule ID 정렬 후 테이블 그룹 ---------- */

  const labelContext = useMemo(() => buildLabelContext(tables, relationships), [tables, relationships])
  const groups = useMemo(() => {
    const order = new Map(tables.map((table, index) => [table.id, index] as const))
    const visible = issues
      .filter((issue) => levels.has(issue.level) && issue.tableId && order.has(issue.tableId))
      .sort(
        (a, b) =>
          LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
          (order.get(a.tableId!) ?? 0) - (order.get(b.tableId!) ?? 0) ||
          a.code.localeCompare(b.code),
      )
    const grouped: { tableId: string; issues: ValidationIssue[] }[] = []
    for (const issue of visible) {
      const last = grouped[grouped.length - 1]
      if (last && last.tableId === issue.tableId) last.issues.push(issue)
      else grouped.push({ tableId: issue.tableId!, issues: [issue] })
    }
    return grouped
  }, [issues, levels, tables])

  const totalCount = counts.error + counts.warning + counts.info

  return (
    <aside
      data-testid="validation-panel"
      aria-label={t('model.validation.title')}
      className="flex h-full w-72 shrink-0 flex-col border-r bg-background"
    >
      {/* 요약 행 + 등급 필터 — 칩 3개가 요약이자 필터 토글이다(활성=보임, 비활성=숨김) */}
      <div className="border-b px-2 py-1.5">
        <p role="status" aria-live="polite" data-testid="validation-summary" className="sr-only">
          {t('model.validation.summary', {
            error: counts.error,
            warning: counts.warning,
            info: counts.info,
          })}
        </p>
        <div className="flex items-center gap-1" role="group" aria-label={t('model.validation.filterLabel')}>
          {LEVELS.map((level) => {
            const count = counts[level]
            const active = levels.has(level)
            return (
              <button
                key={level}
                type="button"
                data-testid={`validation-filter-${level}`}
                onClick={() =>
                  setLevels((prev) => {
                    const next = new Set(prev)
                    // 전부 끄는 것은 허용하지 않는다 — 빈 목록은 필터가 아니라 문서 상태다
                    if (next.has(level)) {
                      if (next.size === 1) return prev
                      next.delete(level)
                    } else next.add(level)
                    return next
                  })
                }
                aria-pressed={active}
                className={cn(
                  'flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs font-medium tabular-nums',
                  !active && 'opacity-40',
                  level === 'error' && 'border-destructive/40 text-destructive',
                  level === 'warning' && 'border-amber-500/40 text-amber-600 dark:text-amber-400',
                  level === 'info' && 'border-border text-muted-foreground',
                )}
              >
                {t(`model.validation.level.${level}`)} {count}
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1.5">
        {totalCount === 0 ? (
          /* 빈 상태 — 초록 체크와 문구(§4.2 1) */
          <div data-testid="validation-empty" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <CircleCheck aria-hidden className="size-6 text-emerald-500" />
            <p className="text-sm font-medium">{t('model.validation.empty')}</p>
            <p className="text-xs text-muted-foreground">{t('model.validation.emptyDetail')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label={t('model.validation.title')}>
            {groups.map((group) => (
              <li key={group.tableId}>
                <p className="truncate px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {labelContext.tableName.get(group.tableId) ?? group.tableId}
                  {group.issues.length > 1 ? ` (${group.issues.length})` : ''}
                </p>
                <ul className="flex flex-col">
                  {group.issues.map((issue, index) => (
                    <li key={`${issue.code}:${issue.columnId ?? ''}:${issue.relationshipId ?? ''}:${index}`}>
                      <button
                        type="button"
                        data-testid="validation-issue"
                        onClick={() => {
                          setSelection([issue.tableId!])
                          focusTable(issue.tableId!)
                        }}
                        className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent/60"
                      >
                        <LevelIcon level={issue.level} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {t(`model.validation.rules.${issue.code}`)}
                          </span>
                          <span className="block truncate text-muted-foreground">
                            {issueTarget(issue, labelContext)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function LevelIcon({ level }: { level: ValidationLevel }) {
  if (level === 'error') return <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-destructive" />
  if (level === 'warning')
    return <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
  return <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
}

/** 대상 표기 재료 — 테이블·컬럼 물리명과 관계(부모→자식) 이름 지도 */
interface LabelContext {
  tableName: ReadonlyMap<string, string>
  columnName: ReadonlyMap<string, string>
  relationLabel: ReadonlyMap<string, string>
}

function buildLabelContext(tables: ErdTable[], relationships: ErdRelationship[]): LabelContext {
  const tableName = new Map<string, string>()
  const columnName = new Map<string, string>()
  for (const table of tables) {
    tableName.set(table.id, table.physicalName)
    for (const column of table.columns) columnName.set(column.id, column.physicalName)
  }
  const relationLabel = new Map<string, string>()
  for (const rel of relationships) {
    relationLabel.set(
      rel.id,
      `${rel.fkName}: ${tableName.get(rel.parentTableId) ?? rel.parentTableId} → ${tableName.get(rel.childTableId) ?? rel.childTableId}`,
    )
  }
  return { tableName, columnName, relationLabel }
}

/** 행의 대상 표기 — 컬럼 규칙은 `테이블.컬럼`, 관계 규칙(컬럼 대상 없음)은 `fk: 부모 → 자식`,
 *  나머지는 테이블명. 컬럼·관계 id를 둘 다 싣는 규칙(FK 타입·NULL 불일치)은 컬럼이 우선한다 */
function issueTarget(issue: ValidationIssue, context: LabelContext): string {
  const table = issue.tableId ? (context.tableName.get(issue.tableId) ?? issue.tableId) : ''
  if (issue.columnId) return `${table}.${context.columnName.get(issue.columnId) ?? issue.columnId}`
  if (issue.relationshipId) return context.relationLabel.get(issue.relationshipId) ?? issue.relationshipId
  return table
}
