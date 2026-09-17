/**
 * 에디터 셸 — 툴바 + 캔버스 + 다이얼로그 + 저장 파이프라인 (storyboard 02-user §5A)
 *
 * - 수화: 상세 content를 parseContent로 스토어에 적재. 같은 문서·같은 버전이면 유지
 *   (저장 직후 invalidate 재조회가 undo 스택을 날리지 않게).
 * - 저장: Ctrl/Cmd+S·툴바 → 뷰포인트 저장 → 직렬화 → PUT content(낙관적 잠금).
 *   409 VERSION_CONFLICT는 충돌 다이얼로그(다시 불러오기 = 강제 수화).
 * - 협업 v1: 5초 폴링으로 서버 version을 물어 변경을 감지한다. 깨끗한 상태면
 *   상세를 다시 떠와 자동 동기화하고, 편집 중이면 배너로만 알린다(충돌은 저장 시 409).
 * - 협업 2차: WebSocket(crowfoot-collab)로 presence(접속자)와 저장 푸시를 실시간으로
 *   받는다. 푸시는 폴링 캐시에 주입해 v1 감지 경로를 그대로 재사용한다.
 * - 단축키는 input/textarea/select 포커스 시 스킵. dirty면 beforeunload 가드.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { isApiError } from '@/api/client'
import type { Model } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { parseContent, serializeContent } from '@/features/editor/model/content-io'
import { templateIdForDatabase } from '@/features/editor/model/dbms'
import { useModelCollab } from '@/features/editor/collab'
import { useMe } from '@/features/auth/hooks'
import { selectDirty, useEditorStore } from '@/features/editor/store/editor-store'
import { useModelVersion, useSaveModelContent } from '@/features/editor/hooks'
import { fetchModel } from '@/features/models/api'
import { modelKeys } from '@/features/models/hooks'
import { errorMessage } from '@/lib/result-code'
import type { ColumnDisplayMode, NameDisplayMode } from './canvas/editor-context'
import { ErdCanvas } from './ErdCanvas'
import { EditorToolbar } from './EditorToolbar'

/** 자동 저장 지연 — 마지막 편집 후 이 시간 동안 추가 편집이 없으면 저장한다 */
const AUTOSAVE_DELAY_MS = 2000

/** 접속자 아바타 이니셜 — 첫 글자(서로게이트 안전). 빈 이름 방어 */
const initialOf = (name: string): string => [...name.trim()][0]?.toUpperCase() ?? '?'

export interface EditorShellProps {
  model: Model
  canEdit: boolean
  /** 저장 성공 콜백 — 헤더 버전 표시 갱신용 */
  onSaved?: (version: number) => void
  /** 공개 공유 뷰어(/share/{token}) — 협업 채널·버전 폴링·워크스페이스 액션을 끈다 (게스트 접근) */
  publicView?: boolean
}

export function EditorShell(props: EditorShellProps) {
  return (
    <ReactFlowProvider>
      <EditorShellInner {...props} />
    </ReactFlowProvider>
  )
}

function EditorShellInner({ model, canEdit, onSaved, publicView = false }: EditorShellProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const rf = useReactFlow()
  const saveMutation = useSaveModelContent(model.workspaceId)

  const [conflictOpen, setConflictOpen] = useState(false)
  const [parseError, setParseError] = useState(false)
  const [nameDisplay, setNameDisplay] = useState<NameDisplayMode>('both')
  const [columnDisplay, setColumnDisplay] = useState<ColumnDisplayMode>('all')
  const reloadingRef = useRef(false)
  const [remoteChangeOpen, setRemoteChangeOpen] = useState(false)
  const syncedVersionRef = useRef(0)

  /* ---------- 수화 — 같은 문서·같은 버전이면 스택 유지 ---------- */

  // layout effect: 첫 페인트 전에 스토어를 채운다 — 빈 캔버스가 그려졌다가 노드가 투척되는
  // 깜빡임 없이 ErdCanvas가 수화된 문서와 함께 마운트된다(아래 hydrated 게이트 참조)
  useLayoutEffect(() => {
    const state = useEditorStore.getState()
    if (state.modelId === model.modelId && state.baseVersion === model.version) return

    const parsed = (() => {
      try {
        return parseContent(model.content)
      } catch {
        return null
      }
    })()
    if (!parsed) {
      setParseError(true)
      return
    }
    setParseError(false)
    // dirty인데 외부에서 버전이 올랐다 → 거부(로컬 보존), 충돌은 저장 시 409로 처리
    useEditorStore
      .getState()
      .hydrate({
        modelId: model.modelId,
        baseVersion: model.version,
        document: { model: parsed.model, diagram: parsed.diagram },
      })
  }, [model.modelId, model.version, model.content])

  // modelId 동일 비교 — dirty-보존으로 hydrate가 skip돼도(같은 문서 재마운트) 화면은 유지된다
  const hydrated = useEditorStore((s) => s.modelId === model.modelId)

  /* ---------- 협업 2차 — 실시간 채널(WebSocket presence·저장 푸시) ---------- */

  // 저장 성공 알림(publishSaved)을 아래 handleSave가 쓴다 — 먼저 선언한다
  const me = useMe()
  const { participants, publishSaved } = useModelCollab({
    modelId: model.modelId,
    userId: me.data?.userId,
    userName: me.data?.name,
    onRemoteSaved: (event) => {
      // 푸시를 폴링 캐시에 주입 — 아래 감지 effect가 자동 동기화·배너로 이어받는다(5초 기다림 없음)
      queryClient.setQueryData(modelKeys.version(model.workspaceId, model.modelId), {
        version: event.version,
        updatedAt: event.at,
      })
    },
  })
  const presenceNames = participants.map((participant) => participant.name).join(', ')

  /* ---------- 저장 ---------- */

  const handleSave = useCallback((options?: { silent?: boolean }) => {
    if (!canEdit || saveMutation.isPending) return
    const state = useEditorStore.getState()
    if (state.past.length === state.savedDepth) return

    // 화면(뷰포인트)도 문서의 일부로 저장 — 다음 열기에서 복원
    state.setViewport(rf.getViewport())
    const { present, baseVersion } = useEditorStore.getState()
    const content = serializeContent({
      schemaVersion: 1,
      model: present.model,
      diagram: present.diagram,

    })

    saveMutation.mutate(
      { modelId: model.modelId, body: { baseVersion, content } },
      {
        onSuccess: (result) => {
          if (result) {
            useEditorStore.getState().markSaved(result.version)
            onSaved?.(result.version)
            publishSaved(result.version) // 협업 룸에 저장 알림(채널 없으면 조용히)
          }
          if (!options?.silent) toast.success(t('model.editor.savedToast'))
        },
        onError: (error) => {
          if (isApiError(error) && error.resultCode === 'VERSION_CONFLICT') {
            setAutosaveBlocked(true) // 자동 저장 재시도 금지 — 사용자가 선택할 때까지
            setConflictOpen(true)
            return
          }
          toast.error(errorMessage(error))
        },
      },
    )
  }, [canEdit, model.modelId, onSaved, publishSaved, rf, saveMutation, t])

  /* ---------- 단축키 — 입력 요소 포커스 시 스킵 ---------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // target이 window(포커스 없는 keydown)일 수 있다 — closest는 요소에만 있다
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return

      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (!canEdit) return
        if (event.shiftKey) useEditorStore.getState().redo()
        else useEditorStore.getState().undo()
      } else if (key === 'y') {
        event.preventDefault()
        if (canEdit) useEditorStore.getState().redo()
      } else if (key === 's') {
        event.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canEdit, handleSave])

  /* ---------- 자동 저장 — 마지막 편집 후 정적 구간이 지나면 조용히 저장 ---------- */

  // 저장 버튼·Ctrl+S와 같은 파이프라인(낙관적 잠금·409 다이얼로그 공유).
  // 충돌이 났으면 자동 재시도하지 않는다 — 다시 불러오기로 수화할 때까지 수동만.
  const dirty = useEditorStore(selectDirty)
  const [autosaveBlocked, setAutosaveBlocked] = useState(false)
  useEffect(() => {
    if (!canEdit || !dirty || autosaveBlocked || saveMutation.isPending || conflictOpen) return
    const timer = setTimeout(() => handleSave({ silent: true }), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [canEdit, dirty, autosaveBlocked, saveMutation.isPending, conflictOpen, handleSave])

  /* ---------- dirty 이탈 가드 ---------- */

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const state = useEditorStore.getState()
      if (state.past.length !== state.savedDepth) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  /* ---------- 충돌 → 다시 불러오기(강제 수화) ---------- */

  const handleConflictReload = useCallback(async () => {
    if (reloadingRef.current) return
    reloadingRef.current = true
    try {
      const fresh = await fetchModel(model.workspaceId, model.modelId)
      if (fresh) {
        const parsed = parseContent(fresh.content)
        useEditorStore.getState().hydrate(
          {
            modelId: fresh.modelId,
            baseVersion: fresh.version,
            document: { model: parsed.model, diagram: parsed.diagram },
          },
          { force: true },
        )
        queryClient.setQueryData(modelKeys.detail(model.workspaceId, model.modelId), fresh)
        setAutosaveBlocked(false)
        setRemoteChangeOpen(false)
        syncedVersionRef.current = fresh.version
      }
      setConflictOpen(false)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      reloadingRef.current = false
    }
  }, [model.workspaceId, model.modelId, queryClient])

  /* ---------- 협업 v1 — 원격 변경 감지(5초 폴링) ---------- */

  // 서버 version이 로컬 base(마지막 저장·수화 시점)보다 높으면 남이 저장한 것이다.
  // 깨끗한 상태(dirty 아님)면 상세를 다시 떠와 자동 동기화 — 수화 effect가 이어받는다.
  // 편집 중이면 배너로만 알린다(자동 저장이 곧 409를 만나 충돌 다이얼로그로 이어짐).
  // 공개 뷰어에서는 폴링하지 않는다 — 스냅샷이 아니라 열 때 받은 본문을 그대로 보여준다.
  const remoteVersionQuery = useModelVersion(model.workspaceId, model.modelId, !publicView)
  const remoteVersion = remoteVersionQuery.data?.version
  useEffect(() => {
    if (remoteVersion == null) return
    if (remoteVersion <= useEditorStore.getState().baseVersion) {
      setRemoteChangeOpen(false)
      return
    }
    if (dirty || saveMutation.isPending || conflictOpen) {
      setRemoteChangeOpen(true)
      return
    }
    if (syncedVersionRef.current !== remoteVersion) {
      syncedVersionRef.current = remoteVersion
      toast.info(t('model.editor.remoteChange.synced'))
    }
    void queryClient.invalidateQueries({ queryKey: modelKeys.detail(model.workspaceId, model.modelId) })
  }, [remoteVersion, dirty, saveMutation.isPending, conflictOpen, model.workspaceId, model.modelId, queryClient, t])

  if (parseError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{t('model.editor.parseError')}</p>
      </div>
    )
  }

  // 문서 대상 DBMS — 문서 생성 시점의 모델 메타(코드 테이블)로 고정. 에디터에서 전환하지 않는다
  const dbmsId = templateIdForDatabase(model.databaseType)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorToolbar
        canEdit={canEdit}
        saving={saveMutation.isPending}
        onSave={() => handleSave()}
        nameDisplay={nameDisplay}
        onNameDisplayChange={setNameDisplay}
        columnDisplay={columnDisplay}
        onColumnDisplayChange={setColumnDisplay}
        dbmsId={dbmsId}
        modelName={model.name}
        databaseType={model.databaseType}
        modelDescription={model.description}
        workspaceId={model.workspaceId}
        modelId={model.modelId}
        publicView={publicView}
      />
      <main className="relative min-h-0 flex-1">
        {remoteChangeOpen && !conflictOpen && (
          <div
            data-testid="remote-change-banner"
            className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-3 py-1.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          >
            <span className="flex items-center gap-2">
              <Users className="size-4 shrink-0" aria-hidden />
              {t('model.editor.remoteChange.banner')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0"
              onClick={() => void handleConflictReload()}
            >
              {t('model.editor.remoteChange.reload')}
            </Button>
          </div>
        )}
        {participants.length > 0 && (
          <div
            data-testid="presence-chip"
            aria-label={`${t('model.editor.presence.label')}: ${presenceNames}`}
            title={presenceNames}
            className="absolute right-3 top-3 z-10 flex -space-x-1.5"
          >
            {participants.slice(0, 5).map((participant) => (
              <span
                key={participant.userId}
                className="flex size-6 items-center justify-center rounded-full border border-background bg-primary text-[10px] font-semibold text-primary-foreground shadow-sm"
              >
                {initialOf(participant.name)}
              </span>
            ))}
            {participants.length > 5 && (
              <span className="flex size-6 items-center justify-center rounded-full border border-background bg-muted text-[10px] font-semibold text-muted-foreground shadow-sm">
                +{participants.length - 5}
              </span>
            )}
          </div>
        )}
        {hydrated ? (
          <ErdCanvas canEdit={canEdit} nameDisplay={nameDisplay} columnDisplay={columnDisplay} dbmsId={dbmsId} modelId={model.modelId} />
        ) : null}
      </main>

      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('model.editor.conflict.title')}</DialogTitle>
            <DialogDescription>{t('model.editor.conflict.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConflictOpen(false)}>
              {t('model.editor.conflict.keep')}
            </Button>
            <Button type="button" onClick={() => void handleConflictReload()}>
              {t('model.editor.conflict.reload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
