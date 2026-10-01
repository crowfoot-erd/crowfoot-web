/**
 * 데이터 브라우저 (09-database-manager/00-data-browser.md §5) — 커넥션별 전체 화면
 *
 * - 새 창으로 열리고 앱 셸(상단 메뉴·사이드바)이 없다. ERD 에디터와 같은 방식이다
 * - 왼쪽 객체 목록, 본문에 고른 객체의 데이터·구조 탭과 객체와 무관한 SQL 탭
 * - 고른 객체와 탭은 주소(쿼리)에 둔다 — 새로고침·링크에서 그대로 열린다
 * - Editor 이상만 쓴다. 권한이 없으면 API를 부르지 않고 안내만 보여 준다
 */
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Columns3, Loader2, Rows3, SquareTerminal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DbmsIcon } from '@/components/dbms-icon'
import { EmptyState } from '@/components/empty-state'
import { LanguageSelect } from '@/components/language-select'
import { ThemeToggle } from '@/components/theme-toggle'
import { ViewerTabButton } from '@/components/viewer-tab-button'
import { useConnections } from '@/features/connections/hooks'
import { DataTab } from '@/features/database/components/data-tab'
import { ObjectList } from '@/features/database/components/object-list'
import { SqlTab } from '@/features/database/components/sql-tab'
import { StructureTab } from '@/features/database/components/structure-tab'
import { databaseErrorMessage, isObjectNotFound } from '@/features/database/errors'
import { useDatabaseObjects, useObjectStructure } from '@/features/database/hooks'
import { dbmsLabel } from '@/features/editor/model/dbms'
import { useMyWorkspaces } from '@/features/workspaces'
import { usePageMeta } from '@/hooks/usePageMeta'

type BrowserTab = 'data' | 'structure' | 'sql'

export default function DatabaseBrowserPage() {
  const { t } = useTranslation()
  const { workspaceId = '', connectionId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('object')
  const tabParam = searchParams.get('tab')
  const tab: BrowserTab = tabParam === 'structure' || tabParam === 'sql' ? tabParam : 'data'

  const myWorkspaces = useMyWorkspaces()
  const myRole = myWorkspaces.data?.items.find((workspace) => workspace.workspaceId === workspaceId)?.myRole
  const canUse = myRole === 'OWNER' || myRole === 'EDITOR'

  const connections = useConnections(canUse ? workspaceId : '')
  const connection = connections.data?.items.find((candidate) => candidate.connectionId === connectionId)
  const objects = useDatabaseObjects(workspaceId, connectionId, canUse)
  const selectedObject = objects.data?.objects.find((object) => object.name === selected) ?? null
  // 구조 탭과 같은 쿼리 — 고른 객체가 그 사이 사라졌는지(OBJECT_NOT_FOUND)를 여기서도 알아챈다
  const structure = useObjectStructure(workspaceId, connectionId, selectedObject ? selectedObject.name : null)
  const refetchObjects = objects.refetch
  /** 데이터 탭에 적용하지 않은 변경이 있는지 */
  const [dirty, setDirty] = useState(false)

  usePageMeta({
    title: `${connection?.name ?? t('database.title')} — ${t('common.appName')}`,
    noindex: true,
  })

  // 고른 객체가 데이터베이스에서 사라졌으면 목록을 다시 읽는다(§5.5)
  useEffect(() => {
    if (isObjectNotFound(structure.error)) void refetchObjects()
  }, [structure.error, refetchObjects])

  /** 객체를 고르면 그 객체의 데이터 탭으로 간다 — SQL 탭에 있었어도 */
  const select = (name: string) => {
    if (name === selected && tab === 'data') return
    if (!confirmDiscard()) return
    setSearchParams({ object: name }, { replace: false })
  }
  /** 적용하지 않은 변경이 있으면 버려도 되는지 묻는다 — 데이터 탭을 떠나면 변경이 사라진다 */
  const confirmDiscard = () => {
    if (!dirty || tab !== 'data') return true
    const ok = window.confirm(t('database.edit.discardConfirm'))
    if (ok) setDirty(false)
    return ok
  }
  const switchTab = (next: BrowserTab) => {
    if (next !== tab && !confirmDiscard()) return
    const params: Record<string, string> = {}
    if (selected) params.object = selected
    if (next !== 'data') params.tab = next
    setSearchParams(params, { replace: true })
  }

  if (myWorkspaces.isPending) {
    return (
      <div role="status" aria-live="polite" className="flex h-dvh items-center justify-center bg-background">
        <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!canUse) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <EmptyState title={t('database.noPermission.title')} description={t('database.noPermission.description')} />
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold">{connection?.name ?? t('database.title')}</h1>
            {connection ? (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <DbmsIcon databaseType={connection.dbmsType} className="size-3" />
                {dbmsLabel(connection.dbmsType)}
              </Badge>
            ) : null}
            <Badge variant="secondary" className="text-[10px]">
              {t('database.title')}
            </Badge>
          </div>
          {connection ? (
            <p className="truncate text-xs text-muted-foreground">
              {`${connection.host}:${connection.port} / ${connection.databaseName}`}
              {/* 스키마는 database 이름과 다를 때만 덧붙인다(MySQL은 둘이 같다) */}
              {objects.data && objects.data.schema !== connection.databaseName ? ` · ${objects.data.schema}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LanguageSelect />
          <Button type="button" variant="outline" size="sm" onClick={() => window.close()}>
            <X aria-hidden />
            {t('database.close')}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ObjectList
          objects={objects.data?.objects}
          loading={objects.isPending}
          error={objects.isError ? databaseErrorMessage(objects.error) : null}
          selected={selected}
          onSelect={select}
          onRefresh={() => void objects.refetch()}
          refreshing={objects.isFetching}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            {selectedObject ? <h2 className="mr-2 truncate text-sm font-semibold">{selectedObject.name}</h2> : null}
            <nav role="tablist" aria-label={t('database.title')} className="flex items-center gap-1">
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
              <span className="truncate text-xs text-muted-foreground">{selectedObject.comment}</span>
            ) : null}
          </div>
          {tab === 'sql' ? (
            <SqlTab
              workspaceId={workspaceId}
              connectionId={connectionId}
              connectionName={connection?.name ?? ''}
              dbmsType={connection?.dbmsType ?? objects.data?.dbmsType ?? ''}
            />
          ) : selectedObject ? (
            tab === 'data' ? (
              // 객체가 바뀌면 조건·정렬·페이지를 처음으로 되돌린다
              <DataTab
                key={selectedObject.name}
                workspaceId={workspaceId}
                connectionId={connectionId}
                connectionName={connection?.name ?? ''}
                object={selectedObject}
                onDirtyChange={setDirty}
              />
            ) : (
              <StructureTab workspaceId={workspaceId} connectionId={connectionId} objectName={selectedObject.name} />
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
