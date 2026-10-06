/**
 * SQL 입력 칸 — CodeMirror 6 (09-database-manager/00-data-browser.md §5.3)
 *
 * - 문법 강조는 커넥션의 DBMS 방언(MySQL·PostgreSQL)을 따른다
 * - 키워드와 테이블·뷰 이름을 자동 완성한다(이름은 객체 목록에서 온다)
 * - Ctrl/Cmd+Enter로 실행한다. Tab은 가두지 않는다(키보드로 입력 칸을 벗어날 수 있어야 한다)
 * 색은 index.css의 `--sql-*` 변수에서 온다 — 밝은 테마와 어두운 테마가 같은 코드를 쓴다.
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { MySQL, PostgreSQL, StandardSQL, sql } from '@codemirror/lang-sql'
import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { tags } from '@lezer/highlight'

export interface SqlEditorHandle {
  focus: () => void
  /** 지금 선택 범위(글자 위치) — 선택이 없으면 from과 to가 커서 위치로 같다 */
  selection: () => { from: number; to: number }
}

export interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  /** Ctrl/Cmd+Enter */
  onRun: () => void
  /** database_types 코드 — 강조와 자동 완성의 방언을 고른다 */
  dbmsType: string
  /** 자동 완성에 쓸 테이블·뷰 이름 */
  objectNames: readonly string[]
  ariaLabel: string
  placeholder: string
  ref?: Ref<SqlEditorHandle>
}

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--sql-keyword)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--sql-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--sql-number)' },
  { tag: [tags.lineComment, tags.blockComment], color: 'var(--sql-comment)', fontStyle: 'italic' },
  { tag: tags.typeName, color: 'var(--sql-type)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--muted-foreground)' },
])

const theme = EditorView.theme({
  '&': { fontSize: '0.875rem', backgroundColor: 'var(--background)', color: 'var(--foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    lineHeight: '1.25rem',
  },
  '.cm-content': { padding: '0.5rem', minHeight: '10rem', caretColor: 'var(--foreground)' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--sql-selection)',
  },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--sql-selection)', outline: 'none' },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '0.375rem',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
})

function language(dbmsType: string, objectNames: readonly string[]) {
  const code = dbmsType.trim().toLowerCase()
  const dialect =
    code === 'mysql' || code === 'mariadb'
      ? MySQL
      : code === 'postgresql'
        ? PostgreSQL
        : StandardSQL
  return sql({
    dialect,
    schema: Object.fromEntries(objectNames.map((name) => [name, []])),
    upperCaseKeywords: true,
  })
}

export function SqlEditor({
  value,
  onChange,
  onRun,
  dbmsType,
  objectNames,
  ariaLabel,
  placeholder,
  ref,
}: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const languageRef = useRef(new Compartment())
  // 편집기는 한 번만 만든다 — 콜백은 최신 것을 가리키게 둔다
  const callbacks = useRef({ onChange, onRun })
  useEffect(() => {
    callbacks.current = { onChange, onRun }
  })

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(
            // Mod는 맥에서 Cmd다 — 맥에서도 Ctrl+Enter가 듣도록 둘 다 건다
            keymap.of(
              ['Mod-Enter', 'Ctrl-Enter'].map((key) => ({
                key,
                run: () => {
                  callbacks.current.onRun()
                  return true
                },
              })),
            ),
          ),
          history(),
          closeBrackets(),
          bracketMatching(),
          autocompletion(),
          keymap.of([
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          languageRef.current.of(language(dbmsType, objectNames)),
          syntaxHighlighting(highlightStyle),
          theme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'false' }),
          placeholderExtension(placeholder),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 처음 한 번만 — 값·방언·이름은 아래 효과가 따라간다
  }, [])

  // 밖에서 값이 바뀌었을 때(이력에서 고름 등)만 문서를 갈아 끼운다
  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  const objectNamesKey = objectNames.join('\n')
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageRef.current.reconfigure(language(dbmsType, objectNames)),
    })
    // 이름 목록은 내용으로 비교한다(배열은 렌더마다 새로 만들어진다)
  }, [dbmsType, objectNamesKey])

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    selection: () => {
      const main = viewRef.current?.state.selection.main
      return main ? { from: main.from, to: main.to } : { from: 0, to: 0 }
    },
  }))

  return (
    <div
      ref={hostRef}
      className="max-h-80 overflow-auto rounded-md border border-input focus-within:ring-2 focus-within:ring-ring"
    />
  )
}

export default SqlEditor
