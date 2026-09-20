/**
 * 버전 기록 뷰어 (08-core/02-model.md §1.11 — /workspaces/{ws}/models/{id}/history/{version})
 *
 * - 해당 시점 스냅샷을 읽기 전용 캔버스로 연다 — 본체는 EditorShell(publicView) 재사용
 * - 헤더는 문서명·v{N}·메모·작성자·일시, 현재 버전이면 "현재" 배지
 * - 되돌리기(복원): 과거 content를 "새 버전으로" 저장한다 — 과거 버전은 불변. 현재 버전
 *   복원은 같은 내용을 다시 저장하는 것이라 노출하지 않는다. baseVersion은 문서 상세
 *   version(복원 시점 최신)을 쓰고, 충돌(409)은 안내 후 문서에서 다시 시도하게 한다.
 * - 비교 모드 ?compare=N(§1.11.3): 이 화면 버전(newer)을 기준 버전 N(base)과 비교한다.
 *   상세 2회·diff는 클라이언트(diffDocuments itemLimit 500) — 캔버스는 최신 버전 하나만
 *   그리고 변경 테이블에 +/~ 배지(CompareHighlightContext), 우측 패널에 변경 목록.
 * - modelId는 합성 식별자(history-{id}-v{N}) — 실제 id면 에디터 스토어 수화가
 *   진짜 문서로 착각해 엉뚱한 문서를 그린다(share-viewer `share-{token}` 관례).
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, FileCode2, GitCompareArrows, Loader2, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'

import type { Model } from '@/api/types'
import { isApiError } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'
import { EditorShell } from '@/features/editor'
import { MigrationDdlDialog } from '@/features/editor/components/MigrationDdlDialog'
import { parseContent } from '@/features/editor/model/content-io'
import { diffDocuments } from '@/features/editor/model/doc-diff'
import { classifyTableChanges, toTableIdMarks } from '@/features/editor/model/version-compare'
import { CompareHighlightContext } from '@/features/editor/components/canvas/compare-context'
import { VersionComparePanel } from '@/features/editor/components/VersionComparePanel'
import { modelEditorPath, useModel, useModelVersionDetail, useRestoreModelVersion } from '@/features/models'
import { useMyWorkspaces } from '@/features/workspaces'

/** 스냅샷 상세 → EditorShell이 받는 Model 모양 — modelId는 버전 식별 합성어로 대체 */
function toViewerModel(model: Model, version: number, content: string): Model {
  return {
    ...model,
    modelId: `history-${model.modelId}-v${version}`,
    workspaceId: '', // 읽기 전용 화면 — 저장·임시 저장·협업 경로가 없다
    sourceConnectionId: null, // 버전 뷰어 — DB 동기화 없음
    version,
    content,
  }
}

/** 버전 비교 diff의 항목 상한 — 저장 요약(50)보다 넉넉히. 배지 누락은 정확성 문제라 올린다 */
const COMPARE_ITEM_LIMIT = 500

export function ModelVersionViewerPage() {
  const { t } = useTranslation()
  const { workspaceId = '', modelId = '', version: versionParam = '' } = useParams()
  const version = Number(versionParam)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const model = useModel(workspaceId, modelId)
  const detail = useModelVersionDetail(workspaceId, modelId, version, Number.isFinite(version))
  const myWorkspaces = useMyWorkspaces()
  const restore = useRestoreModelVersion(workspaceId, modelId)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // 비교 범위의 마이그레이션 DDL(§1.7.1) — 비교 모드에서만 진입한다
  const [migrationOpen, setMigrationOpen] = useState(false)

  // 비교 모드 — ?compare=N은 이 화면 버전보다 과거여야 한다. 아니면 무시(일반 뷰어).
  // 파라미터가 없으면 get()이 null을 주는데 Number(null)===0이라 갈무리 전에 가린다
  const compareParam = searchParams.get('compare')
  const compareRaw = compareParam == null ? Number.NaN : Number(compareParam)
  const compareVersion =
    Number.isFinite(compareRaw) && Number.isInteger(compareRaw) && compareRaw >= 0 && compareRaw < version
      ? compareRaw
      : null
  const base = useModelVersionDetail(
    workspaceId,
    modelId,
    compareVersion ?? -1,
    compareVersion !== null && Number.isFinite(compareVersion),
  )

  const myRole = myWorkspaces.data?.items.find((ws) => ws.workspaceId === workspaceId)?.myRole
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  const invalidVersion = !Number.isFinite(version) || version < 0

  const confirmRestore = () => {
    if (!model.data) return
    restore.mutate(
      { version, baseVersion: model.data.version },
      {
        onSuccess: (result) => {
          toast.success(t('model.editor.history.restored', { version: result?.version ?? version }))
          navigate(modelEditorPath(workspaceId, modelId))
        },
        onError: (error) => {
          // 409 — 복원 사이 남이 저장했다. 안내 후 문서로 가서 최신 상태로 다시 시도한다
          toast.error(errorMessage(error))
          if (isApiError(error) && error.resultCode === 'VERSION_CONFLICT') setConfirmOpen(false)
        },
      },
    )
  }

  /** 비교 diff·배지 마크 — 두 상세가 다 로딩됐을 때만 1회 계산.
   *  마크 지도는 useMemo로 참조를 고정한다(TableNode memo 전략 보존) */
  const compare = useMemo(() => {
    if (compareVersion === null || !detail.data || !base.data) return null
    const newer = parseContent(detail.data.content)
    const older = parseContent(base.data.content)
    const diff = diffDocuments(
      { model: older.model, diagram: older.diagram },
      { model: newer.model, diagram: newer.diagram },
      { itemLimit: COMPARE_ITEM_LIMIT },
    )
    const classification = classifyTableChanges(diff)
    return { classification, marks: toTableIdMarks(classification, newer), diff }
  }, [compareVersion, detail.data, base.data])

  /** 기준 버전 선택 — 0..현재-1 (버전은 연속 생성). 프루닝으로 없는 버전을 고르면 패널이 실패 안내 */
  const changeCompare = (next: string) => {
    const parsed = Number(next)
    if (Number.isFinite(parsed)) setSearchParams({ compare: String(parsed) }, { replace: true })
  }
  const exitCompare = () => setSearchParams({}, { replace: true })

  const compareLoadFailed = compareVersion !== null && base.isError

  return (
    <div className="flex h-dvh flex-col bg-background">
      {model.isPending || detail.isPending ? (
        // 문서 메타 + 스냅샷 상세(content) 조회 — 전체 화면 중앙 스피너 (model-viewer 관례)
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
      ) : invalidVersion || detail.isError || !detail.data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">{t('model.editor.history.notFound')}</p>
          <Button asChild variant="outline" size="sm">
            <Link to={modelEditorPath(workspaceId, modelId)}>
              <ArrowLeft aria-hidden />
              {t('model.editor.history.backToDoc')}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold">{model.data.name}</h1>
                <Badge variant="outline" className="font-mono text-[10px]">v{detail.data.version}</Badge>
                {detail.data.version === model.data.version ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {t('model.editor.history.current')}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="font-mono text-[10px]">
                  {model.data.databaseType}
                </Badge>
                {compareVersion !== null ? (
                  <Badge variant="secondary" data-testid="compare-badge" className="gap-1 text-[10px]">
                    <GitCompareArrows aria-hidden className="size-3" />
                    {t('model.editor.compare.title')}
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  detail.data.createdBy?.name ?? t('common.system'),
                  formatDateTime(detail.data.createdAt),
                ].join(' · ')}
              </p>
              {detail.data.memo ? <p className="truncate text-xs font-medium">{detail.data.memo}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {compareVersion !== null ? (
                <>
                  <Select value={String(compareVersion)} onValueChange={changeCompare}>
                    <SelectTrigger
                      className="h-8 w-32 text-xs"
                      aria-label={t('model.editor.compare.baseLabel')}
                      data-testid="compare-base-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: detail.data.version }, (_, i) => i)
                        .reverse()
                        .map((v) => (
                          <SelectItem key={v} value={String(v)} className="font-mono text-xs">
                            v{v}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMigrationOpen(true)}
                    data-testid="compare-migration-ddl"
                  >
                    <FileCode2 aria-hidden />
                    {t('model.editor.compare.migrationDdl')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={exitCompare}
                    data-testid="compare-exit"
                  >
                    <X aria-hidden />
                    {t('model.editor.compare.exit')}
                  </Button>
                </>
              ) : null}
              {canEdit && detail.data.version !== model.data.version ? (
                <Button type="button" size="sm" onClick={() => setConfirmOpen(true)} disabled={restore.isPending}>
                  <RotateCcw aria-hidden />
                  {t('model.editor.history.restore')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate(modelEditorPath(workspaceId, modelId))}
              >
                <ArrowLeft aria-hidden />
                {t('model.editor.history.backToDoc')}
              </Button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            <CompareHighlightContext.Provider value={compare?.marks ?? null}>
              <EditorShell
                model={toViewerModel(model.data, detail.data.version, detail.data.content)}
                canEdit={false}
                publicView
              />
            </CompareHighlightContext.Provider>
            {compareVersion !== null ? (
              base.isPending ? (
                <aside className="flex w-80 shrink-0 items-center justify-center border-l">
                  <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
                </aside>
              ) : compareLoadFailed ? (
                <aside
                  data-testid="compare-panel-error"
                  className="flex w-80 shrink-0 flex-col items-center justify-center gap-2 border-l px-4 text-center"
                >
                  <p className="text-xs text-muted-foreground">{t('model.editor.compare.loadFailed')}</p>
                  <Button type="button" variant="outline" size="sm" className="h-7" onClick={exitCompare}>
                    {t('model.editor.compare.exit')}
                  </Button>
                </aside>
              ) : compare ? (
                <VersionComparePanel
                  baseVersion={compareVersion}
                  targetVersion={detail.data.version}
                  diff={compare.diff}
                  classification={compare.classification}
                />
              ) : null
            ) : null}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('model.editor.history.restoreConfirmTitle')}
        description={t('model.editor.history.restoreConfirmDescription', {
          version: detail.data?.version ?? version,
        })}
        confirmLabel={t('model.editor.history.restore')}
        confirming={restore.isPending}
        onConfirm={confirmRestore}
      />

      {/* 비교 범위의 마이그레이션 DDL — 기준→현재 버전 ALTER 스크립트 (생성만) */}
      {compareVersion !== null && model.data && detail.data ? (
        <MigrationDdlDialog
          open={migrationOpen}
          onOpenChange={setMigrationOpen}
          modelName={model.data.name}
          mode={{
            kind: 'version',
            workspaceId,
            modelId,
            from: compareVersion,
            to: detail.data.version,
          }}
        />
      ) : null}
    </div>
  )
}
