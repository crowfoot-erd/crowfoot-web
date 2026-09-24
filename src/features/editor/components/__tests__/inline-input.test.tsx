/**
 * CommitInput — blur/Enter 커밋과 IME(한글 조립) Enter 처리
 *
 * 조립 중 Enter에서 바로 blur하면 조립 확정 처리와 겹쳐 마지막 글자가 두 번
 * 삽입된다(안녕 → 안녕녕). 조립 중 Enter는 compositionend 이후(값 확정 뒤)에
 * 커밋하는지를 검증한다. 컬럼 물리명 제안(ColumnTermInput)이 쓰는 확장 계약
 * — ref.commitExternal(외부 적용값으로 blur, 초안 커밋 스킵)과 onKeyDownIntercept
 * (내장 Enter/Esc 처리보다 먼저 키를 가져감)도 함께 검증한다.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CommitInput, type CommitInputHandle } from '@/features/editor/components/canvas/inline-inputs'

// jsdom은 HTMLElement.blur()가 blur 이벤트를 발화하지 않는다 — 브라우저 동작(호출 → 이벤트)을 잇는다.
// 스파이라 "호출됐는가"도 관찰할 수 있다(조립 중 Enter가 blur를 안 호출했는지 검증)
let blurCalls = 0
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'blur').mockImplementation(function (this: HTMLElement) {
    blurCalls += 1
    fireEvent.blur(this)
  })
})
afterAll(() => vi.restoreAllMocks())

function renderInput(onCommit = vi.fn()) {
  const callsBefore = blurCalls
  render(<CommitInput value="원본" onCommit={onCommit} ariaLabel="테이블 물리명" required />)
  return { input: screen.getByLabelText('테이블 물리명'), onCommit, blursSince: () => blurCalls - callsBefore }
}

describe('CommitInput — Enter 커밋', () => {
  it('일반 Enter — 즉시 blur해 1회 커밋', () => {
    const { input, onCommit, blursSince } = renderInput()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'orders' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(blursSince()).toBe(1)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('orders')
  })

  it('IME 조립 중 Enter — 여기서 blur하지 않고, compositionend(값 확정) 뒤 1회 커밋', async () => {
    const { input, onCommit, blursSince } = renderInput()
    fireEvent.focus(input)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '안녕' } })

    // 조립 확정 Enter — isComposing·229가 실린다. 커밋도 blur도 아니어야 한다
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(onCommit).not.toHaveBeenCalled()
    expect(blursSince()).toBe(0)

    // 조립 확정 — compositionend 후 rAF에서 blur → 커밋(글자 중복 없이 확정값 1회)
    await act(async () => {
      fireEvent.compositionEnd(input)
    })
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('안녕'))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(blursSince()).toBe(1)
  })

  it('Safari처럼 keydown이 조립을 알려주지 않아도 compositionStart 추적으로 같게 보호된다', async () => {
    const { input, onCommit } = renderInput()
    fireEvent.focus(input)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '주문' } })

    // isComposing=false·keyCode 13 — 이벤트만 보면 일반 Enter로 위장한다
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false, keyCode: 13 })
    expect(onCommit).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.compositionEnd(input)
    })
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('주문'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})

describe('CommitInput — 제안 목록 연동 확장 (컬럼 물리명 사전 제안)', () => {
  it('commitExternal — 부모가 이미 패치한 값으로 blur한다(초안 커밋 스킵)', () => {
    const onCommit = vi.fn()
    const ref = { current: null as CommitInputHandle | null }
    render(
      <CommitInput
        ref={ref}
        value="column_1"
        onCommit={onCommit}
        ariaLabel="컬럼 물리명"
        required
      />,
    )
    const input = screen.getByLabelText('컬럼 물리명') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'us' } }) // 초안 — 커밋 대상이 될 뻔한 값

    act(() => ref.current?.commitExternal('user'))

    expect(onCommit).not.toHaveBeenCalled() // 'us' 초안 커밋 없이
    expect(input.value).toBe('user') // 적용값 표시
  })

  it('onKeyDownIntercept가 true를 반환하면 내장 Enter 처리(커밋 blur)를 건너뛴다', () => {
    const onCommit = vi.fn()
    const calls: string[] = []
    render(
      <CommitInput
        value="column_1"
        onCommit={onCommit}
        ariaLabel="컬럼 물리명"
        required
        onKeyDownIntercept={(event) => {
          calls.push(event.key)
          return event.key === 'Enter'
        }}
      />,
    )
    const input = screen.getByLabelText('컬럼 물리명') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'us' } })

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // 가로채지만 false — 기본 처리도 없음(이동 키)
    fireEvent.keyDown(input, { key: 'Enter' }) // true — 커밋 blur 스킵

    expect(calls).toEqual(['ArrowDown', 'Enter'])
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('us') // 초안 유지 — 제안 적용이 이어진다
  })
})
