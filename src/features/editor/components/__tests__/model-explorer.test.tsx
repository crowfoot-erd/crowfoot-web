/**
 * 모델 익스플로러 패널 — 트리 렌더·선택 양방향 동기화·검색 필터·nameMode 정합 (05-editor/02-ui.md §3·§11)
 *
 * 패널만 렌더해 스토어 상태로 검증한다(캔버스가 아니어도 동작 — 선택 원천이 스토어다).
 * EditorShell 통합(토글 버튼·Ctrl+F)은 editor-shell.test.tsx, 캔버스 조작과의 정합은 e2e가 담당.
 */
import { ReactFlowProvider } from '@xyflow/react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelExplorerPanel } from '@/features/editor/components/ModelExplorerPanel'
import { createArea, createColumn, createTable } from '@/features/editor/model/changes'
import type { ErdArea, EditorDocument } from '@/features/editor/model/content-schema'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

/** users(PK·NN·nullable 컬럼) + user_settings(FK 컬럼) + 관계 1 + 메모 1 */
function fixtureDoc(): EditorDocument {
  const users = createTable('users', {
    logicalName: '회원',
    columns: [
      createColumn({ id: 'col-id', physicalName: 'id', nullable: false }),
      createColumn({ id: 'col-email', physicalName: 'email', nullable: true }),
      createColumn({ id: 'col-name', physicalName: 'name', nullable: false }),
    ],
    primaryKey: { name: 'pk_users', columnIds: ['col-id'] },
  })
  const settings = createTable('user_settings', {
    logicalName: '설정',
    columns: [
      createColumn({ id: 'col-set-id', physicalName: 'id', nullable: false }),
      createColumn({ id: 'col-set-user', physicalName: 'user_id', nullable: false }),
    ],
    primaryKey: { name: 'pk_user_settings', columnIds: ['col-set-id'] },
  })
  return {
    model: {
      tables: [users, settings],
      relationships: [
        {
          id: 'rel-1',
          name: 'fk_user_settings_users',
          fkName: 'settings_user_fk',
          parentTableId: users.id,
          childTableId: settings.id,
          type: 'ONE_TO_MANY',
          identifying: false,
          parentMultiplicity: 'EXACTLY_ONE',
          childMultiplicity: 'ZERO_OR_MORE',
          columnMappings: [{ parentColumnId: 'col-id', childColumnId: 'col-set-user' }],
          onDelete: 'NO_ACTION',
          onUpdate: 'NO_ACTION',
        },
      ],
    },
    diagram: {
      nodes: {
        [users.id]: { x: 0, y: 0, width: null, color: 'default' },
        [settings.id]: { x: 400, y: 0, width: null, color: 'default' },
      },
      notes: [{ id: 'note-1', x: 0, y: 400, width: 200, text: '내용', title: '정책', color: 'yellow', linkedTableId: null }],
      areas: [],
      viewport: null,
    },
  }
}

function hydrate(doc: EditorDocument = fixtureDoc()) {
  useEditorStore.getState().hydrate({ modelId: '501', baseVersion: 0, document: doc })
  return doc
}

function renderPanel(nameDisplay: 'logical' | 'physical' | 'both' = 'both', open = true) {
  return renderWithProviders(
    <ReactFlowProvider>
      <ModelExplorerPanel
        open={open}
        focusSearchSignal={0}
        nameDisplay={nameDisplay}
        activeAreaId={null}
        onActiveAreaChange={() => {}}
        canEdit
        onOpenAreaEdit={() => {}}
      />
    </ReactFlowProvider>,
    { wrapRoutes: false },
  )
}

const tableRow = (id: string) => document.getElementById(`explorer-table-${id}`) as HTMLElement

/** 클래스 토큰 포함 검사 — 'bg-accent'가 'hover:bg-accent/60'에 오탐되지 않게 */
const hasClass = (el: HTMLElement, token: string) => el.className.split(/\s+/).includes(token)

afterEach(() => {
  resetEditorStore()
  resetSessionState()
})

describe('ModelExplorerPanel — 트리 렌더', () => {
  it('테이블/관계/메모 3그룹과 개수를 표시한다', () => {
    const doc = hydrate()
    renderPanel()

    expect(screen.getByRole('button', { name: /^테이블/ })).toHaveTextContent('(2)')
    expect(screen.getByRole('button', { name: /^관계/ })).toHaveTextContent('(1)')
    expect(screen.getByRole('button', { name: /^메모/ })).toHaveTextContent('(1)')
    expect(tableRow(doc.model.tables[0].id).textContent).toContain('users')
  })

  it('기본 접힌 테이블 — 펼치면 컬럼 자식과 PK/FK/NN 배지가 나온다', () => {
    const doc = hydrate()
    renderPanel()

    const users = doc.model.tables[0]
    expect(screen.queryByText('email')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'users' })) // 펼침 토글(셰브론)

    const usersRow = tableRow(users.id)
    expect(within(usersRow.parentElement as HTMLElement).getByText('email')).toBeInTheDocument()
    const pkColumn = document.getElementById(`explorer-column-${users.id}-col-id`) as HTMLElement
    expect(within(pkColumn).getByText('PK')).toBeInTheDocument() // PK는 NN 배지를 대신한다
    const nnColumn = document.getElementById(`explorer-column-${users.id}-col-name`) as HTMLElement
    expect(within(nnColumn).getByText('NN')).toBeInTheDocument()
    expect(within(nnColumn).queryByText('PK')).not.toBeInTheDocument()

    const settings = doc.model.tables[1]
    fireEvent.click(screen.getByRole('button', { name: 'user_settings' }))
    const fkColumn = document.getElementById(`explorer-column-${settings.id}-col-set-user`) as HTMLElement
    expect(within(fkColumn).getByText('FK')).toBeInTheDocument()
  })

  it('관계 행은 자식 → 부모 물리명으로 표시한다', () => {
    hydrate()
    renderPanel()
    const relRow = document.getElementById('explorer-rel-rel-1') as HTMLElement
    expect(relRow.textContent).toContain('user_settings → users')
  })

  it('그룹 헤더 접기 — 관계 그룹을 접으면 행이 사라진다', () => {
    hydrate()
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /^관계/ }))
    expect(document.getElementById('explorer-rel-rel-1')).not.toBeInTheDocument()
  })

  it('open=false면 렌더하지 않는다', () => {
    hydrate()
    renderPanel('both', false)
    expect(screen.queryByTestId('model-explorer')).not.toBeInTheDocument()
  })

  it('빈 문서면 안내 문구', () => {
    hydrate({ model: { tables: [], relationships: [] }, diagram: { nodes: {}, notes: [], areas: [], viewport: null } })
    renderPanel()
    expect(screen.getByText('문서가 비어 있습니다')).toBeInTheDocument()
  })
})

describe('ModelExplorerPanel — 선택 양방향 동기화', () => {
  it('행 클릭 → 스토어 selectedIds 반영(컬럼 행은 부모 테이블로)', () => {
    const doc = hydrate()
    renderPanel()

    fireEvent.click(tableRow(doc.model.tables[0].id))
    expect(useEditorStore.getState().selectedIds).toEqual([doc.model.tables[0].id])

    fireEvent.click(document.getElementById('explorer-note-note-1') as HTMLElement)
    expect(useEditorStore.getState().selectedIds).toEqual(['note-1'])

    fireEvent.click(screen.getByRole('button', { name: 'user_settings' })) // 펼침
    fireEvent.click(document.getElementById(`explorer-column-${doc.model.tables[1].id}-col-set-user`) as HTMLElement)
    expect(useEditorStore.getState().selectedIds).toEqual([doc.model.tables[1].id]) // 컬럼 히트는 부모 위임
  })

  it('스토어 선택(캔버스 클릭) → 해당 행 하이라이트', () => {
    const doc = hydrate()
    renderPanel()

    act(() => {
      useEditorStore.getState().setSelection([doc.model.tables[1].id])
    })
    expect(hasClass(tableRow(doc.model.tables[1].id), 'bg-accent')).toBe(true)
    expect(hasClass(tableRow(doc.model.tables[0].id), 'bg-accent')).toBe(false)
  })
})

describe('ModelExplorerPanel — 검색', () => {
  it('입력 즉시 필터 + 테이블 자동 펼침 + 일치 구간 하이라이트', () => {
    const doc = hydrate()
    renderPanel()

    // 'user_id'는 user_settings의 컬럼에만 걸린다(테이블 물리명 user_settings와는 다르다)
    fireEvent.change(screen.getByLabelText('객체 검색'), { target: { value: 'user_id' } })

    expect(tableRow(doc.model.tables[0].id)).not.toBeInTheDocument()
    const settings = doc.model.tables[1]
    const matched = document.getElementById(`explorer-column-${settings.id}-col-set-user`) as HTMLElement
    expect(matched).toBeInTheDocument() // 자동 펼침 + 일치 컬럼만 노출
    expect(document.getElementById(`explorer-column-${settings.id}-col-set-id`)).not.toBeInTheDocument()
    expect(matched.querySelector('mark')?.textContent).toBe('user_id')
    expect(screen.getByTestId('explorer-match-count')).toHaveTextContent('1건')
    // 관계·메모는 걸리지 않아 그룹이 0개가 된다
    expect(screen.getByRole('button', { name: /^관계/ })).toHaveTextContent('(0)')
  })

  it('일치 없음 안내', () => {
    hydrate()
    renderPanel()
    fireEvent.change(screen.getByLabelText('객체 검색'), { target: { value: 'zzz' } })
    expect(screen.getByTestId('explorer-no-results')).toHaveTextContent('일치하는 객체가 없습니다')
  })

  it('Enter로 일치 항목을 순회하며 선택한다 — 끝에서 처음으로 되돌아간다', () => {
    const doc = hydrate()
    renderPanel()

    // 'user'는 users·user_settings 테이블, user_id 컬럼, 관계명 fk_user_settings_users에 걸린다(4히트)
    const input = screen.getByLabelText('객체 검색')
    fireEvent.change(input, { target: { value: 'user' } })
    expect(screen.getByTestId('explorer-match-count')).toHaveTextContent('4건')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useEditorStore.getState().selectedIds).toEqual([doc.model.tables[0].id])
    expect(hasClass(tableRow(doc.model.tables[0].id), 'ring-1')).toBe(true)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useEditorStore.getState().selectedIds).toEqual([doc.model.tables[1].id])

    fireEvent.keyDown(input, { key: 'Enter' }) // 컬럼 히트 — 선택은 부모 테이블로 위임
    expect(useEditorStore.getState().selectedIds).toEqual([doc.model.tables[1].id])
    const activeColumn = document.getElementById(
      `explorer-column-${doc.model.tables[1].id}-col-set-user`,
    ) as HTMLElement
    expect(hasClass(activeColumn, 'ring-1')).toBe(true)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useEditorStore.getState().selectedIds).toEqual(['rel-1'])

    fireEvent.keyDown(input, { key: 'Enter' }) // 처음으로 되돌아감
    expect(useEditorStore.getState().selectedIds).toEqual([doc.model.tables[0].id])

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true }) // Shift+Enter 역순회
    expect(useEditorStore.getState().selectedIds).toEqual(['rel-1'])
  })

  it('focusSearchSignal이 바뀌면 검색 입력에 포커스(Ctrl+F 배선)', () => {
    hydrate()
    const { rerender } = render(
      <ReactFlowProvider>
        <ModelExplorerPanel open focusSearchSignal={0} nameDisplay="both" activeAreaId={null} onActiveAreaChange={() => {}} canEdit onOpenAreaEdit={() => {}} />
      </ReactFlowProvider>,
    )
    expect(document.activeElement).not.toBe(screen.getByLabelText('객체 검색'))

    rerender(
      <ReactFlowProvider>
        <ModelExplorerPanel open focusSearchSignal={1} nameDisplay="both" activeAreaId={null} onActiveAreaChange={() => {}} canEdit onOpenAreaEdit={() => {}} />
      </ReactFlowProvider>,
    )
    expect(document.activeElement).toBe(screen.getByLabelText('객체 검색'))
  })
})

describe('ModelExplorerPanel — nameMode 정합', () => {
  it('logical은 논리명만, physical은 물리명만 표시한다', () => {
    const doc = hydrate()
    const { rerender } = renderPanel('logical')

    let row = tableRow(doc.model.tables[0].id)
    expect(row.textContent).toContain('회원')
    expect(row.textContent).not.toContain('users')

    rerender(
      <ReactFlowProvider>
        <ModelExplorerPanel open focusSearchSignal={0} nameDisplay="physical" activeAreaId={null} onActiveAreaChange={() => {}} canEdit onOpenAreaEdit={() => {}} />
      </ReactFlowProvider>,
    )
    row = tableRow(doc.model.tables[0].id)
    expect(row.textContent).toContain('users')
    expect(row.textContent).not.toContain('회원')
  })
})

describe('ModelExplorerPanel — 그룹 폴더 트리 (v1.13)', () => {
  /** 회원 도메인 그룹 1개 — memberIds는 시딩될 문서의 테이블 id에서 뽑는다(랜덤 id 주의) */
  function hydrateWithArea(init: Partial<ErdArea> = {}, members: 'first' | 'all' = 'first') {
    const doc = fixtureDoc()
    doc.diagram.areas = [
      createArea('회원 도메인', {
        id: 'area-1',
        tableIds: members === 'all' ? doc.model.tables.map((table) => table.id) : [doc.model.tables[0].id],
        ...init,
      }),
    ]
    hydrate(doc)
    return doc
  }

  function renderPanelWithArea(
    activeAreaId: string | null,
    onActiveAreaChange: (id: string | null) => void = () => {},
    canEdit = true,
    onOpenAreaEdit: (id: string) => void = () => {},
  ) {
    return renderWithProviders(
      <ReactFlowProvider>
        <ModelExplorerPanel
          open
          focusSearchSignal={0}
          nameDisplay="both"
          activeAreaId={activeAreaId}
          onActiveAreaChange={onActiveAreaChange}
          canEdit={canEdit}
          onOpenAreaEdit={onOpenAreaEdit}
        />
      </ReactFlowProvider>,
      { wrapRoutes: false },
    )
  }

  it('그룹이 없으면 폴더 없이 평면 목록이다', () => {
    const doc = hydrate()
    renderPanelWithArea(null)
    expect(screen.queryByTestId('explorer-group-ungrouped')).not.toBeInTheDocument()
    expect(tableRow(doc.model.tables[0].id)).toBeInTheDocument()
  })

  it('그룹 폴더 + 미분류 — 멤버는 그룹 아래, 비소속은 미분류 아래 렌더', () => {
    const doc = hydrateWithArea() // members: users
    renderPanelWithArea(null)

    expect(screen.getByTestId('explorer-group-area-1')).toHaveTextContent('회원 도메인')
    expect(screen.getByTestId('explorer-group-area-1')).toHaveTextContent('1') // 멤버 수
    expect(tableRow(doc.model.tables[0].id)).toBeInTheDocument() // users — 그룹 폴더 안
    // user_settings는 어느 그룹에도 속하지 않아 미분류 아래 — 그룹 폴더 아래에는 없다
    expect(screen.getByTestId('explorer-group-ungrouped')).toHaveTextContent('미분류')
    expect(document.getElementById(`explorer-table-${doc.model.tables[1].id}`)).toBeInTheDocument()
  })

  it('눈 아이콘은 보기 필터다 — 진입(area-1)은 눌림 없는 상태에서, 접힘과 독립', () => {
    hydrateWithArea()
    const onActiveAreaChange = vi.fn()
    renderPanelWithArea(null, onActiveAreaChange)

    const view = screen.getByTestId('explorer-group-area-1-view')
    expect(view).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(view)
    expect(onActiveAreaChange).toHaveBeenLastCalledWith('area-1')

    // 헤더 접기와 보기 필터는 독립이다 — 접힌 폴더에서도 눈으로 그룹에 들어온다
    fireEvent.click(screen.getByTestId('explorer-group-area-1'))
    expect(onActiveAreaChange).toHaveBeenCalledTimes(1) // 접기는 필터를 건드리지 않는다
    fireEvent.click(view)
    expect(onActiveAreaChange).toHaveBeenCalledTimes(2)
    expect(onActiveAreaChange).toHaveBeenLastCalledWith('area-1')
  })

  it('활성 그룹의 눈 아이콘은 눌림 상태다 — 재클릭하면 전체(null)로 돌아간다', () => {
    hydrateWithArea()
    const onActiveAreaChange = vi.fn()
    renderPanelWithArea('area-1', onActiveAreaChange)

    const view = screen.getByTestId('explorer-group-area-1-view')
    expect(view).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(view)
    expect(onActiveAreaChange).toHaveBeenLastCalledWith(null)
  })

  it('폴더 필터 — 그 그룹 멤버만 목록에 남는다, 관계는 양끽 모두 그룹 안일 때만', () => {
    const doc = hydrateWithArea() // members: users
    renderPanelWithArea('area-1')

    expect(tableRow(doc.model.tables[0].id)).toBeInTheDocument() // users
    expect(document.getElementById(`explorer-table-${doc.model.tables[1].id}`)).not.toBeInTheDocument() // user_settings(미분류)
    // 관계는 한쪽끝(user_settings)이 그룹 밖 — 목록에서 빠진다
    expect(document.getElementById('explorer-rel-rel-1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^관계/ })).toHaveTextContent('(0)')
    // 메모는 그룹 밖 객체라 폴더 필터의 대상이 아니다
    expect(screen.getByRole('button', { name: /^메모/ })).toHaveTextContent('(1)')
  })

  it('폴더 헤더 클릭·셰브론은 목록 접기다 — 멤버 행을 접고 문서는 고치지 않는다', () => {
    const doc = hydrateWithArea() // members: users
    renderPanelWithArea(null)

    const folder = screen.getByTestId('explorer-group-area-1')
    expect(folder).toHaveAttribute('aria-expanded', 'true')
    expect(tableRow(doc.model.tables[0].id)).toBeInTheDocument()

    fireEvent.click(folder)
    expect(screen.getByTestId('explorer-group-area-1')).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(`explorer-table-${doc.model.tables[0].id}`)).not.toBeInTheDocument()
    // 문서 접기 폐지(v1.13 피드백) — 접힘은 패널의 보기 상태라 커밋이 없다
    expect(useEditorStore.getState().past).toHaveLength(0)

    fireEvent.click(screen.getByTestId('explorer-group-area-1')) // 재클릭 — 다시 펼침
    expect(tableRow(doc.model.tables[0].id)).toBeInTheDocument()
  })

  it('미분류 폴더도 목록 접기가 된다 — 눈 아이콘은 없다(그룹이 아니라 전체 보기)', () => {
    const doc = hydrateWithArea()
    renderPanelWithArea(null)

    expect(screen.queryByTestId('explorer-group-ungrouped-view')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('explorer-group-ungrouped'))
    expect(screen.getByTestId('explorer-group-ungrouped')).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(`explorer-table-${doc.model.tables[1].id}`)).not.toBeInTheDocument()
  })

  it('폴더 편집(✎)·삭제(🗑) — 편집은 다이얼로그 오픈, 삭제는 area/remove 커밋', () => {
    hydrateWithArea()
    const onOpenAreaEdit = vi.fn()
    renderPanelWithArea(null, () => {}, true, onOpenAreaEdit)

    fireEvent.click(screen.getByTestId('explorer-group-area-1-edit'))
    expect(onOpenAreaEdit).toHaveBeenCalledWith('area-1')

    fireEvent.click(screen.getByTestId('explorer-group-area-1-remove'))
    expect(useEditorStore.getState().present.diagram.areas).toHaveLength(0) // 그룹만 사라진다
  })

  it('읽기 전용에서는 편집·삭제 버튼이 없다 — 접기·보기는 가능하다(보기 상태라 문서를 안 고친다)', () => {
    hydrateWithArea()
    renderPanelWithArea(null, () => {}, false)

    expect(screen.queryByTestId('explorer-group-area-1-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('explorer-group-area-1-remove')).not.toBeInTheDocument()
    expect(screen.getByTestId('explorer-group-area-1-view')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('explorer-group-area-1')) // 접기는 패널 로컬 — 가능
    expect(screen.getByTestId('explorer-group-area-1')).toHaveAttribute('aria-expanded', 'false')
  })

})
