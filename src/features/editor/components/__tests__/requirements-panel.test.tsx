/**
 * 요구사항 패널 — 묶음, 판정 배지와 필터, 펼치기, 편집, 읽기 전용 (05-editor/02-ui.md §17)
 */
import { ReactFlowProvider } from '@xyflow/react'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { RequirementsPanel, descriptionLines } from '@/features/editor/components/RequirementsPanel'
import { createColumn, createTable } from '@/features/editor/model/changes'
import type { EditorDocument, ErdRequirement } from '@/features/editor/model/content-schema'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { useRequirementsPanel } from '@/features/editor/store/requirements-panel-store'
import { fail, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import type { RequirementChanges } from '@/features/editor/api'
import { diffItems, diffLines } from '@/features/editor/model/requirement-diff'
import { asAuthenticated, renderWithProviders, resetSessionState } from '@/test/test-app'

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
      validationExceptions: [],
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
    const header = (group: HTMLElement) =>
      `${within(group).getByTestId('requirement-group-name').textContent}${within(group).getByTestId('requirement-group-count').textContent}`
    expect(groups.map(header)).toEqual(['회원1', '주문1', '미분류1', '공통1'])
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

  it('근거 없는 테이블은 그 도메인 구역 아래에 보여 준다 — 그룹 밖의 테이블은 미분류에', () => {
    renderPanel()
    const untraced = screen.getAllByTestId('requirement-domain-untraced')
    expect(untraced).toHaveLength(1)
    expect(untraced[0].closest('[data-testid="requirement-group"]')).toHaveAttribute('data-key', 'unassigned')
    expect(within(untraced[0]).getByRole('button')).toHaveTextContent('audit_logs')

    fireEvent.click(within(untraced[0]).getByRole('button'))
    expect(useEditorStore.getState().selectedIds).toEqual(['t-audit'])
    expect(useRequirementsPanel.getState().open).toBe(false)
  })

  it('도메인 목록 — 도메인마다 반영 수와 진행을 보여 주고, 고르면 그 도메인만 본다', () => {
    renderPanel()
    const nav = screen.getByTestId('requirement-domain-nav')
    const items = within(nav).getAllByTestId('requirement-domain-item')
    expect(items.map((item) => item.getAttribute('data-key'))).toEqual(['all', 'a-member', 'a-order', 'unassigned', 'document'])
    // 전체 — 제외를 뺀 4건 가운데 반영 2건(회원 1, 공통 1)
    expect(items[0]).toHaveTextContent('전체')
    expect(items[0]).toHaveTextContent('2/4')
    expect(items[1]).toHaveTextContent('회원')
    expect(items[1]).toHaveTextContent('1/1')
    expect(items[2]).toHaveTextContent('0/1')
    expect(screen.getByTestId('requirement-progress')).toHaveTextContent('반영 2/4')

    fireEvent.click(items[2])
    expect(items[2]).toHaveAttribute('aria-pressed', 'true')
    const groups = screen.getAllByTestId('requirement-group')
    expect(groups).toHaveLength(1)
    expect(within(groups[0]).getByTestId('requirement-group-name')).toHaveTextContent('주문')
    expect(screen.queryByText('이메일로 가입한다')).toBeNull()

    fireEvent.click(items[0])
    expect(screen.getAllByTestId('requirement-group')).toHaveLength(4)
  })

  it('도메인 구역은 접을 수 있고, 구역의 추가는 그 도메인을 미리 골라 둔다', () => {
    renderPanel()
    const order = screen.getAllByTestId('requirement-group')[1]
    fireEvent.click(within(order).getByRole('button', { expanded: true }))
    expect(within(order).queryByTestId('requirement-row')).toBeNull()
    fireEvent.click(within(order).getByRole('button', { expanded: false }))
    expect(within(order).getAllByTestId('requirement-row')).toHaveLength(1)

    fireEvent.click(within(order).getByTestId('requirement-domain-add'))
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '주문을 취소한다' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(requirements().find((r) => r.title === '주문을 취소한다')).toMatchObject({ areaId: 'a-order', code: 'REQ-006' })
  })

  it('찾기 — 코드, 제목, 내용, 테이블 이름에서 찾는다. 없으면 안내한다', () => {
    renderPanel()
    const search = screen.getByTestId('requirement-search')
    fireEvent.change(search, { target: { value: '중복' } })
    expect(screen.getAllByTestId('requirement-row')).toHaveLength(1)
    expect(screen.getByText('이메일로 가입한다')).toBeInTheDocument()
    // 찾는 중에는 근거 없는 테이블을 감춘다
    expect(screen.queryByTestId('requirement-domain-untraced')).toBeNull()

    fireEvent.change(search, { target: { value: 'ORDERS' } })
    expect(screen.getAllByTestId('requirement-row')).toHaveLength(1)
    expect(screen.getByText('주문을 만든다')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'req-003' } })
    expect(screen.getByText('쿠폰을 쓴다')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: '없는 말' } })
    expect(screen.getByTestId('requirements-empty-filtered')).toBeInTheDocument()
  })

  it('수용 기준 — 다이얼로그에서 한 줄에 하나씩 적고, 행에서 체크한다', () => {
    renderPanel()
    fireEvent.click(screen.getByText('이메일로 가입한다'))
    fireEvent.click(screen.getByTestId('requirement-edit'))
    fireEvent.change(screen.getByRole('textbox', { name: '수용 기준' }), { target: { value: '- 이메일 중복을 막는다\n\n가입 시각을 남긴다' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    const saved = () => requirements().find((r) => r.id === 'r1')
    expect(saved()?.criteria?.map((criterion) => [criterion.text, criterion.done])).toEqual([
      ['이메일 중복을 막는다', false],
      ['가입 시각을 남긴다', false],
    ])
    // 수용 기준만 고치면 개정 번호가 오르지 않는다(반영 대기가 되지 않는다)
    expect(saved()).toMatchObject({ revision: 1 })
    expect(screen.getByTestId('requirement-criteria-count')).toHaveTextContent('기준 0/2')

    const boxes = within(screen.getByTestId('requirement-criteria')).getAllByRole('checkbox')
    fireEvent.click(boxes[1])
    expect(saved()?.criteria?.map((criterion) => criterion.done)).toEqual([false, true])
    expect(screen.getByTestId('requirement-criteria-count')).toHaveTextContent('기준 1/2')

    // 문구를 그대로 둔 항목은 체크를 이어받는다
    fireEvent.click(screen.getByTestId('requirement-edit'))
    fireEvent.change(screen.getByRole('textbox', { name: '수용 기준' }), { target: { value: '가입 시각을 남긴다\n비밀번호는 암호화한다' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(saved()?.criteria?.map((criterion) => [criterion.text, criterion.done])).toEqual([
      ['가입 시각을 남긴다', true],
      ['비밀번호는 암호화한다', false],
    ])
  })

  it('수용 기준은 읽기 전용이면 체크할 수 없다', () => {
    useEditorStore.getState().hydrate({
      modelId: '501',
      baseVersion: 0,
      document: {
        ...fixture(),
        diagram: {
          ...fixture().diagram,
          requirements: [requirement({ id: 'r1', code: 'REQ-001', title: '가입', criteria: [{ id: 'k1', text: '중복을 막는다', done: true }] })],
        },
      },
      databaseType: 'mysql',
    })
    useRequirementsPanel.setState({ open: true, focusId: null })
    renderWithProviders(
      <ReactFlowProvider>
        <RequirementsPanel canEdit={false} />
      </ReactFlowProvider>,
      { wrapRoutes: false },
    )
    fireEvent.click(screen.getByText('가입'))
    expect(within(screen.getByTestId('requirement-criteria')).getByRole('checkbox')).toBeDisabled()
  })

  it('캔버스에서 보기 — 요구사항에 연결된 테이블을 모두 고르고 ERD 탭으로 돌아간다', () => {
    renderPanel()
    fireEvent.click(screen.getByText('주문을 만든다'))
    // 반영 대기 요구사항은 반영 단계의 "테이블로 이동"이 같은 동작이다(§21)
    fireEvent.click(screen.getByTestId('requirement-step-tables'))
    expect(useEditorStore.getState().selectedIds).toEqual(['t-orders', 't-users'])
    expect(useRequirementsPanel.getState().open).toBe(false)
  })

  it('도메인의 캔버스에서 보기는 그 도메인의 테이블을 고른다', () => {
    renderPanel()
    const member = screen.getAllByTestId('requirement-group')[0]
    fireEvent.click(within(member).getByTestId('requirement-domain-canvas'))
    expect(useEditorStore.getState().selectedIds).toEqual(['t-users'])
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

describe('요구사항 패널 — 반영 대기 요구사항 반영하기 (§21, 08-core/17-model-edit.md §2.4)', () => {
  const snapshot = (overrides: Partial<NonNullable<RequirementChanges['before']>> = {}) => ({
    title: '주문을 만든다',
    description: '',
    status: 'confirmed',
    tables: ['orders', 'users'],
    criteria: [],
    ...overrides,
  })
  /** 개요 응답 — REQ-002의 바뀐 내용을 정한다. 요청 수를 센다 */
  function useOutline(changes: RequirementChanges) {
    const calls = { count: 0 }
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/outline', () => {
        calls.count += 1
        return HttpResponse.json(
          ok({ response: { version: 3, requirements: [{ code: 'REQ-002', state: 'PENDING', changes }] } }),
        )
      }),
    )
    return calls
  }
  function renderLinked(options: { canEdit?: boolean; sourceConnectionId?: string | null } = {}) {
    asAuthenticated()
    useEditorStore.getState().hydrate({ modelId: '501', baseVersion: 3, document: fixture(), databaseType: 'mysql' })
    useRequirementsPanel.setState({ open: true, focusId: null })
    return renderWithProviders(
      <ReactFlowProvider>
        <RequirementsPanel
          canEdit={options.canEdit ?? true}
          documentName="주문 서비스"
          workspaceId="101"
          modelId="501"
          sourceConnectionId={options.sourceConnectionId === undefined ? '301' : options.sourceConnectionId}
        />
      </ReactFlowProvider>,
      { wrapRoutes: false },
    )
  }
  const openChanges = async () => {
    fireEvent.click(screen.getByText('주문을 만든다'))
    fireEvent.click(screen.getByTestId('requirement-changes-toggle'))
    return screen.findByTestId('requirement-changes')
  }

  it('줄 비교 — 같은 줄은 그대로, 지운 줄과 더한 줄을 나눈다', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ])
    expect(diffLines('', 'x')).toEqual([{ kind: 'add', text: 'x' }])
    expect(diffItems(['a', 'b', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a', 'b'] })
  })

  it('바뀐 내용 — 제목, 내용의 줄 차이, 수용 기준, 연결된 테이블을 보여 준다', async () => {
    useOutline({
      appliedRevision: 1,
      revision: 2,
      isNew: false,
      beforeKnown: true,
      before: snapshot({ title: '주문한다', description: '결제는 카드만\n주문은 취소할 수 있다', tables: ['orders'], criteria: [{ text: '카드 결제' }] }),
      after: snapshot({ description: '결제는 카드와 계좌이체\n주문은 취소할 수 있다', criteria: [{ text: '계좌이체 결제' }] }),
    })
    renderLinked()
    const view = await openChanges()

    await waitFor(() => expect(within(view).getByTestId('requirement-changes-title')).toHaveTextContent('주문한다→주문을 만든다'))
    const lines = within(view).getByTestId('requirement-changes-description').querySelectorAll('li')
    expect([...lines].map((line) => [line.dataset.kind, line.textContent?.replace(/^[+−\s]+/, '').replace(/^(추가|삭제): /, '')])).toEqual([
      ['remove', '결제는 카드만'],
      ['add', '결제는 카드와 계좌이체'],
      ['same', '주문은 취소할 수 있다'],
    ])
    const criteria = within(view).getByTestId('requirement-changes-criteria')
    expect(criteria.querySelector('[data-kind="add"]')).toHaveTextContent('계좌이체 결제')
    expect(criteria.querySelector('[data-kind="remove"]')).toHaveTextContent('카드 결제')
    expect(within(view).getByTestId('requirement-changes-tables-summary')).toHaveTextContent('orders → orders, users')
    // 상태는 그대로라 나오지 않는다
    expect(within(view).queryByTestId('requirement-changes-status')).toBeNull()
  })

  it('새 요구사항과 이전 내용을 찾지 못한 요구사항은 그렇다고 알린다', async () => {
    useOutline({ appliedRevision: 0, revision: 2, isNew: true, beforeKnown: true, before: null, after: snapshot() })
    const first = renderLinked()
    let view = await openChanges()
    expect(await within(view).findByTestId('requirement-changes-new')).toHaveTextContent('새 요구사항')
    first.unmount()

    useOutline({ appliedRevision: 1, revision: 2, isNew: false, beforeKnown: false, before: null, after: snapshot() })
    renderLinked()
    view = await openChanges()
    expect(await within(view).findByTestId('requirement-changes-unknown')).toHaveTextContent(
      '이전 내용을 찾을 수 없습니다(오래된 버전이 정리됨)',
    )
  })

  it('저장하지 않은 편집이 있으면 저장된 문서 기준이라고 알린다', async () => {
    useOutline({ appliedRevision: 1, revision: 2, isNew: false, beforeKnown: true, before: snapshot({ title: '주문한다' }), after: snapshot() })
    renderLinked()
    act(() => useEditorStore.getState().commit({ type: 'requirement/patch', requirementId: 'r3', patch: { title: '쿠폰을 적용한다' } }))
    const view = await openChanges()
    expect(await within(view).findByTestId('requirement-changes-unsaved')).toBeInTheDocument()
  })

  it('DB에 반영 — 원천 커넥션이 있고 편집할 수 있을 때만 보이고, 마이그레이션 다이얼로그를 연다', async () => {
    useOutline({ appliedRevision: 0, revision: 2, isNew: true, beforeKnown: true, before: null, after: snapshot() })
    const first = renderLinked()
    fireEvent.click(screen.getByText('주문을 만든다'))
    // 커넥션 목록(301 존재)을 읽은 뒤에 나타난다
    fireEvent.click(await screen.findByTestId('requirement-step-database'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    first.unmount()

    // 원천 커넥션이 없는 문서 — DB 단계가 없고, 반영함으로 표시는 2단계다
    const second = renderLinked({ sourceConnectionId: null })
    fireEvent.click(screen.getByText('주문을 만든다'))
    expect(screen.getByTestId('requirement-steps')).toBeInTheDocument()
    expect(screen.queryByTestId('requirement-step-database')).toBeNull()
    expect(screen.getByTestId('requirement-steps')).toHaveTextContent('2. 다 반영했으면 표시합니다')
    second.unmount()

    // 읽기 전용 — 반영 단계가 없다. 바뀐 내용은 볼 수 있다
    renderLinked({ canEdit: false })
    fireEvent.click(screen.getByText('주문을 만든다'))
    expect(screen.queryByTestId('requirement-steps')).toBeNull()
    expect(screen.getByTestId('requirement-changes-toggle')).toBeInTheDocument()
  })

  it('반영함으로 표시 — appliedRevision을 revision으로 맞춘다(문서 편집이라 되돌릴 수 있다)', async () => {
    useOutline({ appliedRevision: 1, revision: 2, isNew: false, beforeKnown: true, before: snapshot(), after: snapshot() })
    renderLinked()
    fireEvent.click(screen.getByText('주문을 만든다'))
    fireEvent.click(screen.getByTestId('requirement-mark-applied'))
    const target = () => requirements().find((item) => item.id === 'r2')!
    expect(target().appliedRevision).toBe(2)
    act(() => useEditorStore.getState().undo())
    expect(target().appliedRevision).toBe(1)
  })

  it('공개·버전 뷰어처럼 문서 경로가 없으면 개요를 읽지 않고 바뀐 내용 보기도 없다', () => {
    const calls = useOutline({ appliedRevision: 0, revision: 2, isNew: true, beforeKnown: true, before: null, after: snapshot() })
    renderPanel()
    fireEvent.click(screen.getByText('주문을 만든다'))
    expect(screen.queryByTestId('requirement-changes-toggle')).toBeNull()
    expect(calls.count).toBe(0)
  })
})

describe('요구사항 패널 — 수용 기준을 데이터로 확인 (v1.36)', () => {
  /** 확인 SQL이 붙은 기준 셋 — 통과·실패·오류가 하나씩 나오게(MSW checks 핸들러가 SQL 문구로 정한다) */
  function checkedFixture(): EditorDocument {
    const doc = fixture()
    doc.diagram.requirements[0] = {
      ...doc.diagram.requirements[0],
      criteria: [
        { id: 'k1', text: '이메일은 비어 있지 않다', done: false, check: { sql: 'SELECT COUNT(*) FROM users WHERE email IS NULL', expect: '0' } },
        { id: 'k2', text: '중복 이메일이 없다', done: false, check: { sql: 'SELECT COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1', expect: '0' } },
        { id: 'k3', text: '탈퇴 회원은 따로 둔다', done: false, check: { sql: 'SELECT COUNT(*) FROM no_such_table', expect: '0' } },
        { id: 'k4', text: '가입 시각을 남긴다', done: true },
      ],
    }
    return doc
  }
  function renderChecked(options: { canEdit?: boolean; sourceConnectionId?: string | null; document?: EditorDocument } = {}) {
    asAuthenticated()
    useEditorStore.getState().hydrate({ modelId: '501', baseVersion: 3, document: options.document ?? checkedFixture(), databaseType: 'mysql' })
    useRequirementsPanel.setState({ open: true, focusId: null, checks: null })
    return renderWithProviders(
      <ReactFlowProvider>
        <RequirementsPanel
          canEdit={options.canEdit ?? true}
          documentName="주문 서비스"
          workspaceId="101"
          modelId="501"
          sourceConnectionId={options.sourceConnectionId === undefined ? '301' : options.sourceConnectionId}
        />
      </ReactFlowProvider>,
      { wrapRoutes: false },
    )
  }
  afterEach(() => useRequirementsPanel.setState({ checks: null }))

  it('다이얼로그 — 기준마다 확인 SQL을 붙이고, 문구가 같은 줄은 확인 SQL을 이어받고, SQL을 비우면 뗀다', () => {
    renderPanel()
    fireEvent.click(screen.getByText('이메일로 가입한다'))
    fireEvent.click(screen.getByTestId('requirement-edit'))
    fireEvent.change(screen.getByRole('textbox', { name: '수용 기준' }), { target: { value: '이메일은 비어 있지 않다\n가입 시각을 남긴다' } })
    const [first] = screen.getAllByTestId('requirement-criterion-check-toggle')
    fireEvent.click(first)
    fireEvent.change(screen.getByTestId('requirement-criterion-sql'), { target: { value: '  SELECT COUNT(*) FROM users WHERE email IS NULL  ' } })
    fireEvent.change(screen.getByTestId('requirement-criterion-expect'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    const saved = () => requirements().find((r) => r.id === 'r1')!
    expect(saved().criteria).toEqual([
      { id: expect.any(String), text: '이메일은 비어 있지 않다', done: false, check: { sql: 'SELECT COUNT(*) FROM users WHERE email IS NULL', expect: '0' } },
      { id: expect.any(String), text: '가입 시각을 남긴다', done: false },
    ])
    // 기준만 고쳤으니 개정 번호가 오르지 않는다
    expect(saved().revision).toBe(1)
    const firstId = saved().criteria![0].id

    // 순서를 바꾸고 줄을 더해도 같은 문구는 id·확인 SQL을 이어받는다
    fireEvent.click(screen.getByTestId('requirement-edit'))
    fireEvent.change(screen.getByRole('textbox', { name: '수용 기준' }), { target: { value: '새 기준\n이메일은 비어 있지 않다' } })
    expect(within(screen.getAllByTestId('requirement-criterion-check')[1]).getByText('SQL 있음')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(saved().criteria![1]).toEqual({
      id: firstId,
      text: '이메일은 비어 있지 않다',
      done: false,
      check: { sql: 'SELECT COUNT(*) FROM users WHERE email IS NULL', expect: '0' },
    })

    // SQL을 비우면 확인을 뗀다(check 키가 없다)
    fireEvent.click(screen.getByTestId('requirement-edit'))
    fireEvent.click(screen.getAllByTestId('requirement-criterion-check-toggle')[1])
    fireEvent.change(screen.getByTestId('requirement-criterion-sql'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(saved().criteria![1]).toEqual({ id: firstId, text: '이메일은 비어 있지 않다', done: false })
  })

  it('다이얼로그 — 기준이 20개를 넘거나 한 줄이 200자를 넘으면 저장하지 않는다', () => {
    renderPanel()
    fireEvent.click(screen.getByText('이메일로 가입한다'))
    fireEvent.click(screen.getByTestId('requirement-edit'))
    const many = Array.from({ length: 21 }, (_, index) => `기준 ${index + 1}`).join('\n')
    fireEvent.change(screen.getByRole('textbox', { name: '수용 기준' }), { target: { value: many } })
    expect(screen.getByTestId('requirement-criteria-error')).toHaveTextContent('수용 기준은 20개까지')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByTestId('requirement-dialog')).toBeInTheDocument()
    expect(requirements().find((r) => r.id === 'r1')?.criteria).toBeUndefined()

    fireEvent.change(screen.getByRole('textbox', { name: '수용 기준' }), { target: { value: 'ㄱ'.repeat(201) } })
    expect(screen.getByTestId('requirement-criteria-error')).toHaveTextContent('200자까지')
  })

  it('데이터로 확인 버튼 — 편집 권한, 원천 커넥션, 확인 SQL이 있는 기준이 모두 있을 때만 보인다', async () => {
    const first = renderChecked()
    // 커넥션 목록(301 존재)을 읽은 뒤에 나타난다
    expect(await screen.findByTestId('requirement-checks-run')).toHaveTextContent('데이터로 확인')
    first.unmount()

    const noConnection = renderChecked({ sourceConnectionId: null })
    expect(screen.queryByTestId('requirement-checks-run')).toBeNull()
    noConnection.unmount()

    // 문서가 가리키는 커넥션이 워크스페이스에 없다(삭제됨)
    const missing = renderChecked({ sourceConnectionId: '999' })
    await waitFor(() => expect(screen.getByTestId('requirements-panel')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByTestId('requirement-checks-run')).toBeNull()
    missing.unmount()

    const readOnly = renderChecked({ canEdit: false })
    expect(screen.queryByTestId('requirement-checks-run')).toBeNull()
    // 확인 SQL이 있다는 표시는 읽기 전용에서도 보인다
    fireEvent.click(screen.getByText('이메일로 가입한다'))
    expect(screen.getAllByTestId('requirement-criterion-has-check')).toHaveLength(3)
    readOnly.unmount()

    renderChecked({ document: fixture() })
    await waitFor(() => expect(screen.getByTestId('requirements-panel')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByTestId('requirement-checks-run')).toBeNull()
  })

  it('실행 — 한 번에 보내고 요약과 기준마다 통과·실패·오류를 보여 준다. 결과는 문서에 저장하지 않는다', async () => {
    let sent: { checks: { key: string; sql: string; expect: string }[] } | null = null
    server.events.on('request:start', async ({ request }) => {
      if (request.url.endsWith('/checks')) sent = (await request.clone().json()) as typeof sent
    })
    renderChecked()
    fireEvent.click(screen.getByText('이메일로 가입한다'))
    fireEvent.click(await screen.findByTestId('requirement-checks-run'))

    expect(await screen.findByTestId('requirement-checks-summary')).toHaveTextContent('통과 1 · 실패 1 · 오류 1')
    server.events.removeAllListeners()
    expect(sent!.checks.map((item) => item.key)).toEqual(['REQ-001/k1', 'REQ-001/k2', 'REQ-001/k3'])

    const results = screen.getAllByTestId('requirement-criterion-result')
    expect(results.map((result) => result.dataset.status)).toEqual(['FAILED', 'PASSED', 'ERROR'])
    expect(results[0]).toHaveTextContent('실패실제 값 3 · 기대 0')
    expect(results[2]).toHaveTextContent('오류실행하지 못했습니다')
    expect(within(results[2]).getByTestId('requirement-criterion-message')).toHaveTextContent("Table 'members.no_such_table' doesn't exist")
    expect(requirements()[0].criteria!.every((criterion) => !('result' in criterion))).toBe(true)

    // 기준의 SQL을 고치면 옛 결과는 사라진다
    act(() =>
      useEditorStore.getState().commit({
        type: 'requirement/patch',
        requirementId: 'r1',
        patch: {
          criteria: requirements()[0].criteria!.map((criterion) =>
            criterion.id === 'k1' ? { ...criterion, check: { sql: 'SELECT 0', expect: '0' } } : criterion,
          ),
        },
      }),
    )
    expect(screen.getAllByTestId('requirement-criterion-result').map((result) => result.dataset.status)).toEqual(['PASSED', 'ERROR'])

    // 이 요구사항만 다시 확인
    fireEvent.click(screen.getByTestId('requirement-checks-run-one'))
    await waitFor(() =>
      expect(screen.getAllByTestId('requirement-criterion-result').map((result) => result.dataset.status)).toEqual(['PASSED', 'PASSED', 'ERROR']),
    )
  })

  it('요청이 실패하면 데이터베이스 오류 문구를 보여 준다', async () => {
    server.use(
      http.post('/api/v1/database-manager/workspaces/:workspaceId/connections/:connectionId/checks', () =>
        fail('CONNECTION_UNREACHABLE', 502),
      ),
    )
    renderChecked()
    fireEvent.click(await screen.findByTestId('requirement-checks-run'))
    expect(await screen.findByTestId('requirement-checks-error')).toHaveTextContent('데이터베이스에 접속할 수 없습니다')
    expect(screen.queryByTestId('requirement-checks-summary')).toBeNull()
  })
})
