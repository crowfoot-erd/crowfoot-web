/**
 * 에디터 툴바 — 저장·undo/redo·자동 배치·보기 메뉴·줌·fit·테마·읽기 전용 배지 (storyboard 02-user §5A [6])
 *
 * ReactFlowProvider 안에서 렌더된다(zoom/fitView 접근). undo/redo/dirty는 스토어 셀렉터 구독.
 * 보기 메뉴 — 이름 표시 모드(물리명/논리명/둘 다) 등 뷰 옵션. 편집 권한과 무관하게 항상 사용 가능.
 * 테마 토글 — 에디터·공개 공유 뷰어는 앱 셸(AppLayout) 밖 전체 화면이라 여기서도 노출한다.
 */
import { useState } from 'react'
import { ChevronDown, Database, History, Lock, Eye, FileCode2, FileDown, ImageDown, Loader2, Maximize, Network, Redo2, RefreshCw, Save, Share2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useStore, useReactFlow } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { useConnections } from '@/features/connections/hooks'
import { ShareDialog } from '@/features/models/components/share-dialog'
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
import { layoutTablePositions, orderFkColumns, positionNotes, type TableSizes } from '@/features/editor/model/auto-layout'
import { buildCrownFile } from '@/features/editor/model/crown-io'
import type { ErdChange } from '@/features/editor/model/changes'
import { dbmsTemplate } from '@/features/editor/model/dbms'
import { captureErdPng, captureErdViewportPng, nodesBoundingBox, resolveCanvasBackground, waitForPaint } from '@/features/editor/model/export-image'
import { selectCanRedo, selectCanUndo, selectDirty, useEditorStore } from '@/features/editor/store/editor-store'
import type { ColumnDisplayMode, NameDisplayMode } from './canvas/editor-context'
import { SqlPreviewDialog } from './SqlPreviewDialog'
import { SyncDialog } from './SyncDialog'
import { VersionHistoryDialog } from './VersionHistoryDialog'

export interface EditorToolbarProps {
  canEdit: boolean
  saving: boolean
  onSave: () => void
  nameDisplay: NameDisplayMode
  onNameDisplayChange: (mode: NameDisplayMode) => void
  columnDisplay: ColumnDisplayMode
  onColumnDisplayChange: (mode: ColumnDisplayMode) => void
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
  /** 공개 공유 뷰어(/share/{token}) — 워크스페이스 API(DDL)·공유 관리를 숨긴다 */
  publicView?: boolean
}

export function EditorToolbar({
  canEdit,
  saving,
  onSave,
  nameDisplay,
  onNameDisplayChange,
  columnDisplay,
  onColumnDisplayChange,
  dbmsId,
  modelName,
  databaseType,
  modelDescription,
  workspaceId,
  modelId,
  sourceConnectionId = null,
  publicView = false,
}: EditorToolbarProps) {
  const { t } = useTranslation()
  const dirty = useEditorStore(selectDirty)
  const canUndo = useEditorStore(selectCanUndo)
  const canRedo = useEditorStore(selectCanRedo)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)

  return (
    <div className="flex h-10 items-center gap-1 border-b bg-background px-2">
      {!canEdit ? <Badge variant="secondary" className="mr-1">{t('model.editor.toolbar.readOnly')}</Badge> : null}

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
      {!publicView && canEdit && sourceConnectionId ? (
        <SyncButton
          workspaceId={workspaceId}
          modelName={modelName}
          sourceConnectionId={sourceConnectionId}
          canEdit={canEdit}
        />
      ) : null}
      {!publicView && (
        <DdlButton
          dbmsId={dbmsId}
          modelName={modelName}
          workspaceId={workspaceId}
          databaseType={databaseType}
          canEdit={canEdit}
        />
      )}
      {!publicView && canEdit ? (
        <ShareButton workspaceId={workspaceId} modelId={modelId} modelName={modelName} />
      ) : null}
      {!publicView && (
        <VersionHistoryButton workspaceId={workspaceId} modelId={modelId} modelName={modelName} canEdit={canEdit} />
      )}
      <ImageButton modelName={modelName} />
      <CrownButton modelName={modelName} databaseType={databaseType} modelDescription={modelDescription} />

      <div className="flex-1" />

      <DbmsIndicator dbmsId={dbmsId} />
      <ViewMenu
        nameDisplay={nameDisplay}
        onNameDisplayChange={onNameDisplayChange}
        columnDisplay={columnDisplay}
        onColumnDisplayChange={onColumnDisplayChange}
      />
      <ZoomControls />
      <ThemeToggle />
    </div>
  )
}

/** 문서 대상 DBMS — 문서 생성 시점의 코드 테이블 값으로 고정, 에디터에서 전환하지 않는다.
 *  DBMS 간 전환은 저장된 타입의 마이그레이션 검사가 필요해 1차 제외 (05-editor/01-core.md §17). */
function DbmsIndicator({ dbmsId }: { dbmsId: string }) {
  const { t } = useTranslation()
  const template = dbmsTemplate(dbmsId)

  return (
    <div
      className="mr-1 flex h-7 items-center gap-1 rounded-md border bg-muted/40 px-1.5 text-xs text-muted-foreground"
      title={t('model.editor.toolbar.dbmsLocked')}
    >
      <Database aria-hidden className="size-3.5" />
      {template.id === 'common' ? t('model.editor.dbms.common') : template.label}
      <Lock aria-hidden className="size-3" />
    </div>
  )
}

/** 뷰 옵션 드롭다운 — 이름 표시 모드(erwin·aQueryTool의 logical/physical 뷰 전환)·컬럼 표시 모드(전체/키만) */
function ViewMenu({
  nameDisplay,
  onNameDisplayChange,
  columnDisplay,
  onColumnDisplayChange,
}: {
  nameDisplay: NameDisplayMode
  onNameDisplayChange: (mode: NameDisplayMode) => void
  columnDisplay: ColumnDisplayMode
  onColumnDisplayChange: (mode: ColumnDisplayMode) => void
}) {
  const { t } = useTranslation()

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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 자동 배치 — elkjs 계층형(부모가 위)으로 테이블 좌표만 재계산한다(05-editor/02-ui.md §5.1).
 *  관계선은 자체 라우터가 다시 그리고, FK 컬럼은 부모 위치 순으로 정렬해 선이 좌→우로 펴지게
 *  한다. 결과는 묶음 단일 커밋이라 Undo 1회로 되돌아간다. */
function AutoLayoutButton({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation()
  const { fitView, getNodes } = useReactFlow()
  const commitAll = useEditorStore((s) => s.commitAll)
  const tableCount = useEditorStore((s) => s.present.model.tables.length)
  const [running, setRunning] = useState(false)

  const run = async () => {
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
      const positions = await layoutTablePositions(doc, { sizes })
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
    } catch {
      toast.error(t('model.editor.toolbar.autoLayoutFailed'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2"
      onClick={() => void run()}
      disabled={!canEdit || tableCount < 2 || running}
      aria-label={t('model.editor.toolbar.autoLayout')}
      title={t('model.editor.toolbar.autoLayout')}
    >
      {t('model.editor.toolbar.autoLayout')}
      {running ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Network aria-hidden className="size-3.5" />}
    </Button>
  )
}

/** DB 동기화 — 원천 커넥션(리버스 생성 시점)의 현재 스키마를 문서에 부분 반영한다
 *  (05-editor/04-dbms-engineering.md §3.3). 색상·위치·메모 등 문서 전용 속성은 유지되고
 *  적용은 되돌리기 1회로 복구된다. 원천 커넥션이 삭제됐으면 원천이 없으니 버튼만 숨긴다. */
function SyncButton({
  workspaceId,
  modelName,
  sourceConnectionId,
  canEdit,
}: {
  workspaceId: string
  modelName: string
  sourceConnectionId: string
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const connections = useConnections(workspaceId)
  const exists = (connections.data?.items ?? []).some(
    (connection) => connection.connectionId === sourceConnectionId,
  )
  if (!exists) return null

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2"
        onClick={() => setOpen(true)}
        aria-label={t('model.editor.toolbar.sync')}
        title={t('model.editor.toolbar.sync')}
      >
        {t('model.editor.toolbar.sync')}
        <RefreshCw aria-hidden className="size-3.5" />
      </Button>
      <SyncDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={workspaceId}
        modelName={modelName}
        sourceConnectionId={sourceConnectionId}
        canEdit={canEdit}
      />
    </>
  )
}

/** SQL 스크립트 미리보기 — 문서를 대상 DBMS 방언의 DDL로 내보낸다(05-editor/04-dbms-engineering.md §3.1).
 *  읽기 전용 문서에서도 항상 쓸 수 있다 — 내보내기는 편집이 아니다.
 *  배포(§1.8 진입)는 편집 권한이 있을 때만 미리보기 푸터에 노출된다. */
function DdlButton({
  dbmsId,
  modelName,
  workspaceId,
  databaseType,
  canEdit,
}: {
  dbmsId: string
  modelName: string
  workspaceId: string
  databaseType: string
  canEdit: boolean
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
        databaseType={databaseType}
        canEdit={canEdit}
      />
    </>
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

/** 버전 기록 (08-core/02-model.md §1.11) — 저장마다 남는 스냅샷 목록·메모·조회.
 *  열람은 읽기 전용 뷰어도 가능(메모 편집은 Editor+ — 다이얼로그 안에서 게이트) */
function VersionHistoryButton({
  workspaceId,
  modelId,
  modelName,
  canEdit,
}: {
  workspaceId: string
  modelId: string
  modelName: string
  canEdit: boolean
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
        aria-label={t('model.editor.toolbar.history')}
        title={t('model.editor.toolbar.history')}
      >
        {t('model.editor.toolbar.history')}
        <History aria-hidden className="size-3.5" />
      </Button>
      <VersionHistoryDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={workspaceId}
        modelId={modelId}
        modelName={modelName}
        canEdit={canEdit}
      />
    </>
  )
}

/** 이미지 내보내기 — 두 범위를 제공한다(05-editor/02-ui.md §1.1).
 *  · 보이는 화면: 현재 줌·구도 그대로 뷰포트만 찍는다 — 래스터가 작아 큰 문서도 즉시 끝난다
 *  · 전체 문서: 모든 테이블·노트·관계선 + 여백. 넓은 문서는 배율을 낮춰 느려짐을 줄인다
 *  캡처 대상이 없으면(빈 문서) 비활성. 노드는 항상 전부 렌더돼 있어(컬링 없음) 화면 밖 노드도 그대로 찍힌다. */
function ImageButton({ modelName }: { modelName: string }) {
  const { t } = useTranslation()
  const { getNodes } = useReactFlow()
  const objectCount = useEditorStore(
    (s) => s.present.model.tables.length + s.present.diagram.notes.length,
  )
  const [running, setRunning] = useState(false)

  const run = async (mode: 'viewport' | 'document') => {
    // 캡처 대상 DOM — 에디터 화면의 캔버스는 1개뿐이다
    const canvasEl = document.querySelector<HTMLElement>('.react-flow')
    if (!canvasEl) return
    setRunning(true)
    try {
      // 최신 커밋의 페인트가 끝난 뒤 범위를 계산한다
      await waitForPaint()
      const background = resolveCanvasBackground(canvasEl)
      if (mode === 'viewport') {
        const dataUrl = await captureErdViewportPng(canvasEl, background)
        downloadDataUrl(`${safeFilename(modelName)}.png`, dataUrl)
      } else {
        const bounds = nodesBoundingBox(getNodes())
        if (!bounds) return
        const dataUrl = await captureErdPng(canvasEl, bounds, background)
        downloadDataUrl(`${safeFilename(modelName)}.png`, dataUrl)
      }
      toast.success(t('model.editor.image.exported'))
    } catch {
      toast.error(t('model.editor.image.failed'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2"
          disabled={objectCount === 0 || running}
          aria-label={t('model.editor.toolbar.image')}
          title={t('model.editor.toolbar.image')}
        >
          {t('model.editor.toolbar.image')}
          {running ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <ImageDown aria-hidden className="size-3.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run('viewport')}>
          {t('model.editor.image.viewport')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('document')}>
          {t('model.editor.image.document')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** .crown 문서 파일 내보내기 — 문서 본체(현재 편집 상태)와 메타를 JSON 봉투로 내려받는다(05-editor/00-overview.md §4).
 *  마지막 저장 본문이 아니라 클릭 시점 문서를 싣는다 — 파일은 그 순간의 스냅샷이어야 한다. */
function CrownButton({
  modelName,
  databaseType,
  modelDescription,
}: {
  modelName: string
  databaseType: string
  modelDescription: string | null
}) {
  const { t } = useTranslation()
  const run = () => {
    try {
      const file = buildCrownFile(
        { name: modelName, description: modelDescription, databaseType },
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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2"
      onClick={run}
      aria-label={t('model.editor.toolbar.crown')}
      title={t('model.editor.toolbar.crown')}
    >
      {t('model.editor.toolbar.crown')}
      <FileDown aria-hidden className="size-3.5" />
    </Button>
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
