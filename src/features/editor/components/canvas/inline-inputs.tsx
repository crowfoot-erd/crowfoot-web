/**
 * 인라인 편집 프리미티브 — 로컬 상태 보관, blur/Enter 확정 (성능 전략)
 *
 * 키 입력마다 스토어를 쓰지 않는다: 타수당 스냅샷·리렌더 0, blur(또는 Enter) 시 1커밋.
 * Esc는 초안 폐기. 외부 값 갱신(undo 등)은 포커스가 없을 때만 반영해 입력 중 덮어쓰지 않는다.
 * 모든 요소에 nodrag — 캔버스 드래그와 입력 클릭을 분리한다.
 */
import { useEffect, useRef, useState } from 'react'

import { cn } from 'cn'

interface CommitInputProps {
  value: string
  /** false를 반환하면 거부 — 초안을 value로 되돌린다 (예: 이름 중복 차단) */
  onCommit: (value: string) => boolean | void
  ariaLabel: string
  /** 빈 값은 커밋하지 않고 되돌린다 (물리명 min(1) 계약) */
  required?: boolean
  placeholder?: string
  type?: 'text' | 'number'
  disabled?: boolean
  /** 신규 행 추가 직후 포커스 — 마운트 시 1회만 동작 */
  autoFocus?: boolean
  onFocused?: () => void
  /** 초안 변화 통보 — null은 편집 종료(blur)로 원본 기준 복귀.
   *  입력 중에도 부모가 폭 측정 등에 초안을 반영할 수 있게 한다. */
  onDraftChange?: (draft: string | null) => void
  className?: string
}

export function CommitInput({
  value,
  onCommit,
  ariaLabel,
  required = false,
  placeholder,
  type = 'text',
  disabled = false,
  autoFocus = false,
  onFocused,
  onDraftChange,
  className,
}: CommitInputProps) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])

  const commit = () => {
    const next = draft.trim()
    if (required && next === '') {
      setDraft(value)
      return
    }
    if (next === value) return
    if (onCommit(next) === false) setDraft(value)
  }

  return (
    <input
      className={cn('nodrag nowheel rounded-sm bg-transparent px-1 py-0.5 outline-none focus:bg-accent focus:text-accent-foreground', className)}
      type={type}
      value={draft}
      title={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      onFocus={() => {
        focused.current = true
        onFocused?.()
      }}
      onBlur={() => {
        focused.current = false
        onDraftChange?.(null)
        commit()
      }}
      onChange={(event) => {
        setDraft(event.target.value)
        onDraftChange?.(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

interface CommitSelectProps {
  value: string
  options: { value: string; label: string }[]
  onCommit: (value: string) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
}

/** native select — 변경 즉시 커밋(이산 선택이라 blur 대기가 불필요) */
export function CommitSelect({ value, options, onCommit, ariaLabel, disabled = false, className }: CommitSelectProps) {
  return (
    <select
      // py-1 -my-1 — 시각 행 높이 유지 + 클릭(히트) 영역만 위아래로 여유
      className={cn('nodrag cursor-pointer appearance-none rounded-sm bg-transparent px-1 py-1 -my-1 outline-none focus:bg-accent', className)}
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) => onCommit(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
