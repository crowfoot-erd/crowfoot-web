/**
 * 컬럼 물리명 입력 + 워크스페이스 사전 제안 (05-editor/02-ui.md §8.2, v1.14 2026-09-25)
 *
 * 물리명 input에 포커스하면 입력 아래에 워크스페이스 사전(워크스페이스 공유 — 문서끼리
 * 같은 사전)에 등록된 용어가 서제스트된다. 컬럼 추가 직후 autofocus와 정확히 맞물려
 * "추가 → 사전에서 골라 넣기"가 바로 이어진다.
 *
 * 제안은 **용어**와 **단어**로 나뉜다(v1.30 — model/term-suggest.ts, 08-core/01-workspace.md §4.6).
 * - 용어(도메인 타입을 가리키거나 타입 표기가 있는 항목): 고르면 이름 전체·논리명을 채우고
 *   도메인 타입을 연결한 채 적용한다(없으면 types로 타입을 채운다). 부모(ColumnRow)가 1커밋한다.
 * - 단어(그 밖의 항목): 고르면 지금 치고 있는 조각(마지막 `_` 뒤)만 완성하고 편집을 이어 간다.
 *   타입은 건드리지 않는다. 확정할 때 완성된 이름으로 추론한 논리명을 부모에 함께 넘긴다.
 * - 목록 맨 위에 추론한 논리명을 미리 보여 준다(워크스페이스 사전 기준).
 *
 * - 제안은 워크스페이스 사전만 — 시스템 사전(전역 276토큰)은 목록이 커서 넣지 않는다.
 *   원하는 토큰이 없으면 용어 사전 패널에서 등록하면 바로 이 입력에 나타난다(같은 쿼리 캐시).
 * - 필터: 입력한 초안으로 토큰·라벨 부분 일치(대소문자 무시). 자동 생성 기본 물리명
 *   (column_N)은 미입력으로 취급해 전체 목록을 보여준다 — 지우고 검색하는 단계를 없앤다.
 * - 키보드 ↑↓로 항목 이동, Enter 선택, 클릭 선택. Enter는 CommitInput의 blur-커밋을
 *   가로채(onKeyDownIntercept) 이중 커밋 없이 적용한다(commitExternal — 초안 커밋 스킵).
 * - 읽기 전용·공개 뷰어(workspaceId null)·사전 조회 실패에는 목록을 띄우지 않는다
 *   (입력 자체는 그대로 동작).
 * - 목록은 body 포털로 테이블 위에 떠 있다(2026-09-28 #283, 사용자 보고 — 컬럼 행 안쪽에
 *   absolute로 떴더니 테이블의 스크롤 컨테이너 높이에 포함돼 스크롤이 생기고 잘렸다):
 *   입력 앵커를 rAF로 추적해 fixed로 따라다닌다(캔버스 팬·줌·테이블 스크롤 모두 추종),
 *   아래 공간이 부족하면 위로 플립한다. 포털이라 nowheel/nodrag가 필요 없고 RF 줌 이벤트도
 *   타지 않는다(휠 체이닝은 overscroll-contain으로 막는다).
 */
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { cn } from 'cn'
import type { WorkspaceTerm } from '@/api/types'
import type { DomainType } from '@/features/domain-types/api'
import { useDomainTypes } from '@/features/domain-types/hooks'
import {
  completeWord,
  isTermEntry,
  previewLogicalName,
  suggestTerms,
  workspaceTermMap,
} from '@/features/editor/model/term-suggest'
import { useWorkspaceTerms } from '@/features/terms/hooks'
import { useEditorCanvas } from './editor-context'
import { CommitInput, type CommitInputHandle } from './inline-inputs'

export interface ColumnTermInputProps {
  /** 컬럼 물리명 — CommitInput value */
  value: string
  /** 일반 확정(blur·Enter) — 물리명만 바꾼다. 이번 편집에서 단어를 골라 완성했으면
   *  추론한 논리명을 함께 넘긴다(부모가 논리명이 비었을 때만 채운다) */
  onCommit: (value: string, inferredLabel?: string | null) => boolean | void
  /** 용어 선택 — 물리명·논리명·타입을 한 패치로 채운다(부모 소유). 용어가 가리키는 도메인 타입을
   *  목록에서 찾았으면 함께 넘긴다 — 부모가 연결한 채 적용한다 */
  onApplyTerm: (term: WorkspaceTerm, domainType?: DomainType) => void
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
  /** 이번 편집에서 단어를 골라 완성했는지 — 확정할 때 논리명을 추론해 함께 넘긴다 */
  const usedWord = useRef(false)

  const suggestions = useMemo(
    () => suggestTerms(terms.data?.items ?? [], draft ?? ''),
    [terms.data, draft],
  )
  /** 한 줄 목록 — 용어 먼저, 단어 다음(↑↓ 이동과 Enter 선택의 순서) */
  const items = useMemo(() => [...suggestions.terms, ...suggestions.words], [suggestions])
  const termMap = useMemo(() => workspaceTermMap(terms.data?.items ?? []), [terms.data])
  const preview = draft === null ? null : previewLogicalName(draft, termMap)

  // canEdit는 호출부가 disabled로 넘기지만 이중 장치로 여기서도 닫는다(공개 뷰어 등)
  const open = draft !== null && (items.length > 0 || preview !== null) && !disabled && canEdit

  /** 도메인 타입 목록 — 편집 중(초안이 열려 있을 때)에만 읽는다. 캔버스가 읽어 둔 캐시를 함께 쓴다 */
  const domainTypeList = useDomainTypes(draft !== null && canEdit && !disabled ? workspaceId : null)
  const domainTypes = (): readonly DomainType[] => domainTypeList.data?.items ?? []

  const move = (delta: number) => {
    setActiveIndex((previous) => (previous + delta + items.length) % items.length)
  }

  const apply = (term: WorkspaceTerm) => {
    if (!isTermEntry(term)) {
      // 단어 — 치고 있는 조각만 완성하고 편집을 이어 간다. 타입은 건드리지 않는다
      inputRef.current?.replaceDraft(completeWord(draft ?? '', term.term))
      // 포커스가 다시 걸려 편집 시작으로 처리돼도 표시가 남게, 초안을 바꾼 뒤에 적는다
      usedWord.current = true
      return
    }
    const domainType = term.domainTypeId
      ? domainTypes().find((candidate) => candidate.domainTypeId === term.domainTypeId)
      : undefined
    onApplyTerm(term, domainType)
    // 초안 커밋 없이 적용값으로 마무리 — 부모 패치와 이중 커밋이 되지 않는다
    inputRef.current?.commitExternal(term.term)
  }

  /** 일반 확정 — 단어로 완성한 이름이면 추론한 논리명을 함께 넘긴다 */
  const commit = (next: string) => {
    const inferred = usedWord.current ? previewLogicalName(next, termMap) : undefined
    usedWord.current = false
    return onCommit(next, inferred)
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
      const picked = items[activeIndex] ?? items[0]
      // 제안이 없고 미리보기만 떠 있으면 일반 확정으로 넘긴다
      if (!picked) return false
      apply(picked)
      return true
    }
    return false
  }

  // 목록이 바뀌면(필터·사전 갱신) 활성 항목을 범위 안으로 당긴다
  const active = Math.min(activeIndex, Math.max(items.length - 1, 0))

  /** 제안 앵커(입력 칸)·포털 목록 — rAF 루프에서 위치를 직접 쓴다(상태 아니니 리렌더 없음) */
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const LIST_WIDTH = 288 // w-72
    const LIST_MAX_HEIGHT = 224 // max-h-56
    let raf = 0
    const place = () => {
      const anchor = anchorRef.current
      const list = listRef.current
      if (anchor && list) {
        const rect = anchor.getBoundingClientRect()
        // 왼쪽은 앵커에 맞추되 오른쪽 화면을 넘지 않게 클램프
        list.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - LIST_WIDTH - 8))}px`
        const roomBelow = window.innerHeight - rect.bottom - 8
        if (roomBelow >= 160) {
          list.style.top = `${rect.bottom + 2}px`
          list.style.transform = ''
          list.style.maxHeight = `${Math.min(LIST_MAX_HEIGHT, roomBelow)}px`
        } else {
          // 아래 공간 부족 — 앵커 위로 플립(translateY(-100%)로 하단을 앵커 상단에 댄다)
          list.style.top = `${rect.top - 2}px`
          list.style.transform = 'translateY(-100%)'
          list.style.maxHeight = `${Math.min(LIST_MAX_HEIGHT, rect.top - 8)}px`
        }
      }
      raf = requestAnimationFrame(place)
    }
    place() // layout 페이즈에 첫 배치 — fixed 기본 위치가 한 프레임 보이는 플래시를 막는다
    return () => cancelAnimationFrame(raf)
  }, [open])

  // 목록은 앵커 안(스크롤 컨테이너)이 아니라 body 위에 떠야 테이블 스크롤을 만들지 않는다
  const list = open ? (
    <ul
      ref={listRef}
      role="listbox"
      aria-label={t('model.editor.table.termSuggestLabel')}
      className="fixed z-50 w-72 overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-xs shadow-md"
    >
      {preview !== null ? (
        <li role="presentation" className="flex items-center gap-1.5 px-1.5 py-1 text-muted-foreground" data-testid="term-preview">
          <span className="shrink-0 text-[10px]">{t('model.editor.table.termPreview')}</span>
          <span className="min-w-0 flex-1 truncate text-foreground">{preview}</span>
        </li>
      ) : null}
      {items.map((row, index) => {
        const isTerm = isTermEntry(row)
        const domainName = row.domainTypeId
          ? domainTypes().find((candidate) => candidate.domainTypeId === row.domainTypeId)?.name
          : undefined
        const type = row.types?.[databaseType]
        // 묶음의 첫 항목 앞에 제목을 둔다 — 용어(이름 전체) / 단어(조각 완성)
        const heading =
          index === 0 && isTerm
            ? t('model.editor.table.termGroupTerms')
            : index === suggestions.terms.length && !isTerm
              ? t('model.editor.table.termGroupWords')
              : null
        return (
          <Fragment key={row.termId}>
            {heading ? (
              <li role="presentation" className="px-1.5 pb-0.5 pt-1 text-[10px] font-medium text-muted-foreground">
                {heading}
              </li>
            ) : null}
            <li
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
              {domainName ? (
                <span className="shrink-0 rounded-sm bg-violet-500/15 px-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                  {domainName}
                </span>
              ) : type ? (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {type}
                </span>
              ) : null}
            </li>
          </Fragment>
        )
      })}
    </ul>
  ) : null

  return (
    <div ref={anchorRef} className="flex min-w-0 flex-1 items-center">
      <CommitInput
        ref={inputRef}
        className={cn('min-w-0 flex-1', className)}
        value={value}
        onCommit={commit}
        ariaLabel={ariaLabel}
        required
        disabled={disabled}
        autoFocus={autoFocus}
        onFocused={() => {
          // 포커스 = 편집 시작 — 초안을 현재 물리명으로 열어 입력 없이 바로 제안이 뜨게 한다.
          // column_N은 items 쪽 규칙이 빈 검색으로 취급해 전체 목록을 보여준다
          setDraft(value)
          setActiveIndex(0)
          usedWord.current = false
          onFocused?.()
        }}
        onDraftChange={(next) => {
          setDraft(next)
          if (next !== null) setActiveIndex(0)
        }}
        onKeyDownIntercept={interceptKeyDown}
      />
      {list ? createPortal(list, document.body) : null}
    </div>
  )
}
