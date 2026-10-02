/**
 * 공유 문서 공개 뷰어 (storyboard 00-common §2.1 /share/{token})
 *
 * - 인증 없이 토큰으로만 연다 — 게스트도 볼 수 있는 읽기 전용 화면
 * - 기간(시작·종료) 밖이면 410 SHARE_INACTIVE, 없는 토큰이면 404 SHARE_NOT_FOUND 안내
 * - 본체는 EditorShell 재사용(publicView) — 줌·보기 옵션·이미지 내보내기, 저장·협업 없음
 * - 화면은 **하단 탭 바(ERD 기본 · 댓글)** 로 전환한다(v1.21 후속 — 스크롤 구조에서 개편):
 *   ERD가 주인공인 화면이라 에디터가 뷰포트 대부분을 차지하고, 댓글 탭을 누르면
 *   그 영역 전체가 반응·댓글로 교체된다. 탭 배지는 댓글 수다(피드백 초기화와 같은 쿼리) —
 *   좋아요는 배지에 합산하지 않는다(2026-09-27 2차 보고: 댓글 0인데 좋아요 때문에
 *   1로 보이면 댓글이 있는 것처럼 읽힌다). 좋아요 수는 툴바 버튼·섹션 헤더 [♥ n] 칩으로 노출
 * - SEO(00-common §3.11 v1.18): 성공 시 문서명·설명으로 색인을 허용한다 — 토큰은 128bit
 *   추측 불가라 노출 통제는 철회(410)로 하고, 대기·오류 화면은 계속 noindex다
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Home, Loader2, MessageSquare, Table2 } from 'lucide-react'

import type { Model, PublicShare } from '@/api/types'
import { isApiError } from '@/api/client'
import { LanguageSelect } from '@/components/language-select'
import { Badge } from '@/components/ui/badge'
import { DbmsIcon } from '@/components/dbms-icon'
import { dbmsLabel } from '@/features/editor/model/dbms'
import { Button } from '@/components/ui/button'
import { ViewerTabButton } from '@/components/viewer-tab-button'
import { requirementState } from '@/features/editor/model/requirements'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { useRequirementsPanel } from '@/features/editor/store/requirements-panel-store'
import { EditorShell } from '@/features/editor'
import { useSharedDocument, useShareFeedback } from '@/features/models'
import { ShareFeedbackSection } from '@/features/models/components/share-feedback-section'
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

type ViewerTab = 'erd' | 'comments'

export function ShareViewerPage() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const share = useSharedDocument(token)
  // 탭 배지(총 피드백 수)용 — 섹션과 같은 쿼리 키라 한 번만 fetch된다
  const feedback = useShareFeedback(token)
  const [tab, setTab] = useState<ViewerTab>('erd')
  const requirementsOpen = useRequirementsPanel((state) => state.open)
  const showRequirements = useRequirementsPanel((state) => state.show)
  const hideRequirements = useRequirementsPanel((state) => state.hide)
  const pendingRequirements = useEditorStore(
    (state) => state.present.diagram.requirements.filter((requirement) => requirementState(requirement) === 'PENDING').length,
  )
  // 제목·설명·canonical은 조회 뒤 — 성공 문서는 색인 허용(SEO 정책 v1.18),
  // 대기·오류 화면은 문서 없는 껍데기이므로 계속 noindex로 막는다
  usePageMeta(
    share.data
      ? {
          title: `${share.data.modelName} — ${t('common.appName')}`,
          description: share.data.description ?? undefined,
          canonicalPath: `/share/${token}`,
          ogType: 'article',
        }
      : { noindex: true },
  )

  // 탭 배지 = 댓글 수 — 좋아요 합산은 2026-09-27 2차 보고로 철회(댓글 0인데 1로 보이는 혼란)
  const commentCount = feedback.data?.comments.length ?? 0

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
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <DbmsIcon databaseType={share.data.databaseType} className="size-3" />
                  {dbmsLabel(share.data.databaseType)}
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
          {/* 탭 본문 — ERD 탭은 에디터가 뷰포트 나머지 전체를 차지한다. 공유 토큰이
              공개 DDL(§1.10.8)·문서 좋아요(§1.10.6) 버튼의 자격이 된다 */}
          <div className="flex min-h-0 flex-1 flex-col">
            {tab === 'erd' ? (
              <EditorShell
                model={toViewerModel(token, share.data)}
                canEdit={false}
                publicView
                shareToken={token}
              />
            ) : (
              <ShareFeedbackSection target={{ kind: 'token', token }} />
            )}
          </div>
          {/* 하단 탭 바 — ERD(기본) · 댓글(배지=댓글 수). 좌측 정렬 필 버튼 */}
          <nav
            role="tablist"
            aria-label={t('shareViewer.tab.label')}
            data-testid="share-viewer-tabs"
            className="flex h-12 shrink-0 items-center gap-1 border-t bg-background px-3"
          >
            <ViewerTabButton
              active={tab === 'erd' && !requirementsOpen}
              onClick={() => {
                setTab('erd')
                hideRequirements()
              }}
              icon={<Table2 aria-hidden className="size-4" />}
              label={t('shareViewer.tab.erd')}
            />
            {/* 요구사항 — 에디터 안의 화면이라 ERD 탭을 유지한 채 연다(자동 저장·협업이 이어진다). 배지는 반영 대기 수 */}
            <ViewerTabButton
              active={tab === 'erd' && requirementsOpen}
              onClick={() => {
                setTab('erd')
                showRequirements()
              }}
              icon={<ClipboardList aria-hidden className="size-4" />}
              label={t('shareViewer.tab.requirements')}
              badge={pendingRequirements > 0 ? pendingRequirements : undefined}
            />
            <ViewerTabButton
              active={tab === 'comments'}
              onClick={() => {
                hideRequirements()
                setTab('comments')
              }}
              icon={<MessageSquare aria-hidden className="size-4" />}
              label={t('shareViewer.tab.comments')}
              badge={commentCount}
            />
          </nav>
        </>
      )}
    </div>
  )
}
