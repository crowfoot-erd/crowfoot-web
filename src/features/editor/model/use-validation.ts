/**
 * 검증 실행 훅 — 문서(content) 변경을 500ms 디바운스해 validateModel을 재계산한다
 * (05-editor/05-validation.md §3 실행 모델)
 *
 * 토글 배지는 패널이 닫혀 있어도 최신이어야 하므로(§4.1) 패널 열림과 무관하게 구독한다.
 * 패널을 여는 시점에는 대기 없이 전체 검증(§3 "열림 시 전체 검증 1회") — 디바운스는 그
 * 이후의 편집부터 적용한다. 재계산 트리거는 문서 변경뿐이다(뷰포트 이동·선택 변경 무시 —
 * 스토어 셀렉터가 present.model 참조만 본다).
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import { useEditorStore } from '@/features/editor/store/editor-store'
import { validateModel, type ValidationIssue } from '@/features/editor/model/validation'

/** 편집 후 재계산 지연 — 스펙 §3 */
export const VALIDATION_DEBOUNCE_MS = 500

/** enabled = 패널·배지가 존재하는 화면(공개 뷰어·버전 뷰어는 검증 자체를 안 한다) */
export function useValidationIssues(enabled: boolean, open: boolean): ValidationIssue[] {
  const model = useEditorStore((s) => s.present.model)
  // 문서 대상 DBMS — FK_WITHOUT_INDEX 등 DBMS 조건부 규칙의 판정 재료(§6.6). 수화 시 고정이라
  // 디바운스 대상이 아니라 현재 값을 그대로 쓴다
  const databaseType = useEditorStore((s) => s.databaseType)
  const [settled, setSettled] = useState(model)
  const prevOpen = useRef(false)

  useEffect(() => {
    if (!enabled) return
    // 열림 전환(닫힘→열림) — 디바운트 없이 즉시 전체 검증. 열려 있는 중의 편집은 아래 타이머로
    if (open && !prevOpen.current) {
      prevOpen.current = true
      setSettled(model)
      return
    }
    prevOpen.current = open
    const timer = setTimeout(() => setSettled(model), VALIDATION_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, model, open])

  return useMemo(
    () => (enabled ? validateModel(settled, databaseType) : []),
    [enabled, settled, databaseType],
  )
}
