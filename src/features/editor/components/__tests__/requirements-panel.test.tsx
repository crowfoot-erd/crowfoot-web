/**
 * 요구사항 패널 — 묶음, 판정 배지와 필터, 펼치기, 편집, 읽기 전용 (05-editor/02-ui.md §17)
 */
import { ReactFlowProvider } from '@xyflow/react'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RequirementsPanel, descriptionLines } from '@/features/editor/components/RequirementsPanel'
import { createColumn, createTable } from '@/features/editor/model/changes'
import type { EditorDocument, ErdRequirement } from '@/features/editor/model/content-schema'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { useRequirementsPanel } from '@/features/editor/store/requirements-panel-store'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

const requirement = (overrides: Partial<ErdRequirement>): ErdRequirement => ({
  id: 'r1',
  code: 'REQ-001',
  areaId: null,
  scope: 'tables',
  title: '',
  description: '',
  status: 'draft',
  revision: 1,
  appliedRevision: 0,
  tableIds: [],
  ...overrides,
})

function fixture(): EditorDocument {
  return {
    model: {
      tables: [
        createTable('users', { id: 't-users', columns: [createColumn({ id: 'c1', physicalName: 'id' })] }),
        createTable('orders', { id: 't-orders', columns: [createColumn({ id: 'c2', physicalName: 'id' })] }),
        createTable('audit_logs', { id: 't-audit', columns: [createColumn({ id: 'c3', physicalName: 'id' })] }),
      ],
      relationships: [],
    },
    diagram: {
      nodes: {
        't-users': { x: 0, y: 0, width: null, color: 'default' },
        't-orders': { x: 500, y: 0, width: null, color: 'default' },
        't-audit': { x: 1000, y: 0, width: null, color: 'default' },
      },
      notes: [],
      areas: [
        { id: 'a-member', name: '회원', description: '', color: 'blue', tableIds: ['t-users'] },
        { id: 'a-order', name: '주문', description: '', color: 'green', tableIds: ['t-orders'] },
      ],
      requirements: [
        requirement({ id: 'r1', code: 'REQ-001', areaId: 'a-member', title: '이메일로 가입한다', description: '이메일은 중복될 수 없다', status: 'confirmed', revision: 1, appliedRevision: 1, tableIds: ['t-users'] }),
        requirement({ id: 'r2', code: 'REQ-002', areaId: 'a-order', title: '주문을 만든다', status: 'confirmed', revision: 2, appliedRevision: 1, tableIds: ['t-orders', 't-users'] }),
        requirement({ id: 'r3', code: 'REQ-003', title: '쿠폰을 쓴다', status: 'draft' }),
        requirement({ id: 'r4', code: 'REQ-004', scope: 'document', title: '모든 테이블에 생성 시각을 둔다', status: 'confirmed' }),
        requirement({ id: 'r5', code: 'REQ-005', areaId: 'a-order', title: '선물하기', status: 'dropped' }),
      ],
      viewport: null,
    },
  }
}

function renderPanel(canEdit = true) {
  useEditorStore.getState().hydrate({ modelId: '501', baseVersion: 0, document: fixture(), databaseType: 'mysql' })
  useRequirementsPanel.setState({ open: true, focusId: null })
  return renderWithProviders(
    <ReactFlowProvider>
      <RequirementsPanel canEdit={canEdit} />
    </ReactFlowProvider>,
    { wrapRoutes: false },
  )
}

const requirements = () => useEditorStore.getState().present.diagram.requirements

afterEach(() => {
  useRequirementsPanel.setState({ open: false, focusId: null })
  resetEditorStore()
  resetSessionState()
})

describe('RequirementsPanel', () => {
  it('닫혀 있으면 그리지 않는다', () => {
    useRequirementsPanel.setState({ open: false, focusId: null })
    renderWithProviders(
      <ReactFlowProvider>
        <RequirementsPanel canEdit />
      </ReactFlowProvider>,
      { wrapRoutes: false },
    )
    expect(screen.queryByTestId('requirements-panel')).toBeNull()
  })

  it('도메인별로 묶고 미분류와 공통이 뒤에 온다 — 제외는 기본으로 숨긴다', () => {
    renderPanel()
    const groups = screen.getAllByTestId('requirement-group')
    expect(groups.map((group) => group.querySelector('p')?.textContent)).toEqual(['회원1', '주문1', '미분류1', '공통1'])
    expect(screen.queryByText('선물하기')).toBeNull()

    const states = screen.getAllByTestId('requirement-row').map((row) => row.getAttribute('data-state'))
    expect(states).toEqual(['APPLIED', 'PENDING', 'DRAFT', 'APPLIED'])
  })

  it('필터 칩으로 판정을 걸러 본다', () => {
    renderPanel()
    expect(screen.getByTestId('requirement-filter-PENDING')).toHaveTextContent('반영 대기 1')

    fireEvent.click(screen.getByTestId('requirement-filter-DROPPED'))
    expect(screen.getByText('선물하기')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('requirement-filter-APPLIED'))
    expect(screen.queryByText('이메일로 가입한다')).toBeNull()
  })

  it('행을 펼치면 내용과 연결된 테이블이 나오고, 다른 도메인의 테이블에는 그룹 이름이 붙는다', () => {
    renderPanel()
    fireEvent.click(screen.getByText('주문을 만든다'))
    const detail = screen.getByTestId('requirement-detail')
    const tables = within(detail).getAllByTestId('requirement-table')
    expect(tables.map((table) => table.textContent)).toEqual(['orders', 'users회원'])

    fireEvent.click(tables[1])
    expect(useEditorStore.getState().selectedIds).toEqual(['t-users'])
    // 테이블을 보여 주려고 ERD 탭으로 돌아간다
    expect(useRequirementsPanel.getState().open).toBe(false)
  })

  it('반영 대기 행의 "반영함으로 표시"는 appliedRevision을 revision에 맞춘다', () => {
    renderPanel()
    fireEvent.click(screen.getByText('주문을 만든다'))
    fireEvent.click(screen.getByTestId('requirement-mark-applied'))
    expect(requirements().find((r) => r.id === 'r2')).toMatchObject({ revision: 2, appliedRevision: 2 })
    expect(screen.queryByTestId('requirement-mark-applied')).toBeNull()
  })

  it('근거 없는 테이블을 따로 보여 준다', () => {
    renderPanel()
    expect(within(screen.getByTestId('requirements-untraced')).getByRole('button')).toHaveTextContent('audit_logs')
  })

  it('추가 — 코드는 자동으로 붙고 제목은 필수다', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('requirement-add'))
    const dialog = screen.getByTestId('requirement-dialog')
    expect(dialog).toHaveTextContent('REQ-006')

    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    expect(within(dialog).getByText('제목을 입력하세요')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('제목'), { target: { value: '환불한다' } })
    fireEvent.change(within(dialog).getByLabelText('도메인(그룹)'), { target: { value: 'a-order' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '확정' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'orders' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(requirements().at(-1)).toMatchObject({
      code: 'REQ-006',
      title: '환불한다',
      areaId: 'a-order',
      scope: 'tables',
      status: 'confirmed',
      revision: 1,
      appliedRevision: 0,
      tableIds: ['t-orders'],
    })
  })

  it('수정 — 제목을 고치면 개정 번호가 올라 반영 대기가 되고, 되돌리기 한 번으로 돌아간다', () => {
    renderPanel()
    fireEvent.click(screen.getByText('이메일로 가입한다'))
    fireEvent.click(screen.getByTestId('requirement-edit'))
    const dialog = screen.getByTestId('requirement-dialog')
    fireEvent.change(within(dialog).getByLabelText('제목'), { target: { value: '이메일이나 전화번호로 가입한다' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(requirements().find((r) => r.id === 'r1')).toMatchObject({ title: '이메일이나 전화번호로 가입한다', revision: 2, appliedRevision: 1 })
    expect(screen.getAllByTestId('requirement-row')[0]).toHaveAttribute('data-state', 'PENDING')

    useEditorStore.getState().undo()
    expect(requirements().find((r) => r.id === 'r1')).toMatchObject({ title: '이메일로 가입한다', revision: 1 })
  })

  it('공통으로 바꾸면 도메인과 테이블 연결이 비워진다', () => {
    renderPanel()
    fireEvent.click(screen.getByText('주문을 만든다'))
    fireEvent.click(screen.getByTestId('requirement-edit'))
    const dialog = screen.getByTestId('requirement-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '공통' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    expect(requirements().find((r) => r.id === 'r2')).toMatchObject({ scope: 'document', areaId: null, tableIds: [] })
  })

  it('삭제는 한 번 더 확인한다', () => {
    renderPanel()
    fireEvent.click(screen.getByText('쿠폰을 쓴다'))
    fireEvent.click(screen.getByTestId('requirement-edit'))
    const dialog = screen.getByTestId('requirement-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    expect(requirements()).toHaveLength(5)
    fireEvent.click(within(dialog).getByTestId('requirement-remove-confirm'))
    expect(requirements().map((r) => r.id)).toEqual(['r1', 'r2', 'r4', 'r5'])
  })

  it('읽기 전용이면 추가·수정·반영 표시 버튼이 없다', () => {
    renderPanel(false)
    expect(screen.queryByTestId('requirement-add')).toBeNull()
    fireEvent.click(screen.getByText('주문을 만든다'))
    expect(screen.getByTestId('requirement-detail')).toBeInTheDocument()
    expect(screen.queryByTestId('requirement-edit')).toBeNull()
    expect(screen.queryByTestId('requirement-mark-applied')).toBeNull()
  })

  it('테이블 정보 창에서 넘어오면 걸러져 있던 항목도 펼쳐서 보인다', () => {
    renderPanel()
    expect(screen.queryByText('선물하기')).toBeNull()
    act(() => useRequirementsPanel.getState().reveal('r5'))
    expect(screen.getByText('선물하기')).toBeInTheDocument()
    expect(screen.getByTestId('requirement-detail')).toBeInTheDocument()
  })

  it('내용은 줄을 나눠 보여 준다 — 접혀 있으면 미리 보기, 펼치면 줄마다', () => {
    renderPanel()
    // 접힌 행에도 내용의 앞부분이 보인다
    expect(screen.getByTestId('requirement-preview')).toHaveTextContent('이메일은 중복될 수 없다')
    act(() =>
      useEditorStore.getState().commit({
        type: 'requirement/patch',
        requirementId: 'r1',
        patch: { description: '이메일은 중복될 수 없다. 가입 시각을 남긴다. 탈퇴한 회원은 30일 뒤에 지운다.' },
      }),
    )
    fireEvent.click(screen.getByText('이메일로 가입한다'))
    const lines = within(screen.getByTestId('requirement-description-lines')).getAllByRole('listitem')
    expect(lines.map((line) => line.textContent)).toEqual(['이메일은 중복될 수 없다.', '가입 시각을 남긴다.', '탈퇴한 회원은 30일 뒤에 지운다.'])
  })
})

describe('descriptionLines', () => {
  it('줄바꿈이 있으면 그 줄을 따르고 목록 표시를 뗀다', () => {
    expect(descriptionLines('- 주문 한 건에 상품을 여러 개 담는다\n- 단가를 남긴다\n\n• 취소는 배송 전까지')).toEqual([
      '주문 한 건에 상품을 여러 개 담는다',
      '단가를 남긴다',
      '취소는 배송 전까지',
    ])
  })

  it('한 줄로 이어진 글은 문장마다 나눈다. 소수점은 나누지 않는다', () => {
    expect(descriptionLines('평점은 1~5점이다. 0.5점 단위로 준다. 리뷰는 구매자만 쓴다')).toEqual([
      '평점은 1~5점이다.',
      '0.5점 단위로 준다.',
      '리뷰는 구매자만 쓴다',
    ])
    expect(descriptionLines('  ')).toEqual([])
    expect(descriptionLines('한 문장')).toEqual(['한 문장'])
  })
})
