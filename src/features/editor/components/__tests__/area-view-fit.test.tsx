/**
 * 그룹 보기 진입 맞춤(useAreaViewFit) — 다른 그룹에서 곧바로 전환해도 화면이 그 그룹에
 * 맞는다 (05-editor/02-ui.md §3·§6, 2026-09-23 실사용 회귀)
 *
 * 회귀 원인: fitView({nodes})는 호출 시점 렌더 노드만 검색하는데, A 보기 중 B 눈 아이콘을
 * 누르면 그 시점 캔버스엔 A 멤버만 있어 B 멤버를 못 찾고 조용히 무시됐다. 스토어 좌표로
 * 뷰포트를 계산해 setViewport 하는 지금 구현은 노드 렌더 타이밍과 무관하다 — 이 검증을
 * 위해 useReactFlow만 스파이로 갈아끼운다(나머지 @xyflow/react는 실물).
 */
import { ReactFlowProvider } from '@xyflow/react'
import type * as XyflowModule from '@xyflow/react'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorToolbar } from '@/features/editor/components/EditorToolbar'
import { ModelExplorerPanel } from '@/features/editor/components/ModelExplorerPanel'
import { createArea, createColumn, createTable, type ErdChange } from '@/features/editor/model/changes'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { emptyContent } from '@/features/editor/model/content-io'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

const rfSpies = vi.hoisted(() => ({
  setViewport: vi.fn(),
  getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  fitView: vi.fn(() => Promise.resolve(true)),
  getNodes: vi.fn(() => []),
}))
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof XyflowModule>()
  return { ...actual, useReactFlow: () => rfSpies }
})

/** 두 그룹(A·B)이 화면 좌표로 충분히 떨어진 문서 — 어느 그룹 중심으로 갔는지 역투영로 가린다 */
function twoAreaDoc(): EditorDocument {
  const mk = (id: string, name: string, x: number, y: number): ErdChange => {
    const table = createTable(name, {
      id,
      columns: [createColumn({ id: `${id}-c1`, physicalName: 'id', nullable: false })],
      primaryKey: { name: `pk_${id}`, columnIds: [`${id}-c1`] },
    })
    return { type: 'table/create', table, position: { x, y } }
  }
  useEditorStore.getState().hydrate({ modelId: '901', baseVersion: 0, document: emptyContent() })
  useEditorStore.getState().commitAll([
    mk('A1', 'alpha', 0, 0),
    mk('A2', 'alpha_two', 0, 600),
    mk('B1', 'beta', 5000, 2000),
    mk('B2', 'beta_two', 5400, 2000),
    { type: 'area/create', area: createArea('그룹A', { id: 'area-1', tableIds: ['A1', 'A2'] }) },
    { type: 'area/create', area: createArea('그룹B', { id: 'area-2', tableIds: ['B1', 'B2'] }) },
  ])
  return useEditorStore.getState().present
}

/** setViewport 인자를 화면 중심의 플로우 좌표로 역투영 — jsdom이라 .react-flow가 없어
 *  window 크기(1024×768) 폴백으로 계산된다 */
const flowCenter = () => {
  expect(rfSpies.setViewport).toHaveBeenCalled()
  const vp = rfSpies.setViewport.mock.calls[rfSpies.setViewport.mock.calls.length - 1][0] as {
    x: number
    y: number
    zoom: number
  }
  const size = { width: window.innerWidth || 1200, height: window.innerHeight || 800 }
  return { x: (size.width / 2 - vp.x) / vp.zoom, y: (size.height / 2 - vp.y) / vp.zoom, zoom: vp.zoom }
}

beforeEach(() => {
  twoAreaDoc()
  rfSpies.setViewport.mockClear()
  rfSpies.fitView.mockClear()
})
afterEach(() => {
  resetEditorStore()
  resetSessionState()
})

describe('useAreaViewFit — 익스플로러 눈 아이콘', () => {
  const renderPanel = (activeAreaId: string | null, onActiveAreaChange = vi.fn()) =>
    renderWithProviders(
      <ReactFlowProvider>
        <ModelExplorerPanel
          open
          focusSearchSignal={0}
          nameDisplay="both"
          activeAreaId={activeAreaId}
          onActiveAreaChange={onActiveAreaChange}
          canEdit
          onOpenAreaEdit={() => {}}
        />
      </ReactFlowProvider>,
      { wrapRoutes: false },
    )

  it('다른 그룹에서 곧바로 전환해도 새 그룹 중심에 화면을 맞춘다(회귀 — fitView는 무시됐다)', () => {
    const onActiveAreaChange = vi.fn()
    renderPanel('area-1', onActiveAreaChange)

    fireEvent.click(screen.getByTestId('explorer-group-area-2-view'))

    expect(onActiveAreaChange).toHaveBeenLastCalledWith('area-2')
    // 스토어 좌표 계산 + setViewport — 렌더를 기다리는 fitView가 아니다
    expect(rfSpies.setViewport).toHaveBeenCalledTimes(1)
    expect(rfSpies.fitView).not.toHaveBeenCalled()
    const center = flowCenter()
    expect(center.x).toBeGreaterThan(4800) // 그룹 B(≈5000..5700) 쪽
    expect(center.x).toBeLessThan(6000)
    expect(center.y).toBeGreaterThan(1900)
    expect(center.y).toBeLessThan(3100)
  })

  it('전체(null)에서 진입할 때도 같다 — 첫 진입 맞춤은 그대로', () => {
    renderPanel(null)

    fireEvent.click(screen.getByTestId('explorer-group-area-1-view'))

    expect(rfSpies.setViewport).toHaveBeenCalledTimes(1)
    const center = flowCenter()
    expect(center.x).toBeLessThan(500) // 그룹 A(0..수백) 쪽
    expect(center.y).toBeGreaterThan(0)
    expect(center.y).toBeLessThan(1200)
  })

  it('활성 그룹 재클릭은 해제다 — 뷰포트를 건드리지 않는다', () => {
    const onActiveAreaChange = vi.fn()
    renderPanel('area-1', onActiveAreaChange)

    fireEvent.click(screen.getByTestId('explorer-group-area-1-view'))

    expect(onActiveAreaChange).toHaveBeenLastCalledWith(null)
    expect(rfSpies.setViewport).not.toHaveBeenCalled()
  })
})

describe('useAreaViewFit — 보기 메뉴 라디오', () => {
  const renderToolbar = (onActiveAreaChange = vi.fn()) =>
    renderWithProviders(
      <ReactFlowProvider>
        <EditorToolbar
          canEdit
          saving={false}
          onSave={() => {}}
          explorerOpen
          onToggleExplorer={() => {}}
          nameDisplay="both"
          onNameDisplayChange={() => {}}
          columnDisplay="all"
          onColumnDisplayChange={() => {}}
          activeAreaId={null}
          onActiveAreaChange={onActiveAreaChange}
          dbmsId="mysql"
          modelName="m"
          databaseType="mysql"
          modelDescription={null}
          workspaceId="9"
          modelId="901"
          onOpenShortcuts={() => {}}
        />
      </ReactFlowProvider>,
      { wrapRoutes: false },
    )

  it('라디오로 그룹을 고르면 그 그룹에 화면을 맞춘다(눈 아이콘과 같은 규칙)', async () => {
    const onActiveAreaChange = vi.fn()
    renderToolbar(onActiveAreaChange)

    const trigger = screen.getByRole('button', { name: '보기' })
    fireEvent.pointerDown(trigger, { button: 0 })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '그룹B' }))

    expect(onActiveAreaChange).toHaveBeenLastCalledWith('area-2')
    expect(rfSpies.setViewport).toHaveBeenCalledTimes(1)
    const center = flowCenter()
    expect(center.x).toBeGreaterThan(4800)
    expect(center.x).toBeLessThan(6000)
  })
})
