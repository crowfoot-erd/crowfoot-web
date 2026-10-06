/**
 * 데이터 보기 탭 — 문서의 원천 커넥션으로 데이터 브라우저를 에디터 안에서 보여 준다
 * (05-editor/02-ui.md §22, 09-database-manager/00-data-browser.md §5.1)
 *
 * - 처음 열 때 마운트한다. 데이터 브라우저 코드도 이때 내려받는다(lazy)
 * - 고른 객체와 탭은 데이터 보기 스토어에 둔다 — 에디터 주소는 바꾸지 않는다
 * - 논리명과 그룹은 에디터가 열어 둔 문서(저장 전 편집까지)에서 읽는다
 * - 원천 커넥션이 없으면 데이터베이스 연결을 안내한다(도구 메뉴의 연결 다이얼로그와 같다).
 *   원천 커넥션이 지워졌으면 연결할 수 없으니 데이터베이스 탭을 안내만 한다
 */
import { Suspense, lazy, useState } from 'react'
import { Link2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { useConnections } from '@/features/connections/hooks'
import { ConnectDatabaseDialog } from '@/features/models/components/connect-database-dialog'
import { useDataView } from '@/features/editor/store/data-view-store'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { cn } from 'cn'
import { DataViewDocumentDiff } from './DataViewDocumentDiff'

const DataBrowser = lazy(() =>
  import('@/features/database/components/data-browser').then((module) => ({
    default: module.DataBrowser,
  })),
)

export function EditorDataView({
  hidden,
  workspaceId,
  modelId,
  modelName,
  databaseType,
  sourceConnectionId,
  canEdit,
}: {
  /** 다른 탭을 보는 중 — 내리지 않고 감춘다(고른 객체·조건·적용 전 변경이 남는다) */
  hidden: boolean
  workspaceId: string
  modelId: string
  modelName: string
  databaseType: string
  sourceConnectionId: string | null
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const object = useDataView((state) => state.object)
  const tab = useDataView((state) => state.tab)
  const request = useDataView((state) => state.request)
  const navigate = useDataView((state) => state.navigate)
  const document = useEditorStore((state) => state.present)
  const connections = useConnections(sourceConnectionId ? workspaceId : '')
  const sourceMissing =
    sourceConnectionId !== null &&
    connections.data !== undefined &&
    !connections.data.items.some((connection) => connection.connectionId === sourceConnectionId)
  const [connectOpen, setConnectOpen] = useState(false)

  const spinner = (
    <div role="status" aria-live="polite" className="flex flex-1 items-center justify-center">
      <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col', hidden && 'hidden')}
      data-testid="editor-data-view"
    >
      {!sourceConnectionId || sourceMissing ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            title={
              sourceMissing
                ? t('database.embedded.sourceMissing.title')
                : t('database.embedded.noSource.title')
            }
            description={
              sourceMissing
                ? t('database.embedded.sourceMissing.description')
                : t('database.embedded.noSource.description')
            }
            action={
              !sourceMissing && canEdit ? (
                <Button type="button" onClick={() => setConnectOpen(true)}>
                  <Link2 aria-hidden />
                  {t('model.connect.toolbar')}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : connections.isPending ? (
        spinner
      ) : (
        <Suspense fallback={spinner}>
          <DataBrowser
            variant="embedded"
            workspaceId={workspaceId}
            connectionId={sourceConnectionId}
            document={document}
            selected={object}
            tab={tab}
            selectRequest={request}
            onNavigate={(next) => navigate(next.object, next.tab)}
            // 구조 탭 맨 위의 문서와 다른 점 — 가져오기·반영은 편집 권한의 일이다(§22)
            structureComparison={
              canEdit
                ? (objectName) => (
                    <DataViewDocumentDiff
                      workspaceId={workspaceId}
                      sourceConnectionId={sourceConnectionId}
                      objectName={objectName}
                    />
                  )
                : undefined
            }
          />
        </Suspense>
      )}
      {/* 연결에 성공하면 문서 상세가 다시 읽혀 원천 커넥션이 생기고, 이 자리에 데이터 브라우저가 나온다 */}
      {connectOpen ? (
        <ConnectDatabaseDialog
          open
          onOpenChange={(open) => setConnectOpen(open)}
          workspaceId={workspaceId}
          model={{ modelId, name: modelName, databaseType }}
        />
      ) : null}
    </div>
  )
}
