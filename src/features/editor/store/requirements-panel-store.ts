/**
 * 요구사항 패널의 열림과 가리키는 항목 (05-editor/02-ui.md §17)
 *
 * 패널은 도구 모음 버튼으로도, 테이블 정보 창의 요구사항 링크로도 열린다. 두 곳이 떨어져 있어
 * (도구 모음은 셸, 정보 창은 캔버스) 작은 스토어로 잇는다. 열림은 브라우저에 기억한다(기본 닫힘).
 */
import { create } from 'zustand'

const OPEN_KEY = 'crowfoot.editor.requirements-open'

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open))
  } catch {
    // 시크릿 모드 등 저장 실패는 무시 — 상태만 전환한다
  }
}

interface RequirementsPanelState {
  open: boolean
  /** 펼쳐서 보여 줄 요구사항 — 테이블 정보 창에서 넘어올 때 채워진다 */
  focusId: string | null
  toggle: () => void
  /** 패널을 열고 그 요구사항으로 간다 */
  reveal: (requirementId: string) => void
  clearFocus: () => void
}

export const useRequirementsPanel = create<RequirementsPanelState>((set, get) => ({
  open: readOpen(),
  focusId: null,
  toggle: () => {
    const open = !get().open
    writeOpen(open)
    set({ open, focusId: null })
  },
  reveal: (requirementId) => {
    writeOpen(true)
    set({ open: true, focusId: requirementId })
  },
  clearFocus: () => set({ focusId: null }),
}))
