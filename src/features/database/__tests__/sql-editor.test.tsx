/**
 * SQL 입력 칸(CodeMirror) — 실제 편집기 (09-database-manager/00-data-browser.md §5.3)
 *
 * 화면 테스트는 textarea 대역을 쓴다(src/test/setup.ts). 여기서만 실제 편집기를 올려
 * 값 주고받기·실행 키·선택 범위·문법 강조가 붙는지 본다.
 */
import { createRef } from 'react'
import { EditorView } from '@codemirror/view'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type * as SqlEditorModule from '@/features/database/components/sql-editor'
import type { SqlEditorHandle, SqlEditorProps } from '@/features/database/components/sql-editor'

vi.unmock('@/features/database/components/sql-editor')
const { SqlEditor } = await vi.importActual<typeof SqlEditorModule>('@/features/database/components/sql-editor')

function renderEditor(overrides: Partial<SqlEditorProps> = {}) {
  const ref = createRef<SqlEditorHandle>()
  const props: SqlEditorProps = {
    value: '',
    onChange: vi.fn(),
    onRun: vi.fn(),
    dbmsType: 'mysql',
    objectNames: ['orders', 'users'],
    ariaLabel: 'SQL 입력',
    placeholder: 'SELECT …',
    ref,
    ...overrides,
  }
  const view = render(<SqlEditor {...props} />)
  const content = view.container.querySelector('.cm-content') as HTMLElement
  const editor = EditorView.findFromDOM(content)
  if (!editor) throw new Error('편집기를 찾지 못했다')
  return { ...view, props, ref, content, editor }
}

describe('SqlEditor', () => {
  it('입력 칸에 이름이 붙고, 처음 값과 문법 강조가 보인다', () => {
    const { content } = renderEditor({ value: "SELECT * FROM orders WHERE status = 'PAID' -- 메모" })

    expect(content).toHaveAttribute('aria-label', 'SQL 입력')
    expect(content).toHaveTextContent("SELECT * FROM orders WHERE status = 'PAID' -- 메모")
    // 키워드·문자열·주석이 서로 다른 강조 클래스로 나뉜다
    const classOf = (text: string) =>
      [...content.querySelectorAll('span')].find((span) => span.textContent === text)?.className ?? ''
    expect(classOf('SELECT')).not.toBe('')
    expect(classOf("'PAID'")).not.toBe('')
    expect(new Set([classOf('SELECT'), classOf("'PAID'"), classOf('-- 메모')]).size).toBe(3)
  })

  it('고치면 onChange로 전체 문장을 알린다 — 밖에서 값을 바꾸면 따라온다', () => {
    const { editor, props, rerender, content } = renderEditor({ value: 'SELECT 1' })

    editor.dispatch({ changes: { from: 8, insert: ' FROM orders' } })
    expect(props.onChange).toHaveBeenLastCalledWith('SELECT 1 FROM orders')

    // 이력에서 고른 문장이 들어오는 경우
    rerender(<SqlEditor {...props} value="DELETE FROM users" />)
    expect(content).toHaveTextContent('DELETE FROM users')
    expect(props.onChange).toHaveBeenLastCalledWith('DELETE FROM users')
  })

  it('선택 범위를 돌려준다 — 선택이 없으면 커서 위치다', () => {
    const { editor, ref } = renderEditor({ value: 'SELECT 1;\nSELECT 2;' })

    editor.dispatch({ selection: { anchor: 3 } })
    expect(ref.current?.selection()).toEqual({ from: 3, to: 3 })
    editor.dispatch({ selection: { anchor: 10, head: 18 } })
    expect(ref.current?.selection()).toEqual({ from: 10, to: 18 })
  })

  it('Ctrl+Enter는 실행이고 줄을 바꾸지 않는다', () => {
    const { content, props, editor } = renderEditor({ value: 'SELECT 1' })

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))

    expect(props.onRun).toHaveBeenCalledTimes(1)
    expect(editor.state.doc.toString()).toBe('SELECT 1')
  })
})
