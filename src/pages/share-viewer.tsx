/**
 * 공유 문서 공개 뷰어 (storyboard 00-common §2.1 /share/{token})
 *
 * - 인증 없이 토큰으로만 연다 — 게스트도 볼 수 있는 읽기 전용 화면
 * - 기간(시작·종료) 밖이면 410 SHARE_INACTIVE, 없는 토큰이면 404 SHARE_NOT_FOUND 안내
 * - 본체는 EditorShell 재사용(publicView) — 줌·보기 옵션·이미지 내보내기, 저장·협업 없음
 */
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home } from 'lucide-react'

import type { Model, PublicShare } from '@/api/types'
import { isApiError } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EditorShell } from '@/features/editor'
import { useSharedDocument } from '@/features/models'
import { resultCodeMessage } from '@/lib/result-code'

/** 공개 응답 → EditorShell이 받는 Model 모양으로 — modelId는 공유 문서 식별자로 대체 */
function toViewerModel(token: string, share: PublicShare): Model {
  const now = new Date().toISOString()
  return {
    modelId: `share-${token}`,
    workspaceId: '',
    name: share.modelName,
    description: share.description,
    databaseType: share.databaseType,
    version: share.version,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    content: share.content,
  }
}

export function ShareViewerPage() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const share = useSharedDocument(token)

  return (
    <div className="flex h-dvh flex-col bg-background">
      {share.isPending ? (
        <div className="flex flex-1 flex-col gap-3 p-6">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="flex-1" />
        </div>
      ) : share.isError || !share.data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">
            {isApiError(share.error) && share.error.resultCode !== 'NETWORK_ERROR'
              ? resultCodeMessage(share.error.resultCode)
              : t('shareViewer.notFound')}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">{t('shareViewer.home')}</Link>
          </Button>
        </div>
      ) : (
        <>
          <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold">{share.data.modelName}</h1>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {share.data.databaseType}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">{t('shareViewer.badge')}</Badge>
              </div>
              {share.data.description ? (
                <p className="truncate text-xs text-muted-foreground">{share.data.description}</p>
              ) : null}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <Home aria-hidden />
                {t('shareViewer.home')}
              </Link>
            </Button>
          </header>
          <EditorShell model={toViewerModel(token, share.data)} canEdit={false} publicView />
        </>
      )}
    </div>
  )
}
