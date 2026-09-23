/**
 * 캔버스 공유 컨텍스트 — 노드 data 대신 context로 주입해 node 객체 참조를 안정화한다.
 *
 * node.data에 콜백을 넣으면 스토어 동기화마다 새 참조가 만들어져 전 노드가 리렌더된다
 * (성능 전략 위반). canEdit·다이얼로그 오픈러·뷰 옵션은 값이 바뀔 때만 갱신되는 context로 전달.
 */
import { createContext, useContext } from 'react'

import type { Multiplicity, RelationshipType } from '@/features/editor/model/content-schema'
import type { KeyKind } from '@/features/editor/model/keys'

/** 테이블 이름 표시 모드 — 물리명만 / 논리명만 / 둘 다 (erwin·aQueryTool 뷰 전환) */
export type NameDisplayMode = 'physical' | 'logical' | 'both'

/** 컬럼 표시 모드 — 전체 컬럼 / 키(PK·FK)만. 넓은 모델을 훑어볼 때 일반 컬럼 행을 접는다 */
export type ColumnDisplayMode = 'all' | 'keys'

/** 관계선이 붙는 노드 면 — RF Handle id와 일치 */
export type RelationHandleId = 'top' | 'bottom' | 'left' | 'right'

/** 핸들 팝업에서 유형·종류·기수까지 선택 완료된 관계 — 마우스를 따라 선이 움직이고 대상 테이블 클릭으로 확정된다 */
export interface PendingRelation {
  /** 시작 테이블 = 부모(1) — PK를 제공하는 참조되는 쪽 */
  parentId: string
  /** 시작(부모) 테이블에서 선이 나가는 면 (팝업을 띄운 밴드 방향) */
  parentHandle: RelationHandleId
  type: RelationshipType
  identifying: boolean
  /** 부모(1) 쪽 기수 — ‖ 또는 ○‖ */
  parentMultiplicity: Multiplicity
  /** 자식(N) 쪽 기수 — 발톱 3종 / 1:1이면 ‖·○‖. FK 컬럼은 대상(자식) 테이블에 생성된다 */
  childMultiplicity: Multiplicity
}

export interface EditorCanvasContextValue {
  canEdit: boolean
  /** 문서 대상 DBMS 템플릿 id — 문서 생성 시점의 모델 메타에서 파생, 문서 수명 동안 불변 */
  dbmsId: string
  /** 테이블 정보 다이얼로그 열기 — 노드 헤더 ⓘ·더블클릭·컨텍스트 메뉴 */
  openTableInfo: (tableId: string) => void
  /** 컬럼 정보 다이얼로그 열기 — 컬럼 행 이름 더블클릭 */
  openColumnInfo: (tableId: string, columnId: string) => void
  /** 키(유니크·인덱스) 정보 다이얼로그 열기 — 키 영역 행 클릭·추가 버튼. keyId null = 생성 */
  openKeyInfo: (tableId: string, keyId: string | null, kind: KeyKind) => void
  /** 진행 중 관계 — 핸들 팝업에서 유형 선택 후 대상 테이블 클릭 대기 중. Esc·빈 캔버스 클릭으로 취소 */
  pendingRelation: PendingRelation | null
  /** 관계 유형·종류·기수 선택 확정 — 이후 마우스를 따라 선이 움직인다 */
  startPendingRelation: (relation: PendingRelation) => void
  /** 진행 중 관계를 대상(자식) 테이블에 확정 — 연결면은 배치 기준으로 자동 계산된다 */
  completeRelation: (targetTableId: string) => void
  /** 점(핸들) 클릭 — 캔버스 오버레이에서 관계 유형·종류를 고르는 선택기를 연다 */
  openRelationPicker: (parentId: string, side: RelationHandleId) => void
  nameDisplay: NameDisplayMode
  columnDisplay: ColumnDisplayMode
  /** 노드가 자기 렌더 크기(폭·높이)를 보고 — 캔버스가 겹침 해소(이웃 밀어내기)에 쓴다. 안정 참조여야 한다 */
  reportSize: (tableId: string, width: number, height: number) => void
}

export const EditorCanvasContext = createContext<EditorCanvasContextValue>({
  canEdit: false,
  dbmsId: 'common',
  openTableInfo: () => {},
  openColumnInfo: () => {},
  openKeyInfo: () => {},
  pendingRelation: null,
  startPendingRelation: () => {},
  completeRelation: () => {},
  openRelationPicker: () => {},
  nameDisplay: 'both',
  columnDisplay: 'all',
  reportSize: () => {},
})

export function useEditorCanvas(): EditorCanvasContextValue {
  return useContext(EditorCanvasContext)
}
