/**
 * 데이터 브라우저 본체 (09-database-manager/00-data-browser.md §5) — 새 창 화면과 에디터의 데이터 보기 탭이 함께 쓴다
 *
 * - 왼쪽 객체 목록, 본문에 고른 객체의 데이터·구조 탭과 객체와 무관한 SQL 탭
 * - 고른 객체와 탭은 부모가 정한다(selected·tab·onNavigate) — 새 창은 주소의 쿼리에, 탭은 에디터의 스토어에 둔다.
 *   탭은 에디터 주소를 바꾸지 않는다
 * - 문서: 탭은 에디터가 열어 둔 문서를 받고(document), 새 창은 주소의 `?model=`을 읽는다(§5.2).
 *   문서가 정해지면 왼쪽 목록을 그 문서의 그룹으로 나눈다(§5.6)
 * - Editor 이상만 쓴다. 권한이 없으면 API를 부르지 않고 안내만 보여 준다
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Columns3, Loader2, Rows3, SquareTerminal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DbmsIcon } from '@/components/dbms-icon'
import { EmptyState } from '@/components/empty-state'
import { LanguageSelect } from '@/components/language-select'
import { ThemeToggle } from '@/components/theme-toggle'
import { ViewerTabButton } from '@/components/viewer-tab-button'
import { useConnections } from '@/features/connections/hooks'
import {
  columnLabelsOf,
  documentIndexOf,
  useDocumentIndex,
  type BrowserDocument,
} from '@/features/database/logical-names'
import { LogicalNameText } from '@/features/database/components/column-header'
import { DataTab } from '@/features/database/components/data-tab'
import type { FollowTarget } from '@/features/database/foreign-keys'
import { ObjectList } from '@/features/database/components/object-list'
import { SqlTab } from '@/features/database/components/sql-tab'
import { StructureTab } from '@/features/database/components/structure-tab'
import { databaseErrorMessage, isObjectNotFound } from '@/features/database/errors'
import { useDatabaseObjects, useObjectStructure } from '@/features/database/hooks'
import { dbmsLabel } from '@/features/editor/model/dbms'
import { useMyWorkspaces } from '@/features/workspaces'
import { cn } from 'cn'

export type BrowserTab = 'data' | 'structure' | 'sql'

export interface DataBrowserProps {
  workspaceId: string
  connectionId: string
  /** 새 창 — 머리에 창 닫기·테마·언어가 있다. 탭 — 에디터 안에 끼우는 얇은 머리 */
  variant: 'page' | 'embedded'
  selected: string | null
  tab: BrowserTab
  /** 객체·탭을 옮긴다 — push는 객체를 새로 골랐을 때(새 창의 뒤로 가기 기록) */
  onNavigate: (next: { object: string | null; tab: BrowserTab }, options: { push: boolean }) => void
  /** 주소로 받은 ERD 문서 — 저장된 내용을 읽는다(새 창) */
  modelId?: string | null
  /** 에디터가 열어 둔 문서 — 주면 그것을 쓰고 문서를 읽지 않는다(탭) */
  document?: BrowserDocument | null
  /** 바깥에서 고르라고 한 객체 — 적용하지 않은 변경을 확인한 뒤 고른다(탭 — 캔버스 우클릭) */
  selectRequest?: { object: string; seq: number } | null
  /** 구조 탭 맨 위에 둘 문서와 다른 점 — 에디터의 데이터 보기 탭만 준다(§5.10) */
  structureComparison?: (objectName: string) => ReactNode
}

export function DataBrowser({
  workspaceId,
  connectionId,
  variant,
  selected,
  tab,
  onNavigate,
  modelId = null,
  document = null,
  selectRequest = null,
  structureComparison,
}: DataBrowserProps) {
  const { t } = useTranslation()
  const page = variant === 'page'

  const myWorkspaces = useMyWorkspaces()
  const myRole = myWorkspaces.data?.items.find(
    (workspace) => workspace.workspaceId === workspaceId,
  )?.myRole
  const canUse = myRole === 'OWNER' || myRole === 'EDITOR'

  const connections = useConnections(canUse ? workspaceId : '')
  const connection = connections.data?.items.find(
    (candidate) => candidate.connectionId === connectionId,
  )
  const objects = useDatabaseObjects(workspaceId, connectionId, canUse)
  const selectedObject = objects.data?.objects.find((object) => object.name === selected) ?? null
  // 구조 탭과 같은 쿼리 — 고른 객체가 그 사이 사라졌는지(OBJECT_NOT_FOUND)를 여기서도 알아챈다
  const structure = useObjectStructure(
    workspaceId,
    connectionId,
    selectedObject ? selectedObject.name : null,
  )
  const refetchObjects = objects.refetch

  // 문서 — 에디터가 준 문서가 있으면 그것(저장 전 편집까지), 없으면 저장된 문서를 읽는다
  const fetched = useDocumentIndex(workspaceId, connectionId, modelId, canUse && !document)
  const liveIndex = useMemo(() => (document ? documentIndexOf(document) : null), [document])
  const logicalNames = liveIndex?.logicalNames ?? fetched.data?.logicalNames
  // 그룹은 문서를 정해서 열었을 때만 — 원천 문서를 찾아 쓴 경우(§5.2)는 논리명만 쓴다
  const outline = liveIndex?.outline ?? (modelId ? fetched.data?.outline : null) ?? null
  /** 데이터 탭에 적용하지 않은 변경이 있는지 */
  const [dirty, setDirty] = useState(false)

  // 고른 객체가 데이터베이스에서 사라졌으면 목록을 다시 읽는다(§5.5)
  useEffect(() => {
    if (isObjectNotFound(structure.error)) void refetchObjects()
  }, [structure.error, refetchObjects])

  /** 적용하지 않은 변경이 있으면 버려도 되는지 묻는다 — 데이터 탭을 떠나면 변경이 사라진다 */
  const confirmDiscard = () => {
    if (!dirty || tab !== 'data') return true
    const ok = window.confirm(t('database.edit.discardConfirm'))
    if (ok) setDirty(false)
    return ok
  }
  /** 외래 키를 따라 연 표의 처음 조건 — 그 객체를 보는 동안만 쓴다. 번호가 바뀌면 데이터 탭을 새로 연다(§5.9) */
  const [jump, setJump] = useState<(FollowTarget & { seq: number }) | null>(null)
  /** 객체를 고르면 그 객체의 데이터 탭으로 간다 — SQL 탭에 있었어도 */
  const select = (name: string) => {
    if (name === selected && tab === 'data' && !jump) return
    if (!confirmDiscard()) return
    setJump(null)
    onNavigate({ object: name, tab: 'data' }, { push: true })
  }
  /** 외래 키를 따라간다 — 그 객체의 데이터 탭을 그 값의 조건으로 연다 */
  const follow = (target: FollowTarget) => {
    const found = objects.data?.objects.find(
      (object) => object.name.toLowerCase() === target.object.toLowerCase(),
    )
    if (!found) {
      toast.error(t('database.follow.notFound', { object: target.object }))
      return
    }
    if (!confirmDiscard()) return
    setJump({ object: found.name, filters: target.filters, seq: (jump?.seq ?? 0) + 1 })
    onNavigate({ object: found.name, tab: 'data' }, { push: true })
  }
  const switchTab = (next: BrowserTab) => {
    if (next !== tab && !confirmDiscard()) return
    onNavigate({ object: selected, tab: next }, { push: false })
  }

  // 바깥에서 고르라고 한 객체(캔버스 우클릭) — 요청마다 한 번만 적용한다
  const [handledSeq, setHandledSeq] = useState(0)
  useEffect(() => {
    if (!selectRequest || selectRequest.seq === handledSeq) return
    setHandledSeq(selectRequest.seq)
    select(selectRequest.object)
    // select는 렌더마다 새로 만든다 — 요청 번호가 바뀔 때만 돈다
  }, [selectRequest?.seq])

  const frame = page ? 'h-dvh bg-background' : 'min-h-0 flex-1'

  if (myWorkspaces.isPending) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn('flex items-center justify-center', frame)}
      >
        <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!canUse) {
    return (
      <div className={cn('flex items-center justify-center', frame)}>
        <EmptyState
          title={t('database.noPermission.title')}
          description={t('database.noPermission.description')}
        />
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', frame)} data-testid="data-browser">
      {/* 탭 안에서는 에디터 머리가 이미 있다 — 커넥션 줄을 따로 두지 않고 도구 줄 오른쪽에 붙인다(v1.35 사용자 요청) */}
      {page ? (
        <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {page ? (
                <h1 className="truncate text-base font-semibold">
                  {connection?.name ?? t('database.title')}
                </h1>
              ) : (
                // 탭 안에서는 문서 이름(h1)이 위에 있다 — 커넥션 이름은 한 단계 아래 제목이다
                <h2 className="truncate text-sm font-semibold">
                  {connection?.name ?? t('database.title')}
                </h2>
              )}
              {connection ? (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <DbmsIcon databaseType={connection.dbmsType} className="size-3" />
                  {dbmsLabel(connection.dbmsType)}
                </Badge>
              ) : null}
              {page ? (
                <Badge variant="secondary" className="text-[10px]">
                  {t('database.title')}
                </Badge>
              ) : null}
            </div>
            {connection ? (
              <p className="truncate text-xs text-muted-foreground">
                {`${connection.host}:${connection.port} / ${connection.databaseName}`}
                {/* 스키마는 database 이름과 다를 때만 덧붙인다(MySQL은 둘이 같다) */}
                {objects.data && objects.data.schema !== connection.databaseName
                  ? ` · ${objects.data.schema}`
                  : ''}
              </p>
            ) : null}
          </div>
          {page ? (
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <LanguageSelect />
              <Button type="button" variant="outline" size="sm" onClick={() => window.close()}>
                <X aria-hidden />
                {t('database.close')}
              </Button>
            </div>
          ) : null}
        </header>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <ObjectList
          objects={objects.data?.objects}
          loading={objects.isPending}
          error={objects.isError ? databaseErrorMessage(objects.error) : null}
          selected={selected}
          onSelect={select}
          onRefresh={() => void objects.refetch()}
          refreshing={objects.isFetching}
          outline={outline}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            {selectedObject ? (
              <h2 className="mr-2 truncate text-sm font-semibold">{selectedObject.name}</h2>
            ) : null}
            <nav
              role="tablist"
              aria-label={t('database.title')}
              className="flex items-center gap-1"
            >
              {selectedObject ? (
                <>
                  <ViewerTabButton
                    active={tab === 'data'}
                    onClick={() => switchTab('data')}
                    icon={<Rows3 aria-hidden className="size-4" />}
                    label={t('database.tabs.data')}
                  />
                  <ViewerTabButton
                    active={tab === 'structure'}
                    onClick={() => switchTab('structure')}
                    icon={<Columns3 aria-hidden className="size-4" />}
                    label={t('database.tabs.structure')}
                  />
                </>
              ) : null}
              <ViewerTabButton
                active={tab === 'sql'}
                onClick={() => switchTab('sql')}
                icon={<SquareTerminal aria-hidden className="size-4" />}
                label={t('database.tabs.sql')}
              />
            </nav>
            {selectedObject?.comment && tab !== 'sql' ? (
              // 코멘트는 ERD 논리명 관례를 따른다 — 앞부분만, 설명은 툴팁(05-editor/01-core.md §3.3)
              <LogicalNameText
                value={selectedObject.comment}
                descriptionId="data-browser-object-comment"
                className="truncate text-xs text-muted-foreground"
              />
            ) : null}
            {!page && connection ? (
              <span
                className="ml-auto flex min-w-0 shrink items-center gap-1.5 text-xs text-muted-foreground"
                data-testid="data-browser-connection"
                title={`${connection.name} — ${connection.host}:${connection.port} / ${connection.databaseName}`}
              >
                <DbmsIcon databaseType={connection.dbmsType} className="size-3 shrink-0" />
                <span className="shrink-0 font-medium text-foreground">{connection.name}</span>
                <span className="truncate">
                  {`${connection.host}:${connection.port} / ${connection.databaseName}`}
                  {objects.data && objects.data.schema !== connection.databaseName
                    ? ` · ${objects.data.schema}`
                    : ''}
                </span>
              </span>
            ) : null}
          </div>
          {tab === 'sql' ? (
            <SqlTab
              workspaceId={workspaceId}
              connectionId={connectionId}
              connectionName={connection?.name ?? ''}
              dbmsType={connection?.dbmsType ?? objects.data?.dbmsType ?? ''}
              objectNames={(objects.data?.objects ?? []).map((object) => object.name)}
            />
          ) : selectedObject ? (
            tab === 'data' ? (
              // 객체가 바뀌면 조건·정렬·페이지를 처음으로 되돌린다
              <DataTab
                key={`${selectedObject.name}:${jump?.object === selectedObject.name ? jump.seq : 0}`}
                workspaceId={workspaceId}
                connectionId={connectionId}
                connectionName={connection?.name ?? ''}
                object={selectedObject}
                columnLabels={columnLabelsOf(logicalNames, selectedObject.name)}
                onDirtyChange={setDirty}
                structure={structure.data}
                initialFilters={jump?.object === selectedObject.name ? jump.filters : undefined}
                onFollow={follow}
              />
            ) : (
              <StructureTab
                workspaceId={workspaceId}
                connectionId={connectionId}
                objectName={selectedObject.name}
                comparison={structureComparison?.(selectedObject.name)}
              />
            )
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              {objects.isPending
                ? null
                : selected && objects.data
                  ? t('database.error.objectNotFound')
                  : t('database.objects.select')}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
