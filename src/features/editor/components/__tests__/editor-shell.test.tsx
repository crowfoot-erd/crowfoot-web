/**
 * 에디터 셸 통합 테스트 — 수화·우클릭 생성 커밋·저장(PUT)·버전 충돌 409·읽기 전용·협업 v1 원격 변경 감지
 *
 * MSW: 기본 PUT 핸들러(501 version 3 → 성공 4 / 불일치 409), 409 케이스는 server.use로 덧씌운다.
 * 노드 내부 요소는 getByLabelText/selector로 조회한다 — RF 노드가 jsdom 0-size 뷰포트에서
 * role 쿼리의 name 계산에 걸리지 않기 때문 (DOM에는 정상 존재).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { toPng } from 'html-to-image'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import type { Model } from '@/api/types'
import { fail, fixtures, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { EditorShell } from '@/features/editor'
import { createArea, createColumn, createTable, type ErdChange } from '@/features/editor/model/changes'
import type { DocumentDiffSummary } from '@/features/editor/model/doc-diff'
import { buildRelationship } from '@/features/editor/model/relationship'
import { emptyContent, serializeContent } from '@/features/editor/model/content-io'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { modelKeys, useModel } from '@/features/models/hooks'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

// 캡처 라이브러리 — 브라우저 렌더링이 필요해 실동작은 검증 대상 아님, dataURL만 흘려준다
vi.mock('html-to-image', () => ({ toPng: vi.fn() }))

// 협업 3차 채널 — 훅 전체를 갈아끼운다(실제 WebSocket은 별도 훅 테스트에서 검증).
// v1.17 핸들(커맨드·락·커서·역할)까지 전부 스텁: 셸이 destructure 하는 전체 계약이다
const collabMock = vi.hoisted(() => ({
  participants: [] as Array<{ userId: string; name: string; avatarUrl?: string | null }>,
  publishSaved: vi.fn(),
  messages: [] as Array<{
    seq: number
    userId: string
    name: string
    avatarUrl?: string | null
    userLogin?: string | null
    message: string
    at: string
  }>,
  sendMessage: vi.fn(),
  connected: true,
  sendCommands: vi.fn(),
  sendCursor: vi.fn(),
  acquireLock: vi.fn(),
  renewLock: vi.fn(),
  releaseLock: vi.fn(),
  locks: [] as Array<{ targetType: string; targetId: string; userId: string; userName: string; acquiredAt: string }>,
  remoteCursors: [] as Array<{ userId: string; name: string; cursor: { x: number; y: number }; at: string }>,
  myRole: null as string | null,
  readOnly: false,
  options: undefined as
    | undefined
    | {
        avatarUrl?: string
        githubLogin?: string | null
        onRemoteSaved?: (event: { version: number; savedBy: string; savedByName: string; at: string; seq: number; receivedSeq: number }) => void
        onIncomingChat?: (message: { seq: number; userId: string; name: string; message: string; at: string; avatarUrl?: string | null; userLogin?: string | null }) => void
        onRemoteCommand?: (change: ErdChange, actor: { userId: string; name: string }) => void
        onRejected?: (reason: string) => void
        onResync?: (reason: string) => void
      },
}))
vi.mock('@/features/editor/collab', () => ({
  useModelCollab: (options: typeof collabMock.options) => {
    collabMock.options = options
    return {
      participants: collabMock.participants,
      publishSaved: collabMock.publishSaved,
      messages: collabMock.messages,
      sendMessage: collabMock.sendMessage,
      connected: collabMock.connected,
      sendCommands: collabMock.sendCommands,
      sendCursor: collabMock.sendCursor,
      acquireLock: collabMock.acquireLock,
      renewLock: collabMock.renewLock,
      releaseLock: collabMock.releaseLock,
      locks: collabMock.locks,
      remoteCursors: collabMock.remoteCursors,
      myRole: collabMock.myRole,
      readOnly: collabMock.readOnly,
    }
  },
}))

// sonner 토스트 — 토스트 발화 자체가 검증 대상(채팅 알림·LWW 충돌). 평호출 toast() 와
// toast.custom/warning/… 메서드를 모두 쓴다 — 호출 가능한 fn에 메서드를 붙인다
const toastMock = vi.hoisted(() => {
  const fn = vi.fn() as unknown as ReturnType<typeof vi.fn> & {
    custom: ReturnType<typeof vi.fn>
    dismiss: ReturnType<typeof vi.fn>
    success: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    warning: ReturnType<typeof vi.fn>
  }
  fn.custom = vi.fn()
  fn.dismiss = vi.fn()
  fn.success = vi.fn()
  fn.error = vi.fn()
  fn.info = vi.fn()
  fn.warning = vi.fn()
  return fn
})
vi.mock('sonner', () => ({ toast: toastMock }))

afterEach(() => {
  resetEditorStore()
  resetSessionState() // 일부 채팅 테스트가 asAuthenticated로 세션을 시딩한다
  // 임시 저장(draft) 키가 테스트 사이에 새어 들어가면 다음 수화가 임시본을 복원해 버린다
  window.localStorage.clear()
  vi.restoreAllMocks()
  collabMock.participants.length = 0
  collabMock.messages.length = 0
  collabMock.options = undefined
  collabMock.publishSaved.mockClear()
  collabMock.sendMessage.mockClear()
  collabMock.sendCommands.mockClear()
  collabMock.sendCursor.mockClear()
  collabMock.acquireLock.mockClear()
  collabMock.renewLock.mockClear()
  collabMock.releaseLock.mockClear()
  collabMock.locks.length = 0
  collabMock.remoteCursors.length = 0
  collabMock.myRole = null
  collabMock.readOnly = false
  toastMock.custom.mockClear()
  toastMock.dismiss.mockClear()
  toastMock.success.mockClear()
  toastMock.warning.mockClear()
})

function modelFixture(overrides: Partial<Model> = {}): Model {
  const base = fixtures.models.responses[0] as unknown as Model
  return { ...base, content: serializeContent(emptyContent()), ...overrides }
}

/** 원격에서 남이 저장한 문서 — 테이블 1개(remote_orders). 협업 감지 테스트 공용 */
function remoteContent() {
  const table = createTable('remote_orders', {
    columns: [createColumn({ physicalName: 'id', dataType: 'BIGINT', nullable: false })],
  })
  return serializeContent({
    schemaVersion: 1,
    model: { tables: [table], relationships: [] },
    diagram: { nodes: { [table.id]: { x: 0, y: 0, width: null, color: 'default' } }, notes: [], areas: [], viewport: null },
  })
}

/** 실제 페이지 구조 — useModel(상세 쿼리)이 model prop을 내려준다(invalidate→prop 교체→수화 배선 포함). 협업 감지 테스트 공용 */
function Harness({ canEdit = true }: { canEdit?: boolean }) {
  const model = useModel('101', '501')
  if (!model.data) return null
  return <EditorShell model={model.data} canEdit={canEdit} />
}

async function renderCollabEditor(canEdit = true) {
  // 이 파일의 테스트는 캔버스 조작이 대상 — 익스플로러를 닫아 텍스트 질의가 캔버스에만 걸리게 한다(패널은 model-explorer.test.tsx)
  window.localStorage.setItem('crowfoot.editor.explorer-open', 'false')
  const utils = renderWithProviders(<Harness canEdit={canEdit} />, { wrapRoutes: false })
  await waitFor(() => expect(useEditorStore.getState().modelId).toBe('501'))
  return utils
}

async function renderEditor(canEdit = true) {
  window.localStorage.setItem('crowfoot.editor.explorer-open', 'false')
  renderWithProviders(<EditorShell model={modelFixture()} canEdit={canEdit} />, { wrapRoutes: false })
  await waitFor(() => expect(useEditorStore.getState().modelId).toBe('501'))
}

/** 컬럼 행 root — 이름 input이 속한 grid 행 */
function rowOf(ariaLabel: string): HTMLElement {
  const input = screen.getByLabelText(ariaLabel)
  const row = input.closest('.grid')
  expect(row).not.toBeNull()
  return row as HTMLElement
}

/** 그립 드래그로 from 행을 to 행 앞으로 이동 — 노드 렌더를 기다린다 */
async function dragColumn(fromIndex: number, toLabel: string) {
  const grips = await screen.findAllByTitle('컬럼 순서 변경 — 드래그하여 이동')
  fireEvent.dragStart(grips[fromIndex])
  const target = rowOf(toLabel)
  fireEvent.dragOver(target)
  fireEvent.drop(target)
}

describe('EditorShell — 읽기 전용', () => {
  it('canEdit=false면 읽기 전용 배지·저장 비활성화', async () => {
    await renderEditor(false)

    expect(screen.getByText('읽기 전용')).toBeVisible()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    // 테마 토글 — 에디터는 앱 셸 밖 전체 화면이라 툴바가 제공한다(읽기 전용도 보기 옵션)
    expect(screen.getByRole('button', { name: '테마' })).toBeVisible()
  })
})

describe('EditorShell — 빈 캔버스 온보딩 (05-editor/02-ui.md §2.1)', () => {
  it('편집 가능한 빈 문서 — 첫 테이블 추가 힌트 카드를 그린다', async () => {
    await renderEditor()

    // then: 오버레이 카드 — 첫 테이블 추가 버튼 + 우클릭 힌트 (컨테이너는 pointer-events:none)
    expect(screen.getByTestId('empty-canvas-hint')).toBeVisible()
    expect(screen.getByRole('button', { name: '첫 테이블 추가' })).toBeVisible()
    expect(screen.getByText(/우클릭하면/)).toBeVisible()
  })

  it('첫 테이블 추가 — 컨텍스트 createTable 경로를 타면 테이블 1개가 생기고 오버레이가 사라진다', async () => {
    await renderEditor()

    fireEvent.click(screen.getByRole('button', { name: '첫 테이블 추가' }))

    // then: 문서에 테이블 1개(다이어그램 노드 배치 포함) — 오버레이는 자동 소멸
    await waitFor(() => expect(useEditorStore.getState().present.model.tables).toHaveLength(1))
    const table = useEditorStore.getState().present.model.tables[0]
    expect(useEditorStore.getState().present.diagram.nodes[table.id]).toBeDefined()
    await waitFor(() => expect(screen.queryByTestId('empty-canvas-hint')).not.toBeInTheDocument())
  })

  it('읽기 전용(공개 뷰어·버전 뷰어)에는 오버레이가 없다', async () => {
    await renderEditor(false)

    expect(screen.queryByTestId('empty-canvas-hint')).not.toBeInTheDocument()
  })
})

describe('EditorShell — 협업 v1 원격 변경 감지(폴링)', () => {
  /** 폴링(refetchInterval 5s)을 대신해 version 쿼리를 강제 refetch — 서버 version이 올라간 상황 재현 */
  const pollVersion = (queryClient: ReturnType<typeof renderWithProviders>['queryClient']) =>
    queryClient.refetchQueries({ queryKey: modelKeys.version('101', '501') })

  it('깨끗한 상태에서 서버 version이 오르면 자동 동기화된다 — 배너 없이 강제 수화', async () => {
    const { queryClient } = await renderCollabEditor()
    expect(useEditorStore.getState().baseVersion).toBe(3)

    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/version', () =>
        HttpResponse.json(ok({ response: { version: 5, updatedAt: '2026-09-14T05:00:00Z' } }))),
      http.get('/api/v1/core/workspaces/101/models/501', () =>
        HttpResponse.json(ok({ response: { ...modelFixture(), version: 5, content: remoteContent() } }))),
    )
    await pollVersion(queryClient)

    await waitFor(() => {
      const state = useEditorStore.getState()
      expect(state.baseVersion).toBe(5)
      expect(state.present.model.tables.map((t) => t.physicalName)).toEqual(['remote_orders'])
    })
    expect(screen.queryByTestId('remote-change-banner')).toBeNull()
  })

  it('편집 중(dirty)이면 배너로만 알린다 — 로컬 변경을 지키고 자동 수화하지 않는다', async () => {
    const { queryClient } = await renderCollabEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    // 자동 저장(2s)이 남의 변경을 누르기 전에 끝나지 않게 — 저장 버튼 경로와 무관하게 dirty 유지만 확인

    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/version', () =>
        HttpResponse.json(ok({ response: { version: 5, updatedAt: '2026-09-14T05:00:00Z' } }))),
    )
    await pollVersion(queryClient)

    expect(await screen.findByTestId('remote-change-banner')).toBeVisible()
    expect(screen.getByText(/다른 사용자가 문서를 수정했습니다/)).toBeVisible()
    const state = useEditorStore.getState()
    expect(state.baseVersion).toBe(3) // 로컬 base 유지
    expect(state.present.model.tables.map((t) => t.physicalName)).toEqual(['orders']) // 로컬 문서 유지
  })

  it('배너의 서버 본문 불러오기 → 강제 수화로 원격 문서로 대체, 배너 소멸', async () => {
    const { queryClient } = await renderCollabEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/version', () =>
        HttpResponse.json(ok({ response: { version: 5, updatedAt: '2026-09-14T05:00:00Z' } }))),
      http.get('/api/v1/core/workspaces/101/models/501', () =>
        HttpResponse.json(ok({ response: { ...modelFixture(), version: 5, content: remoteContent() } }))),
    )
    await pollVersion(queryClient)
    expect(await screen.findByTestId('remote-change-banner')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '서버 본문 불러오기' }))

    await waitFor(() => {
      const state = useEditorStore.getState()
      expect(state.baseVersion).toBe(5)
      expect(state.present.model.tables.map((t) => t.physicalName)).toEqual(['remote_orders'])
    })
    await waitFor(() => expect(screen.queryByTestId('remote-change-banner')).toBeNull())
  })

  it('읽기 전용 뷰어도 원격 변경을 따라간다 — dirty가 없으니 항상 자동 동기화', async () => {
    const { queryClient } = await renderCollabEditor(false)

    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/version', () =>
        HttpResponse.json(ok({ response: { version: 4, updatedAt: '2026-09-14T05:00:00Z' } }))),
      http.get('/api/v1/core/workspaces/101/models/501', () =>
        HttpResponse.json(ok({ response: { ...modelFixture(), version: 4, content: remoteContent() } }))),
    )
    await pollVersion(queryClient)

    await waitFor(() => {
      const state = useEditorStore.getState()
      expect(state.baseVersion).toBe(4)
      expect(state.present.model.tables.map((t) => t.physicalName)).toEqual(['remote_orders'])
    })
  })
})

describe('EditorShell — 협업 2차 실시간 채널(WebSocket)', () => {
  it('접속자 presence 칩 — 참가자 아바타 이니셜과 이름 노출', async () => {
    collabMock.participants.push(
      { userId: 'u1', name: '앨리스' },
      { userId: 'u2', name: '밥' },
    )
    await renderEditor()

    const chip = await screen.findByTestId('presence-chip')
    expect(chip).toBeVisible()
    expect(chip).toHaveTextContent('앨')
    expect(chip).toHaveTextContent('밥')
    expect(chip.getAttribute('aria-label')).toContain('앨리스')
    expect(chip.getAttribute('aria-label')).toContain('밥')
  })

  it('남의 저장 푸시(onRemoteSaved) → 폴링 없이 즉시 자동 동기화 — v1 감지 경로 재사용', async () => {
    await renderCollabEditor()
    expect(useEditorStore.getState().baseVersion).toBe(3)

    server.use(
      http.get('/api/v1/core/workspaces/101/models/501', () =>
        HttpResponse.json(ok({ response: { ...modelFixture(), version: 6, content: remoteContent() } }))),
    )
    act(() => {
      collabMock.options?.onRemoteSaved?.({
        version: 6,
        savedBy: 'u2',
        savedByName: '밥',
        at: '2026-09-14T06:00:00Z',
        // 끊김 중 저장(seq 6 > 받은 5) — 승계 불가 판정으로 기존 감지 경로(강제 수화)를 탄다
        seq: 6,
        receivedSeq: 5,
      })
    })

    await waitFor(() => {
      const state = useEditorStore.getState()
      expect(state.baseVersion).toBe(6)
      expect(state.present.model.tables.map((t) => t.physicalName)).toEqual(['remote_orders'])
    })
    expect(screen.queryByTestId('remote-change-banner')).toBeNull()
  })

  it('저장 성공 → 룸에 저장 알림(publishSaved) — 확정 버전을 실어 보낸다', async () => {
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    // 자동 저장(2s) → MSW 기본 PUT: version 3 → 4
    await waitFor(
      () => {
        expect(useEditorStore.getState().baseVersion).toBe(4)
        expect(collabMock.publishSaved).toHaveBeenCalledWith(4)
      },
      { timeout: 5000 },
    )
  }, 15000)

  it('접속자 칩 — 프로필 사진이 있는 참가자는 <img>, 없으면 이니셜 원', async () => {
    collabMock.participants.push(
      { userId: 'u1', name: '앨리스', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4' },
      { userId: 'u2', name: '밥', avatarUrl: null },
    )
    await renderEditor()

    const chip = await screen.findByTestId('presence-chip')
    const image = chip.querySelector('img')
    expect(image).not.toBeNull()
    expect(image).toHaveAttribute('src', 'https://avatars.githubusercontent.com/u/1?v=4')
    expect(chip).toHaveTextContent('밥') // 아바타 없는 참가자는 이니셜 폴백
  })
})

describe('EditorShell — 문서 채팅', () => {
  it('채팅 도크 — 토글로 패널을 열고 내/남의 발언을 구분해 그린다', async () => {
    asAuthenticated() // useMe 활성화 — 내 발언 판별(myUserId)에 me 픽스처(userId '2')가 필요하다
    // 내 발언의 userId는 MSW me 픽스처(userId '2')와 같아야 ChatDock이 '내 발언'으로 구분한다
    collabMock.messages.push(
      { seq: 1, userId: 'u2', name: '밥', avatarUrl: null, userLogin: 'octocat', message: '남의 발언', at: '2026-09-18T00:00:00Z' },
      { seq: 2, userId: '2', name: '나', avatarUrl: null, message: '내 발언', at: '2026-09-18T00:00:01Z' },
    )
    await renderEditor()

    fireEvent.click(screen.getByTestId('chat-toggle'))

    expect(screen.getByRole('region', { name: '문서 채팅' })).toBeVisible()
    expect(screen.getByTestId('chat-bubble-other')).toHaveTextContent('남의 발언')
    expect(screen.getByTestId('chat-bubble-mine')).toHaveTextContent('내 발언')
    expect(screen.getByText('@octocat')).toBeVisible() // 남의 발언은 GitHub 핸들 노출
  })

  it('패널 닫힘 중 남의 메시지 → 토스트(이름·미리보기), 클릭하면 패널이 열린다', async () => {
    await renderEditor()
    expect(screen.getByTestId('chat-toggle')).toBeVisible()

    act(() => {
      collabMock.options?.onIncomingChat?.({
        seq: 1,
        userId: 'u2',
        name: '밥',
        avatarUrl: null,
        userLogin: 'octocat',
        message: 'ERD 다 그렸나요?',
        at: '2026-09-18T00:00:00Z',
      })
    })
    expect(toastMock.custom).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('chat-unread')).toHaveTextContent('1') // 라이브 수신 1건 배지

    // 토스트 렌더러를 실제 DOM에 그려 클릭 동작(패널 오픈)을 검증
    const renderToast = toastMock.custom.mock.calls[0][0] as (id: string | number) => ReactElement
    renderWithProviders(<>{renderToast(7)}</>, { wrapRoutes: false })
    expect(screen.getByText('@octocat')).toBeVisible() // 토스트도 이름 옆 @핸들
    // 아바타 이니셜('밥')과 이름('밥')이 같아 텍스트로는 중복 — 버튼 role로 잡는다
    fireEvent.click(screen.getByRole('button', { name: /ERD 다 그렸나요/ }))

    expect(toastMock.dismiss).toHaveBeenCalledWith(7)
    expect(await screen.findByRole('region', { name: '문서 채팅' })).toBeVisible()
  })

  it('패널 열림 상태에서 남의 메시지가 와도 토스트는 없다 — 목록 갱신으로 충분', async () => {
    await renderEditor()
    fireEvent.click(screen.getByTestId('chat-toggle'))

    act(() => {
      collabMock.options?.onIncomingChat?.({
        seq: 1, userId: 'u2', name: '밥', avatarUrl: null, message: '안녕', at: 'T',
      })
    })
    expect(toastMock.custom).not.toHaveBeenCalled()
  })

  it('publicView(공개 뷰어)는 게스트라 채팅 도크를 렌더하지 않는다', async () => {
    renderWithProviders(<EditorShell model={modelFixture()} canEdit={false} publicView />, { wrapRoutes: false })
    await waitFor(() => expect(useEditorStore.getState().modelId).toBe('501'))

    expect(screen.queryByTestId('chat-dock')).toBeNull()
  })
})

describe('EditorShell — 우클릭 컨텍스트 메뉴', () => {
  it('캔버스 우클릭 → 엔터티 생성 → table/create 커밋(기본 물리명 table_1)', async () => {
    await renderEditor()

    fireEvent.contextMenu(document.querySelector('.react-flow') ?? document.body)
    fireEvent.click(await screen.findByText('엔터티 생성'))

    const state = useEditorStore.getState()
    await waitFor(() => expect(state.present.model.tables).toHaveLength(1))
    const table = useEditorStore.getState().present.model.tables[0]
    expect(table.physicalName).toBe('table_1')
    expect(useEditorStore.getState().present.diagram.nodes[table.id]).toBeDefined()
  })

  it('캔버스 우클릭 → 메모 생성 → note/create 커밋', async () => {
    await renderEditor()

    fireEvent.contextMenu(document.querySelector('.react-flow') ?? document.body)
    fireEvent.click(await screen.findByText('메모 생성'))

    await waitFor(() => expect(useEditorStore.getState().present.diagram.notes).toHaveLength(1))
  })

  it('메모 헤더 밴드 — 더블클릭으로 편집 다이얼로그(제목·색상 프리셋·자유 색)', async () => {
    await renderEditor()

    fireEvent.contextMenu(document.querySelector('.react-flow') ?? document.body)
    fireEvent.click(await screen.findByText('메모 생성'))
    await waitFor(() => expect(useEditorStore.getState().present.diagram.notes).toHaveLength(1))

    // 제목이 없으면 밴드에 자리표시자가 보인다 (RF 노드는 jsdom 0-size — DOM 존재로 단정)
    expect(screen.getByText('메모', { selector: 'span' })).toBeInTheDocument()

    // 밴드 더블클릭 → 편집 다이얼로그(포털) — 제목 입력 + 프리셋 5색 + 자유 색 픽커
    fireEvent.doubleClick(screen.getByTitle('드래그로 이동 · 두 번 클릭해 편집'))
    const dialog = await screen.findByRole('dialog')
    const titleInput = within(dialog).getByLabelText('메모 제목')
    const dots = within(dialog).getAllByLabelText('메모 색상')
    expect(dots).toHaveLength(5)
    expect(within(dialog).getByLabelText('자유 색')).toBeInTheDocument()

    // 색은 즉시 확정(파랑 = 3번째), 제목은 저장으로 확정
    fireEvent.click(dots[2])
    fireEvent.change(titleInput, { target: { value: '주의사항' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))

    const note = useEditorStore.getState().present.diagram.notes[0]
    expect(note.title).toBe('주의사항')
    expect(note.color).toBe('blue')
    // 밴드에 제목이 표시된다
    expect(screen.getByText('주의사항')).toBeInTheDocument()
  })

  it('메모 색 — 자유 색 픽커로 고른 #hex는 닫을 때 커밋된다', async () => {
    await renderEditor()

    fireEvent.contextMenu(document.querySelector('.react-flow') ?? document.body)
    fireEvent.click(await screen.findByText('메모 생성'))
    await waitFor(() => expect(useEditorStore.getState().present.diagram.notes).toHaveLength(1))

    fireEvent.doubleClick(screen.getByTitle('드래그로 이동 · 두 번 클릭해 편집'))
    const dialog = await screen.findByRole('dialog')

    // 픽커 변경 → 디바운스 대기 중 닫으면 즉시 플러시된다
    fireEvent.change(within(dialog).getByLabelText('자유 색'), { target: { value: '#7c3aed' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))

    expect(useEditorStore.getState().present.diagram.notes[0].color).toBe('#7c3aed')
    // 프리셋으로 되돌리기 — 문서 어느 쪽이든 파싱된다
    expect(() => JSON.parse(JSON.stringify(useEditorStore.getState().present.diagram.notes[0]))).not.toThrow()
  })

  it('밴드 삭제 아이콘 클릭 → note/remove 커밋으로 메모가 사라진다', async () => {
    await renderEditor()

    fireEvent.contextMenu(document.querySelector('.react-flow') ?? document.body)
    fireEvent.click(await screen.findByText('메모 생성'))
    await waitFor(() => expect(useEditorStore.getState().present.diagram.notes).toHaveLength(1))

    // 밴드 오른쪽 삭제 버튼 (RF 노드는 jsdom 0-size — title 셀렉터로 단정)
    expect(screen.getByTitle('메모 삭제')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('메모 삭제'))
    await waitFor(() => expect(useEditorStore.getState().present.diagram.notes).toHaveLength(0))

    // undo로 되돌아온다 — 삭제도 1스택
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(useEditorStore.getState().present.diagram.notes).toHaveLength(1))
  })
})

describe('EditorShell — 보기 메뉴(컬럼 이름 표시 모드)', () => {
  it('테이블명은 모드와 무관하게 고정(밴드 논리명·헤더 물리명), 컬럼 이름만 전환된다', async () => {
    await renderEditor()
    const table = createTable('orders', { logicalName: '주문' })
    const column = createColumn({ physicalName: 'id', logicalName: '아이디' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column },
    ])

    // 기본(둘 다) — 밴드 논리명(표시 전용) + 헤더 물리명 + 컬럼 물리·논리 (jsdom은 레이아웃이 없어 DOM 존재로 단정)
    expect(await screen.findByText('주문', { selector: 'span:not([data-extras])' })).toBeInTheDocument()
    expect(screen.getByLabelText('테이블 물리명')).toBeInTheDocument()
    expect(screen.getByLabelText('컬럼 물리명 — id')).toBeInTheDocument()
    expect(screen.getByLabelText('컬럼 논리명 — id')).toBeInTheDocument()

    // radix 트리거는 pointerdown으로 열린다
    const selectMode = async (label: string) => {
      const trigger = screen.getByRole('button', { name: '보기' })
      fireEvent.pointerDown(trigger, { button: 0 })
      fireEvent.click(trigger)
      fireEvent.click(await screen.findByRole('menuitemradio', { name: label }))
    }

    // 논리명만 — 컬럼은 논리명 입력만, 테이블 헤더·밴드는 유지
    await selectMode('논리명만')
    await waitFor(() => {
      expect(screen.getByLabelText('컬럼 논리명 — id')).toBeInTheDocument()
      expect(screen.queryByLabelText('컬럼 물리명 — id')).toBeNull()
      expect(screen.getByLabelText('테이블 물리명')).toBeInTheDocument()
      expect(screen.getByText('주문', { selector: 'span:not([data-extras])' })).toBeInTheDocument()
    })

    // 물리명만 — 컬럼 논리명 소멸
    await selectMode('물리명만')
    await waitFor(() => {
      expect(screen.getByLabelText('컬럼 물리명 — id')).toBeInTheDocument()
      expect(screen.queryByLabelText('컬럼 논리명 — id')).toBeNull()
    })
  })
})

describe('EditorShell — PK 토글', () => {
  it('PK 켜면 NN 강제 + 컬럼이 최상단(PK 블록 끝)으로 이동한다', async () => {
    await renderEditor()
    const table = createTable('orders')
    const a = createColumn({ physicalName: 'a' })
    const b = createColumn({ physicalName: 'b' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: a },
      { type: 'column/add', tableId: table.id, column: b },
    ])

    fireEvent.click(await screen.findByLabelText('기본 키 — b'))

    await waitFor(() => {
      const state = useEditorStore.getState()
      const orders = state.present.model.tables[0]
      expect(orders.primaryKey?.columnIds).toEqual([b.id])
      expect(orders.columns.map((c) => c.physicalName)).toEqual(['b', 'a'])
      expect(orders.columns[0].nullable).toBe(false)
    })
  })

  it('PK 끄면 AI도 함께 해제된다', async () => {
    await renderEditor()
    const table = createTable('orders')
    const a = createColumn({ physicalName: 'a', dataType: 'INT', autoIncrement: true, nullable: false })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: a },
      { type: 'primaryKey/set', tableId: table.id, primaryKey: { name: 'orders_pk', columnIds: [a.id] } },
    ])

    fireEvent.click(await screen.findByLabelText('기본 키 — a'))

    const state = useEditorStore.getState()
    await waitFor(() => {
      const orders = state.present.model.tables[0]
      expect(orders.primaryKey).toBeNull()
      expect(orders.columns[0].autoIncrement).toBe(false)
    })
  })
})

describe('EditorShell — 컬럼 드래그 재정렬', () => {
  it('그립 드래그로 컬럼 순서를 바꾼다 — b를 a 앞으로', async () => {
    await renderEditor()
    const table = createTable('orders')
    const a = createColumn({ physicalName: 'a' })
    const b = createColumn({ physicalName: 'b' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: a },
      { type: 'column/add', tableId: table.id, column: b },
    ])

    await dragColumn(1, '컬럼 물리명 — a')

    await waitFor(() => {
      const orders = useEditorStore.getState().present.model.tables[0]
      expect(orders.columns.map((c) => c.physicalName)).toEqual(['b', 'a'])
      expect(orders.primaryKey).toBeNull()
    })
  })

  it('일반 컬럼을 PK 블록으로 드래그할 수 없다 — PK는 키 버튼으로만 지정한다', async () => {
    await renderEditor()
    const table = createTable('orders')
    const a = createColumn({ physicalName: 'a', dataType: 'INT', nullable: false })
    const x = createColumn({ physicalName: 'x' })
    const b = createColumn({ physicalName: 'b' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: a },
      { type: 'column/add', tableId: table.id, column: x },
      { type: 'column/add', tableId: table.id, column: b },
      { type: 'primaryKey/set', tableId: table.id, primaryKey: { name: 'orders_pk', columnIds: [a.id] } },
    ])

    // b(일반)를 PK 블록 안(a 앞)으로 드래그 — 영역이 달라 무시된다
    await dragColumn(2, '컬럼 물리명 — a')

    await waitFor(() => {
      const orders = useEditorStore.getState().present.model.tables[0]
      expect(orders.columns.map((c) => c.physicalName)).toEqual(['a', 'x', 'b'])
      expect(orders.primaryKey?.columnIds).toEqual([a.id])
    })
  })

  it('PK 컬럼을 일반 영역으로 드래그할 수 없다 — PK 해제는 키 버튼으로만', async () => {
    await renderEditor()
    const table = createTable('orders')
    const a = createColumn({ physicalName: 'a', dataType: 'INT', nullable: false })
    const b = createColumn({ physicalName: 'b', dataType: 'INT', autoIncrement: true, nullable: false })
    const x = createColumn({ physicalName: 'x' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: a },
      { type: 'column/add', tableId: table.id, column: b },
      { type: 'column/add', tableId: table.id, column: x },
      { type: 'primaryKey/set', tableId: table.id, primaryKey: { name: 'orders_pk', columnIds: [a.id, b.id] } },
    ])

    // b(PK)를 x 앞(= PK 블록 밖)으로 드래그 — 영역이 달라 무시된다
    await dragColumn(1, '컬럼 물리명 — x')

    await waitFor(() => {
      const orders = useEditorStore.getState().present.model.tables[0]
      expect(orders.columns.map((c) => c.physicalName)).toEqual(['a', 'b', 'x'])
      expect(orders.primaryKey?.columnIds).toEqual([a.id, b.id])
      expect(orders.columns.find((c) => c.physicalName === 'b')?.autoIncrement).toBe(true)
    })
  })
})

describe('EditorShell — 컬럼 정보 다이얼로그', () => {
  it('다이얼로그에서 PK 켜고 저장 → PK 지정 + NN 강제 + 최상단 이동(1 undo 스택)', async () => {
    await renderEditor()
    const table = createTable('orders')
    const a = createColumn({ physicalName: 'a' })
    const b = createColumn({ physicalName: 'b' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: a },
      { type: 'column/add', tableId: table.id, column: b },
    ])

    fireEvent.doubleClick(await screen.findByLabelText('컬럼 물리명 — b'))
    fireEvent.click(await screen.findByLabelText('PK (기본 키)'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const orders = useEditorStore.getState().present.model.tables[0]
      expect(orders.primaryKey?.columnIds).toEqual([b.id])
      expect(orders.columns.map((c) => c.physicalName)).toEqual(['b', 'a'])
      expect(orders.columns[0].nullable).toBe(false)
    })
    // 세팅 1스택 + 저장 1스택 — PK 토글 묶음과 patch가 한 스택에 묶였다
    expect(useEditorStore.getState().past).toHaveLength(2)
  })

  it('컬럼 이름 더블클릭 → 컬럼 정보에서 논리명·기본값 수정 → column/patch 1커밋', async () => {
    await renderEditor()
    const table = createTable('orders')
    const a = createColumn({ physicalName: 'order_id' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: a },
    ])

    fireEvent.doubleClick(await screen.findByLabelText('컬럼 물리명 — order_id'))

    expect(await screen.findByText('컬럼 정보')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('논리명'), { target: { value: '주문번호' } })
    fireEvent.change(screen.getByLabelText('기본값'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const column = useEditorStore.getState().present.model.tables[0].columns[0]
      expect(column.logicalName).toBe('주문번호')
      expect(column.defaultValue).toBe('0')
    })
  })
})

describe('EditorShell — 저장', () => {
  it('변경 후 저장 → PUT content 성공 → markSaved(version+1)', async () => {
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    const save = screen.getByRole('button', { name: '저장' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    // 기본 핸들러: 501 version 3 → 4
    await waitFor(() => expect(useEditorStore.getState().baseVersion).toBe(4))
    const state = useEditorStore.getState()
    expect(state.past).toHaveLength(state.savedDepth) // dirty 해제
    expect(state.present.model.tables).toHaveLength(1) // 문서 유지
  })

  it('저장 본문에 변경 요약(changeSummary)이 동봉된다 — savedDocument 대비 table add 1건', async () => {
    const bodies: Array<{ baseVersion: number; content: string; changeSummary?: string }> = []
    server.use(
      http.put('/api/v1/core/workspaces/101/models/501/content', async ({ request }) => {
        bodies.push((await request.json()) as { baseVersion: number; content: string; changeSummary?: string })
        return HttpResponse.json(ok({ response: { version: 4, updatedAt: '2026-09-18T00:00:00Z' } }))
      }),
    )
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    const save = screen.getByRole('button', { name: '저장' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    await waitFor(() => expect(bodies).toHaveLength(1))
    // 요약 — 마지막 저장본(빈 문서) → 현재(orders)의 구조 diff. 노드 항목은 없다(양쪽에 있는 노드만)
    const summary = JSON.parse(bodies[0].changeSummary ?? 'null') as DocumentDiffSummary
    expect(summary.items).toEqual([
      { kind: 'table', action: 'add', table: 'orders', name: 'orders', detail: 'columns 0' },
    ])
    expect(summary.layoutOnly).toBe(false)
    expect(summary.truncated).toBe(false)
  })

  it('409 VERSION_CONFLICT → 충돌 다이얼로그 → 다시 불러오기(강제 수화)', async () => {
    server.use(
      http.put('/api/v1/core/workspaces/101/models/501/content', () => fail('VERSION_CONFLICT', 409)),
    )
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    const save = screen.getByRole('button', { name: '저장' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    expect(await screen.findByText('버전 충돌')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

    // 강제 수화 — 서버 문서(빈 v1, version 3)로 롤백
    await waitFor(() => {
      const state = useEditorStore.getState()
      expect(state.baseVersion).toBe(3)
      expect(state.present.model.tables).toHaveLength(0)
    })
  })
})

describe('EditorShell — 키(유니크·인덱스)', () => {
  async function seedTable() {
    const table = createTable('orders')
    const email = createColumn({ physicalName: 'email' })
    const createdAt = createColumn({ physicalName: 'created_at' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: email },
      { type: 'column/add', tableId: table.id, column: createdAt },
    ])
    return { table, email, createdAt }
  }

  it('유니크 추가 → 복합 컬럼 선택 → 기본 이름 자동(uk_접두) → 1커밋·undo로 제거', async () => {
    await renderEditor()
    const { table, email, createdAt } = await seedTable()

    fireEvent.click(await screen.findByText('유니크 추가'))
    expect(await screen.findByText('유니크 추가', { selector: '[role="dialog"] *' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('컬럼 — email'))
    fireEvent.click(screen.getByLabelText('컬럼 — created_at'))

    // 컬럼 선택을 따르는 기본 이름 — 체크 순서 = 복합 키 컬럼 순서
    const nameInput = screen.getByPlaceholderText('uk_table_col1_col2') as HTMLInputElement
    await waitFor(() => expect(nameInput.value).toBe('uk_orders_email_created_at'))

    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const orders = useEditorStore.getState().present.model.tables[0]
      expect(orders.uniques).toEqual([{ id: expect.any(String), name: 'uk_orders_email_created_at', columnIds: [email.id, createdAt.id] }])
    })
    // 노드 키 영역에 행 표시
    expect(await screen.findByText('uk_orders_email_created_at')).toBeInTheDocument()

    useEditorStore.getState().undo()
    await waitFor(() => expect(useEditorStore.getState().present.model.tables[0].uniques).toEqual([]))
    expect(table).toBeDefined()
  })

  it('문서 내 같은 키 이름은 저장이 막힌다', async () => {
    await renderEditor()
    const { email } = await seedTable()
    useEditorStore.getState().commit({
      type: 'uniqueKey/set',
      tableId: useEditorStore.getState().present.model.tables[0].id,
      uniques: [{ id: 'u-existing', name: 'uk_taken', columnIds: [email.id] }],
    })

    fireEvent.click(await screen.findByText('유니크 추가'))
    fireEvent.click(await screen.findByLabelText('컬럼 — email'))
    const nameInput = screen.getByPlaceholderText('uk_table_col1_col2') as HTMLInputElement
    await waitFor(() => expect(nameInput.value).toBe('uk_orders_email'))
    fireEvent.change(nameInput, { target: { value: 'uk_taken' } }) // 기존 키와 같은 이름 입력
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('문서 내에 같은 키 이름이 있습니다')).toBeInTheDocument()
    expect(useEditorStore.getState().present.model.tables[0].uniques).toHaveLength(1) // 커밋 안 됨
  })

  it('키 행 X로 삭제, 컬럼 삭제는 키 참조를 정리한다', async () => {
    await renderEditor()
    const { email, createdAt } = await seedTable()
    const tableId = useEditorStore.getState().present.model.tables[0].id
    useEditorStore.getState().commit({
      type: 'uniqueKey/set',
      tableId,
      uniques: [{ id: 'u1', name: 'uk_orders', columnIds: [email.id, createdAt.id] }],
    })
    useEditorStore.getState().commit({
      type: 'index/set',
      tableId,
      indexes: [{ id: 'i1', name: 'idx_orders_email', columns: [{ columnId: email.id, order: 'ASC' }] }],
    })

    // 컬럼 하나 삭제 → 복합 UK는 컬럼만 줄고, 1컬럼 IX는 통째로 사라진다
    useEditorStore.getState().commit({ type: 'column/remove', tableId, columnId: email.id })
    const after = useEditorStore.getState().present.model.tables[0]
    expect(after.uniques).toEqual([{ id: 'u1', name: 'uk_orders', columnIds: [createdAt.id] }])
    expect(after.indexes).toEqual([])

    // 키 행 삭제
    fireEvent.click(await screen.findByLabelText('키 삭제 — uk_orders'))
    await waitFor(() => expect(useEditorStore.getState().present.model.tables[0].uniques).toEqual([]))
  })

  it('인덱스 추가 → 컬럼별 정렬 DESC 전환 → 저장 → 행에 (email DESC) 표시', async () => {
    await renderEditor()
    const { email } = await seedTable()

    fireEvent.click(await screen.findByText('인덱스 추가'))
    fireEvent.click(await screen.findByLabelText('컬럼 — email'))
    const nameInput = screen.getByPlaceholderText('idx_table_col1_col2') as HTMLInputElement
    await waitFor(() => expect(nameInput.value).toBe('idx_orders_email'))

    // 정렬 토글 ASC → DESC
    fireEvent.click(screen.getByLabelText('정렬 순서 — email'))
    expect(screen.getByLabelText('정렬 순서 — email').textContent).toBe('DESC')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const orders = useEditorStore.getState().present.model.tables[0]
      expect(orders.indexes).toEqual([{ id: expect.any(String), name: 'idx_orders_email', columns: [{ columnId: email.id, order: 'DESC' }] }])
    })
    // 노드 키 영역 표시 — 행 1곳만 발견된다(키 이름은 자동 폭 측정 미러에 없다 —
    // 긴 키 이름이 상자를 부풀려 컬럼 이름↔타입 사이 빈칸을 만드는 일을 막는다)
    expect((await screen.findAllByText(/email DESC/)).length).toBe(1)
  })
})

describe('EditorShell — 테이블 물리명 중복 차단', () => {
  it('다른 테이블과 겹치는 이름 커밋은 무시된다 — 초안 원복·문서 불변', async () => {
    await renderEditor()
    const users = createTable('users')
    const orders = createTable('orders')
    useEditorStore.getState().commitAll([
      { type: 'table/create', table: users, position: { x: 0, y: 0 } },
      { type: 'table/create', table: orders, position: { x: 400, y: 0 } },
    ])
    const inputs = await screen.findAllByLabelText('테이블 물리명')
    expect(inputs).toHaveLength(2)
    // orders 헤더를 users로 바꾸려 시도 → 겹친다 (Enter는 실제 blur를 유발하지 못하니 blur 직접)
    fireEvent.change(inputs[1], { target: { value: 'users' } })
    fireEvent.blur(inputs[1])

    const names = useEditorStore.getState().present.model.tables.map((tb) => tb.physicalName)
    expect(names.sort()).toEqual(['orders', 'users'])
    await waitFor(() => expect(inputs[1]).toHaveValue('orders')) // 초안 되돌림
  })

  it('테이블 정보 다이얼로그에서 중복 이름 저장은 차단 — 인라인 안내·다이얼로그 유지', async () => {
    await renderEditor()
    const users = createTable('users')
    const orders = createTable('orders')
    useEditorStore.getState().commitAll([
      { type: 'table/create', table: users, position: { x: 0, y: 0 } },
      { type: 'table/create', table: orders, position: { x: 400, y: 0 } },
    ])
    const infoButtons = await screen.findAllByLabelText('테이블 정보')
    fireEvent.click(infoButtons[1]) // orders

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('물리명'), { target: { value: 'users' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(await within(dialog).findByText(/이미 존재하는 테이블 물리명입니다/)).toBeInTheDocument()
    const names = useEditorStore.getState().present.model.tables.map((tb) => tb.physicalName)
    expect(names.sort()).toEqual(['orders', 'users']) // 저장 안 됨
  })
})

describe('EditorShell — 노드 자동 폭', () => {
  it('이름 커밋으로 길어지면 측정 미러가 노드 폭을 자동 확장한다', async () => {
    // jsdom은 레이아웃이 없어 offsetWidth가 항상 0 — 텍스트 길이 기반 stub으로 측정 파이프라인 검증
    const proto = HTMLElement.prototype as { offsetWidth: number }
    const original = Object.getOwnPropertyDescriptor(proto, 'offsetWidth')
    Object.defineProperty(proto, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return (this.textContent?.length ?? 0) * 7
      },
    })
    try {
      await renderEditor()
      const table = createTable('orders')
      const name = createColumn({ id: 'c1', physicalName: 'nm', dataType: 'VARCHAR', length: 10 })
      useEditorStore.getState().commitAll([
        { type: 'table/create', table, position: { x: 0, y: 0 } },
        { type: 'column/add', tableId: table.id, column: name },
      ])

      const root = (await screen.findByLabelText('컬럼 물리명 — nm')) // 렌더 대기
        .closest('[data-nodekind="table"]') as HTMLElement
      const before = root.style.width
      expect(before).not.toBe('')

      // 긴 이름으로 커밋 → 측정 재실행 → 폭 확장
      useEditorStore.getState().commit({
        type: 'column/patch',
        tableId: table.id,
        columnId: 'c1',
        patch: { physicalName: 'very_long_column_name_for_width_test' },
      })
      await waitFor(() => {
        const after = (document.querySelector('[data-nodekind="table"]') as HTMLElement).style.width
        expect(parseInt(after, 10)).toBeGreaterThan(parseInt(before, 10))
      })
    } finally {
      if (original) Object.defineProperty(proto, 'offsetWidth', original)
    }
  })
})

describe('EditorShell — NOT NULL 토글', () => {
  it('NN 클릭은 nullable을 실제로 반전한다 — 활성 여부(aria-pressed) 갱신', async () => {
    await renderEditor()
    const table = createTable('orders')
    const name = createColumn({ id: 'c1', physicalName: 'name', dataType: 'VARCHAR', length: 50 }) // nullable 기본 true
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: name },
    ])

    const nn = await screen.findByLabelText('NOT NULL — name')
    expect(nn.getAttribute('aria-pressed')).toBe('false') // NULL 허용 상태

    fireEvent.click(nn)
    await waitFor(() => {
      expect(useEditorStore.getState().present.model.tables[0].columns[0].nullable).toBe(false)
    })
    expect(nn.getAttribute('aria-pressed')).toBe('true') // NOT NULL 활성
  })

  it('PK 컬럼의 NN은 고정 — 클릭 불가', async () => {
    await renderEditor()
    const table = createTable('orders')
    const id = createColumn({ id: 'c1', physicalName: 'id', dataType: 'BIGINT', nullable: false })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: id },
      { type: 'primaryKey/set', tableId: table.id, primaryKey: { name: 'orders_pk', columnIds: ['c1'] } },
    ])

    const nn = await screen.findByLabelText('NOT NULL — id')
    expect(nn.getAttribute('aria-pressed')).toBe('true')
    expect(nn).toBeDisabled()
  })
})

describe('EditorShell — 노드 버튼 연속 클릭', () => {
  it('NN 버튼을 연달아 클릭하면 토글만 동작 — 노드 더블클릭(테이블 정보)이 새지 않는다', async () => {
    await renderEditor()
    const table = createTable('orders')
    const name = createColumn({ id: 'c1', physicalName: 'name', dataType: 'VARCHAR', length: 50 })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: name },
    ])

    const nn = await screen.findByLabelText('NOT NULL — name')
    fireEvent.click(nn)
    fireEvent.click(nn) // 연속 클릭 = 더블클릭 — 토글 원위치

    await waitFor(() => {
      expect(useEditorStore.getState().present.model.tables[0].columns[0].nullable).toBe(true)
    })
    // 테이블 정보 다이얼로그가 뜨지 않는다
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('EditorShell — 자동 저장', () => {
  it('저장 버튼 없이 마지막 편집 후 2초가 지나면 자동 저장된다 — 버전 갱신·dirty 해소', async () => {
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    const before = useEditorStore.getState()
    expect(before.past.length).toBeGreaterThan(before.savedDepth) // dirty — 저장 대기

    // MSW 기본 PUT: 501 version 3 → 성공 4. 2초 딜레이 실측 — waitFor 타임아웃 5초
    await waitFor(
      () => {
        const state = useEditorStore.getState()
        expect(state.baseVersion).toBe(4)
        expect(state.past.length).toBe(state.savedDepth)
      },
      { timeout: 5000 },
    )
  }, 15000)
})

describe('EditorShell — 임시 저장(배포·이탈 편집 복원)', () => {
  const DRAFT_KEY = 'crowfoot:editor-draft:101:501'

  /** 서버 PUT을 잡아 본문을 기록하는 핸들러 — 버전 3 → 4 성공 */
  function capturePuts() {
    const puts: Array<{ baseVersion: number; content: string; changeSummary?: string }> = []
    server.use(
      http.put('/api/v1/core/workspaces/101/models/501/content', async ({ request }) => {
        puts.push((await request.json()) as { baseVersion: number; content: string; changeSummary?: string })
        return HttpResponse.json(ok({ response: { version: 4, updatedAt: '2026-09-18T00:00:00Z' } }))
      }),
    )
    return puts
  }

  it('baseVersion이 같은 임시본이면 복원해 즉시 저장한다 — 성공 후 임시본 폐기', async () => {
    // 직전 세션에서 저장이 못 끝난 편집 — 서버 version 3에서 시작된 임시본
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ baseVersion: 3, content: remoteContent(), savedAt: 0 }),
    )
    const puts = capturePuts()
    await renderEditor()

    // 임시본(remote_orders)으로 수화 — 서버 빈 본문이 아니라 복원본이 그려진다
    await waitFor(() =>
      expect(useEditorStore.getState().present.model.tables.map((t) => t.physicalName)).toEqual(['remote_orders']),
    )
    expect(toastMock.info).toHaveBeenCalledWith('저장되지 않은 편집을 복구했습니다')

    // 즉시 플러시 — 자동 저장(2s)을 기다리지 않고 PUT
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ baseVersion: 3 })
    expect(puts[0].content).toContain('remote_orders')
    // 플러시 저장의 요약 — 임시본(remote_orders) 대 서버 본문(빈 문서)의 diff만 말한다
    const summary = JSON.parse(puts[0].changeSummary ?? 'null') as DocumentDiffSummary
    expect(summary.items).toEqual([
      { kind: 'table', action: 'add', table: 'remote_orders', name: 'remote_orders', detail: 'columns 1' },
    ])
    await waitFor(() => expect(useEditorStore.getState().baseVersion).toBe(4))
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull() // 서버가 원천 — 폐기
  })

  it('baseVersion이 어긋난 임시본은 폐기하고 서버 본문으로 연다', async () => {
    // 남이 이미 저장해 서버가 version 3까지 앞선 상황 — 임시본은 version 2 기준이라 못 쓴다
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ baseVersion: 2, content: remoteContent(), savedAt: 0 }),
    )
    const puts = capturePuts()
    await renderEditor()

    await waitFor(() => expect(useEditorStore.getState().present.model.tables).toHaveLength(0))
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull() // 폐기
    expect(puts).toHaveLength(0) // 복원 플러시도 없다
    expect(toastMock.info).not.toHaveBeenCalled()
  })

  it('pagehide에서 dirty 편집을 임시 저장 + keepalive PUT으로 남긴다', async () => {
    const puts = capturePuts()
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    fireEvent.pageHide(window)

    const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null') as
      | { baseVersion: number; content: string }
      | null
    expect(draft).toMatchObject({ baseVersion: 3 })
    expect(draft?.content).toContain('orders')
    await waitFor(() => expect(puts).toHaveLength(1)) // saveModelContentOnUnload — keepalive PUT
    // 이탈 저장에도 요약이 동봉된다 — 마지막 저장본(빈 문서) 대비 diff
    const summary = JSON.parse(puts[0].changeSummary ?? 'null') as DocumentDiffSummary
    expect(summary.items).toEqual([
      { kind: 'table', action: 'add', table: 'orders', name: 'orders', detail: 'columns 0' },
    ])
  })

  it('깨끗한 상태의 pagehide는 아무것도 남기지 않는다', async () => {
    const puts = capturePuts()
    await renderEditor()

    fireEvent.pageHide(window)

    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(puts).toHaveLength(0)
  })
})

describe('EditorShell — 복합 PK와 자동 증가', () => {
  it('복합 PK가 되는 순간 기존 AI가 풀리고, 복합 PK에서는 AI 버튼이 사라진다 — undo로 복원', async () => {
    await renderEditor()
    const table = createTable('orders')
    const id = createColumn({ id: 'c1', physicalName: 'id', dataType: 'BIGINT', nullable: false, autoIncrement: true })
    const code = createColumn({ id: 'c2', physicalName: 'order_code', dataType: 'VARCHAR', length: 20 })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: id },
      { type: 'column/add', tableId: table.id, column: code },
      { type: 'primaryKey/set', tableId: table.id, primaryKey: { name: 'orders_pk', columnIds: ['c1'] } },
    ])

    // 단일 PK + 정수 → AI 버튼 노출
    expect(await screen.findByLabelText('자동 증가 — id')).toBeTruthy()

    // 두 번째 컬럼을 PK로 → 복합화 순간 기존 AI 해제
    fireEvent.click(screen.getByLabelText('기본 키 — order_code'))
    await waitFor(() => {
      const orders = useEditorStore.getState().present.model.tables[0]
      expect(orders.primaryKey?.columnIds).toEqual(['c1', 'c2'])
      expect(orders.columns.find((c) => c.id === 'c1')?.autoIncrement).toBe(false)
    })

    // 복합 PK 상태 — AI 버튼 자체가 사라진다
    await waitFor(() => expect(screen.queryByLabelText('자동 증가 — id')).toBeNull())

    // undo — 복합화 이전(AI 켜진 단일 PK)으로 돌아온다
    useEditorStore.getState().undo()
    await waitFor(() => {
      const orders = useEditorStore.getState().present.model.tables[0]
      expect(orders.primaryKey?.columnIds).toEqual(['c1'])
      expect(orders.columns.find((c) => c.id === 'c1')?.autoIncrement).toBe(true)
    })
    expect(await screen.findByLabelText('자동 증가 — id')).toBeTruthy()
  })
})

describe('EditorShell — 문서 대상 DBMS 고정', () => {
  it('모델 databaseType(postgresql)으로 고정 — 툴바 잠금 표시, 타입 표기는 물리(INTEGER), 저장 값은 공용 코드(INT)', async () => {
    await renderEditor()
    const table = createTable('orders')
    const id = createColumn({ physicalName: 'id', dataType: 'INT' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: id },
    ])

    // 툴바 — 문서 생성 시점 값의 잠긴 표시 (전환 select는 없다)
    expect(await screen.findByText('PostgreSQL')).toBeTruthy()
    expect(screen.queryByLabelText('대상 DBMS')).toBeNull()

    const typeSelect = (await screen.findByLabelText('데이터 타입 — id')) as HTMLSelectElement
    expect(typeSelect.selectedOptions[0]?.textContent).toBe('INTEGER') // 물리 표기
    // 표기만 물리 — content에는 공용 논리 코드가 저장된다
    expect(useEditorStore.getState().present.model.tables[0].columns[0].dataType).toBe('INT')
  })

  it('databaseType을 알 수 없으면 공용(논리) 폴백 — 표기 INT 그대로', async () => {
    renderWithProviders(<EditorShell model={modelFixture({ databaseType: 'mariadb' })} canEdit />, { wrapRoutes: false })
    await waitFor(() => expect(useEditorStore.getState().modelId).toBe('501'))

    const table = createTable('orders')
    const id = createColumn({ physicalName: 'id', dataType: 'INT' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: table.id, column: id },
    ])

    expect(await screen.findByText('공용(논리)')).toBeTruthy()
    const typeSelect = (await screen.findByLabelText('데이터 타입 — id')) as HTMLSelectElement
    expect(typeSelect.selectedOptions[0]?.textContent).toBe('INT')
  })
})

describe('EditorShell — DB 동기화 버튼 노출 조건', () => {
  // 원천 연결 있는(리버스 생성) 문서·편집 권한·원천 커넥션 생존 — 세 조건이 모두 있을 때만
  it('원천 커넥션이 살아 있으면 노출한다 (기본 픽스처 501 — sourceConnectionId 301)', async () => {
    await renderEditor()
    // 커넥션 목록(301 존재) 로드 후 버튼이 나타난다
    expect(await screen.findByRole('button', { name: 'DB 동기화' })).toBeVisible()
  })

  it('읽기 전용(편집 권한 없음)에서는 노출하지 않는다', async () => {
    await renderEditor(false)
    await waitFor(() => expect(useEditorStore.getState().modelId).toBe('501'))
    expect(screen.queryByRole('button', { name: 'DB 동기화' })).toBeNull()
  })

  it('원천 연결이 없는(직접 생성) 문서에는 노출하지 않는다', async () => {
    renderWithProviders(<EditorShell model={modelFixture({ sourceConnectionId: null })} canEdit />, { wrapRoutes: false })
    await waitFor(() => expect(useEditorStore.getState().modelId).toBe('501'))
    expect(screen.queryByRole('button', { name: 'DB 동기화' })).toBeNull()
  })

  // 논리명 추론 버튼(v1.13) — 커스텀 사전이 워크스페이스 API라 편집 권한이 필요하다
  it('논리명 추론 버튼은 편집 가능에서 노출한다', async () => {
    await renderEditor()
    expect(screen.getByRole('button', { name: '논리명 추론' })).toBeVisible()
  })

  it('논리명 추론 버튼은 읽기 전용에서는 노출하지 않는다', async () => {
    await renderEditor(false)
    await waitFor(() => expect(useEditorStore.getState().modelId).toBe('501'))
    expect(screen.queryByRole('button', { name: '논리명 추론' })).toBeNull()
  })
})

// 용어 사전 패널(v1.14) — 토글 버튼·localStorage 영속·권한·공개 뷰어 게이트.
// 패널 본체(두 탭)는 term-dictionary-panel.test.tsx가 담당한다
describe('EditorShell — 용어 사전 패널', () => {
  it('토글 버튼이 패널을 열고 닫는다 — 열림이 localStorage(crowfoot.editor.terms-open)에 남는다', async () => {
    await renderEditor()
    expect(screen.queryByTestId('term-dictionary-panel')).toBeNull() // 기본 닫힘

    fireEvent.click(screen.getByRole('button', { name: '용어 사전' }))
    expect(await screen.findByTestId('term-dictionary-panel')).toBeVisible()
    expect(window.localStorage.getItem('crowfoot.editor.terms-open')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '용어 사전' }))
    expect(screen.queryByTestId('term-dictionary-panel')).toBeNull()
    expect(window.localStorage.getItem('crowfoot.editor.terms-open')).toBe('false')
  })

  it('읽기 전용 멤버도 토글·패널을 쓸 수 있다(쓰기 affordance는 패널 안에서 게이트)', async () => {
    await renderEditor(false)
    fireEvent.click(screen.getByRole('button', { name: '용어 사전' }))
    expect(await screen.findByTestId('term-dictionary-panel')).toBeVisible()
    expect(screen.getByText('열람 전용 — 등록·수정은 편집 권한이 필요합니다')).toBeVisible()
  })

  it('publicView(공개 뷰어)는 용어 사전 토글 버튼·패널을 렌더하지 않는다', async () => {
    renderWithProviders(<EditorShell model={modelFixture()} canEdit={false} publicView />, { wrapRoutes: false })
    await waitFor(() => expect(useEditorStore.getState().modelId).toBe('501'))
    expect(screen.queryByRole('button', { name: '용어 사전' })).toBeNull()
    expect(screen.queryByTestId('term-dictionary-panel')).toBeNull()
  })
})

describe('EditorShell — 관계 생성 UX (밴드 팝업 → 대상 클릭)', () => {
  /** 부모(users, PK 있음)·자식(orders) 2테이블 문서 — 노드 렌더까지 기다린다 */
  async function setupTwoTables(withParentPk = true) {
    await renderEditor()
    const users = createTable('users', { logicalName: '사용자' })
    const uid = createColumn({ physicalName: 'id', dataType: 'INT', nullable: false })
    const orders = createTable('orders', { logicalName: '주문' })
    const oid = createColumn({ physicalName: 'id', dataType: 'INT' })
    const changes: ErdChange[] = [
      { type: 'table/create', table: users, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: users.id, column: uid },
      { type: 'table/create', table: orders, position: { x: 500, y: 0 } },
      { type: 'column/add', tableId: orders.id, column: oid },
    ]
    if (withParentPk) {
      changes.push({ type: 'primaryKey/set', tableId: users.id, primaryKey: { name: 'users_pk', columnIds: [uid.id] } })
    }
    useEditorStore.getState().commitAll(changes)
    await waitFor(() => expect(screen.getAllByLabelText('컬럼 물리명 — id')).toHaveLength(2))
    // 논리명 텍스트는 측정 미러(data-extras)에도 있어 실제 밴드 span으로 좁힌다
    const nodeOf = (logical: string) =>
      screen.getByText(logical, { selector: 'span:not([data-extras])' }).closest('[data-nodekind="table"]') as HTMLElement
    return { users, orders, nodeOf }
  }

  /** users(부모·PK 보유) 오른쪽 점 근처 밴드 클릭 → 오버레이에서 1:N → 비식별까지 선택해 pending을 만든다 */
  async function startRelation(nodeOf: (logical: string) => HTMLElement) {
    const rightBand = nodeOf('사용자').querySelector('[data-relation-band="right"]') as HTMLElement
    fireEvent.click(rightBand)
    // 오버레이는 캔버스 레벨이라 role 쿼리가 동작한다 (RF 노드 내부와 다름)
    const overlay = await screen.findByRole('dialog')
    fireEvent.click(within(overlay).getByRole('button', { name: '1:N' }))
    fireEvent.click(within(overlay).getByRole('button', { name: '비식별 관계' }))
    expect(await screen.findByText(/대상 테이블을 클릭/)).toBeTruthy()
  }

  /** 진행 중 관계를 대상(자식 orders) 노드에 확정 — 오른쪽 면 근처 좌표(orders는 (500,0)에 렌더) */
  const clickOrders = (nodeOf: (logical: string) => HTMLElement) =>
    fireEvent.click(nodeOf('주문').querySelector('[data-relation-target]') as HTMLElement, { clientX: 850, clientY: 120 })

  it('밴드 hover → 1:N → 비식별 → 대상 클릭으로 즉시 관계 생성(다이얼로그 거치지 않음)', async () => {
    const { users, orders, nodeOf } = await setupTwoTables()
    await startRelation(nodeOf)

    // 시작(부모) 노드 강조 — 진행 중임이 보인다
    expect(nodeOf('사용자').className).toContain('ring-sky')

    // 대상 orders 클릭 — 진행 중에는 노드 전체를 덮는 클릭 캐치 레이어가 클릭을 받는다
    clickOrders(nodeOf)

    // 즉시 생성 — 다이얼로그 없이 관계·FK 컬럼까지. 시작=부모(1), 클릭 대상=자식(N)에 FK가 생긴다
    const rel = useEditorStore.getState().present.model.relationships
    expect(rel).toHaveLength(1)
    expect(rel[0]).toMatchObject({
      parentTableId: users.id,
      childTableId: orders.id,
      type: 'ONE_TO_MANY',
      identifying: false,
      parentMultiplicity: 'EXACTLY_ONE' as const, // 기수 기본값 — 양쪽 모두 필수
      childMultiplicity: 'ONE_OR_MORE' as const,
    })
    // 연결면은 저장하지 않는다 — 렌더 시점에 배치 기준 최단 면으로 자동 계산된다
    expect(rel[0].sourceHandle).toBeUndefined()
    expect(rel[0].targetHandle).toBeUndefined()
    expect(await screen.findByLabelText('컬럼 물리명 — users_id')).toBeTruthy() // FK 자동 생성(자식에)
    expect(screen.queryByRole('dialog')).toBeNull() // 다이얼로그를 거치지 않는다
    expect(screen.queryByText(/대상 테이블을 클릭/)).toBeNull() // 안내 배지 해제
  })

  it('식별 관계 선택 → FK가 NOT NULL로 생성된다', async () => {
    const { users, orders, nodeOf } = await setupTwoTables()
    const rightBand = nodeOf('사용자').querySelector('[data-relation-band="right"]') as HTMLElement
    fireEvent.click(rightBand)
    const overlay = await screen.findByRole('dialog')
    fireEvent.click(within(overlay).getByRole('button', { name: '1:1' }))
    fireEvent.click(within(overlay).getByRole('button', { name: '식별 관계' }))

    clickOrders(nodeOf)

    const rel = useEditorStore.getState().present.model.relationships
    expect(rel).toHaveLength(1)
    expect(rel[0]).toMatchObject({ type: 'ONE_TO_ONE', identifying: true, parentTableId: users.id, childTableId: orders.id })
    const fk = useEditorStore.getState().present.model.tables.find((tb) => tb.id === orders.id)?.columns.find((c) => c.physicalName === 'users_id')
    expect(fk?.nullable).toBe(false) // 식별 관계 — FK는 NOT NULL
  })

  it('오버레이에서 Esc로 취소하면 관계 대기로 넘어가지 않는다', async () => {
    const { nodeOf } = await setupTwoTables()
    const rightBand = nodeOf('사용자').querySelector('[data-relation-band="right"]') as HTMLElement
    fireEvent.click(rightBand)
    expect(await screen.findByRole('dialog')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText(/대상 테이블을 클릭/)).toBeNull()
    expect(useEditorStore.getState().present.model.relationships).toHaveLength(0)
  })

  it('Esc로 진행 중 관계를 취소한다', async () => {
    const { nodeOf } = await setupTwoTables()
    await startRelation(nodeOf)

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText(/대상 테이블을 클릭/)).toBeNull())
    expect(useEditorStore.getState().present.model.relationships).toHaveLength(0)
  })

  it('시작(부모)에 PK가 없으면 연결되지 않는다', async () => {
    const { nodeOf } = await setupTwoTables(false)
    await startRelation(nodeOf)

    clickOrders(nodeOf)

    expect(useEditorStore.getState().present.model.relationships).toHaveLength(0)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('기수를 0 계열로 고르면 관계에 반영된다 — 자식 0 이상(○<) · 부모 0 또는 하나(○|)', async () => {
    const { nodeOf } = await setupTwoTables()
    const rightBand = nodeOf('사용자').querySelector('[data-relation-band="right"]') as HTMLElement
    fireEvent.click(rightBand)
    const overlay = await screen.findByRole('dialog')
    fireEvent.click(within(overlay).getByRole('button', { name: '1:N' }))
    // 자식(N) 쪽 0 이상(○<) · 부모(1) 쪽 0 또는 하나(○|)
    fireEvent.click(within(overlay).getByRole('button', { name: '0 이상 (○<)' }))
    fireEvent.click(within(overlay).getByRole('button', { name: '0 또는 하나 (○|)' }))
    fireEvent.click(within(overlay).getByRole('button', { name: '비식별 관계' }))

    clickOrders(nodeOf)

    expect(useEditorStore.getState().present.model.relationships[0]).toMatchObject({
      parentMultiplicity: 'ZERO_OR_ONE' as const,
      childMultiplicity: 'ZERO_OR_MORE' as const,
    })
  })

  it('1:1을 고르면 자식 쪽 기수 라벨이 0 또는 하나(○|)/하나(|)로 바뀐다', async () => {
    const { nodeOf } = await setupTwoTables()
    const rightBand = nodeOf('사용자').querySelector('[data-relation-band="right"]') as HTMLElement
    fireEvent.click(rightBand)
    const overlay = await screen.findByRole('dialog')

    expect(within(overlay).getAllByRole('button', { name: '0 이상 (○<)' })).toHaveLength(1) // 1:N 라벨
    fireEvent.click(within(overlay).getByRole('button', { name: '1:1' }))
    expect(within(overlay).queryByRole('button', { name: '0 이상 (○<)' })).toBeNull()
    expect(within(overlay).getAllByRole('button', { name: '0 또는 하나 (○|)' })).toHaveLength(2) // 자식+부모
  })

  it('관계 생성 후 FK는 자식 노드의 PK 아래 별도 영역(하늘)에 표시된다', async () => {
    const { nodeOf } = await setupTwoTables()
    await startRelation(nodeOf)
    clickOrders(nodeOf)

    await waitFor(() => expect(useEditorStore.getState().present.model.relationships).toHaveLength(1))
    // orders에는 PK가 없어 FK 영역이 최상단 — 컬럼 순서 users_id → id
    const orders = useEditorStore.getState().present.model.tables.find((tb) => tb.physicalName === 'orders')
    expect(orders?.columns.map((c) => c.physicalName)).toEqual(['users_id', 'id'])
    // FK 행은 하늘 배경 영역, 그립(드래그)이 없다
    const fkRow = rowOf('컬럼 물리명 — users_id')
    expect(fkRow.dataset.zone).toBe('fk')
    expect(fkRow.className).toContain('bg-sky-500')
    expect(fkRow.querySelector('[title="컬럼 순서 변경 — 드래그하여 이동"]')).toBeNull()
    // 일반 컬럼(id)은 FK 영역 아래 일반 영역 — 두 노드에 다 있는 이름이라 orders로 스코프
    const idRow = within(nodeOf('주문')).getByLabelText('컬럼 물리명 — id').closest('.grid') as HTMLElement
    expect(idRow.dataset.zone).toBe('general')
    // 사용자 노드의 PK 행에는 영향 없음
    const usersNode = nodeOf('사용자')
    expect(within(usersNode).queryByLabelText('컬럼 물리명 — users_id')).toBeNull()
  })

  it('일반 컬럼을 FK 행으로 드래그해도 무시된다 — FK 영역은 드롭 불가', async () => {
    const { nodeOf } = await setupTwoTables()
    await startRelation(nodeOf)
    clickOrders(nodeOf)
    await waitFor(() => expect(useEditorStore.getState().present.model.relationships).toHaveLength(1))

    // 그립은 PK/일반 행에만 — [users.id(pk), orders.id(일반)]
    const grips = await screen.findAllByTitle('컬럼 순서 변경 — 드래그하여 이동')
    fireEvent.dragStart(grips[1]) // orders.id(일반)
    const fkRow = rowOf('컬럼 물리명 — users_id')
    fireEvent.dragOver(fkRow)
    fireEvent.drop(fkRow)

    const orders = useEditorStore.getState().present.model.tables.find((tb) => tb.physicalName === 'orders')
    expect(orders?.columns.map((c) => c.physicalName)).toEqual(['users_id', 'id'])
  })

  it('데이터 배열에서 FK가 일반 뒤에 있어도(레거시) 렌더는 PK → FK → 일반 순서를 지킨다', async () => {
    const { nodeOf } = await setupTwoTables()
    await startRelation(nodeOf)
    clickOrders(nodeOf)
    await waitFor(() => expect(useEditorStore.getState().present.model.relationships).toHaveLength(1))

    // 관계 삽입 로직 개선 전에 저장된 문서 재현 — FK(users_id)를 배열 끝으로 보낸다
    const orders = useEditorStore.getState().present.model.tables.find((tb) => tb.physicalName === 'orders')
    const fk = orders?.columns.find((c) => c.physicalName === 'users_id')
    useEditorStore.getState().commit({ type: 'column/move', tableId: orders!.id, columnId: fk!.id, toIndex: 1 })
    expect(useEditorStore.getState().present.model.tables.find((tb) => tb.physicalName === 'orders')
      ?.columns.map((c) => c.physicalName)).toEqual(['id', 'users_id'])

    // 화면 표시는 데이터 순서와 무관하게 FK 영역이 PK(없음) 바로 밑 — 일반 위
    const zones = Array.from(nodeOf('주문').querySelectorAll('[data-zone]'))
    expect(zones.map((el) => (el as HTMLElement).dataset.zone)).toEqual(['fk', 'general'])
    expect(within(zones[0] as HTMLElement).getByLabelText('컬럼 물리명 — users_id')).toBeTruthy()
  })
})

describe('EditorShell — 자기 참조 관계 (시작 테이블 자신에게 연결)', () => {
  /** users(기본 PK 보유)·orders 2테이블 — 진행 중에는 소스 테이블에도 클릭 캐치 레이어가 있다 */
  async function setupPair(withUsersPk = true, withOrdersPk = false) {
    await renderEditor()
    const users = createTable('users', { logicalName: '사용자' })
    const uid = createColumn({ physicalName: 'id', dataType: 'INT', nullable: false })
    const orders = createTable('orders', { logicalName: '주문' })
    const oid = createColumn({ physicalName: 'id', dataType: 'INT' })
    const changes: ErdChange[] = [
      { type: 'table/create', table: users, position: { x: 0, y: 0 } },
      { type: 'column/add', tableId: users.id, column: uid },
      { type: 'table/create', table: orders, position: { x: 500, y: 0 } },
      { type: 'column/add', tableId: orders.id, column: oid },
    ]
    if (withUsersPk) {
      changes.push({ type: 'primaryKey/set', tableId: users.id, primaryKey: { name: 'users_pk', columnIds: [uid.id] } })
    }
    if (withOrdersPk) {
      changes.push({ type: 'primaryKey/set', tableId: orders.id, primaryKey: { name: 'orders_pk', columnIds: [oid.id] } })
    }
    useEditorStore.getState().commitAll(changes)
    await waitFor(() => expect(screen.getAllByLabelText('컬럼 물리명 — id')).toHaveLength(2))
    const nodeOf = (logical: string) =>
      screen.getByText(logical, { selector: 'span:not([data-extras])' }).closest('[data-nodekind="table"]') as HTMLElement
    return { users, orders, nodeOf }
  }

  /** users 오른쪽 밴드 → 오버레이 1:N → 비식별까지 골라 pending을 만든다 */
  async function startUsersRelation(nodeOf: (logical: string) => HTMLElement) {
    fireEvent.click(nodeOf('사용자').querySelector('[data-relation-band="right"]') as HTMLElement)
    const overlay = await screen.findByRole('dialog')
    fireEvent.click(within(overlay).getByRole('button', { name: '1:N' }))
    fireEvent.click(within(overlay).getByRole('button', { name: '비식별 관계' }))
    expect(await screen.findByText(/대상 테이블을 클릭/)).toBeTruthy()
  }

  /** 진행 중 관계를 노드의 클릭 캐치 레이어로 확정 — 소스 테이블 자신도 대상이 될 수 있다 */
  const clickNode = (node: HTMLElement, x: number, y: number) =>
    fireEvent.click(node.querySelector('[data-relation-target]') as HTMLElement, { clientX: x, clientY: y })

  it('시작 테이블 자신을 클릭하면 자기 참조 관계가 된다 — FK는 같은 테이블에 생긴다', async () => {
    const { users, nodeOf } = await setupPair()
    await startUsersRelation(nodeOf)

    clickNode(nodeOf('사용자'), 400, 120)

    const rel = useEditorStore.getState().present.model.relationships
    expect(rel).toHaveLength(1)
    expect(rel[0]).toMatchObject({ parentTableId: users.id, childTableId: users.id, type: 'ONE_TO_MANY' })
    // FK 컬럼은 users 자신에 — PK 아래 FK 영역에 렌더된다
    expect(await within(nodeOf('사용자')).findByLabelText('컬럼 물리명 — users_id')).toBeTruthy()
    const usersTable = useEditorStore.getState().present.model.tables.find((tb) => tb.id === users.id)
    expect(usersTable?.columns.map((c) => c.physicalName)).toEqual(['id', 'users_id'])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(/대상 테이블을 클릭/)).toBeNull() // 안내 배지 해제
  })

  it('자기 참조 중복은 차단된다 — 같은 방향 순서쌍 1개, 재시도하면 대기가 유지된다', async () => {
    const { nodeOf } = await setupPair()
    await startUsersRelation(nodeOf)
    clickNode(nodeOf('사용자'), 400, 120)
    await waitFor(() => expect(useEditorStore.getState().present.model.relationships).toHaveLength(1))

    await startUsersRelation(nodeOf)
    clickNode(nodeOf('사용자'), 400, 120)

    expect(useEditorStore.getState().present.model.relationships).toHaveLength(1) // 여전히 1개
    expect(await screen.findByText(/대상 테이블을 클릭/)).toBeTruthy() // pending 유지 — 다른 대상을 고를 수 있다
  })

  it('PK 없는 테이블의 자기 참조는 연결되지 않는다', async () => {
    const { nodeOf } = await setupPair(false)
    await startUsersRelation(nodeOf)

    clickNode(nodeOf('사용자'), 400, 120)

    expect(useEditorStore.getState().present.model.relationships).toHaveLength(0)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('상호 참조(A→B + B→A)는 두 관계 모두 존재할 수 있다 — 렌더에서 평행 분리된다', async () => {
    const { users, orders, nodeOf } = await setupPair(true, true)
    // users → orders
    await startUsersRelation(nodeOf)
    clickNode(nodeOf('주문'), 850, 120)
    await waitFor(() => expect(useEditorStore.getState().present.model.relationships).toHaveLength(1))

    // orders → users (역방향)
    fireEvent.click(nodeOf('주문').querySelector('[data-relation-band="right"]') as HTMLElement)
    const overlay = await screen.findByRole('dialog')
    fireEvent.click(within(overlay).getByRole('button', { name: '1:N' }))
    fireEvent.click(within(overlay).getByRole('button', { name: '비식별 관계' }))
    clickNode(nodeOf('사용자'), 400, 120)

    const rels = useEditorStore.getState().present.model.relationships
    expect(rels).toHaveLength(2)
    expect(rels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentTableId: users.id, childTableId: orders.id }),
        expect.objectContaining({ parentTableId: orders.id, childTableId: users.id }),
      ]),
    )
    // 역방향 FK는 users에 생긴다
    expect(await within(nodeOf('사용자')).findByLabelText('컬럼 물리명 — orders_id')).toBeTruthy()
  })
})

describe('EditorShell — 자동 배치(elkjs)', () => {
  /** A→B→C 체인 시드 — 일부러 부모가 아래에 흩어져 있는 배치 */
  async function seedChain() {
    await renderEditor()
    const mk = (id: string) =>
      createTable(`tb_${id.toLowerCase()}`, {
        id,
        columns: [
          createColumn({ id: `${id}-pk`, physicalName: 'id', dataType: 'BIGINT', nullable: false }),
          createColumn({ id: `${id}-c1`, physicalName: 'name', dataType: 'VARCHAR', length: 50 }),
        ],
        primaryKey: { name: `${id}_pk`, columnIds: [`${id}-pk`] },
      })
    const [a, b, c] = [mk('A'), mk('B'), mk('C')]
    const relate = (parent: typeof a, child: typeof a) => {
      const built = buildRelationship({
        parentTable: parent,
        childTable: child,
        type: 'ONE_TO_MANY',
        identifying: false,
        parentMultiplicity: 'EXACTLY_ONE',
        childMultiplicity: 'ONE_OR_MORE',
      })
      if (!built.ok) throw new Error('unreachable')
      return { type: 'relationship/create', relationship: built.relationship, fkColumns: built.fkColumns } as ErdChange
    }
    useEditorStore.getState().commitAll([
      { type: 'table/create', table: a, position: { x: 0, y: 900 } },
      { type: 'table/create', table: b, position: { x: 400, y: 0 } },
      { type: 'table/create', table: c, position: { x: 800, y: 450 } },
      relate(a, b),
      relate(b, c),
    ] as ErdChange[])
  }

  it('실행하면 FK 참조 방향(부모가 위)으로 재배치되고 undo 1회로 원복된다', async () => {
    await seedChain()
    const before = { ...useEditorStore.getState().present.diagram.nodes }

    fireEvent.click(screen.getByRole('button', { name: '자동 배치' }))

    await waitFor(() => {
      const nodes = useEditorStore.getState().present.diagram.nodes
      expect(nodes.A.y).toBeLessThan(nodes.B.y)
      expect(nodes.B.y).toBeLessThan(nodes.C.y)
    })
    // 좌표가 실제로 바뀌었다
    const laidOut = useEditorStore.getState().present.diagram.nodes
    expect(laidOut.A.y).not.toBe(before.A.y)

    // 단일 커밋 — undo 1회면 시드 배치로 돌아온다
    useEditorStore.getState().undo()
    await waitFor(() => {
      const nodes = useEditorStore.getState().present.diagram.nodes
      expect(nodes.A).toEqual(before.A)
      expect(nodes.B).toEqual(before.B)
      expect(nodes.C).toEqual(before.C)
    })
  })

  it('테이블이 2개 미만이면 비활성화', async () => {
    await seedChain()
    useEditorStore.getState().commitAll([
      { type: 'table/remove', tableId: 'C' },
      { type: 'table/remove', tableId: 'B' },
    ])
    await waitFor(() => expect(screen.getByRole('button', { name: '자동 배치' })).toBeDisabled())
  })

  it('읽기 전용이면 비활성화', async () => {
    await renderEditor(false)
    expect(screen.getByRole('button', { name: '자동 배치' })).toBeDisabled()
  })
})

describe('EditorShell — SQL 생성', () => {
  it('툴바 버튼으로 미리보기 다이얼로그를 열고 문서 내용을 DDL로 보여준다', async () => {
    await renderEditor()
    useEditorStore.getState().commit({
      type: 'table/create',
      table: createTable('member', {
        id: 'T1',
        columns: [createColumn({ id: 'c1', physicalName: 'id', dataType: 'BIGINT', nullable: false })],
        primaryKey: { name: 'pk_member', columnIds: ['c1'] },
      }),
      position: { x: 0, y: 0 },
    } as ErdChange)

    fireEvent.click(screen.getByRole('button', { name: 'SQL 생성' }))

    // 스크립트는 core-api DDL API(§1.7) 응답 — 목업 핸들러가 내려준다
    const script = await screen.findByTestId('ddl-script')
    expect(screen.getByText('SQL 스크립트')).toBeVisible()
    expect(script.textContent ?? '').toContain('CREATE TABLE member')
    expect(script.textContent ?? '').toContain('CONSTRAINT pk_member PRIMARY KEY (id)')
  })

  it('읽기 전용 문서에서도 생성할 수 있다 — 내보내기는 편집이 아니다', async () => {
    await renderEditor(false)
    expect(screen.getByRole('button', { name: 'SQL 생성' })).toBeEnabled()
  })
})

describe('EditorShell — 이미지 내보내기', () => {
  /** 이미지 버튼은 드롭다운 — 열고 항목을 고른다 (radix pointerdown 관례) */
  const openImageMenu = () => {
    const trigger = screen.getByRole('button', { name: '이미지 내보내기' })
    fireEvent.pointerDown(trigger, { button: 0 })
    fireEvent.click(trigger)
  }

  it('전체 문서 항목으로 전체 범위 PNG를 파일명({문서명}.png)으로 내려받는다', async () => {
    vi.mocked(toPng).mockResolvedValue('data:image/png;base64,MOCK')
    const clicked: HTMLAnchorElement[] = []
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this)
      })
    await renderEditor()
    useEditorStore.getState().commit({
      type: 'table/create',
      table: createTable('member', {
        id: 'T1',
        columns: [createColumn({ id: 'c1', physicalName: 'id', dataType: 'BIGINT', nullable: false })],
        primaryKey: { name: 'pk_member', columnIds: ['c1'] },
      }),
      position: { x: 100, y: 50 },
    } as ErdChange)
    // 커밋 → RF 노드 등록(리렌더)까지 기다린 뒤 캡처 — 등록 전이면 캡처 대상이 없다
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node')).toHaveLength(1))

    openImageMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '전체 문서 PNG' }))

    await waitFor(() => expect(clicked).toHaveLength(1))
    expect(clicked[0].download).toBe('주문_서비스_ERD.png')
    expect(clicked[0].href).toBe('data:image/png;base64,MOCK')
    // 캡처는 문서 전체(viewport DOM) 대상 — 노드는 컬링 없이 항상 전부 렌더돼 있다
    expect(clickSpy).toHaveBeenCalled()
  })

  it('보이는 화면 항목은 현재 줌 그대로 뷰포트 캡처로 내려받는다', async () => {
    vi.mocked(toPng).mockResolvedValue('data:image/png;base64,VIEWPORT')
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    await renderEditor()
    useEditorStore.getState().commit({
      type: 'table/create',
      table: createTable('member', { id: 'T1', columns: [] }),
      position: { x: 0, y: 0 },
    } as ErdChange)
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node')).toHaveLength(1))

    openImageMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '보이는 화면 PNG' }))

    await waitFor(() => expect(clicked).toHaveLength(1))
    expect(clicked[0].download).toBe('주문_서비스_ERD.png')
    // 뷰포트 캡처 판별 — 클론 style에 현재 transform이 그대로 얹힌다(transformOrigin 고정)
    const options = vi.mocked(toPng).mock.calls.at(-1)?.[1]
    expect(options?.style).toHaveProperty('transformOrigin', '0 0')
  })

  it('캡처 대상(테이블·노트)이 없으면 비활성화', async () => {
    await renderEditor()
    expect(screen.getByRole('button', { name: '이미지 내보내기' })).toBeDisabled()
  })

  it('캡처 실패 시 다운로드가 일어나지 않는다', async () => {
    vi.mocked(toPng).mockRejectedValue(new Error('boom'))
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    await renderEditor()
    useEditorStore.getState().commit({
      type: 'table/create',
      table: createTable('member', { id: 'T1', columns: [] }),
      position: { x: 0, y: 0 },
    } as ErdChange)
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node')).toHaveLength(1))

    openImageMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '보이는 화면 PNG' }))

    await waitFor(() => expect(toPng).toHaveBeenCalled())
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('캡처 중 진행 오버레이 — 렌더링 단계 문구가 보이다가 완료 뒤 사라진다', async () => {
    // 캡처를 완료 못 하게 묶어두고 중간 상태를 관찰한다
    let resolvePng!: (value: string) => void
    vi.mocked(toPng).mockImplementation(
      () => new Promise((resolve) => { resolvePng = resolve }),
    )
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    await renderEditor()
    useEditorStore.getState().commit({
      type: 'table/create',
      table: createTable('member', { id: 'T1', columns: [] }),
      position: { x: 0, y: 0 },
    } as ErdChange)
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node')).toHaveLength(1))

    openImageMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '전체 문서 PNG' }))

    // 렌더링 단계 — 오버레이(status) + 진행 문구 (문구는 toPng 진입 전에 먼저 보인다)
    expect(await screen.findByText(/이미지로 렌더링하는 중/)).toBeVisible()
    const overlay = screen.getByTestId('image-export-progress')
    expect(overlay.getAttribute('role')).toBe('status')
    await waitFor(() => expect(toPng).toHaveBeenCalled())

    resolvePng('data:image/png;base64,OK')
    await waitFor(() => expect(screen.queryByTestId('image-export-progress')).toBeNull())
    expect(clickSpy).toHaveBeenCalled()
  })
})

describe('EditorShell — .crown 문서 파일 내보내기', () => {
  it('툴바 버튼으로 봉투(JSON)를 {문서명}.crown으로 내려받는다 — 클릭 시점 편집 상태', async () => {
    let downloadedText = ''
    // Blob 내용을 캡처 — 봉투가 클릭 시점 문서 스냅샷을 싣는지 확인한다
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob.text().then((text) => {
        downloadedText = text
      })
      return 'blob:mock'
    })
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    let downloadedName = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function handleClick(
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download
    })
    await renderEditor()
    useEditorStore.getState().commit({
      type: 'table/create',
      table: createTable('member', {
        id: 'T1',
        columns: [createColumn({ id: 'c1', physicalName: 'id', dataType: 'BIGINT', nullable: false })],
        primaryKey: { name: 'pk_member', columnIds: ['c1'] },
      }),
      position: { x: 0, y: 0 },
    } as ErdChange)

    fireEvent.click(screen.getByRole('button', { name: '문서 파일 내보내기' }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))
    expect(downloadedName).toBe('주문_서비스_ERD.crown')
    await waitFor(() => expect(downloadedText).toBeTruthy())
    const envelope = JSON.parse(downloadedText) as { format: string; model: { databaseType: string }; content: { model: { tables: { physicalName: string }[] } } }
    expect(envelope.format).toBe('crowfoot-crown')
    expect(envelope.model.databaseType).toBe('postgresql')
    expect(envelope.content.model.tables[0]?.physicalName).toBe('member')
  })
})

describe('EditorShell — 단축키: 클립보드·선택·이동 (§9)', () => {
  function seedTable(name: string, x = 10, y = 20) {
    const table = createTable(name)
    useEditorStore.getState().commit({ type: 'table/create', table, position: { x, y } })
    return table
  }

  it('Ctrl+A 전체 선택 → Esc 해제', async () => {
    await renderEditor()
    const orders = seedTable('orders')
    const users = seedTable('users')

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect([...useEditorStore.getState().selectedIds].sort()).toEqual([orders.id, users.id].sort())

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useEditorStore.getState().selectedIds).toEqual([])
  })

  it('Ctrl+C → Ctrl+V — 사본 생성·붙여넣은 객체 선택·undo 한 번에 전체 취소', async () => {
    await renderEditor()
    const orders = seedTable('orders')
    useEditorStore.getState().setSelection([orders.id])

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    const state = useEditorStore.getState()
    expect(state.present.model.tables.map((t) => t.physicalName)).toEqual(['orders', 'orders_사본'])
    const copy = state.present.model.tables[1]
    expect(state.selectedIds).toEqual([copy.id])
    expect(state.present.diagram.nodes[copy.id]).toMatchObject({ x: 42, y: 52 }) // +32px 오프셋

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().present.model.tables).toHaveLength(1)
    expect(useEditorStore.getState().selectedIds).toEqual([]) // 선택은 undo 대상 아님 — 남는 id도 정리된다
  })

  it('Ctrl+D — 선택을 그 자리에서 복제한다', async () => {
    await renderEditor()
    const orders = seedTable('orders')
    useEditorStore.getState().setSelection([orders.id])

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })

    const state = useEditorStore.getState()
    expect(state.present.model.tables.map((t) => t.physicalName)).toEqual(['orders', 'orders_사본'])
    expect(state.selectedIds).toEqual([state.present.model.tables[1].id])
  })

  it('Arrow — 선택 테이블 1px 이동, Shift+Arrow 10px', async () => {
    await renderEditor()
    const orders = seedTable('orders', 10, 20)
    useEditorStore.getState().setSelection([orders.id])

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useEditorStore.getState().present.diagram.nodes[orders.id]).toMatchObject({ x: 11, y: 20 })

    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true })
    expect(useEditorStore.getState().present.diagram.nodes[orders.id]).toMatchObject({ x: 11, y: 30 })

    // 선택 없으면 방향키는 문서를 바꾸지 않는다
    useEditorStore.getState().setSelection([])
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useEditorStore.getState().present.diagram.nodes[orders.id]).toMatchObject({ x: 11, y: 30 })
  })

  it('읽기 전용에서는 클립보드·이동이 동작하지 않는다', async () => {
    await renderEditor(false)
    const orders = seedTable('orders') // 스토어 직접 commit — 읽기 전용은 UI 게이트일 뿐
    useEditorStore.getState().setSelection([orders.id])

    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useEditorStore.getState().present.model.tables).toHaveLength(1)
    expect(useEditorStore.getState().present.diagram.nodes[orders.id]).toMatchObject({ x: 10, y: 20 })
  })

  it('input 포커스 중에는 클립보드 단축키를 건너뛴다', async () => {
    await renderEditor()
    const table = createTable('orders', {
      columns: [createColumn({ id: 'c1', physicalName: 'id' })],
    })
    useEditorStore.getState().commit({ type: 'table/create', table, position: { x: 0, y: 0 } })
    useEditorStore.getState().setSelection([table.id])

    const input = await screen.findByLabelText('컬럼 물리명 — id')
    input.focus()
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'v', ctrlKey: true })

    expect(useEditorStore.getState().present.model.tables).toHaveLength(1)
  })

  it('Ctrl+/ — 단축키 치트시트를 연다(읽기 전용도)', async () => {
    await renderEditor(false)

    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(await screen.findByText('키보드 단축키')).toBeVisible()
    expect(screen.getByText('편집 권한이 없으면 편집·이동·삭제 단축키는 동작하지 않습니다')).toBeVisible()
  })

  it('input 포커스 중에도 Ctrl+/ 치트시트는 동작한다 — 유일한 가드 예외', async () => {
    await renderEditor()
    const table = createTable('orders', {
      columns: [createColumn({ id: 'c1', physicalName: 'id' })],
    })
    useEditorStore.getState().commit({ type: 'table/create', table, position: { x: 0, y: 0 } })

    const input = await screen.findByLabelText('컬럼 물리명 — id')
    input.focus()
    fireEvent.keyDown(input, { key: '/', ctrlKey: true })

    expect(await screen.findByText('키보드 단축키')).toBeVisible()
  })

  it('툴바 버튼으로 치트시트를 열고 Esc로 닫는다', async () => {
    await renderEditor()

    fireEvent.click(screen.getByRole('button', { name: '단축키 도움말' }))
    expect(await screen.findByText('키보드 단축키')).toBeVisible()

    // Esc는 다이얼로그를 닫는다(Radix) — 닫힌 뒤 기존 Esc 동작(선택 해제)은 그대로다
    fireEvent.keyDown(screen.getByText('키보드 단축키'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('키보드 단축키')).toBeNull())

    fireEvent.keyDown(window, { key: 'Escape' }) // 닫힌 뒤에도 window Esc는 정상 처리
    expect(useEditorStore.getState().selectedIds).toEqual([])
  })
})

describe('EditorShell — 단축키: 그룹(주제 영역)은 캔버스 객체가 아니다 (v1.13 §6)', () => {
  function seedArea(name: string) {
    const area = createArea(name)
    useEditorStore.getState().commit({ type: 'area/create', area })
    return area
  }

  it('Ctrl+A 전체 선택에 그룹은 포함되지 않는다 — 논리 소속은 선택 대상이 아니다', async () => {
    await renderEditor()
    const orders = createTable('orders')
    useEditorStore.getState().commit({ type: 'table/create', table: orders, position: { x: 0, y: 0 } })
    seedArea('회원 도메인')

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(useEditorStore.getState().selectedIds).toEqual([orders.id])
  })

  it('Arrow — 그룹 id가 선택에 남아 있어도 문서를 움직이지 않는다', async () => {
    await renderEditor()
    const area = seedArea('회원 도메인')
    useEditorStore.getState().setSelection([area.id])

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useEditorStore.getState().present.diagram.areas[0]).toBe(area)
  })
})

describe('EditorShell — 그룹 소속 테이블: 색 잠금·소속 표시·메뉴 비활성화 (v1.13 §6)', () => {
  /** orders(회원 도메인 그룹·sky) + payments(미소속) */
  async function seedGroupedFixture() {
    await renderEditor()
    const orders = createTable('orders', { logicalName: '주문' })
    const payments = createTable('payments', { logicalName: '결제' })
    useEditorStore.getState().commitAll([
      { type: 'table/create', table: orders, position: { x: 0, y: 0 } },
      { type: 'table/create', table: payments, position: { x: 400, y: 0 } },
    ])
    const area = createArea('회원 도메인', { color: 'sky', tableIds: [orders.id] })
    useEditorStore.getState().commit({ type: 'area/create', area })
    return { orders, payments, area }
  }

  /** 노드 안 요소에 컨텍스트 메뉴 열기 — 논리명 밴드는 테이블별 유일한 노드 내 앵커다 */
  const openTableMenu = (logical: string) =>
    fireEvent.contextMenu(screen.getByText(logical, { selector: 'span:not([data-extras])' }))

  it('그룹 소속 — 테이블 정보의 색 선택기가 그룹 색(sky)으로 잠기고 소속 그룹을 보여준다', async () => {
    await seedGroupedFixture()

    // 노드 더블클릭 → 테이블 정보 다이얼로그
    fireEvent.doubleClick(await screen.findByText('주문', { selector: 'span:not([data-extras])' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('테이블 정보')).toBeInTheDocument()

    // 소속 그룹 표시 — 문서 순서 그대로
    expect(within(dialog).getByText('회원 도메인')).toBeInTheDocument()

    // 스와치 전부 잠김 + 그룹 색(sky)이 선택된 상태 + 잠금 안내
    const swatches = within(dialog).getAllByRole('button', { name: /^색상$|^기본$/ })
    expect(swatches).toHaveLength(1 + 10) // 기본 + 프리셋 10색
    for (const s of swatches) expect(s).toBeDisabled()
    const sky = within(dialog).getAllByRole('button', { name: '색상' }).find(
      (s) => s.getAttribute('aria-pressed') === 'true',
    )
    expect(sky).toBeDefined()
    expect(within(dialog).getByText(/그룹 색이 우선합니다/)).toBeInTheDocument()

    // 미소속 테이블(payments)은 그대로 개별 편집 — '미분류' 안내
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    fireEvent.doubleClick(await screen.findByText('결제', { selector: 'span:not([data-extras])' }))
    const dialog2 = await screen.findByRole('dialog')
    expect(within(dialog2).getByText('미분류')).toBeInTheDocument()
    for (const s of within(dialog2).getAllByRole('button', { name: /^색상$|^기본$/ })) expect(s).toBeEnabled()
    expect(within(dialog2).queryByText(/그룹 색이 우선합니다/)).toBeNull()
  })

  it('이미 소속 테이블 우클릭 — 그룹에 추가는 비활성화, 그룹에서 제외는 제공', async () => {
    await seedGroupedFixture()

    openTableMenu('주문') // 그룹 소속 orders 노드 안
    const addTo = await screen.findByRole('menuitem', { name: '그룹에 추가' })
    expect(addTo).toHaveAttribute('aria-disabled', 'true')
    expect(await screen.findByRole('menuitem', { name: '그룹에서 제외' })).toBeEnabled()
  })

  it('그룹 편집 — 소속 테이블은 활성(클릭 → 그룹 다이얼로그), 미소속은 비활성화', async () => {
    await seedGroupedFixture()

    openTableMenu('주문')
    const editGroup = await screen.findByRole('menuitem', { name: '그룹 편집' })
    expect(editGroup).toBeEnabled()
    fireEvent.click(editGroup)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('이름')).toHaveValue('회원 도메인')
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))

    openTableMenu('결제')
    const editGroup2 = await screen.findByRole('menuitem', { name: '그룹 편집' })
    expect(editGroup2).toHaveAttribute('aria-disabled', 'true')
  })

  it('미소속 테이블 우클릭 — 그룹에 추가 서브메뉴에서 그룹을 고르면 area/patch로 소속된다', async () => {
    const { payments, area } = await seedGroupedFixture()

    openTableMenu('결제')
    const addTo = await screen.findByRole('menuitem', { name: '그룹에 추가' })
    expect(addTo).not.toHaveAttribute('aria-disabled', 'true')

    // 서브메뉴 펼침(radix는 키보드 ArrowRight로 하위 메뉴를 연다) → 그룹 행 클릭 → 미소속 테이블만 소속된다
    fireEvent.keyDown(addTo, { key: 'ArrowRight' })
    const groupItem = await screen.findByRole('menuitem', { name: /회원 도메인/ }, { timeout: 2500 })
    fireEvent.click(groupItem)

    await waitFor(() => expect(useEditorStore.getState().present.diagram.areas[0].tableIds).toContain(payments.id))
    // 기존 멤버는 유지된다
    expect(useEditorStore.getState().present.diagram.areas[0].tableIds).toContain(area.tableIds[0])
  })

  it('전체 보기에서는 캔버스 메뉴에 돌아가기 항목이 없다', async () => {
    await seedGroupedFixture()

    fireEvent.contextMenu(document.querySelector('.react-flow') ?? document.body)
    expect(await screen.findByRole('menuitem', { name: '엔터티 생성' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '전체 화면으로 돌아가기' })).toBeNull()
  })

  it('그룹 보기 중 캔버스 우클릭 → 전체 화면으로 돌아가기 → 숨겨졌던 미소속 테이블이 돌아온다', async () => {
    const { area } = await seedGroupedFixture()

    // 렌더러는 익스플로러를 닫고 시작한다 — 패널을 열고 눈 아이콘 클릭 → 그룹 보기(멤버만 보인다).
    // (폴더 헤더 클릭은 목록 접기 — 보기 필터가 아니다)
    fireEvent.click(screen.getByRole('button', { name: '탐색기' }))
    fireEvent.click(await screen.findByTestId(`explorer-group-${area.id}-view`))
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node')).toHaveLength(1))

    fireEvent.contextMenu(document.querySelector('.react-flow') ?? document.body)
    fireEvent.click(await screen.findByRole('menuitem', { name: '전체 화면으로 돌아가기' }))

    // 전체 복귀 — 미소속 payments 노드가 다시 그려진다
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node')).toHaveLength(2))
  })
})

/* ---------- 협업 3차: 실시간 편집·LWW·승계·리졸버·락 (v1.17) ---------- */

/** 커맨드 1건을 원격에서 흘려보낸다 — 채널 목은 options로 구독 콜백을 노출한다 */
function remoteCommand(change: ErdChange, actor = { userId: 'u9', name: '밥' }) {
  expect(collabMock.options?.onRemoteCommand).toBeTypeOf('function')
  act(() => collabMock.options?.onRemoteCommand?.(change, actor))
}

describe('EditorShell — 협업 3차 실시간 편집(v1.17)', () => {
  it('로컬 커밋 → sendCommands 발행 — 편집 경로는 협업을 모른다', async () => {
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    await waitFor(() => expect(collabMock.sendCommands).toHaveBeenCalled())
    const published = collabMock.sendCommands.mock.calls[0][0] as ErdChange[]
    expect(published).toEqual([
      expect.objectContaining({ type: 'table/create', table: expect.objectContaining({ physicalName: 'orders' }) }),
    ])
  })

  it('남의 커맨드는 present에 반영 — 다른 객체의 변경은 조용히(자동 병합)', async () => {
    await renderEditor()
    const table = createTable('orders')
    useEditorStore.getState().commit({ type: 'table/create', table, position: { x: 0, y: 0 } })
    useEditorStore.getState().commit({ type: 'table/patch', tableId: table.id, patch: { logicalName: '내 편집' } })
    toastMock.mockClear()

    // 밥이 자기 테이블을 만든다 — 내 dirty(orders)와 객체가 다르니 겹침 없다
    remoteCommand({ type: 'table/create', table: createTable('members'), position: { x: 20, y: 20 } })

    const state = useEditorStore.getState()
    expect(state.present.model.tables.map((t) => t.physicalName)).toEqual(['orders', 'members'])
    expect(state.present.model.tables[0].logicalName).toBe('내 편집') // 내 편집 보존
    expect(toastMock).not.toHaveBeenCalled() // 겹침 없음 — 알림 없는 자동 병합
  })

  it('LWW 충돌 → 알림 토스트 + "내 값 복원" — 복원은 새 커맨드로 재발행된다', async () => {
    await renderEditor()
    const table = createTable('orders')
    useEditorStore.getState().commit({ type: 'table/create', table, position: { x: 0, y: 0 } })
    useEditorStore.getState().commit({ type: 'table/patch', tableId: table.id, patch: { comment: '내 설명' } })
    toastMock.mockClear()

    // 같은 속성(comment)을 다른 값으로 — 늦은 쪽(원격)이 이긴다
    remoteCommand({ type: 'table/patch', tableId: table.id, patch: { comment: '밥의 설명' } })
    expect(useEditorStore.getState().present.model.tables[0].comment).toBe('밥의 설명')

    expect(toastMock).toHaveBeenCalledTimes(1)
    const [message, options] = toastMock.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
    expect(message).toContain('밥')
    expect(options.action.label).toBe('내 값 복원')

    // 복원 — 충돌 시점 내 값으로 commitAll(재발행 → 새 seq로 재승부)
    act(() => options.action.onClick())
    expect(useEditorStore.getState().present.model.tables[0].comment).toBe('내 설명')
    const republished = collabMock.sendCommands.mock.calls.at(-1)?.[0] as ErdChange[]
    expect(republished).toEqual([
      expect.objectContaining({ type: 'table/patch', patch: expect.objectContaining({ comment: '내 설명' }) }),
    ])
  })

  it('원격 saved 승계 — 받은 커맨드가 저장 내용을 덮으면 base만 조용히 옮긴다(dirty 유지)', async () => {
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    const dirtyDepth = useEditorStore.getState().past.length

    act(() => {
      collabMock.options?.onRemoteSaved?.({
        version: 7, savedBy: 'u9', savedByName: '밥', at: 'T', seq: 3, receivedSeq: 3,
      })
    })

    const state = useEditorStore.getState()
    expect(state.baseVersion).toBe(7) // 승계
    expect(state.past.length).toBe(dirtyDepth) // 되돌리지 않는다 — dirty 그대로
    expect(state.present.model.tables).toHaveLength(1)
    expect(screen.queryByText('버전 충돌')).toBeNull() // 리졸버·배너 없음
  })

  it('Viewer(readOnly) → 편집 잠금 + 1회 경고 토스트, 커맨드 발행도 끊긴다', async () => {
    collabMock.readOnly = true
    try {
      await renderEditor()

      await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith('현재 역할은 읽기 전용입니다 — 편집할 수 없습니다'))
      expect(toastMock.warning).toHaveBeenCalledTimes(1) // 역할 확정 시 1회만
      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

      useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
      await act(async () => {}) // 발행 effect flush
      expect(collabMock.sendCommands).not.toHaveBeenCalled()
    } finally {
      collabMock.readOnly = false
    }
  })

  it('409 → 충돌 리졸버 → 기본 선택(내 것 유지) 적용 후 저장 성공 → baseVersion 승계', async () => {
    const putBodies: Array<{ baseVersion: number; content: string }> = []
    let putCount = 0
    server.use(
      http.put('/api/v1/core/workspaces/101/models/501/content', async ({ request }) => {
        putCount += 1
        if (putCount === 1) return fail('VERSION_CONFLICT', 409)
        const body = (await request.json()) as { baseVersion: number; content: string }
        putBodies.push(body)
        return HttpResponse.json(ok({ response: { version: 4, updatedAt: 'T' } }))
      }),
    )
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })

    const save = screen.getByRole('button', { name: '저장' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    // 리졸버 — 서버(빈 문서)가 내 테이블을 지우는 변경 1건, 내 dirty와 겹쳐 기본 '내 것 유지'
    const resolver = await screen.findByRole('dialog')
    expect(within(resolver).getByText('버전 충돌')).toBeVisible()
    expect(resolver.textContent).toContain('충돌 1 · 자동 병합 0') // counts는 autoNote와 한 문단
    fireEvent.click(within(resolver).getByRole('button', { name: '선택 적용 후 저장' }))

    await waitFor(() => expect(useEditorStore.getState().baseVersion).toBe(4))
    expect(useEditorStore.getState().present.model.tables).toHaveLength(1) // 병합본 = 내 테이블 유지
    expect(putBodies).toHaveLength(1)
    expect(putBodies[0].baseVersion).toBe(3) // 서버 버전을 base로 다시 저장
    expect(JSON.parse(putBodies[0].content).model.tables).toHaveLength(1)
    expect(screen.queryByText('버전 충돌')).toBeNull() // 해소 완료 — 다이얼로그 닫힘
  })

  it('409 + 서버 본문이 내 문서와 같으면(동시 동일 저장) 리졸버 없이 base만 승계', async () => {
    server.use(
      http.put('/api/v1/core/workspaces/101/models/501/content', () => fail('VERSION_CONFLICT', 409)),
    )
    await renderEditor()
    useEditorStore.getState().commit({ type: 'table/create', table: createTable('orders'), position: { x: 0, y: 0 } })
    const { present } = useEditorStore.getState()
    const identical = serializeContent({ schemaVersion: 1, model: present.model, diagram: present.diagram })
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501', () =>
        HttpResponse.json(ok({ response: modelFixture({ content: identical, version: 4 }) })),
      ),
    )

    const save = screen.getByRole('button', { name: '저장' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    await waitFor(() => expect(useEditorStore.getState().baseVersion).toBe(4))
    const state = useEditorStore.getState()
    expect(state.past.length).toBe(state.savedDepth) // 깨끗 — dirty 없음
    expect(screen.queryByText('버전 충돌')).toBeNull()
  })

  it('락 배선 — 메모 편집 다이얼로그 오픈 → acquireLock, 닫으면 releaseLock', async () => {
    await renderEditor()
    fireEvent.contextMenu(document.querySelector('.react-flow') ?? document.body)
    fireEvent.click(await screen.findByText('메모 생성'))
    await waitFor(() => expect(useEditorStore.getState().present.diagram.notes).toHaveLength(1))
    const noteId = useEditorStore.getState().present.diagram.notes[0].id

    fireEvent.doubleClick(screen.getByTitle('드래그로 이동 · 두 번 클릭해 편집'))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(collabMock.acquireLock).toHaveBeenCalledWith('note', noteId))

    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(collabMock.releaseLock).toHaveBeenCalledWith('note', noteId))
  })

  it('남의 락 → 다이얼로그 진입 차단 안내 + 저장 disabled', async () => {
    asAuthenticated() // me 픽스처 userId '2' — 락 보유자 u9와 다르다
    await renderEditor()
    fireEvent.contextMenu(document.querySelector('.react-flow') ?? document.body)
    fireEvent.click(await screen.findByText('메모 생성'))
    await waitFor(() => expect(useEditorStore.getState().present.diagram.notes).toHaveLength(1))
    const noteId = useEditorStore.getState().present.diagram.notes[0].id

    // 새 배열 참조로 갈아끼운 뒤 EditorShell을 다시 그린다(탐색기 토글) — locks 브리지 effect가
    // 새 스냅샷을 스토어에 반영한다. 다이얼로그 오픈만으로는 ErdCanvas 지역 상태라 셸이 안 그려진다
    collabMock.locks = [{ targetType: 'note', targetId: noteId, userId: 'u9', userName: '밥', acquiredAt: 'T' }]
    fireEvent.click(screen.getByRole('button', { name: '탐색기' }))
    fireEvent.doubleClick(screen.getByTitle('드래그로 이동 · 두 번 클릭해 편집'))
    const dialog = await screen.findByRole('dialog')

    const notice = await within(dialog).findByTestId('edit-lock-notice')
    expect(notice.textContent).toContain('밥')
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeDisabled()
  })
})
