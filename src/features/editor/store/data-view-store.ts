/**
 * 데이터 보기 탭의 열림과 고른 객체 (05-editor/02-ui.md §22, 09-database-manager/00-data-browser.md §5.1)
 *
 * 데이터 보기는 문서 화면 맨 아래의 탭이다(ERD · 요구사항 · 데이터 보기 · 댓글). 탭 바는 페이지에,
 * 데이터 브라우저는 에디터 셸 안에, 들어가는 곳(도구 메뉴·테이블 우클릭)은 툴바와 캔버스에 있다.
 * 요구사항 탭과 같이 이 작은 스토어로 잇는다.
 *
 * - 고른 객체와 탭은 주소가 아니라 여기에 둔다 — 에디터 주소를 바꾸지 않는다
 * - 처음 열 때 마운트하고(그 전에는 데이터 브라우저 코드를 내려받지 않는다), 다른 탭으로 옮겨도 내리지 않는다
 * - 탭은 문서 열기 화면이 켠다(available). 공개 뷰어·버전 뷰어에는 탭이 없어 들어가는 곳도 숨는다
 * - 구조 탭의 문서 비교(§22)가 도구 메뉴의 다이얼로그(DB 동기화·마이그레이션 DDL)를 열 때도 여기로 잇는다(toolRequest)
 */
import { create } from 'zustand'

import { useRequirementsPanel } from '@/features/editor/store/requirements-panel-store'

export type DataViewTab = 'data' | 'structure' | 'sql'

/** 구조 탭에서 열어 달라고 하는 도구 다이얼로그 — 문서로 가져오기(DB 동기화)·DB에 반영(마이그레이션 DDL) */
export type DataViewTool = 'sync' | 'migration'

interface DataViewState {
  /** 이 화면에 데이터 보기 탭이 있다 — 문서 열기 화면이 편집 권한(Editor 이상)일 때 켠다 */
  available: boolean
  /** 데이터 보기 탭이 열려 있다 — 에디터 셸은 캔버스를 감추고 데이터 브라우저를 보여 준다 */
  open: boolean
  /** 한 번이라도 열었다 — 이때부터 데이터 브라우저를 마운트해 둔다 */
  mounted: boolean
  /** 탭 상태가 속한 문서 — 다른 문서를 열면 처음부터 시작한다 */
  modelId: string | null
  object: string | null
  tab: DataViewTab
  /** 바깥(캔버스 우클릭)에서 고르라고 한 객체 — 브라우저가 적용하지 않은 변경을 확인한 뒤 고른다 */
  request: { object: string; seq: number } | null
  /** 도구 메뉴가 열 다이얼로그 — 번호가 바뀔 때마다 한 번 연다 */
  toolRequest: { tool: DataViewTool; seq: number } | null
  requestTool: (tool: DataViewTool) => void
  setAvailable: (available: boolean) => void
  /** 탭을 연다. 객체를 주면 그 객체의 데이터 탭으로 간다 */
  show: (object?: string) => void
  hide: () => void
  navigate: (object: string | null, tab: DataViewTab) => void
  /** 에디터 셸이 문서를 열 때 — 다른 문서면 비우고 닫는다. 같은 문서면 고른 객체와 탭을 남긴다.
   *  댓글 탭(셸을 내린다)에서 데이터 보기 탭을 눌러 셸이 다시 올라온 경우는 열린 채로 둔다 */
  enter: (modelId: string) => void
}

export const useDataView = create<DataViewState>((set, get) => ({
  available: false,
  open: false,
  mounted: false,
  modelId: null,
  object: null,
  tab: 'data',
  request: null,
  toolRequest: null,
  requestTool: (tool) => set({ toolRequest: { tool, seq: (get().toolRequest?.seq ?? 0) + 1 } }),
  setAvailable: (available) => set(available ? { available } : { available, open: false }),
  show: (object) => {
    // 요구사항 탭과 동시에 열리지 않는다 — 하단 탭은 하나만 고른다
    useRequirementsPanel.getState().hide()
    const seq = (get().request?.seq ?? 0) + 1
    set(
      object
        ? { open: true, mounted: true, request: { object, seq } }
        : { open: true, mounted: true },
    )
  },
  hide: () => set({ open: false }),
  navigate: (object, tab) => set({ object, tab }),
  enter: (modelId) =>
    set((state) =>
      state.modelId !== modelId
        ? { open: false, mounted: false, request: null, modelId, object: null, tab: 'data' }
        : state.open
          ? {}
          : { mounted: false, request: null },
    ),
}))

/** 테스트 격리 — 처음 상태로 되돌린다 */
export function resetDataView() {
  useDataView.setState({
    available: false,
    open: false,
    mounted: false,
    modelId: null,
    object: null,
    tab: 'data',
    request: null,
    toolRequest: null,
  })
}
