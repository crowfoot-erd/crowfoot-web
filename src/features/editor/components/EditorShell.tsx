/**
 * 에디터 셸 — 툴바 + 캔버스 + 다이얼로그 + 저장 파이프라인 (storyboard 02-user §5A)
 *
 * - 수화: 상세 content를 parseContent로 스토어에 적재. 같은 문서·같은 버전이면 유지
 *   (저장 직후 invalidate 재조회가 undo 스택을 날리지 않게).
 * - 저장: Ctrl/Cmd+S·툴바 → 뷰포인트 저장 → 직렬화 → PUT content(낙관적 잠금).
 *   본문과 함께 변경 요약(savedDocument↔present diff — §13)을 동봉해 버전 기록을 남긴다.
 *   409 VERSION_CONFLICT는 충돌 다이얼로그(다시 불러오기 = 강제 수화).
 * - 임시 저장: 저장 시도마다 localStorage에 본문을 먼저 남기고 성공하면 폐기한다.
 *   다시 열 때 baseVersion이 서버와 같은 임시본이면 복원해 즉시 저장하고, pagehide에서는
 *   keepalive PUT까지 최선으로 남긴다 — 배포·재로드로 2s 자동 저장 사이 편집이 유실되지
 *   않게(스토어는 메모리 전용).
 * - 협업 v1: 5초 폴링으로 서버 version을 물어 변경을 감지한다. 깨끗한 상태면
 *   상세를 다시 떠와 자동 동기화하고, 편집 중이면 배너로만 알린다(충돌은 저장 시 409).
 * - 협업 2차: WebSocket(crowfoot-collab)로 presence(접속자)와 저장 푸시를 실시간으로
 *   받는다. 푸시는 폴링 캐시에 주입해 v1 감지 경로를 그대로 재사용한다.
 * - 채팅: 같은 채널의 문서별 실시간 채팅(ChatDock). 패널 닫힘 중 남의 메시지는
 *   토스트(클릭하면 패널 열림)·미읽음 배지로 알린다.
 * - 단축키는 input/textarea/select 포커스 시 스킵. dirty면 beforeunload 가드.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { isApiError } from '@/api/client'
import type { Model } from '@/api/types'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Loader2, Users } from 'lucide-react'
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
import { copyToClipboard, pasteFromClipboard } from '@/features/editor/model/clipboard'
import type { ErdChange } from '@/features/editor/model/changes'
import { diffDocuments } from '@/features/editor/model/doc-diff'
import { clearDraft, loadDraft, saveDraft } from '@/features/editor/model/draft-storage'
import { saveModelContentOnUnload } from '@/features/editor/api'
import { useModelCollab } from '@/features/editor/collab'
import { useMe } from '@/features/auth/hooks'
import { selectDirty, useEditorStore } from '@/features/editor/store/editor-store'
import { useModelVersion, useSaveModelContent } from '@/features/editor/hooks'
import { fetchModel } from '@/features/models/api'
import { modelKeys } from '@/features/models/hooks'
import { errorMessage } from '@/lib/result-code'
import type { ColumnDisplayMode, NameDisplayMode } from './canvas/editor-context'
import { ChatDock, chatPreview } from './ChatDock'
import { ErdCanvas } from './ErdCanvas'
import { EditorToolbar } from './EditorToolbar'
import { ModelExplorerPanel } from './ModelExplorerPanel'

/** 자동 저장 지연 — 마지막 편집 후 이 시간 동안 추가 편집이 없으면 저장한다 */
const AUTOSAVE_DELAY_MS = 2000

/** 모델 익스플로러 열림 기억 — 브라우저 단위(줌·팬 기억 viewport-memory와 같은 관례, 문서 무관) */
const EXPLORER_OPEN_KEY = 'crowfoot.editor.explorer-open'

function readExplorerOpen(): boolean {
  try {
    const raw = localStorage.getItem(EXPLORER_OPEN_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

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
  // 모델 익스플로러 — 열림은 브라우저에 기억, focusSearchSignal은 Ctrl+F로 검색창에 데려오는 신호
  const [explorerOpen, setExplorerOpen] = useState(readExplorerOpen)
  const [explorerFocusSignal, setExplorerFocusSignal] = useState(0)
  const toggleExplorer = useCallback(() => {
    setExplorerOpen((open) => {
      try {
        localStorage.setItem(EXPLORER_OPEN_KEY, String(!open))
      } catch {
        // 시크릿 모드 등 저장 실패는 무시 — 상태만 전환한다
      }
      return !open
    })
  }, [])
  const openExplorerSearch = useCallback(() => {
    setExplorerOpen(true)
    setExplorerFocusSignal((signal) => signal + 1)
  }, [])
  const reloadingRef = useRef(false)
  const [remoteChangeOpen, setRemoteChangeOpen] = useState(false)
  const syncedVersionRef = useRef(0)
  // 임시 저장 복원 본문 — 수화 시 채워 두면 아래 플러시 effect가 서버로 즉시 저장한다
  const restoredDraftRef = useRef<string | null>(null)

  /* ---------- 수화 — 같은 문서·같은 버전이면 스택 유지 ---------- */

  // layout effect: 첫 페인트 전에 스토어를 채운다 — 빈 캔버스가 그려졌다가 노드가 투척되는
  // 깜빡임 없이 ErdCanvas가 수화된 문서와 함께 마운트된다(아래 hydrated 게이트 참조)
  useLayoutEffect(() => {
    const state = useEditorStore.getState()
    if (state.modelId === model.modelId && state.baseVersion === model.version) return
    restoredDraftRef.current = null

    // 임시 저장 복원 — 문서를 닫을 때 저장이 못 끝난 편집(배포 중단·페이지 강제 재로드 등).
    // baseVersion이 서버 버전과 같을 때만 복구한다: 다르면 남이 저장했거나 임시본이 다른
    // 곳에서 이미 저장돼 서버가 앞선 것이다 — 임시본을 폐기하고 서버 본문으로 연다.
    const draft = canEdit ? loadDraft(model.workspaceId, model.modelId) : null
    const restore = draft && draft.baseVersion === model.version ? draft : null
    if (draft && !restore) clearDraft(model.workspaceId, model.modelId)

    const tryParse = (text: string) => {
      try {
        return parseContent(text)
      } catch {
        return null
      }
    }
    // 서버 본문은 요약 diff의 기준점(savedDocument)으로도 쓴다 — 임시본을 화면에 띄우는
    // 복원 경로에서도 마지막 저장본은 서버 것이므로. 파싱 실패는 로드 실패와 같게 취급한다
    const serverParsed = tryParse(model.content)
    const draftParsed = restore ? tryParse(restore.content) : null
    if (restore && !draftParsed) clearDraft(model.workspaceId, model.modelId) // 깨진 임시본 — 폐기
    const parsed = draftParsed ?? serverParsed
    if (!parsed) {
      setParseError(true)
      return
    }
    setParseError(false)
    restoredDraftRef.current = draftParsed ? restore!.content : null
    // dirty인데 외부에서 버전이 올랐다 → 거부(로컬 보존), 충돌은 저장 시 409로 처리
    useEditorStore
      .getState()
      .hydrate({
        modelId: model.modelId,
        baseVersion: model.version,
        document: { model: parsed.model, diagram: parsed.diagram },
        savedDocument: serverParsed
          ? { model: serverParsed.model, diagram: serverParsed.diagram }
          : undefined,
      })
  }, [model.modelId, model.version, model.content, model.workspaceId, canEdit])

  /* ---------- 협업 2차 — 실시간 채널(WebSocket presence·저장 푸시) ---------- */

  // 저장 성공 알림(publishSaved)을 아래 handleSave가 쓴다 — 먼저 선언한다
  const me = useMe()
  const [chatOpen, setChatOpen] = useState(false)
  // 채팅 미읽음 — 라이브로 수신한 남의 메시지만 센다(join 시의 과거 history는 제외).
  // 패널을 열면 0으로 리셋한다.
  const [chatUnread, setChatUnread] = useState(0)
  const handleChatOpenChange = useCallback((next: boolean) => {
    setChatOpen(next)
    if (next) setChatUnread(0)
  }, [])
  const { participants, publishSaved, messages, sendMessage, connected } = useModelCollab({
    modelId: model.modelId,
    userId: me.data?.userId,
    userName: me.data?.name,
    avatarUrl: me.data?.avatarUrl,
    githubLogin: me.data?.githubLogin,
    // 공개 뷰어는 읽기 전용 게스트 화면 — 룸에 접속자로 뜨지 않게 채널 자체를 끈다
    enabled: !publicView,
    onRemoteSaved: (event) => {
      // 푸시를 폴링 캐시에 주입 — 아래 감지 effect가 자동 동기화·배너로 이어받는다(5초 기다림 없음)
      queryClient.setQueryData(modelKeys.version(model.workspaceId, model.modelId), {
        version: event.version,
        updatedAt: event.at,
      })
    },
    onIncomingChat: (message) => {
      // 패널이 열려 있으면 목록 append로 충분하다 — 닫힘에서만 배지·토스트
      if (chatOpen) return
      setChatUnread((count) => count + 1)
      toast.custom((id) => (
        <button
          type="button"
          className="flex w-full items-start gap-2.5 rounded-lg border bg-popover p-3 text-left shadow-lg"
          onClick={() => {
            toast.dismiss(id)
            handleChatOpenChange(true)
          }}
        >
          <Avatar name={message.name} avatarUrl={message.avatarUrl} className="mt-0.5 size-8 text-sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {message.name}
              {message.userLogin && (
                <span className="font-normal text-muted-foreground"> @{message.userLogin}</span>
              )}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {chatPreview(message.message)}
            </span>
          </span>
        </button>
      ))
    },
  })
  const presenceNames = participants.map((participant) => participant.name).join(', ')

  /* ---------- 저장 ---------- */

  /** 저장 실행부 — dirty 검사 없이 주어진 본문을 PUT한다. 수동·자동 저장과 임시 저장 복원
   *  플러시가 같은 파이프라인(낙관적 잠금·409 처리·성공 후 임시본 폐기)을 공유한다.
   *  버전 기록 요약(§13)도 여기서 낀다 — 마지막 저장본(savedDocument)과 현재 문서의 diff를
   *  JSON으로 동봉하고, 성공 시 PUT한 본문 시점의 문서를 다음 diff 기준점으로 포착한다
   *  (요청 비행 중 들어온 편집은 다음 저장 요약으로 넘어간다). */
  const putContent = useCallback(
    (content: string, baseVersion: number, options?: { silent?: boolean }) => {
      const state = useEditorStore.getState()
      const savingDocument = state.present
      const changeSummary = state.savedDocument
        ? JSON.stringify(diffDocuments(state.savedDocument, state.present))
        : undefined
      // 서버에 못 미치는 순간(배포 중단·네트워크 오류)에 대비해 임시 저장을 먼저 남긴다 —
      // 저장이 성공하면 폐기되고, 실패하면 다음 열기에서 복원된다
      saveDraft(model.workspaceId, model.modelId, { baseVersion, content, savedAt: Date.now() })
      saveMutation.mutate(
        { modelId: model.modelId, body: { baseVersion, content, changeSummary } },
        {
          onSuccess: (result) => {
            if (result) {
              useEditorStore.getState().markSaved(result.version, savingDocument)
              clearDraft(model.workspaceId, model.modelId) // 서버가 원천 — 임시본 폐기
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
    },
    [model.workspaceId, model.modelId, onSaved, publishSaved, saveMutation, t],
  )

  const handleSave = useCallback(
    (options?: { silent?: boolean }) => {
      if (!canEdit || saveMutation.isPending) return
      const state = useEditorStore.getState()
      if (state.past.length === state.savedDepth) return

      // 화면(뷰포인트)도 문서의 일부로 저장 — 다음 열기에서 복원
      state.setViewport(rf.getViewport())
      const { present, baseVersion } = useEditorStore.getState()
      putContent(
        serializeContent({
          schemaVersion: 1,
          model: present.model,
          diagram: present.diagram,
        }),
        baseVersion,
        options,
      )
    },
    [canEdit, putContent, rf, saveMutation],
  )

  /* ---------- 단축키 — 입력 요소 포커스 시 스킵 ---------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // target이 window(포커스 없는 keydown)일 수 있다 — closest는 요소에만 있다
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return

      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      // Esc — 선택 해제(보기 동작이라 읽기 전용도 동작)
      if (key === 'escape') {
        const { selectedIds, setSelection } = useEditorStore.getState()
        if (selectedIds.length > 0) {
          event.preventDefault()
          setSelection([])
        }
        return
      }

      // 방향키 — 선택 객체 미세 이동(1px, Shift 10px). 테이블은 node/move, 메모는 note/patch로
      if (!mod && key.startsWith('arrow')) {
        if (!canEdit) return
        const { selectedIds, present, commitAll } = useEditorStore.getState()
        if (selectedIds.length === 0) return
        const step = event.shiftKey ? 10 : 1
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
        const positions: Record<string, { x: number; y: number }> = {}
        const changes: ErdChange[] = []
        for (const id of selectedIds) {
          const layout = present.diagram.nodes[id]
          if (layout) positions[id] = { x: layout.x + dx, y: layout.y + dy }
          const note = present.diagram.notes.find((n) => n.id === id)
          if (note) changes.push({ type: 'note/patch', noteId: id, patch: { x: note.x + dx, y: note.y + dy } })
        }
        if (Object.keys(positions).length > 0) changes.push({ type: 'node/move', positions })
        if (changes.length === 0) return
        event.preventDefault()
        commitAll(changes)
        return
      }

      if (!mod) return
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
      } else if (key === 'f') {
        // 검색 — 모델 익스플로러를 열고 검색 입력으로 포커스(읽기 전용·공개 뷰어도 탐색은 가능)
        event.preventDefault()
        openExplorerSearch()
      } else if (key === 'a') {
        // 전체 선택 — 테이블+메모(관계는 양끝 테이블 선택에 따라붙는다)
        event.preventDefault()
        const { present, setSelection } = useEditorStore.getState()
        setSelection([
          ...present.model.tables.map((table) => table.id),
          ...present.diagram.notes.map((note) => note.id),
        ])
      } else if (key === 'c') {
        if (!canEdit) return
        const { present, selectedIds } = useEditorStore.getState()
        if (copyToClipboard(present, selectedIds)) event.preventDefault()
      } else if (key === 'v') {
        if (!canEdit) return
        const { present, commitAll, setSelection } = useEditorStore.getState()
        const pasted = pasteFromClipboard(present, t('model.editor.clipboard.copyLabel'))
        if (pasted) {
          event.preventDefault()
          commitAll(pasted.changes)
          setSelection(pasted.selectedIds)
        }
      } else if (key === 'd') {
        // Duplicate — 선택을 그 자리에서 복사+붙여넣기(같은 규칙, 오프셋 32px)
        if (!canEdit) return
        event.preventDefault()
        const { present, selectedIds, commitAll, setSelection } = useEditorStore.getState()
        if (!copyToClipboard(present, selectedIds)) return
        const pasted = pasteFromClipboard(present, t('model.editor.clipboard.copyLabel'))
        if (pasted) {
          commitAll(pasted.changes)
          setSelection(pasted.selectedIds)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canEdit, handleSave, openExplorerSearch, t])

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

  /* ---------- 임시 저장 복원 플러시 ---------- */

  // 복원한 임시본은 서버에 아직 없는 내용이다 — 자동 저장 지연(2s)을 기다리지 않고 곧바로
  // PUT해 서버를 원천으로 되돌린다. 실패해도 임시본이 남아 다음 열기에서 다시 복원된다.
  // modelId 동일 비교 — dirty-보존으로 hydrate가 skip돼도(같은 문서 재마운트) 화면은 유지된다
  const hydrated = useEditorStore((s) => s.modelId === model.modelId)
  useEffect(() => {
    const content = restoredDraftRef.current
    if (!content || !hydrated || !canEdit) return
    restoredDraftRef.current = null
    toast.info(t('model.editor.draftRestored'))
    putContent(content, model.version, { silent: true })
  }, [hydrated, canEdit, model.version, putContent, t])

  /* ---------- dirty 이탈 가드 + 페이지 숨김 최선 저장 ---------- */

  // beforeunload: dirty면 확인 프롬프트(취소로 머물 수 있다). pagehide: 떠나는 게 확정된
  // 순간(닫기·새로고침·배포 강제 재로드) 임시 저장(localStorage)과 keepalive PUT을 최선으로
  // 남긴다 — 자동 저장 2s 사이에 끊기는 편집이 사라지지 않게. pagehide는 beforeunload를
  // 취소해 머무는 경우 발화하지 않아 이미 저장된 요청과 충돌하지 않는다.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const state = useEditorStore.getState()
      if (state.past.length !== state.savedDepth) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const onPageHide = () => {
      const state = useEditorStore.getState()
      if (!canEdit || state.past.length === state.savedDepth) return
      state.setViewport(rf.getViewport())
      const { present, baseVersion, savedDocument } = useEditorStore.getState()
      const content = serializeContent({
        schemaVersion: 1,
        model: present.model,
        diagram: present.diagram,
      })
      // 최선 저장에도 요약을 동봉한다 — 이 저장이 살면 그대로 버전 기록이 된다
      const changeSummary = savedDocument
        ? JSON.stringify(diffDocuments(savedDocument, present))
        : undefined
      saveDraft(model.workspaceId, model.modelId, { baseVersion, content, savedAt: Date.now() })
      saveModelContentOnUnload(model.workspaceId, model.modelId, { baseVersion, content, changeSummary })
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [canEdit, model.workspaceId, model.modelId, rf])

  /* ---------- 충돌 → 다시 불러오기(강제 수화) ---------- */

  const handleConflictReload = useCallback(async () => {
    if (reloadingRef.current) return
    reloadingRef.current = true
    try {
      const fresh = await fetchModel(model.workspaceId, model.modelId)
      if (fresh) {
        // 서버 본문으로 되돌리는 길이다 — 로컬 dirty와 임시본 모두 폐기 대상
        clearDraft(model.workspaceId, model.modelId)
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
        explorerOpen={explorerOpen}
        onToggleExplorer={toggleExplorer}
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
        sourceConnectionId={model.sourceConnectionId}
        publicView={publicView}
      />
      <main className="flex min-h-0 flex-1">
        {/* 모델 익스플로러 — 탐색은 보기 기능이라 읽기 전용·공개 뷰어에서도 쓸 수 있다 */}
        <ModelExplorerPanel
          open={explorerOpen}
          focusSearchSignal={explorerFocusSignal}
          nameDisplay={nameDisplay}
        />
        <div className="relative min-w-0 flex-1">
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
                <Avatar
                  key={participant.userId}
                  name={participant.name}
                  avatarUrl={participant.avatarUrl}
                  className="size-6 border border-background text-[10px] font-semibold shadow-sm"
                />
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
          ) : (
            // 수화 게이트 — 문서 파싱·hydrate가 끝나기 전 캔버스 자리에 로딩을 보여준다
            <div
              role="status"
              aria-live="polite"
              data-testid="editor-loading"
              className="flex h-full flex-col items-center justify-center gap-4"
            >
              <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            </div>
          )}
          {/* 문서 채팅 — 공개 뷰어는 게스트(신원 없음)라 렌더하지 않는다 */}
          {!publicView && (
            <ChatDock
              open={chatOpen}
              onOpenChange={handleChatOpenChange}
              unread={chatUnread}
              messages={messages}
              participants={participants}
              myUserId={me.data?.userId}
              connected={connected}
              onSend={sendMessage}
            />
          )}
        </div>
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
