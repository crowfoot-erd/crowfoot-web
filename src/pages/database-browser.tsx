/**
 * 데이터 브라우저 (09-database-manager/00-data-browser.md §5) — 커넥션별 전체 화면
 *
 * - 새 창으로 열리고 앱 셸(상단 메뉴·사이드바)이 없다. ERD 에디터와 같은 방식이다
 * - 본체는 DataBrowser — 에디터의 데이터 보기 탭과 같은 컴포넌트다(§5.1)
 * - 고른 객체와 탭은 주소(쿼리)에 둔다 — 새로고침·링크에서 그대로 열린다
 * - 주소의 `?model=`은 논리명과 그룹을 읽어 올 ERD 문서다(§5.2·§5.6). 객체나 탭을 옮겨도 유지한다
 */
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useConnections } from '@/features/connections/hooks'
import { DataBrowser, type BrowserTab } from '@/features/database/components/data-browser'
import { useMyWorkspaces } from '@/features/workspaces'
import { usePageMeta } from '@/hooks/usePageMeta'

export default function DatabaseBrowserPage() {
  const { t } = useTranslation()
  const { workspaceId = '', connectionId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('object')
  const tabParam = searchParams.get('tab')
  const modelParam = searchParams.get('model')
  const tab: BrowserTab = tabParam === 'structure' || tabParam === 'sql' ? tabParam : 'data'

  // 창 제목의 커넥션 이름 — 본체와 같은 쿼리라 한 번만 읽는다
  const myWorkspaces = useMyWorkspaces()
  const myRole = myWorkspaces.data?.items.find((workspace) => workspace.workspaceId === workspaceId)?.myRole
  const canUse = myRole === 'OWNER' || myRole === 'EDITOR'
  const connections = useConnections(canUse ? workspaceId : '')
  const connection = connections.data?.items.find((candidate) => candidate.connectionId === connectionId)

  usePageMeta({
    title: `${connection?.name ?? t('database.title')} — ${t('common.appName')}`,
    noindex: true,
  })

  return (
    <DataBrowser
      variant="page"
      workspaceId={workspaceId}
      connectionId={connectionId}
      modelId={modelParam}
      selected={selected}
      tab={tab}
      onNavigate={(next, { push }) => {
        const params: Record<string, string> = {}
        if (next.object) params.object = next.object
        if (next.tab !== 'data') params.tab = next.tab
        if (modelParam) params.model = modelParam
        setSearchParams(params, { replace: !push })
      }}
    />
  )
}
