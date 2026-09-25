/**
 * 공유 문서 공개 뷰어 (storyboard 00-common §2.1 /share/{token})
 *
 * - 인증 없이 토큰으로만 연다 — 게스트도 볼 수 있는 읽기 전용 화면
 * - 기간(시작·종료) 밖이면 410 SHARE_INACTIVE, 없는 토큰이면 404 SHARE_NOT_FOUND 안내
 * - 본체는 EditorShell 재사용(publicView) — 줌·보기 옵션·이미지 내보내기, 저장·협업 없음
 */
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Loader2 } from 'lucide-react'

import type { Model, PublicShare } from '@/api/types'
import { isApiError } from '@/api/client'
import { LanguageSelect } from '@/components/language-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EditorShell } from '@/features/editor'
import { useSharedDocument } from '@/features/models'
import { usePageMeta } from '@/hooks/usePageMeta'
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
    sourceConnectionId: null, // 공개 뷰어 — 동기화 없음(편집 불가 문서)
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
  // 제목·설명은 조회 뒤 — 색인은 어떤 상태(pending·오류 포함)에서도 금지(토큰이 곧 자격)
  usePageMeta(
    share.data
      ? {
          title: `${share.data.modelName} — ${t('common.appName')}`,
          description: share.data.description ?? undefined,
          noindex: true,
        }
      : { noindex: true },
  )

  return (
    <div className="flex h-dvh flex-col bg-background">
      {share.isPending ? (
        // 공유 문서 조회 — 전체 화면 중앙 스피너 (model-viewer와 같은 관례)
        <div
          role="status"
          aria-live="polite"
          data-testid="editor-loading"
          className="flex flex-1 flex-col items-center justify-center gap-4"
        >
          <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
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
            <div className="flex shrink-0 items-center gap-1">
              <LanguageSelect />
              <Button asChild variant="outline" size="sm">
                <Link to="/">
                  <Home aria-hidden />
                  {t('shareViewer.home')}
                </Link>
              </Button>
            </div>
          </header>
          <EditorShell model={toViewerModel(token, share.data)} canEdit={false} publicView />
        </>
      )}
    </div>
  )
}
