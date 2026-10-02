/**
 * 에디터 툴바 — 저장·undo/redo·자동 배치·보기 메뉴·줌·fit·테마·읽기 전용 배지 (storyboard 02-user §5A [6])
 *
 * ReactFlowProvider 안에서 렌더된다(zoom/fitView 접근). undo/redo/dirty는 스토어 셀렉터 구독.
 * 보기 메뉴 — 이름 표시 모드(물리명/논리명/둘 다) 등 뷰 옵션. 편집 권한과 무관하게 항상 사용 가능.
 * 테마 토글 — 에디터·공개 공유 뷰어는 앱 셸(AppLayout) 밖 전체 화면이라 여기서도 노출한다.
 *
 * 버튼 구성(05-editor/02-ui.md §1.1) — 한 줄에 다 늘어놓지 않는다. 늘 쓰는 것만 버튼으로 두고
 * 나머지는 두 메뉴로 묶는다:
 *   버튼: 탐색기·용어 사전·검증·되돌리기·저장·자동 배치·SQL 생성·공유
 *   「내보내기」 메뉴: 이미지(보이는 화면·전체 문서)·문서 파일(.crown)
 *   「도구」 메뉴: 논리명 추론·데이터베이스 연결 또는 DB 동기화(+ 데이터 보기)·다른 DBMS로 복제·버전 기록
 * 메뉴 항목은 다이얼로그를 여는 신호만 보낸다 — 다이얼로그는 메뉴 밖(형제)에 둔다.
 * 메뉴 내용은 닫히면 언마운트되므로, 그 안에 다이얼로그를 두면 열자마자 사라진다.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowRight, BookMarked, BookOpenText, ChevronDown, CircleHelp, ClipboardList, CopyPlus, Heart, History, Keyboard, Link2, Lock, Eye, FileCode2, FileDown, ImageDown, Loader2, Maximize, Network, Orbit, PanelLeft, Redo2, RefreshCw, Rows3, Save, Shapes, Share2, ShieldCheck, Undo2, Waypoints, Wrench, ZoomIn, ZoomOut } from 'lucide-react'
import { useStore, useReactFlow } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DbmsIcon } from '@/components/dbms-icon'
import { ThemeToggle } from '@/components/theme-toggle'
import { useConnections } from '@/features/connections/hooks'
import { databaseBrowserPath } from '@/features/database'
import { ConnectDatabaseDialog } from '@/features/models/components/connect-database-dialog'
import { ShareDialog } from '@/features/models/components/share-dialog'
import { modelKeys, useShareFeedback, useToggleShareReaction } from '@/features/models/hooks'
import { useSessionStore } from '@/stores/session'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { downloadDataUrl, downloadTextFile, safeFilename } from '@/lib/download'
import {
  LayoutCancelledError,
  cancelLayout,
  layoutHubPositions,
  layoutTablePositions,
  orderFkColumns,
  positionNotes,
  type AutoLayoutMode,
  type LayoutDirection,
  type TableSizes,
} from '@/features/editor/model/auto-layout'
import { buildCrownFile } from '@/features/editor/model/crown-io'
import type { ErdChange } from '@/features/editor/model/changes'
import { dbmsTemplate } from '@/features/editor/model/dbms'
import { captureErdPng, captureErdViewportPng, nodesBoundingBox, resolveCanvasBackground, waitForPaint } from '@/features/editor/model/export-image'
import { requirementState } from '@/features/editor/model/requirements'
import { selectCanRedo, selectCanUndo, selectDirty, useEditorStore } from '@/features/editor/store/editor-store'
import { useRequirementsPanel } from '@/features/editor/store/requirements-panel-store'
import type { ColumnDisplayMode, NameDisplayMode } from './canvas/editor-context'
import { ConvertDbmsDialog } from './ConvertDbmsDialog'
import { LogicalNamesDialog } from './LogicalNamesDialog'
import { useAreaViewFit } from './ModelExplorerPanel'
import { SqlPreviewDialog } from './SqlPreviewDialog'
import { SyncDialog } from './SyncDialog'
import { VersionHistoryDialog } from './VersionHistoryDialog'

/** 영역 필터 라디오의 "전체" 값 — 영역 id와 충돌하지 않는 센티넬 */
const AREA_FILTER_ALL = '__all__'

export interface EditorToolbarProps {
  canEdit: boolean
  saving: boolean
  onSave: () => void
  /** 모델 익스플로러 패널 열림 — 토글 버튼 상태 */
  explorerOpen: boolean
  onToggleExplorer: () => void
  /** 용어 사전 패널 열림 — 토글 버튼 상태. 열람은 멤버 전체라 공개 뷰어만 숨긴다 */
  termsOpen: boolean
  onToggleTermsPanel: () => void
  /** 「도구」 메뉴의 "도메인 타입" — 용어 사전 패널의 도메인 타입 탭을 연다 */
  onOpenDomainTypes?: () => void
  /** 검증 패널 열림 — 토글 버튼 상태(05-validation §4.1). 열람은 멤버 전체라 공개 뷰어만 숨긴다 */
  validationOpen: boolean
  onToggleValidationPanel: () => void
  /** 검증 요약 배지 건수 — Error ≥ 1이면 destructive, 아니면 Warning ≥ 1이면 amber(§4.1).
   *  패널이 닫혀 있어도 배지는 최신 값을 유지한다 */
  validationErrorCount: number
  validationWarningCount: number
  nameDisplay: NameDisplayMode
  onNameDisplayChange: (mode: NameDisplayMode) => void
  columnDisplay: ColumnDisplayMode
  onColumnDisplayChange: (mode: ColumnDisplayMode) => void
  /** 보기 필터로 선택된 주제 영역 — null이면 전체. 영역 목록은 스토어에서 직접 읽는다 */
  activeAreaId: string | null
  onActiveAreaChange: (areaId: string | null) => void
  /** 문서 대상 DBMS 템플릿 id — 모델 메타에서 파생된 고정값 */
  dbmsId: string
  /** 문서명 — SQL·이미지·.crown 다운로드 파일명 */
  modelName: string
  /** 모델 메타 원본 — .crown 봉투에는 코드 테이블 원값을 기록한다 */
  databaseType: string
  /** 모델 설명 — .crown 봉투 메타 */
  modelDescription: string | null
  /** 워크스페이스 id — DDL 생성 API 호출 경로 */
  workspaceId: string
  /** 문서 id — 공유 링크 API 호출 경로 */
  modelId: string
  /** 리버스 엔지니어링 원천 커넥션 — DB 동기화 버튼 노출 근거(없으면 미노출) */
  sourceConnectionId?: string | null
  /** 공개 공유 뷰어(/share/{token}) — 워크스페이스 API(공유 관리·버전 기록·문서 파일)를 숨긴다.
   *  SQL 생성은 공개 DDL(§1.10.8)로, 좋아요는 문서 반응(§1.10.6)으로 계속 쓸 수 있다 */
  publicView?: boolean
  /** 공개 뷰어의 공유 토큰 — DDL 생성 경로와 문서 좋아요의 자격 */
  shareToken?: string
  /** 단축키 치트시트 열기 — 보기 기능이라 읽기 전용·공개 뷰어에서도 노출 */
  onOpenShortcuts: () => void
}

export function EditorToolbar({
  canEdit,
  saving,
  onSave,
  explorerOpen,
  onToggleExplorer,
  termsOpen,
  onToggleTermsPanel,
  onOpenDomainTypes,
  validationOpen,
  onToggleValidationPanel,
  validationErrorCount,
  validationWarningCount,
  nameDisplay,
  onNameDisplayChange,
  columnDisplay,
  onColumnDisplayChange,
  activeAreaId,
  onActiveAreaChange,
  dbmsId,
  modelName,
  databaseType,
  modelDescription,
  workspaceId,
  modelId,
  sourceConnectionId = null,
  publicView = false,
  shareToken,
  onOpenShortcuts,
}: EditorToolbarProps) {
  const { t } = useTranslation()
  const requirementsOpen = useRequirementsPanel((state) => state.open)
  const toggleRequirements = useRequirementsPanel((state) => state.toggle)
  const pendingRequirements = useEditorStore(
    (state) => state.present.diagram.requirements.filter((requirement) => requirementState(requirement) === 'PENDING').length,
  )
  const dirty = useEditorStore(selectDirty)
  const canUndo = useEditorStore(selectCanUndo)
  const canRedo = useEditorStore(selectCanRedo)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)

  return (
    <div className="flex h-10 items-center gap-1 border-b bg-background px-2">
      {!canEdit ? <Badge variant="secondary" className="mr-1">{t('model.editor.toolbar.readOnly')}</Badge> : null}

      {/* 패널 토글 — 아이콘만이 아니라 메뉴명과 함께(무엇을 여는지 알 수 있게) */}
      <Button
        type="button"
        variant={explorerOpen ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 gap-1.5 px-2"
        onClick={onToggleExplorer}
        aria-label={t('model.editor.explorer.toggle')}
        aria-pressed={explorerOpen}
        title={t('model.editor.explorer.toggle')}
      >
        <PanelLeft aria-hidden className="size-3.5" />
        {t('model.editor.explorer.toggle')}
      </Button>

      {/* 용어 사전 패널 — 워크스페이스 API라 공개 뷰어에서는 숨긴다(멤버 Viewer는 열람 가능) */}
      {!publicView ? (
        <Button
          type="button"
          variant={termsOpen ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 gap-1.5 px-2"
          onClick={onToggleTermsPanel}
          aria-label={t('model.editor.termDictionary.toggle')}
          aria-pressed={termsOpen}
          title={t('model.editor.termDictionary.toggle')}
        >
          <BookMarked aria-hidden className="size-3.5" />
          {t('model.editor.termDictionary.toggle')}
        </Button>
      ) : null}

      {/* 검증 패널(v1.20 05-validation §4.1) — 문서 자체만 보므로 멤버 전체가 열람한다.
          요약 배지: Error ≥ 1 destructive, Error 0이고 Warning ≥ 1이면 amber */}
      {!publicView ? (
        <Button
          type="button"
          variant={validationOpen ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 gap-1.5 px-2"
          onClick={onToggleValidationPanel}
          aria-label={t('model.validation.toggle')}
          aria-pressed={validationOpen}
          title={t('model.validation.toggle')}
        >
          <ShieldCheck aria-hidden className="size-3.5" />
          {t('model.validation.toggle')}
          {validationErrorCount > 0 ? (
            <span
              data-testid="validation-badge"
              className="rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-white"
            >
              {validationErrorCount}
            </span>
          ) : validationWarningCount > 0 ? (
            <span
              data-testid="validation-badge"
              className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-amber-950"
            >
              {validationWarningCount}
            </span>
          ) : null}
        </Button>
      ) : null}

      {/* 요구사항 패널(v1.31 02-ui.md §17) — 문서에 속한 내용이라 공개 뷰어에서도 보인다.
          반영 대기 요구사항이 있으면 그 수가 붙는다 */}
      <Button
        type="button"
        variant={requirementsOpen ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 gap-1.5 px-2"
        onClick={toggleRequirements}
        aria-label={t('model.editor.toolbar.requirements')}
        aria-pressed={requirementsOpen}
        title={t('model.editor.toolbar.requirements')}
        data-testid="requirements-toggle"
      >
        <ClipboardList aria-hidden className="size-3.5" />
        {t('model.editor.toolbar.requirements')}
        {pendingRequirements > 0 ? (
          <span
            data-testid="requirements-badge"
            title={t('model.requirements.state.PENDING')}
            className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-amber-950"
          >
            {pendingRequirements}
          </span>
        ) : null}
      </Button>

      <Button type="button" variant="ghost" size="icon" onClick={undo} disabled={!canEdit || !canUndo} aria-label={t('model.editor.toolbar.undo')} title={t('model.editor.toolbar.undo')}>
        <Undo2 aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={redo} disabled={!canEdit || !canRedo} aria-label={t('model.editor.toolbar.redo')} title={t('model.editor.toolbar.redo')}>
        <Redo2 aria-hidden />
      </Button>

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <Button
        type="button"
        variant="default"
        size="sm"
        className="h-7 gap-1 px-2"
        onClick={onSave}
        disabled={!canEdit || saving || !dirty}
      >
        <Save aria-hidden className="size-3.5" />
        {t('model.editor.toolbar.save')}
      </Button>

      <AutoLayoutButton canEdit={canEdit} />
      {/* SQL 생성 — 읽기 전용·공개 뷰어에서도 쓸 수 있다: 내보내기는 편집이 아니다.
          공개 뷰어는 공유 토큰 경로(§1.10.8)로, 멤버 화면은 워크스페이스 경로(§1.7)로 생성한다 */}
      <DdlButton
        dbmsId={dbmsId}
        modelName={modelName}
        workspaceId={workspaceId}
        databaseType={databaseType}
        canEdit={canEdit}
        shareToken={publicView ? shareToken : undefined}
      />
      {!publicView && canEdit ? (
        <ShareButton workspaceId={workspaceId} modelId={modelId} modelName={modelName} />
      ) : null}
      {/* 내보내기 메뉴 — 이미지는 어디서나, .crown 문서 파일은 내 계정 문서에만(공개 뷰어에서는 숨긴다) */}
      <ExportMenu
        modelName={modelName}
        crown={!publicView ? { databaseType, modelDescription } : undefined}
      />
      {/* 도구 메뉴 — 전부 워크스페이스 API라 공개 뷰어에서는 메뉴째 숨긴다.
          버전 기록 열람은 멤버 전체, 나머지는 편집 권한이 있을 때만 항목이 보인다 */}
      {!publicView ? (
        <ToolsMenu
          canEdit={canEdit}
          workspaceId={workspaceId}
          modelId={modelId}
          modelName={modelName}
          modelDescription={modelDescription}
          databaseType={databaseType}
          sourceConnectionId={sourceConnectionId}
          onOpenDomainTypes={onOpenDomainTypes}
        />
      ) : null}
      {/* 문서 좋아요 — 공개 뷰어 헤더 전용(§1.10.6). 내보내기 메뉴 다음 자리.
          댓글 탭의 버튼과 같은 쿼리로 정착한다 */}
      {publicView && shareToken ? <ShareLikeButton token={shareToken} /> : null}

      <div className="flex-1" />

      <DbmsIndicator
        dbmsId={dbmsId}
        convert={
          !publicView && canEdit
            ? { workspaceId, modelName, modelDescription, databaseType }
            : undefined
        }
      />
      <ViewMenu
        nameDisplay={nameDisplay}
        onNameDisplayChange={onNameDisplayChange}
        columnDisplay={columnDisplay}
        onColumnDisplayChange={onColumnDisplayChange}
        activeAreaId={activeAreaId}
        onActiveAreaChange={onActiveAreaChange}
      />
      <ZoomControls />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onOpenShortcuts}
        aria-label={t('model.editor.shortcuts.open')}
        title={`${t('model.editor.shortcuts.open')} (Ctrl/Cmd+/)`}
      >
        <Keyboard aria-hidden />
      </Button>
      {/* 사용 가이드 — 도구 모음에 따로 둔다(메뉴 안에 넣으면 찾기 어렵다). 새 창으로 연다(공개 문서 /guide) */}
      <Button asChild variant="ghost" size="icon">
        <a href="/guide" target="_blank" rel="noopener noreferrer" aria-label={t('guide.title')} title={t('guide.title')}>
          <CircleHelp aria-hidden />
        </a>
      </Button>
      <ThemeToggle />
    </div>
  )
}

/** 문서 대상 DBMS — 문서 생성 시점의 코드 테이블 값으로 고정, 제자리에서 바꾸지 않는다 (05-editor/01-core.md §17).
 *  편집 가능한 로그인 문서에서는 배지가 버튼이다 — 누르면 대상 DBMS만 다른 새 문서로 복제하는
 *  다이얼로그가 열린다 (05-editor/04-dbms-engineering.md §3.5). 그 밖의 화면에서는 표시만 한다. */
function DbmsIndicator({
  dbmsId,
  convert,
}: {
  dbmsId: string
  /** 다른 DBMS로 복제에 필요한 원본 메타 — 없으면 표시 전용 배지 */
  convert?: { workspaceId: string; modelName: string; modelDescription: string | null; databaseType: string }
}) {
  const { t } = useTranslation()
  const template = dbmsTemplate(dbmsId)
  const [open, setOpen] = useState(false)
  const badgeClass =
    'mr-1 flex h-7 items-center gap-1 rounded-md border bg-muted/40 px-1.5 text-xs text-muted-foreground'
  const content = (
    <>
      {/* DBMS 상징 아이콘 — dbmsId(템플릿 id)를 그대로 넘겨도 판정이 항등처리된다 */}
      <DbmsIcon databaseType={dbmsId} className="size-3.5" />
      {template.id === 'common' ? t('model.editor.dbms.common') : template.label}
      <Lock aria-hidden className="size-3" />
    </>
  )

  if (!convert) {
    return (
      <div className={badgeClass} title={t('model.editor.toolbar.dbmsLocked')}>
        {content}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className={`${badgeClass} cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        title={`${t('model.editor.toolbar.dbmsLocked')} · ${t('model.editor.toolbar.dbmsConvert')}`}
        aria-label={t('model.editor.toolbar.dbmsConvert')}
        onClick={() => setOpen(true)}
      >
        {content}
      </button>
      <ConvertDbmsDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={convert.workspaceId}
        modelName={convert.modelName}
        modelDescription={convert.modelDescription}
        databaseType={convert.databaseType}
      />
    </>
  )
}

/** 뷰 옵션 드롭다운 — 이름 표시 모드(erwin·aQueryTool의 logical/physical 뷰 전환)·컬럼 표시 모드(전체/키만)·
 *  주제 영역 필터(영역이 있을 때만 — 문서의 영역은 스토어에서 직접 읽어 셸을 거치지 않는다) */
function ViewMenu({
  nameDisplay,
  onNameDisplayChange,
  columnDisplay,
  onColumnDisplayChange,
  activeAreaId,
  onActiveAreaChange,
}: {
  nameDisplay: NameDisplayMode
  onNameDisplayChange: (mode: NameDisplayMode) => void
  columnDisplay: ColumnDisplayMode
  onColumnDisplayChange: (mode: ColumnDisplayMode) => void
  activeAreaId: string | null
  onActiveAreaChange: (areaId: string | null) => void
}) {
  const { t } = useTranslation()
  const areas = useEditorStore((s) => s.present.diagram.areas)
  const fitArea = useAreaViewFit()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="mr-1 h-7 gap-1 px-2" aria-label={t('model.editor.toolbar.view')}>
          <Eye aria-hidden className="size-3.5" />
          {t('model.editor.toolbar.view')}
          <ChevronDown aria-hidden className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t('model.editor.toolbar.nameMode.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={nameDisplay}
          onValueChange={(value) => onNameDisplayChange(value as NameDisplayMode)}
        >
          <DropdownMenuRadioItem value="physical">{t('model.editor.toolbar.nameMode.physical')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="logical">{t('model.editor.toolbar.nameMode.logical')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="both">{t('model.editor.toolbar.nameMode.both')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('model.editor.toolbar.columnMode.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={columnDisplay}
          onValueChange={(value) => onColumnDisplayChange(value as ColumnDisplayMode)}
        >
          <DropdownMenuRadioItem value="all">{t('model.editor.toolbar.columnMode.all')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="keys">{t('model.editor.toolbar.columnMode.keys')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {areas.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('model.editor.toolbar.areaFilter.label')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={activeAreaId ?? AREA_FILTER_ALL}
              onValueChange={(value) => {
                // 그룹을 고르면 익스플로러 눈 아이콘과 같은 규칙으로 그 그룹에 화면을 맞춘다
                if (value === AREA_FILTER_ALL) {
                  onActiveAreaChange(null)
                  return
                }
                onActiveAreaChange(value)
                fitArea(value)
              }}
            >
              <DropdownMenuRadioItem value={AREA_FILTER_ALL}>{t('model.editor.toolbar.areaFilter.all')}</DropdownMenuRadioItem>
              {areas.map((area) => (
                <DropdownMenuRadioItem key={area.id} value={area.id}>
                  {area.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 자동 배치 — elkjs 계층형(부모가 위)으로 테이블 좌표만 재계산한다(05-editor/02-ui.md §5.1).
 *  관계선은 자체 라우터가 다시 그리고, FK 컬럼은 부모 위치 순으로 정렬해 선이 좌→우로 펴지게
 *  한다. 결과는 묶음 단일 커밋이라 Undo 1회로 되돌아간다. */
/** 자동 배치 모드 기억 — 브라우저 단위(패널 열림 기억 crowfoot.editor.* 와 같은 관례).
 *  기본은 계층형(종래 동작) — 모르는 값·저장 불가 환경은 계층형으로 귀결 */
const LAYOUT_MODE_KEY = 'crowfoot.editor.layout-mode'

const LAYOUT_MODES: AutoLayoutMode[] = ['layered', 'hub', 'hybrid']

/** 모드별 보이는 라벨 키와 아이콘 — 계층형 Network, 허브 Waypoints, 하이브리드 Orbit */
const LAYOUT_MODE_META: Record<AutoLayoutMode, { labelKey: string; Icon: typeof Network }> = {
  layered: { labelKey: 'model.editor.toolbar.autoLayoutLayered', Icon: Network },
  hub: { labelKey: 'model.editor.toolbar.autoLayoutHub', Icon: Waypoints },
  hybrid: { labelKey: 'model.editor.toolbar.autoLayoutHybrid', Icon: Orbit },
}

/** 배치 방향 기억 — 모드와 같은 관례. 기본은 위→아래(종래 동작) */
const LAYOUT_DIRECTION_KEY = 'crowfoot.editor.layout-direction'

function readLayoutDirection(): LayoutDirection {
  try {
    return localStorage.getItem(LAYOUT_DIRECTION_KEY) === 'right' ? 'right' : 'down'
  } catch {
    return 'down'
  }
}

/** 진행 안내를 띄우기까지의 지연 — 금방 끝나는 배치에서는 깜빡이지 않게 한다 */
const LAYOUT_PROGRESS_DELAY_MS = 800

function readLayoutMode(): AutoLayoutMode {
  try {
    const raw = localStorage.getItem(LAYOUT_MODE_KEY)
    return LAYOUT_MODES.includes(raw as AutoLayoutMode) ? (raw as AutoLayoutMode) : 'layered'
  } catch {
    return 'layered'
  }
}

/** 자동 배치 — 분할 버튼(v1.24 §1). 본체는 현재 모드로 바로 실행하고, 캐럿은 모드 라디오.
 *  본체 aria-label은 종래 '자동 배치' 그대로(스크린리더 안내·기존 테스트 보존),
 *  보이는 라벨은 선택된 모드명으로 바뀐다. 모드 선택은 localStorage 즉시 저장 + 즉시 실행. */
function AutoLayoutButton({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation()
  const { fitView, getNodes } = useReactFlow()
  const commitAll = useEditorStore((s) => s.commitAll)
  const tableCount = useEditorStore((s) => s.present.model.tables.length)
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<AutoLayoutMode>(readLayoutMode)
  const [direction, setDirection] = useState<LayoutDirection>(readLayoutDirection)
  /** 걸린 시간(초) — null이면 진행 안내를 띄우지 않는다(실행 전이거나 아직 지연 시간 안) */
  const [elapsed, setElapsed] = useState<number | null>(null)

  useEffect(() => {
    if (!running) return
    const startedAt = Date.now()
    const timer = setInterval(() => {
      const ms = Date.now() - startedAt
      if (ms >= LAYOUT_PROGRESS_DELAY_MS) setElapsed(Math.floor(ms / 1000))
    }, 250)
    return () => {
      clearInterval(timer)
      setElapsed(null)
    }
  }, [running])

  const run = async (nextMode: AutoLayoutMode, nextDirection: LayoutDirection = direction) => {
    setRunning(true)
    try {
      // 클릭 시점 문서 스냅샷 — await 사이 편집이 끼어도 node/move는 존재 노드만 갱신해 안전하다
      const doc = useEditorStore.getState().present
      // 렌더 실측 크기 — 추정식은 컬럼명·배지 폭을 못 재서 노트 간격이 좁아진다
      const sizes: TableSizes = {}
      for (const node of getNodes()) {
        const m = node.measured
        if (m?.width !== undefined && m.height !== undefined) sizes[node.id] = { w: m.width, h: m.height }
      }
      // 허브·하이브리드는 순수 동기 계산(전략만 다름), 계층형은 elkjs 비동기 —
      // 이후 파이프라인(FK 정렬·노트·fit)은 공통
      const positions =
        nextMode === 'layered'
          ? await layoutTablePositions(doc, { sizes, direction: nextDirection })
          : layoutHubPositions(doc, {
              sizes,
              strategy: nextMode === 'hybrid' ? 'tree' : 'ring',
              direction: nextDirection,
            })
      if (Object.keys(positions).length > 0) {
        // FK 컬럼을 부모 테이블 위치 순으로 정렬한다 — 선 부착 순서가 좌→우로 정렬돼 겹침이 줄고,
        // 노트는 테이블 위에 포개지지 않게 위치를 잡는다. 묶음 커밋이라 Undo 1회
        const fkMoves = orderFkColumns(doc, positions, sizes)
        const noteChanges = Object.entries(positionNotes(doc, positions, sizes)).map(
          ([noteId, xy]) => ({ type: 'note/patch', noteId, patch: xy }) as ErdChange,
        )
        commitAll([{ type: 'node/move', positions }, ...fkMoves, ...noteChanges])
        // ErdCanvas 노드 재빌드 직후 새 좌표 기준으로 뷰를 맞춘다
        setTimeout(() => void fitView({ padding: 0.25, duration: 200 }), 0)
      }
    } catch (error) {
      // 취소는 실패가 아니다 — 문서는 바뀌지 않았다
      if (!(error instanceof LayoutCancelledError)) toast.error(t('model.editor.toolbar.autoLayoutFailed'))
    } finally {
      setRunning(false)
    }
  }

  /** 방향 선택 — 모드 선택과 같이 저장하고 바로 실행한다 */
  const selectDirection = (value: string) => {
    const nextDirection: LayoutDirection = value === 'right' ? 'right' : 'down'
    setDirection(nextDirection)
    try {
      localStorage.setItem(LAYOUT_DIRECTION_KEY, nextDirection)
    } catch {
      // 저장 실패는 세션 상태로만 동작
    }
    void run(mode, nextDirection)
  }

  /** 라디오 선택 — 저장과 실행을 함께(모드를 바꾸는 것 자체가 결과 확인이 목적) */
  const selectMode = (value: string) => {
    const nextMode: AutoLayoutMode = LAYOUT_MODES.includes(value as AutoLayoutMode)
      ? (value as AutoLayoutMode)
      : 'layered'
    setMode(nextMode)
    try {
      localStorage.setItem(LAYOUT_MODE_KEY, nextMode)
    } catch {
      // 사생활 보호 모드 등 저장 실패는 세션 상태로만 동작
    }
    void run(nextMode)
  }

  return (
    <div className="flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 rounded-r-none px-2"
        onClick={() => void run(mode)}
        disabled={!canEdit || tableCount < 2 || running}
        aria-label={t('model.editor.toolbar.autoLayout')}
        title={t('model.editor.toolbar.autoLayout')}
      >
        {t(LAYOUT_MODE_META[mode].labelKey)}
        {running ? (
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
        ) : (
          (() => {
            const Icon = LAYOUT_MODE_META[mode].Icon
            return <Icon aria-hidden className="size-3.5" />
          })()
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-6 rounded-l-none border-l border-border/60 px-0"
            disabled={!canEdit || tableCount < 2 || running}
            aria-label={t('model.editor.toolbar.autoLayoutMode')}
            title={t('model.editor.toolbar.autoLayoutMode')}
          >
            <ChevronDown aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        {/* 가장 긴 항목(방향 — "Left to right" 등)이 한 줄에 들어가게 폭을 내용에 맞춘다 */}
        <DropdownMenuContent align="start" className="w-max min-w-44 whitespace-nowrap">
          <DropdownMenuRadioGroup value={mode} onValueChange={selectMode}>
            {LAYOUT_MODES.map((candidate) => {
              const { labelKey, Icon } = LAYOUT_MODE_META[candidate]
              return (
                <DropdownMenuRadioItem key={candidate} value={candidate}>
                  <Icon aria-hidden className="size-3.5" />
                  {t(labelKey)}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('model.editor.toolbar.autoLayoutDirection')}</DropdownMenuLabel>
          {/* 허브(동심원) 모드에는 방향이 없다 */}
          <DropdownMenuRadioGroup value={direction} onValueChange={selectDirection}>
            <DropdownMenuRadioItem value="down" disabled={mode === 'hub'}>
              <ArrowDown aria-hidden className="size-3.5" />
              {t('model.editor.toolbar.autoLayoutDown')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="right" disabled={mode === 'hub'}>
              <ArrowRight aria-hidden className="size-3.5" />
              {t('model.editor.toolbar.autoLayoutRight')}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* 오래 걸리는 배치 — 걸린 시간과 취소. 계산은 워커에서 돌아 화면은 멈추지 않는다 */}
      {running && elapsed !== null
        ? createPortal(
            <div
              role="status"
              className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-md"
            >
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t('model.editor.toolbar.autoLayoutRunning', { seconds: elapsed })}
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={cancelLayout}>
                {t('model.editor.toolbar.autoLayoutCancel')}
              </Button>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

/** SQL 스크립트 미리보기 — 문서를 대상 DBMS 방언의 DDL로 내보낸다(05-editor/04-dbms-engineering.md §3.1).
 *  읽기 전용·공개 뷰어에서도 항상 쓸 수 있다 — 내보내기는 편집이 아니다. 공개 뷰어는
 *  shareToken 경로(§1.10.8)로 생성하고, 배포(§1.8 진입)는 편집 권한이 있을 때만 노출된다. */
function DdlButton({
  dbmsId,
  modelName,
  workspaceId,
  databaseType,
  canEdit,
  shareToken,
}: {
  dbmsId: string
  modelName: string
  workspaceId: string
  databaseType: string
  canEdit: boolean
  shareToken?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2"
        onClick={() => setOpen(true)}
        aria-label={t('model.editor.toolbar.ddl')}
        title={t('model.editor.toolbar.ddl')}
      >
        {t('model.editor.toolbar.ddl')}
        <FileCode2 aria-hidden className="size-3.5" />
      </Button>
      <SqlPreviewDialog
        open={open}
        onOpenChange={setOpen}
        dbmsId={dbmsId}
        modelName={modelName}
        workspaceId={workspaceId}
        shareToken={shareToken}
        databaseType={databaseType}
        canEdit={canEdit}
      />
    </>
  )
}

/** 문서 좋아요(§1.10.6) — 공개 뷰어 헤어 버튼. 댓글 탭의 반응 버튼과 같은 쿼리 키로 정착하고,
 *  회원만 토글(비회원 클릭은 로그인 안내 토스트 — 게이트웨이가 어차피 401로 막는다) */
function ShareLikeButton({ token }: { token: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isMember = useSessionStore((state) => state.status) === 'authenticated'
  const feedback = useShareFeedback(token)
  const toggleReaction = useToggleShareReaction(token)
  const reacted = feedback.data?.reacted ?? false
  const count = feedback.data?.reactionCount ?? 0

  const react = () => {
    if (!isMember) {
      toast.info(t('shareFeedback.reactionMemberOnly'))
      return
    }
    const current = feedback.data
    if (!current) return
    // 낙관 전환 — 댓글 탭 버튼과 같은 쿼리 키라 양쪽이 함께 갱신된다
    const optimistic = !current.reacted
    queryClient.setQueryData(modelKeys.shareFeedback(token), {
      ...current,
      reacted: optimistic,
      reactionCount: current.reactionCount + (optimistic ? 1 : -1),
    })
    toggleReaction.mutate(undefined, {
      onError: () => {
        queryClient.setQueryData(modelKeys.shareFeedback(token), current) // 원복
        toast.error(t('shareFeedback.reactionFailed'))
      },
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={
        reacted ? 'h-7 gap-1 px-2 text-red-500 hover:text-red-500' : 'h-7 gap-1 px-2'
      }
      onClick={react}
      disabled={toggleReaction.isPending || feedback.isPending}
      aria-pressed={reacted}
      aria-label={t('shareFeedback.reactionLabel')}
      title={isMember ? t('shareFeedback.reactionLabel') : t('shareFeedback.reactionMemberOnly')}
      data-testid="toolbar-like-button"
    >
      <Heart aria-hidden className={`size-4 ${reacted ? 'fill-current' : ''}`} />
      {t('shareFeedback.like')}
      <span data-testid="toolbar-like-count">{count}</span>
    </Button>
  )
}

/** 문서 공유 링크 — 발급·복사·철회 다이얼로그 (08-core/02-model.md §1.10). Editor 이상. */
function ShareButton({
  workspaceId,
  modelId,
  modelName,
}: {
  workspaceId: string
  modelId: string
  modelName: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2"
        onClick={() => setOpen(true)}
        aria-label={t('model.editor.toolbar.share')}
        title={t('model.editor.toolbar.share')}
      >
        {t('model.editor.toolbar.share')}
        <Share2 aria-hidden className="size-3.5" />
      </Button>
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={workspaceId}
        modelId={modelId}
        modelName={modelName}
      />
    </>
  )
}

/** 「도구」 메뉴 — 가끔 쓰는 문서 작업을 묶는다(05-editor/02-ui.md §1.1).
 *  · 논리명 추론(§3.2 — 편집 권한) · 데이터베이스 연결(§1.14 — 미연결 문서) 또는 DB 동기화(§3.3 — 연결된 문서)
 *  · 다른 DBMS로 복제(§3.5 — 편집 권한) · 도메인 타입(§16 — 멤버 전체, 쓰기는 편집 권한)
 *  · 버전 기록(08-core/02-model.md §1.11 — 멤버 전체)
 *  항목은 어느 다이얼로그를 열지만 정하고, 다이얼로그는 메뉴 밖에서 렌더한다. */
type ToolDialog = 'logicalNames' | 'connect' | 'sync' | 'convert' | 'history'

function ToolsMenu({
  canEdit,
  workspaceId,
  modelId,
  modelName,
  modelDescription,
  databaseType,
  sourceConnectionId,
  onOpenDomainTypes,
}: {
  canEdit: boolean
  workspaceId: string
  modelId: string
  modelName: string
  modelDescription: string | null
  databaseType: string
  sourceConnectionId: string | null
  onOpenDomainTypes?: () => void
}) {
  const { t } = useTranslation()
  const [active, setActive] = useState<ToolDialog | null>(null)
  const close = (open: boolean) => {
    if (!open) setActive(null)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" aria-label={t('model.editor.toolbar.tools')}>
            <Wrench aria-hidden className="size-3.5" />
            {t('model.editor.toolbar.tools')}
            <ChevronDown aria-hidden className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          {canEdit ? (
            <DropdownMenuItem onSelect={() => setActive('logicalNames')}>
              <BookOpenText aria-hidden />
              {t('model.editor.toolbar.logicalNames')}
            </DropdownMenuItem>
          ) : null}
          {/* 데이터베이스 최초 연결(§1.14) — 미연결 문서에만. 연결 성공으로 models 프리픽스가
              무효화되면 상세가 재조회돼 이 항목은 사라지고 DB 동기화가 그 자리에 나타난다 */}
          {canEdit && !sourceConnectionId ? (
            <DropdownMenuItem onSelect={() => setActive('connect')}>
              <Link2 aria-hidden />
              {t('model.connect.toolbar')}
            </DropdownMenuItem>
          ) : null}
          {canEdit && sourceConnectionId ? (
            <SyncMenuItem
              workspaceId={workspaceId}
              modelId={modelId}
              sourceConnectionId={sourceConnectionId}
              onSelect={() => setActive('sync')}
            />
          ) : null}
          {canEdit ? (
            <DropdownMenuItem onSelect={() => setActive('convert')}>
              <CopyPlus aria-hidden />
              {t('model.editor.toolbar.dbmsConvert')}
            </DropdownMenuItem>
          ) : null}
          {canEdit ? <DropdownMenuSeparator /> : null}
          {onOpenDomainTypes ? (
            // 도메인 타입은 용어 사전 패널의 탭이다 — 여기서는 그 탭을 연다(§14)
            <DropdownMenuItem onSelect={onOpenDomainTypes}>
              <Shapes aria-hidden />
              {t('model.editor.domainType.menu')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setActive('history')}>
            <History aria-hidden />
            {t('model.editor.toolbar.history')}
          </DropdownMenuItem>

        </DropdownMenuContent>
      </DropdownMenu>

      <LogicalNamesDialog open={active === 'logicalNames'} onOpenChange={close} workspaceId={workspaceId} />
      {active === 'connect' ? (
        <ConnectDatabaseDialog
          open
          onOpenChange={close}
          workspaceId={workspaceId}
          model={{ modelId, name: modelName, databaseType }}
        />
      ) : null}
      {sourceConnectionId ? (
        <SyncDialog
          open={active === 'sync'}
          onOpenChange={close}
          workspaceId={workspaceId}
          modelName={modelName}
          sourceConnectionId={sourceConnectionId}
          canEdit={canEdit}
        />
      ) : null}
      <ConvertDbmsDialog
        open={active === 'convert'}
        onOpenChange={close}
        workspaceId={workspaceId}
        modelName={modelName}
        modelDescription={modelDescription}
        databaseType={databaseType}
      />
      <VersionHistoryDialog
        open={active === 'history'}
        onOpenChange={close}
        workspaceId={workspaceId}
        modelId={modelId}
        modelName={modelName}
        canEdit={canEdit}
      />
    </>
  )
}

/** DB 동기화 항목 — 원천 커넥션(리버스 생성 시점)의 현재 스키마를 문서에 부분 반영한다
 *  (05-editor/04-dbms-engineering.md §3.3). 원천 커넥션이 삭제됐으면 원천이 없으니 항목을 숨긴다.
 *  커넥션 목록은 메뉴를 열 때 조회한다(항목이 메뉴 내용 안에서 마운트된다). */
function SyncMenuItem({
  workspaceId,
  modelId,
  sourceConnectionId,
  onSelect,
}: {
  workspaceId: string
  modelId: string
  sourceConnectionId: string
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const connections = useConnections(workspaceId)
  const exists = (connections.data?.items ?? []).some(
    (connection) => connection.connectionId === sourceConnectionId,
  )
  if (!exists) return null

  return (
    <>
      <DropdownMenuItem onSelect={onSelect}>
        <RefreshCw aria-hidden />
        {t('model.editor.toolbar.sync')}
      </DropdownMenuItem>
      {/* 데이터 보기 — 원천 커넥션의 데이터 브라우저를 새 창으로 연다(09-database-manager/00-data-browser.md §5.1) */}
      <DropdownMenuItem
        onSelect={() =>
          window.open(databaseBrowserPath(workspaceId, sourceConnectionId, { modelId }), '_blank', 'noopener,noreferrer')
        }
      >
        <Rows3 aria-hidden />
        {t('database.openShort')}
      </DropdownMenuItem>
    </>
  )
}

/** 「내보내기」 메뉴 — 이미지와 문서 파일을 묶는다(05-editor/02-ui.md §1.1).
 *  이미지는 두 범위를 제공한다.
 *  · 보이는 화면: 현재 줌·구도 그대로 뷰포트만 찍는다 — 래스터가 작아 큰 문서도 즉시 끝난다
 *  · 전체 문서: 모든 테이블·노트·관계선 + 여백. 넓은 문서는 배율을 낮춰 느려짐을 줄인다
 *  캡처 대상이 없으면(빈 문서) 이미지 항목은 비활성. 노드는 항상 전부 렌더돼 있어(컬링 없음) 화면 밖 노드도 그대로 찍힌다.
 *  .crown 문서 파일(05-editor/00-overview.md §5)은 문서 본체(현재 편집 상태)와 메타를 JSON 봉투로 내려받는다 —
 *  마지막 저장 본문이 아니라 클릭 시점 문서를 싣는다. crown이 없으면(공개 뷰어) 항목을 숨긴다. */
function ExportMenu({
  modelName,
  crown,
}: {
  modelName: string
  crown?: { databaseType: string; modelDescription: string | null }
}) {
  const { t } = useTranslation()
  const { getNodes } = useReactFlow()
  const objectCount = useEditorStore(
    (s) => s.present.model.tables.length + s.present.diagram.notes.length,
  )
  /** 진행 표시 — 범위 계산(prepare) → 렌더링(render, 제일 김) → 파일 저장(save).
   *  단계마다 waitForPaint로 커밋·페인트를 기다린 뒤 무거운 작업을 시작한다(오버레이가 먼저 보여야 한다) */
  const [progress, setProgress] = useState<{ mode: 'viewport' | 'document'; phase: 'prepare' | 'render' | 'save' } | null>(null)
  const running = progress !== null

  const runImage = async (mode: 'viewport' | 'document') => {
    const canvasEl = document.querySelector<HTMLElement>('.react-flow')
    if (!canvasEl) return
    setProgress({ mode, phase: 'prepare' })
    try {
      await waitForPaint()
      const background = resolveCanvasBackground(canvasEl)
      if (mode === 'viewport') {
        setProgress({ mode, phase: 'render' })
        await waitForPaint()
        const dataUrl = await captureErdViewportPng(canvasEl, background)
        setProgress({ mode, phase: 'save' })
        await waitForPaint()
        downloadDataUrl(`${safeFilename(modelName)}.png`, dataUrl)
      } else {
        const bounds = nodesBoundingBox(getNodes())
        if (!bounds) return
        setProgress({ mode, phase: 'render' })
        await waitForPaint()
        const dataUrl = await captureErdPng(canvasEl, bounds, background)
        setProgress({ mode, phase: 'save' })
        await waitForPaint()
        downloadDataUrl(`${safeFilename(modelName)}.png`, dataUrl)
      }
      toast.success(t('model.editor.image.exported'))
    } catch {
      toast.error(t('model.editor.image.failed'))
    } finally {
      setProgress(null)
    }
  }

  const runCrown = () => {
    if (!crown) return
    try {
      const file = buildCrownFile(
        { name: modelName, description: crown.modelDescription, databaseType: crown.databaseType },
        useEditorStore.getState().present,
        new Date().toISOString(),
      )
      downloadTextFile(`${safeFilename(modelName)}.crown`, file, 'application/json')
      toast.success(t('model.editor.crown.exported'))
    } catch {
      toast.error(t('model.editor.crown.failed'))
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2"
            disabled={running}
            aria-label={t('model.editor.toolbar.export')}
          >
            {running ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <FileDown aria-hidden className="size-3.5" />}
            {t('model.editor.toolbar.export')}
            <ChevronDown aria-hidden className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuLabel>{t('model.editor.toolbar.image')}</DropdownMenuLabel>
          <DropdownMenuItem disabled={objectCount === 0} onSelect={() => void runImage('viewport')}>
            <ImageDown aria-hidden />
            {t('model.editor.image.viewport')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={objectCount === 0} onSelect={() => void runImage('document')}>
            <ImageDown aria-hidden />
            {t('model.editor.image.document')}
          </DropdownMenuItem>
          {crown ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={runCrown}>
                <FileDown aria-hidden />
                {t('model.editor.toolbar.crown')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {progress ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="image-export-progress"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
        >
          <div className="flex w-80 flex-col items-center gap-3 rounded-lg border bg-background p-5 shadow-lg">
            <p className="text-sm font-medium">
              {t('model.editor.toolbar.image')} — {t(`model.editor.image.${progress.mode}`)}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full origin-left rounded-full bg-primary [animation:image-export-progress_20s_ease-out_forwards]" />
            </div>
            <p className="text-xs text-muted-foreground">{t(`model.editor.image.progress.${progress.phase}`)}</p>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** 줌 표시·제어 — RF transform 구독. ±버튼은 15% 단위로 딱 떨어지게 이동한다 */
function ZoomControls() {
  const { t } = useTranslation()
  const { zoomTo, fitView } = useReactFlow()
  const zoom = useStore((s) => s.transform[2])

  const stepZoom = (direction: 1 | -1) => {
    // ErdCanvas 줌 한계(0.1~2.5) 안에서 15% 스텝 — round로 부동소수 오차를 없앤다
    const next = Math.round((zoom + direction * 0.15) * 1000) / 1000
    void zoomTo(Math.min(2.5, Math.max(0.1, next)), { duration: 150 })
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button type="button" variant="ghost" size="icon" onClick={() => stepZoom(-1)} aria-label={t('model.editor.toolbar.zoomOut')} title={t('model.editor.toolbar.zoomOut')}>
        <ZoomOut aria-hidden />
      </Button>
      <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <Button type="button" variant="ghost" size="icon" onClick={() => stepZoom(1)} aria-label={t('model.editor.toolbar.zoomIn')} title={t('model.editor.toolbar.zoomIn')}>
        <ZoomIn aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={() => void fitView({ padding: 0.25, duration: 200 })} aria-label={t('model.editor.toolbar.fit')} title={t('model.editor.toolbar.fit')}>
        <Maximize aria-hidden />
      </Button>
    </div>
  )
}
