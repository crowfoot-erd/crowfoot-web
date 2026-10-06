/**
 * ERD 문서 열기 (storyboard 02-user §5 — 문서 이름·돋보기에서 window.open 진입)
 *
 * - 새 창 전체 화면 — 앱 셸(사이드바·탭) 없이 문서만 크게
 * - 상세(1.3)로 메아를 로드: 이름·DB 종류·캔버스·버전·생성자·최근 수정
 * - 본체는 EditorShell(에디터 1차 — 캔버스·인라인 편집·관계·메모·저장)
 * - 권한: 내 역할(OWNER/EDITOR)만 편집, Viewer·Commenter는 읽기 전용 캔버스
 * - 화면은 공개 뷰어와 같은 **하단 탭 바(ERD 기본 · 요구사항 · 데이터 보기 · 댓글)** (v1.21 후속 — 동일 UX).
 *   데이터 보기 탭(05-editor/02-ui.md §22)은 Editor 이상에게만 있다 — 데이터 브라우저의 권한과 같다
 *   댓글 탭은 문서 단위 멤버 경로(§1.10.7)로 좋아요·댓글을 바로 보여준다(#261) —
 *   공유 링크가 없어도 되고, 스레드는 공개 뷰어와 같다(활성 링크가 있으면 같은 댓글).
 *   댓글 등록은 Commenter 이상, 답글은 문서 작성자만
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, Loader2, MessageSquare, Rows3, Table2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DbmsIcon } from '@/components/dbms-icon'
import { dbmsLabel } from '@/features/editor/model/dbms'
import { ErrorState } from '@/components/error-state'
import { ViewerTabButton } from '@/components/viewer-tab-button'
import { requirementState } from '@/features/editor/model/requirements'
import { useDataView } from '@/features/editor/store/data-view-store'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { useRequirementsPanel } from '@/features/editor/store/requirements-panel-store'
import { formatDateTime } from '@/lib/format'
import { EditorShell } from '@/features/editor'
import { useModel, useModelFeedback } from '@/features/models'
import { useMe } from '@/features/auth'
import { useMyWorkspaces } from '@/features/workspaces'
import { ShareFeedbackSection } from '@/features/models/components/share-feedback-section'

type ViewerTab = 'erd' | 'comments'

export function ModelViewerPage() {
  const { t } = useTranslation()
  const { workspaceId = '', modelId = '' } = useParams()
  const model = useModel(workspaceId, modelId)
  const myWorkspaces = useMyWorkspaces()
  const me = useMe()

  // 저장 성공 콜백으로만 갱신 — invalidate 재조회 전에 즉시 반영
  const [savedVersion, setSavedVersion] = useState<number | null>(null)
  // 하단 탭 — ERD 기본(에디터가 주인공), 댓글 탭은 문서 단위 피드백 패널
  const [tab, setTab] = useState<ViewerTab>('erd')
  const requirementsOpen = useRequirementsPanel((state) => state.open)
  const showRequirements = useRequirementsPanel((state) => state.show)
  const hideRequirements = useRequirementsPanel((state) => state.hide)
  const dataOpen = useDataView((state) => state.open)
  const showData = useDataView((state) => state.show)
  const hideData = useDataView((state) => state.hide)
  const pendingRequirements = useEditorStore(
    (state) => state.present.diagram.requirements.filter((requirement) => requirementState(requirement) === 'PENDING').length,
  )

  // 탭 배지(댓글 수) — 댓글 탭 본문(ShareFeedbackSection)과 같은 쿼리 키라 한 번만 fetch된다
  const feedback = useModelFeedback(workspaceId, modelId)

  const myRole = myWorkspaces.data?.items.find((ws) => ws.workspaceId === workspaceId)?.myRole
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  // 댓글 등록은 Commenter 이상(Viewer는 읽기 전용), 답글은 문서 작성자만
  const canComment = myRole === 'OWNER' || myRole === 'EDITOR' || myRole === 'COMMENTER'
  // 데이터 보기 탭 — 툴바의 「데이터 보기」와 같은 권한(Editor 이상). 탭이 있는 화면이라고 에디터에 알린다
  const setDataAvailable = useDataView((state) => state.setAvailable)
  useEffect(() => {
    setDataAvailable(canEdit)
    return () => setDataAvailable(false)
  }, [canEdit, setDataAvailable])
  const isOwner = me.data != null && me.data.userId === model.data?.createdBy?.userId
  // 댓글 수 — 공개 뷰어와 같은 규칙(좋아요 합산은 2026-09-27 2차 보고로 철회)
  const commentCount = feedback.data?.comments.length ?? 0

  return (
    <div className="flex h-dvh flex-col bg-background">
      {model.isPending ? (
        // 문서 상세(content 포함) 조회 — 셸 없는 전체 화면이라 중앙 스피너로 로딩을 알린다
        <div
          role="status"
          aria-live="polite"
          data-testid="editor-loading"
          className="flex flex-1 flex-col items-center justify-center gap-4"
        >
          <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
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
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <DbmsIcon databaseType={model.data.databaseType} className="size-3" />
                  {dbmsLabel(model.data.databaseType)}
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
          {/* 탭 본문 — ERD 탭은 에디터가 뷰포트 나머지 전체를 차지한다 */}
          <div className="flex min-h-0 flex-1 flex-col">
            {tab === 'erd' ? (
              <EditorShell model={model.data} canEdit={canEdit} onSaved={setSavedVersion} />
            ) : (
              <ShareFeedbackSection
                target={{ kind: 'model', workspaceId, modelId, canComment, canReply: isOwner }}
              />
            )}
          </div>
          {/* 하단 탭 바 — 공개 뷰어와 같은 모양(ERD 기본 · 댓글 배지=댓글 수). 좌측 정렬 필 버튼 */}
          <nav
            role="tablist"
            aria-label={t('shareViewer.tab.label')}
            data-testid="model-viewer-tabs"
            className="flex h-12 shrink-0 items-center gap-1 border-t bg-background px-3"
          >
            <ViewerTabButton
              active={tab === 'erd' && !requirementsOpen && !(canEdit && dataOpen)}
              onClick={() => {
                setTab('erd')
                hideRequirements()
                hideData()
              }}
              icon={<Table2 aria-hidden className="size-4" />}
              label={t('shareViewer.tab.erd')}
            />
            {/* 요구사항 — 에디터 안의 화면이라 ERD 탭을 유지한 채 연다(자동 저장·협업이 이어진다). 배지는 반영 대기 수 */}
            <ViewerTabButton
              active={tab === 'erd' && requirementsOpen}
              onClick={() => {
                setTab('erd')
                hideData()
                showRequirements()
              }}
              icon={<ClipboardList aria-hidden className="size-4" />}
              label={t('shareViewer.tab.requirements')}
              badge={pendingRequirements > 0 ? pendingRequirements : undefined}
            />
            {/* 데이터 보기 — 원천 커넥션의 데이터 브라우저를 에디터 안에서 연다(§22). 에디터는 감추기만 한다 */}
            {canEdit ? (
              <ViewerTabButton
                active={tab === 'erd' && dataOpen}
                onClick={() => {
                  setTab('erd')
                  showData()
                }}
                icon={<Rows3 aria-hidden className="size-4" />}
                label={t('shareViewer.tab.data')}
              />
            ) : null}
            <ViewerTabButton
              active={tab === 'comments'}
              onClick={() => {
                hideRequirements()
                hideData()
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
