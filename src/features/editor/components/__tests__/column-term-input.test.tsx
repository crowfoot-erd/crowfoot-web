/**
 * ColumnTermInput — 컬럼 물리명 입력의 워크스페이스 사전 제안 (05-editor/02-ui.md §8.2)
 *
 * 제안은 용어(타입이 있는 항목 — 이름 전체를 바꾼다)와 단어(조각만 완성한다)로 나뉜다(v1.30).
 * 용어를 적용하면 물리명·논리명·타입을 채우는 onApplyTerm(부모가 1커밋)만 호출된다 —
 * 일반 blur 커밋(onCommit)과 겹치지 않는다. 단어는 초안만 바꾸고 편집을 이어 간다.
 * 사전은 MSW 목업(fixtures.terms: member→회원 types null, user→사용자 types
 * {mysql: VARCHAR(60), postgresql: VARCHAR(50)}) — 문서 DB 종류 mysql 기준으로
 * user행에만 VARCHAR(60) 배지가 붙는다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { EditorCanvasContext, type EditorCanvasContextValue } from '@/features/editor/components/canvas/editor-context'
import { ColumnTermInput } from '@/features/editor/components/canvas/column-term-input'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

// jsdom은 blur()가 이벤트를 발화하지 않는다 — 적용(Enter·클릭) 후 commitExternal의 blur가
// 실제 브라우저처럼 onBlur(초안 커밋 스킵 플래그 청소)까지 이어지게 한다
let blurCalls = 0
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'blur').mockImplementation(function (this: HTMLElement) {
    blurCalls += 1
    fireEvent.blur(this)
  })
})
afterAll(() => vi.restoreAllMocks())

afterEach(() => {
  resetSessionState()
})

/** 제안이 읽는 컨텍스트 — databaseType은 배지·적용 파싱의 키, workspaceId는 사전 조회 키 */
const canvasValue = (overrides: Partial<EditorCanvasContextValue> = {}): EditorCanvasContextValue => ({
  canEdit: true,
  dbmsId: 'mysql',
  workspaceId: '101',
  databaseType: 'mysql',
  openTableInfo: () => {},
  openColumnInfo: () => {},
  openKeyInfo: () => {},
  pendingRelation: null,
  startPendingRelation: () => {},
  completeRelation: () => {},
  openRelationPicker: () => {},
  nameDisplay: 'both',
  columnDisplay: 'all',
  reportSize: () => {},
  ...overrides,
})

function renderInput({
  value = 'column_1',
  canvas = canvasValue(),
  disabled,
  ariaLabel = '컬럼 물리명',
}: {
  value?: string
  canvas?: EditorCanvasContextValue
  disabled?: boolean
  ariaLabel?: string
} = {}) {
  const onCommit = vi.fn()
  const onApplyTerm = vi.fn()
  renderWithProviders(
    <EditorCanvasContext.Provider value={canvas}>
      <ColumnTermInput
        value={value}
        onCommit={onCommit}
        onApplyTerm={onApplyTerm}
        ariaLabel={ariaLabel}
        disabled={disabled ?? !canvas.canEdit}
      />
    </EditorCanvasContext.Provider>,
    { wrapRoutes: false },
  )
  return { input: screen.getByLabelText(ariaLabel) as HTMLInputElement, onCommit, onApplyTerm }
}

/** 제안 목록 — 워크스페이스 사전 조회가 끝나야 뜬다 */
const findListbox = () => screen.findByRole('listbox', { name: '워크스페이스 사전 제안' })

/** 부정 단언용 — 사전 조회(MSW)가 끝날 만큼의 시간을 흘려보낸 뒤 목록 없음을 검증한다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('ColumnTermInput — 제안 노출', () => {
  it('포커스하면 제안이 묶음별로 뜬다 — 용어(타입이 있는 user)가 먼저, 단어(member)가 다음', async () => {
    const { input } = renderInput({ value: 'column_1' })
    fireEvent.focus(input)

    const listbox = await findListbox()
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(within(options[0]).getByText('user')).toBeVisible()
    expect(within(options[1]).getByText('member')).toBeVisible()
    // 묶음 제목 — 용어는 이름 전체, 단어는 조각 완성
    expect(within(listbox).getByText('용어 — 이름 전체')).toBeVisible()
    expect(within(listbox).getByText('단어 — 치고 있는 조각 완성')).toBeVisible()
    // 타입 배지는 문서 DB 종류(mysql) 키 값 — user에만 붙는다
    expect(within(options[0]).getByText('VARCHAR(60)')).toBeVisible()
    expect(within(options[1]).queryByText(/VARCHAR/)).toBeNull()
  })

  it('용어는 입력 전체와, 단어는 치고 있는 조각과 견준다', async () => {
    const { input } = renderInput()
    fireEvent.focus(input)
    await findListbox()

    // 조각 "mem"에 걸리는 단어만 — 앞부분(order_)은 그대로 둔다
    fireEvent.change(input, { target: { value: 'order_mem' } })
    let options = within(await findListbox()).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(within(options[0]).getByText('member')).toBeVisible()

    fireEvent.change(input, { target: { value: '사용' } }) // 라벨 부분 일치(용어)
    options = within(await findListbox()).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(within(options[0]).getByText('user')).toBeVisible()
  })

  it('추론한 논리명을 미리 보여 준다 — 사전에 걸리는 조각만 바뀐 모습', async () => {
    const { input } = renderInput()
    fireEvent.focus(input)
    await findListbox()

    fireEvent.change(input, { target: { value: 'member_no' } })
    expect(await screen.findByTestId('term-preview')).toHaveTextContent('논리명회원 no')
  })

  it('일치도 미리보기도 없으면 목록을 띄우지 않는다', async () => {
    const { input } = renderInput()
    fireEvent.focus(input)
    await findListbox()

    fireEvent.change(input, { target: { value: 'zzz' } })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })
})

describe('ColumnTermInput — 적용', () => {
  it('용어: Enter로 적용 — onApplyTerm만 호출(일반 커밋 아님), 이름 전체가 바뀐다', async () => {
    const { input, onCommit, onApplyTerm } = renderInput()
    fireEvent.focus(input)
    const listbox = await findListbox()
    expect(within(listbox).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    const blursBefore = blurCalls
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onApplyTerm).toHaveBeenCalledTimes(1)
    expect(onApplyTerm.mock.calls[0][0]).toMatchObject({ term: 'user', label: '사용자' })
    expect(onCommit).not.toHaveBeenCalled() // 제안 적용은 blur 커밋을 건너뛴다
    expect(input.value).toBe('user')
    expect(blurCalls - blursBefore).toBeGreaterThanOrEqual(1)
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull()) // blur로 닫힌다
  })

  it('단어: 치고 있는 조각만 완성하고 편집을 이어 간다 — 확정할 때 추론한 논리명을 함께 넘긴다', async () => {
    const { input, onCommit, onApplyTerm } = renderInput()
    fireEvent.focus(input)
    await findListbox()

    fireEvent.change(input, { target: { value: 'order_mem' } })
    fireEvent.click(within(await findListbox()).getByText('member'))

    // 이름 전체가 아니라 조각만 바뀐다. 타입을 채우는 적용(onApplyTerm)은 부르지 않는다
    expect(input.value).toBe('order_member')
    expect(onApplyTerm).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('order_member', 'order 회원')
  })

  it('↑↓로 단어까지 내려가 Enter로 완성한다', async () => {
    const { input, onApplyTerm } = renderInput()
    fireEvent.focus(input)
    const listbox = await findListbox()

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // user(용어) → member(단어)
    expect(within(listbox).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input.value).toBe('member')
    expect(onApplyTerm).not.toHaveBeenCalled()
  })

  it('단어를 고르지 않은 일반 blur는 물리명만 커밋한다 — 논리명을 넘기지 않는다', async () => {
    const { input, onCommit, onApplyTerm } = renderInput()
    fireEvent.focus(input)
    await findListbox()

    fireEvent.change(input, { target: { value: 'order_nm' } })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('order_nm', undefined)
    expect(onApplyTerm).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })
})

describe('ColumnTermInput — 제안 부재 조건', () => {
  it('읽기 전용·공개 뷰어(workspaceId null)에는 목록이 없다', async () => {
    const { input: readOnly } = renderInput({ canvas: canvasValue({ canEdit: false }), ariaLabel: '읽기 전용 물리명' })
    fireEvent.focus(readOnly)
    // 사전 조회가 끝나도(공유 fixtures) 조건이 아니면 목록은 뜨지 않는다
    await settle()
    expect(screen.queryByRole('listbox')).toBeNull()

    const { input: viewer } = renderInput({ canvas: canvasValue({ workspaceId: null }), ariaLabel: '공개 뷰어 물리명' })
    fireEvent.focus(viewer)
    await settle()
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
