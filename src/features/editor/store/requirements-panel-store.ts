/**
 * 요구사항 화면의 열림과 가리키는 항목 (05-editor/02-ui.md §17)
 *
 * 요구사항은 문서 화면 맨 아래의 탭으로 연다(ERD · 요구사항 · 댓글). 탭 바는 페이지에, 요구사항 화면은
 * 에디터 셸 안에(문서 스토어와 캔버스를 쓴다), 테이블 정보 창의 요구사항 링크는 캔버스에 있다.
 * 서로 떨어진 세 곳을 이 작은 스토어로 잇는다. 문서를 열 때는 늘 ERD 탭에서 시작한다.
 *
 * 수용 기준을 데이터로 확인한 결과(v1.36)도 여기에 둔다 — 탭을 옮겨도 남고, 문서에는 저장하지 않는다.
 * 결과는 그때 보낸 SQL·기대값과 함께 두어, 기준의 SQL을 고치면 옛 결과를 보여 주지 않는다.
 */
import { create } from 'zustand'

import type { CheckResult } from '@/features/database/api'

/** 한 기준의 확인 결과 — 보낸 SQL과 함께 */
export interface CriterionCheckRun extends CheckResult {
  sql: string
}

export interface CriterionChecks {
  /** 결과가 속한 문서 — 다른 문서를 열면 버린다 */
  modelId: string
  /** 키는 `${요구사항 코드}/${기준 id}` */
  results: Record<string, CriterionCheckRun>
  /** 마지막으로 돌린 확인의 요약 */
  summary: { passed: number; failed: number; errors: number }
}

/** 확인 결과의 키 — 요청의 key와 같다 */
export const criterionCheckKey = (code: string, criterionId: string) => `${code}/${criterionId}`

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
  checks: CriterionChecks | null
  /** 확인 결과를 더한다 — 같은 문서면 앞 결과에 덮어쓰고, 다른 문서면 새로 시작한다 */
  addCheckResults: (modelId: string, runs: CriterionCheckRun[], summary: CriterionChecks['summary']) => void
}

export const useRequirementsPanel = create<RequirementsPanelState>((set) => ({
  open: false,
  focusId: null,
  show: () => set({ open: true }),
  hide: () => set({ open: false, focusId: null }),
  reveal: (requirementId) => set({ open: true, focusId: requirementId }),
  clearFocus: () => set({ focusId: null }),
  checks: null,
  addCheckResults: (modelId, runs, summary) =>
    set((state) => {
      const base = state.checks?.modelId === modelId ? state.checks.results : {}
      const results = { ...base }
      for (const run of runs) results[run.key] = run
      return { checks: { modelId, results, summary } }
    }),
}))
