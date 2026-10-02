/**
 * 요구사항 화면의 열림과 가리키는 항목 (05-editor/02-ui.md §17)
 *
 * 요구사항은 문서 화면 맨 아래의 탭으로 연다(ERD · 요구사항 · 댓글). 탭 바는 페이지에, 요구사항 화면은
 * 에디터 셸 안에(문서 스토어와 캔버스를 쓴다), 테이블 정보 창의 요구사항 링크는 캔버스에 있다.
 * 서로 떨어진 세 곳을 이 작은 스토어로 잇는다. 문서를 열 때는 늘 ERD 탭에서 시작한다.
 */
import { create } from 'zustand'

interface RequirementsPanelState {
  /** 요구사항 탭이 열려 있다 — 에디터 셸은 캔버스를 감추고 요구사항 화면을 보여 준다 */
  open: boolean
  /** 펼쳐서 보여 줄 요구사항 — 테이블 정보 창에서 넘어올 때 채워진다 */
  focusId: string | null
  show: () => void
  hide: () => void
  /** 요구사항 탭을 열고 그 요구사항으로 간다 */
  reveal: (requirementId: string) => void
  clearFocus: () => void
}

export const useRequirementsPanel = create<RequirementsPanelState>((set) => ({
  open: false,
  focusId: null,
  show: () => set({ open: true }),
  hide: () => set({ open: false, focusId: null }),
  reveal: (requirementId) => set({ open: true, focusId: requirementId }),
  clearFocus: () => set({ focusId: null }),
}))
