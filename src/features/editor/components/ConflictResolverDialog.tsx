/**
 * 버전 충돌 리졸버 (05-editor/03-collaboration.md §2 — 수동 충돌 해결, v1.17)
 *
 * 409는 "커맨드 채널이 끊긴 동안 분기가 났다"는 신호다 — 자동 병합을 시도하지 않고
 * 서버 변경(내 문서 → 서버 본문 diff, deriveChanges)을 항목 단위로 나열해 선택받는다:
 * · 내 편집과 겹친 항목(동일 속성·구조 — detectLwwConflicts와 같은 겹침 규칙)
 *   → 기본 "내 것 유지"
 * · 겹치지 않은 항목 → 기본 "서버 것 사용"(다른 객체 자동 병합과 같은 규칙)
 * 선택이 끝나면 서버 커맨드를 순서대로 적용해 병합 문서를 조립하고 상위(onResolve)가
 * 강제 수화(base=서버 버전) 후 곧바로 저장한다. 항목 마커·문구는 버전 기록 렌더
 * (history.kind·history.action)를 그대로 쓴다 — VersionComparePanel과 같은 관례.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { DocDiffAction, DocDiffKind } from '@/features/editor/model/doc-diff'
import type { ErdChange } from '@/features/editor/model/changes'
import { applyChanges } from '@/features/editor/model/changes'
import { changeTargetKeys, deriveChanges, dirtyTargetKeys } from '@/features/editor/model/collab-merge'
import type {
  EditorDocument,
  ErdColumn,
  ErdTable,
} from '@/features/editor/model/content-schema'
import { useEditorStore } from '@/features/editor/store/editor-store'

/** EditorShell의 prepareConflict이 조립한 재료 — 서버 저장본과 그 버전 */
export interface ConflictRecord {
  serverVersion: number
  serverDocument: EditorDocument
}

export interface ConflictResolverDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** null이면 서버 본문 조회 중·실패 — 안내와 다시 불러오기만 제공한다 */
  record: ConflictRecord | null
  /** 선택 완료 — 병합 문서로 강제 수화 후 저장하는 상위 파이프라인 */
  onResolve(merged: EditorDocument): void
  /** 서버 본문으로 덮어쓰기(기존 conflict reload 경로) — 로컬 변경은 버린다 */
  onReload(): void
}

/** 선택 가능한 서버 변경 항목 — 커맨드 1건. 겹침(conflict) 여부로 기본 선택이 갈린다 */
interface ResolveRow {
  change: ErdChange
  kind: DocDiffKind
  action: DocDiffAction
  /** 소속 테이블 물리명 — doc-diff 관례(관계는 자식 테이블, 노드는 대상 물리명) */
  table: string
  name: string
  detail: string
  /** 내 편집과 같은 객체·속성(또는 구조)을 건드렸다 — 기본 "내 것 유지" */
  conflict: boolean
}

/** 커맨드가 내 dirty 키와 겹치는가 — '*'(구조)는 같은 객체의 어떤 키와도 겹친다
 *  (detectLwwConflicts의 구조 규칙과 동일하게 판정한다) */
function overlapsMine(change: ErdChange, myKeys: Set<string>): boolean {
  for (const key of changeTargetKeys(change)) {
    const prefix = `${key.kind}:${key.id}:`
    if (myKeys.has(`${prefix}${key.field}`)) return true
    if (key.field === '*') {
      for (const k of myKeys) if (k.startsWith(prefix)) return true
    } else {
      for (const k of myKeys) if (k.startsWith(prefix) && k.endsWith(':*')) return true
    }
  }
  return false
}

const noteName = (note: { title: string; text: string }): string =>
  note.title || note.text.split('\n')[0] || ''

/** 커맨드 → 표시 항목. 제거·패치는 내 문서(=분기 전 공통 조상 쪽)에서 이름을 찾고,
 *  생성은 커맨드 페이로드에 이름이 있다 */
function changeToRow(
  change: ErdChange,
  tablesById: Map<string, ErdTable>,
  columns: Map<string, { column: ErdColumn; table: ErdTable }>,
  notesById: Map<string, { title: string; text: string }>,
  areasById: Map<string, { name: string }>,
  relationshipsById: Map<string, { fkName: string; childTableId: string }>,
): Omit<ResolveRow, 'change' | 'conflict'> {
  const tableName = (id: string): string => tablesById.get(id)?.physicalName ?? id
  const keys = (patch: Record<string, unknown>): string => Object.keys(patch).join(', ')
  const setAction = (prev: number, next: number): DocDiffAction =>
    prev === 0 ? 'add' : next === 0 ? 'remove' : 'update'
  const base = { detail: '' }
  switch (change.type) {
    case 'table/create':
      return { ...base, kind: 'table', action: 'add', table: change.table.physicalName, name: change.table.physicalName }
    case 'table/remove':
      return { ...base, kind: 'table', action: 'remove', table: tableName(change.tableId), name: tableName(change.tableId) }
    case 'table/patch':
      return { ...base, kind: 'table', action: 'update', table: tableName(change.tableId), name: tableName(change.tableId), detail: keys(change.patch as Record<string, unknown>) }
    case 'column/add':
      return { ...base, kind: 'column', action: 'add', table: tableName(change.tableId), name: change.column.physicalName }
    case 'column/remove': {
      const found = columns.get(change.columnId)
      return { ...base, kind: 'column', action: 'remove', table: found ? found.table.physicalName : '', name: found?.column.physicalName ?? change.columnId }
    }
    case 'column/patch': {
      const found = columns.get(change.columnId)
      return { ...base, kind: 'column', action: 'update', table: found ? found.table.physicalName : '', name: found?.column.physicalName ?? change.columnId, detail: keys(change.patch as Record<string, unknown>) }
    }
    case 'column/move': {
      const found = columns.get(change.columnId)
      return { ...base, kind: 'column', action: 'move', table: found ? found.table.physicalName : '', name: found?.column.physicalName ?? change.columnId }
    }
    case 'primaryKey/set': {
      const table = tablesById.get(change.tableId)
      const prev = table?.primaryKey ? table.primaryKey.columnIds.length : 0
      const next = change.primaryKey ? change.primaryKey.columnIds.length : 0
      return { ...base, kind: 'primaryKey', action: setAction(prev, next), table: tableName(change.tableId), name: change.primaryKey?.name ?? table?.primaryKey?.name ?? '' }
    }
    case 'uniqueKey/set': {
      const table = tablesById.get(change.tableId)
      const prev = table?.uniques.length ?? 0
      const next = change.uniques.length
      return { ...base, kind: 'uniqueKey', action: setAction(prev, next), table: tableName(change.tableId), name: `${next}` }
    }
    case 'index/set': {
      const table = tablesById.get(change.tableId)
      const prev = table?.indexes.length ?? 0
      const next = change.indexes.length
      return { ...base, kind: 'index', action: setAction(prev, next), table: tableName(change.tableId), name: `${next}` }
    }
    case 'relationship/create':
      return { ...base, kind: 'relationship', action: 'add', table: tableName(change.relationship.childTableId), name: change.relationship.fkName }
    case 'relationship/patch': {
      const rel = relationshipsById.get(change.relationshipId)
      return { ...base, kind: 'relationship', action: 'update', table: rel ? tableName(rel.childTableId) : '', name: rel?.fkName ?? change.relationshipId, detail: keys(change.patch as Record<string, unknown>) }
    }
    case 'relationship/remove': {
      const rel = relationshipsById.get(change.relationshipId)
      return { ...base, kind: 'relationship', action: 'remove', table: rel ? tableName(rel.childTableId) : '', name: rel?.fkName ?? change.relationshipId }
    }
    case 'note/create':
      return { ...base, kind: 'note', action: 'add', table: '', name: noteName(change.note) }
    case 'note/remove':
      return { ...base, kind: 'note', action: 'remove', table: '', name: notesById.get(change.noteId) ? noteName(notesById.get(change.noteId)!) : change.noteId }
    case 'note/patch':
      return { ...base, kind: 'note', action: 'update', table: '', name: notesById.get(change.noteId) ? noteName(notesById.get(change.noteId)!) : change.noteId, detail: keys(change.patch as Record<string, unknown>) }
    case 'area/create':
      return { ...base, kind: 'area', action: 'add', table: '', name: change.area.name }
    case 'area/remove':
      return { ...base, kind: 'area', action: 'remove', table: '', name: areasById.get(change.areaId)?.name ?? change.areaId }
    case 'area/patch':
      return { ...base, kind: 'area', action: 'update', table: '', name: areasById.get(change.areaId)?.name ?? change.areaId, detail: keys(change.patch as Record<string, unknown>) }
    case 'node/move': {
      const ids = Object.keys(change.positions)
      const label = ids.map((id) => tableName(id)).join(', ')
      return { ...base, kind: 'node', action: 'move', table: label, name: label }
    }
    case 'node/resize':
      return { ...base, kind: 'node', action: 'update', table: tableName(change.tableId), name: tableName(change.tableId), detail: 'width' }
    case 'node/color':
      return { ...base, kind: 'node', action: 'update', table: tableName(change.tableId), name: tableName(change.tableId), detail: 'color' }
  }
}

export function ConflictResolverDialog({
  open,
  onOpenChange,
  record,
  onResolve,
  onReload,
}: ConflictResolverDialogProps) {
  const { t } = useTranslation()
  const [choices, setChoices] = useState<Record<number, 'mine' | 'server'>>({})

  // 레코드가 바뀔 때마다 선택 초기화 — 이전 충돌의 토글이 새 충돌에 새어들지 않게
  useEffect(() => {
    setChoices({})
  }, [record])

  // 내 문서는 다이얼로그가 모달이라 열려 있는 동안 얼어 있다 — 레코드 시점에 한 번 포착
  const analysis = useMemo(() => {
    if (!record) return null
    const mine = useEditorStore.getState().present
    const tablesById = new Map(mine.model.tables.map((table) => [table.id, table]))
    const columns = new Map<string, { column: ErdColumn; table: ErdTable }>()
    for (const table of mine.model.tables) {
      for (const column of table.columns) columns.set(column.id, { column, table })
    }
    const notesById = new Map(mine.diagram.notes.map((note) => [note.id, note]))
    const areasById = new Map(mine.diagram.areas.map((area) => [area.id, area]))
    const relationshipsById = new Map(mine.model.relationships.map((rel) => [rel.id, rel]))

    // 서버 변경 = 내 문서 → 서버 본문. 내 편집과의 겹침은 서버 본문 기준 dirty로 잰다
    const myKeys = dirtyTargetKeys(record.serverDocument, mine)
    const rows: ResolveRow[] = deriveChanges(mine, record.serverDocument).map((change) => ({
      ...changeToRow(change, tablesById, columns, notesById, areasById, relationshipsById),
      change,
      conflict: overlapsMine(change, myKeys),
    }))
    return { mine, rows }
  }, [record])

  const choiceOf = (row: ResolveRow, index: number): 'mine' | 'server' =>
    choices[index] ?? (row.conflict ? 'mine' : 'server')

  // 병합 문서 — 서버 커맨드를 순서(제거→패치→생성)대로 선택분만 적용. 건너뛴 커맨드가
  // 있어도 applyChange는 멱등이라 뒤 커맨드가 안전하다(없는 객체 조작 = no-op)
  const merged = useMemo(() => {
    if (!analysis) return null
    let doc = analysis.mine
    analysis.rows.forEach((row, index) => {
      if (choiceOf(row, index) === 'server') doc = applyChanges(doc, [row.change])
    })
    return doc
  }, [analysis, choices])

  const conflictCount = analysis?.rows.filter((row) => row.conflict).length ?? 0

  // 테이블별 그룹핑 — VersionComparePanel과 같은 패턴(빈 table은 "기타" 묶음)
  const groups = useMemo(() => {
    if (!analysis) return []
    const map = new Map<string, { row: ResolveRow; index: number }[]>()
    analysis.rows.forEach((row, index) => {
      const key = row.table === '' ? t('model.editor.compare.noTableGroup') : row.table
      const list = map.get(key)
      if (list) list.push({ row, index })
      else map.set(key, [{ row, index }])
    })
    return [...map.entries()]
  }, [analysis, t])

  const setAll = (choice: 'mine' | 'server') => {
    if (!analysis) return
    const next: Record<number, 'mine' | 'server'> = {}
    analysis.rows.forEach((_row, index) => {
      next[index] = choice
    })
    setChoices(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('model.editor.conflict.title')}</DialogTitle>
          <DialogDescription>{t('model.editor.conflict.resolverDescription')}</DialogDescription>
        </DialogHeader>

        {!record || !analysis ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 aria-hidden className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          </div>
        ) : analysis.rows.length === 0 ? (
          // prepareConflict이 diff 비어 있음을 이미 걸렀다 — 서버 상태가 또 바뀐 극단 경우
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('model.editor.conflict.emptyDiff')}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {t('model.editor.conflict.counts', {
                conflicts: conflictCount,
                auto: analysis.rows.length - conflictCount,
              })}
              {' · '}
              {t('model.editor.conflict.autoNote')}
            </p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setAll('mine')}
                >
                  {t('model.editor.conflict.allMine')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setAll('server')}
                >
                  {t('model.editor.conflict.allServer')}
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
              {groups.map(([table, entries]) => (
                <div key={table} className="border-b last:border-b-0">
                  <p className="break-all bg-muted/40 px-3 py-1 font-mono text-xs font-medium">{table}</p>
                  <ul>
                    {entries.map(({ row, index }) => (
                      <li
                        key={index}
                        className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 border-t px-3 py-1.5 text-xs first:border-t-0"
                      >
                        <ItemMarker action={row.action} />
                        <span className="shrink-0">
                          {t(`model.editor.history.kind.${row.kind}`)}{' '}
                          {t(`model.editor.history.action.${row.action}`)}
                        </span>
                        <span className="min-w-0 flex-1 break-all font-mono">
                          {row.kind === 'node' ? row.name : row.table ? `${row.table}.${row.name}` : row.name}
                        </span>
                        {row.detail ? (
                          <span className="w-full break-all pl-[18px] text-muted-foreground">— {row.detail}</span>
                        ) : null}
                        {row.conflict ? (
                          <span
                            title={t('model.editor.conflict.conflictNote')}
                            className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                          >
                            {t('model.editor.conflict.conflictBadge')}
                          </span>
                        ) : null}
                        <span className="ml-auto flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={choiceOf(row, index) === 'mine' ? 'default' : 'outline'}
                            className="h-6 px-2 text-[11px]"
                            onClick={() => setChoices((prev) => ({ ...prev, [index]: 'mine' }))}
                          >
                            {t('model.editor.conflict.keepMine')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={choiceOf(row, index) === 'server' ? 'default' : 'outline'}
                            className="h-6 px-2 text-[11px]"
                            onClick={() => setChoices((prev) => ({ ...prev, [index]: 'server' }))}
                          >
                            {t('model.editor.conflict.useServer')}
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onReload}>
            {t('model.editor.conflict.reload')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('model.editor.conflict.keep')}
            </Button>
            <Button
              type="button"
              disabled={!merged || !record || analysis?.rows.length === 0}
              onClick={() => merged && onResolve(merged)}
            >
              {t('model.editor.conflict.resolve')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 항목 행 마커 — [+]/[~]/[−]/[→] (버전 기록·버전 비교 표기 관례) */
function ItemMarker({ action }: { action: DocDiffAction }) {
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
