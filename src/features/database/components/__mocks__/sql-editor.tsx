/**
 * SQL 입력 칸의 테스트 대역 — 기본 textarea.
 * jsdom은 CodeMirror의 입력(contenteditable)을 흉내 내지 못한다. 화면 테스트는 이 대역으로 입력하고,
 * 실제 편집기는 sql-editor.test.tsx가 따로 확인한다(src/test/setup.ts에서 전역으로 바꿔 끼운다).
 */
import { useImperativeHandle, useRef } from 'react'

import type { SqlEditorProps } from '../sql-editor'

export function SqlEditor({ value, onChange, onRun, ariaLabel, placeholder, ref }: SqlEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    selection: () => ({
      from: textareaRef.current?.selectionStart ?? value.length,
      to: textareaRef.current?.selectionEnd ?? value.length,
    }),
  }))
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault()
          onRun()
        }
      }}
      aria-label={ariaLabel}
      placeholder={placeholder}
    />
  )
}

export default SqlEditor
