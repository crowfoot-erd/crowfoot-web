/**
 * ERD 문서 열기 (storyboard 02-user §5 — 문서 이름·돋보기에서 window.open 진입)
 *
 * - 새 창 전체 화면 — 앱 셸(사이드바·탭) 없이 문서만 크게
 * - 상세(1.3)로 메아를 로드: 이름·DB 종류·캔버스·버전·생성자·최근 수정
 * - 본체는 EditorShell(에디터 1차 — 캔버스·인라인 편집·관계·메모·저장)
 * - 권한: 내 역할(OWNER/EDITOR)만 편집, Viewer·Commenter는 읽기 전용 캔버스
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import { formatDateTime } from '@/lib/format'
import { EditorShell } from '@/features/editor'
import { useModel } from '@/features/models'
import { useMyWorkspaces } from '@/features/workspaces'

export function ModelViewerPage() {
  const { t } = useTranslation()
  const { workspaceId = '', modelId = '' } = useParams()
  const model = useModel(workspaceId, modelId)
  const myWorkspaces = useMyWorkspaces()

  // 저장 성공 콜백으로만 갱신 — invalidate 재조회 전에 즉시 반영
  const [savedVersion, setSavedVersion] = useState<number | null>(null)

  const myRole = myWorkspaces.data?.items.find((ws) => ws.workspaceId === workspaceId)?.myRole
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'

  return (
    <div className="flex h-dvh flex-col bg-background">
      {model.isPending ? (
        <div className="flex flex-1 flex-col gap-3 p-6">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="flex-1" />
        </div>
      ) : model.isError || !model.data ? (
        <div className="flex flex-1 items-center justify-center">
          <ErrorState onRetry={() => void model.refetch()} />
        </div>
      ) : (
        <>
          <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold">{model.data.name}</h1>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {model.data.databaseType}
                </Badge>
                <span className="shrink-0 text-xs text-muted-foreground">v{savedVersion ?? model.data.version}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  model.data.createdBy?.name ?? t('common.system'),
                  formatDateTime(model.data.updatedAt),
                ].join(' · ')}
              </p>
              {model.data.description ? (
                <p className="truncate text-xs text-muted-foreground">{model.data.description}</p>
              ) : null}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => window.close()}>
              <X aria-hidden />
              {t('model.viewer.close')}
            </Button>
          </header>
          <EditorShell model={model.data} canEdit={canEdit} onSaved={setSavedVersion} />
        </>
      )}
    </div>
  )
}
