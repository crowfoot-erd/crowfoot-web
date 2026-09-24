/**
 * 컬럼 물리명 입력 + 워크스페이스 사전 제안 (05-editor/02-ui.md §8.2, v1.14 2026-09-25)
 *
 * 물리명 input에 포커스하면 입력 아래에 워크스페이스 사전(워크스페이스 공유 — 문서끼리
 * 같은 사전)에 등록된 용어가 서제스트된다. 컬럼 추가 직후 autofocus와 정확히 맞물려
 * "추가 → 사전에서 골라 넣기"가 바로 이어진다. 항목 선택은 물리명·논리명·타입을
 * 한 덩어리로 채운다(부모(ColumnRow)가 column/patch 1커밋) — 타입은 용어 types 맵 중
 * 문서 DB 종류 키 값(물리 표기)을 parsePhysicalType로 논리 코드+p/s로 되돌려 적용하고,
 * 용어에 그 종류 타입이 없으면 타입 칸은 건드리지 않는다.
 *
 * - 제안은 워크스페이스 사전만 — 시스템 사전(전역 276토큰)은 목록이 커서 넣지 않는다.
 *   원하는 토큰이 없으면 용어 사전 패널에서 등록하면 바로 이 입력에 나타난다(같은 쿼리 캐시).
 * - 필터: 입력한 초안으로 토큰·라벨 부분 일치(대소문자 무시). 자동 생성 기본 물리명
 *   (column_N)은 미입력으로 취급해 전체 목록을 보여준다 — 지우고 검색하는 단계를 없앤다.
 * - 키보드 ↑↓로 항목 이동, Enter 선택, 클릭 선택. Enter는 CommitInput의 blur-커밋을
 *   가로채(onKeyDownIntercept) 이중 커밋 없이 적용한다(commitExternal — 초안 커밋 스킵).
 * - 읽기 전용·공개 뷰어(workspaceId null)·사전 조회 실패에는 목록을 띄우지 않는다
 *   (입력 자체는 그대로 동작).
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from 'cn'
import type { WorkspaceTerm } from '@/api/types'
import { useWorkspaceTerms } from '@/features/terms/hooks'
import { useEditorCanvas } from './editor-context'
import { CommitInput, type CommitInputHandle } from './inline-inputs'

/** 제안 최대 노출 수 — 그보다 많으면 필터로 좁힌다(276토큰급 전역 사전이 아니라 충분) */
const SUGGEST_LIMIT = 8

export interface ColumnTermInputProps {
  /** 컬럼 물리명 — CommitInput value */
  value: string
  /** 일반 확정(blur·Enter) — 물리명만 바꾼다 */
  onCommit: (value: string) => boolean | void
  /** 제안 선택 — 물리명·논리명·타입을 한 패치로 채운다(부모 소유) */
  onApplyTerm: (term: WorkspaceTerm) => void
  ariaLabel: string
  autoFocus?: boolean
  onFocused?: () => void
  disabled?: boolean
  className?: string
}

export function ColumnTermInput({
  value,
  onCommit,
  onApplyTerm,
  ariaLabel,
  autoFocus,
  onFocused,
  disabled,
  className,
}: ColumnTermInputProps) {
  const { t } = useTranslation()
  const { canEdit, workspaceId, databaseType } = useEditorCanvas()
  /** 초안(null = 포커스 아님 = 제안 닫힘) */
  const [draft, setDraft] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<CommitInputHandle>(null)

  const terms = useWorkspaceTerms(workspaceId ?? '')

  const items = useMemo(() => {
    const all = terms.data?.items ?? []
    const query = (draft ?? '').trim().toLowerCase()
    // 자동 생성 기본 물리명(column_N)은 미입력 취급 — 추가 직후 전체 제안을 바로 보여준다
    const effective =
      query === '' || /^column_\d+$/i.test(query) ? '' : query
    const filtered = effective
      ? all.filter(
          (row) =>
            row.term.toLowerCase().includes(effective) ||
            row.label.toLowerCase().includes(effective),
        )
      : all
    return filtered.slice(0, SUGGEST_LIMIT)
  }, [terms.data, draft])

  // canEdit는 호출부가 disabled로 넘기지만 이중 장치로 여기서도 닫는다(공개 뷰어 등)
  const open = draft !== null && items.length > 0 && !disabled && canEdit

  const move = (delta: number) => {
    setActiveIndex((previous) => (previous + delta + items.length) % items.length)
  }

  const apply = (term: WorkspaceTerm) => {
    onApplyTerm(term)
    // 초안 커밋 없이 적용값으로 마무리 — 부모 패치와 이중 커밋이 되지 않는다
    inputRef.current?.commitExternal(term.term)
  }

  /** 제안 목록이 열려 있을 때만 키를 가져간다 — IME 조립 중 Enter는 가로채지 않는다 */
  const interceptKeyDown = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    if (!open) return false
    if (event.nativeEvent.isComposing || event.keyCode === 229) return false
    if (event.key === 'ArrowDown') {
      move(1)
      return true
    }
    if (event.key === 'ArrowUp') {
      move(-1)
      return true
    }
    if (event.key === 'Enter') {
      apply(items[activeIndex] ?? items[0])
      return true
    }
    return false
  }

  // 목록이 바뀌면(필터·사전 갱신) 활성 항목을 범위 안으로 당긴다
  const active = Math.min(activeIndex, Math.max(items.length - 1, 0))

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <CommitInput
        ref={inputRef}
        className={cn('min-w-0 flex-1', className)}
        value={value}
        onCommit={onCommit}
        ariaLabel={ariaLabel}
        required
        disabled={disabled}
        autoFocus={autoFocus}
        onFocused={() => {
          // 포커스 = 편집 시작 — 초안을 현재 물리명으로 열어 입력 없이 바로 제안이 뜨게 한다.
          // column_N은 items 쪽 규칙이 빈 검색으로 취급해 전체 목록을 보여준다
          setDraft(value)
          setActiveIndex(0)
          onFocused?.()
        }}
        onDraftChange={(next) => {
          setDraft(next)
          if (next !== null) setActiveIndex(0)
        }}
        onKeyDownIntercept={interceptKeyDown}
      />
      {open ? (
        <ul
          role="listbox"
          aria-label={t('model.editor.table.termSuggestLabel')}
          className="nodrag nowheel absolute left-0 top-full z-20 mt-0.5 max-h-56 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-xs shadow-md"
        >
          {items.map((row, index) => {
            const type = row.types?.[databaseType]
            return (
              <li
                key={row.termId}
                role="option"
                aria-selected={index === active}
                // mousedown 기본(blur)을 막아 클릭 적용이 blur-커밋보다 먼저 확정되게 한다
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(row)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1',
                  index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
              >
                <code className="min-w-0 shrink-0 truncate font-mono text-muted-foreground">
                  {row.term}
                </code>
                <span aria-hidden className="shrink-0 text-muted-foreground">
                  →
                </span>
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {type ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {type}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
