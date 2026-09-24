/**
 * ColumnTermInput — 컬럼 물리명 입력의 워크스페이스 사전 제안 (05-editor/02-ui.md §8.2)
 *
 * 포커스·입력으로 제안이 뜨고 ↑↓/Enter·클릭으로 적용하면 물리명·논리명·타입을 채우는
 * onApplyTerm(부모가 1커밋)만 호출된다 — 일반 blur 커밋(onCommit)과 겹치지 않는다.
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
  it('포커스하면 워크스페이스 사전 제안이 뜬다 — 자동 생성 물리명(column_N)은 전체 목록', async () => {
    const { input } = renderInput({ value: 'column_1' })
    fireEvent.focus(input)

    const listbox = await findListbox()
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(within(options[0]).getByText('member')).toBeVisible()
    expect(within(options[1]).getByText('user')).toBeVisible()
    // 타입 배지는 문서 DB 종류(mysql) 키 값 — user에만 붙는다
    expect(within(options[1]).getByText('VARCHAR(60)')).toBeVisible()
    expect(within(options[0]).queryByText(/VARCHAR/)).toBeNull()
  })

  it('입력(토큰·라벨)으로 좁혀진다', async () => {
    const { input } = renderInput()
    fireEvent.focus(input)
    await findListbox()

    fireEvent.change(input, { target: { value: 'mem' } })
    let options = within(await findListbox()).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(within(options[0]).getByText('member')).toBeVisible()

    fireEvent.change(input, { target: { value: '사용' } }) // 라벨 부분 일치
    options = within(await findListbox()).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(within(options[0]).getByText('user')).toBeVisible()
  })

  it('일치가 없으면 목록을 띄우지 않는다', async () => {
    const { input } = renderInput()
    fireEvent.focus(input)
    await findListbox()

    fireEvent.change(input, { target: { value: 'zzz' } })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })
})

describe('ColumnTermInput — 적용', () => {
  it('↑↓로 이동하고 Enter로 적용 — onApplyTerm만 호출(일반 커밋 아님)', async () => {
    const { input, onCommit, onApplyTerm } = renderInput()
    fireEvent.focus(input)
    const listbox = await findListbox()

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // member → user
    expect(within(listbox).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')

    const blursBefore = blurCalls
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onApplyTerm).toHaveBeenCalledTimes(1)
    expect(onApplyTerm.mock.calls[0][0]).toMatchObject({ term: 'user', label: '사용자' })
    expect(onCommit).not.toHaveBeenCalled() // 제안 적용은 blur 커밋을 건너뛴다
    expect(input.value).toBe('user')
    expect(blurCalls - blursBefore).toBeGreaterThanOrEqual(1)
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull()) // blur로 닫힌다
  })

  it('클릭으로 적용한다', async () => {
    const { input, onCommit, onApplyTerm } = renderInput()
    fireEvent.focus(input)
    const listbox = await findListbox()

    fireEvent.click(within(listbox).getByText('member'))
    expect(onApplyTerm).toHaveBeenCalledTimes(1)
    expect(onApplyTerm.mock.calls[0][0]).toMatchObject({ term: 'member', label: '회원' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('member')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('제안 열린 상태의 일반 blur는 물리명만 커밋한다', async () => {
    const { input, onCommit, onApplyTerm } = renderInput()
    fireEvent.focus(input)
    await findListbox()

    fireEvent.change(input, { target: { value: 'order_nm' } })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('order_nm')
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
