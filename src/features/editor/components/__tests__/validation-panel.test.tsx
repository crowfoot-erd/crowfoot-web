/**
 * 검증 패널 — 요약·등급 필터·그룹 목록·클릭 선택·빈 상태·감사 POST 1회 (05-editor/05-validation.md §4·§6)
 *
 * 패널만 렌더해 스토어 상태(라벨·선택 원천)로 검증한다 — 포커스 뷰포트 이동은 익스플로러와
 * 같은 로직이라 e2e가 담당. EditorShell 통합(토글·배지·localStorage·뷰어 게이트)은
 * editor-shell.test.tsx, 규칙 정의 17종은 model/__tests__/validation.test.ts가 맡는다.
 *
 * 픽스처 문서는 정확히 3문제를 낸다: orders에 PK 없음(warning)·FK NULL 허용 불일치(error,
 * parentMultiplicity EXACTLY_ONE + nullable FK)·FK 인덱스 없음(info). 나머지 규칙은 통과다.
 */
import { ReactFlowProvider } from '@xyflow/react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { server } from '@/api/mocks/server'
import { EditorToolbar } from '@/features/editor/components/EditorToolbar'
import { ValidationPanel } from '@/features/editor/components/ValidationPanel'
import { createColumn, createTable } from '@/features/editor/model/changes'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { validateModel } from '@/features/editor/model/validation'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

function issueDoc(): EditorDocument {
  const users = createTable('users', {
    id: 't-users',
    logicalName: '회원',
    columns: [
      createColumn({ id: 'c-uid-pk', physicalName: 'id', logicalName: 'ID', dataType: 'BIGINT', nullable: false }),
    ],
    primaryKey: { name: 'pk_users', columnIds: ['c-uid-pk'] },
  })
  // PK 없음(MISSING_PK) + FK 컬럼 nullable(FK_NULLABILITY_MISMATCH) — 둘 다 orders 문제
  const orders = createTable('orders', {
    id: 't-orders',
    logicalName: '주문',
    columns: [
      createColumn({ id: 'c-oid', physicalName: 'id', logicalName: 'ID', dataType: 'BIGINT', nullable: false }),
      createColumn({ id: 'c-fk', physicalName: 'user_id', logicalName: '사용자 ID', dataType: 'BIGINT', nullable: true }),
    ],
  })
  return {
    model: {
      tables: [users, orders],
      relationships: [
        {
          id: 'rel-1',
          name: 'rel_1',
          fkName: 'fk_orders_users',
          parentTableId: 't-users',
          childTableId: 't-orders',
          type: 'ONE_TO_MANY',
          identifying: false,
          parentMultiplicity: 'EXACTLY_ONE',
          childMultiplicity: 'ZERO_OR_MORE',
          columnMappings: [{ parentColumnId: 'c-uid-pk', childColumnId: 'c-fk' }],
          onDelete: 'NO_ACTION',
          onUpdate: 'NO_ACTION',
        },
      ],
    },
    diagram: {
      nodes: {
        't-users': { x: 0, y: 0, width: null, color: 'default' },
        't-orders': { x: 400, y: 0, width: null, color: 'default' },
      },
      notes: [],
      areas: [],
      viewport: null,
    },
  }
}

/** 문서 DB 종류 — FK_WITHOUT_INDEX가 발화하는 PostgreSQL(§6.6 자동 생성 안 함)로 고정 */
const DOC_DB = 'postgresql'

function hydrate(doc: EditorDocument) {
  useEditorStore.getState().hydrate({ modelId: '501', baseVersion: 0, document: doc, databaseType: DOC_DB })
  return doc
}

function renderPanel(options: { open?: boolean; issues?: ReturnType<typeof validateModel>; canReport?: boolean } = {}) {
  const doc = hydrate(issueDoc())
  const { open = true, issues = validateModel(doc.model, DOC_DB), canReport = false } = options
  return renderWithProviders(
    <ReactFlowProvider>
      <ValidationPanel open={open} issues={issues} canReport={canReport} workspaceId="101" modelId="501" />
    </ReactFlowProvider>,
    { wrapRoutes: false },
  )
}

/** 이 파일의 감사 POST 추적기 — MSW 라이프사이클 이벤트로 잡는다(실제 네트워크 경로) */
const validationPosts: Request[] = []
let validationPostListener: ((event: { request: Request }) => void) | null = null
function trackValidationPosts() {
  validationPostListener = ({ request }) => {
    if (new URL(request.url).pathname.endsWith('/validation-runs')) validationPosts.push(request)
  }
  server.events.on('request:start', validationPostListener)
}

afterEach(() => {
  if (validationPostListener) server.events.removeListener('request:start', validationPostListener)
  validationPostListener = null
  validationPosts.length = 0
  resetEditorStore()
  resetSessionState()
})

describe('ValidationPanel — 요약·목록', () => {
  it('등급별 요약 칩과 테이블 그룹 목록을 렌더한다 — 등급 → Rule ID 정렬', () => {
    renderPanel()

    // 요약 칩 — 등급별 건수(칩이 요약이자 필터 토글이다)
    expect(screen.getByTestId('validation-filter-error')).toHaveTextContent('오류 1')
    expect(screen.getByTestId('validation-filter-warning')).toHaveTextContent('경고 1')
    expect(screen.getByTestId('validation-filter-info')).toHaveTextContent('참고 1')

    // 같은 테이블 문제는 그룹 헤더로 묶는다 — 전부 orders 문제다
    expect(screen.getByText('orders (3)')).toBeInTheDocument()

    // 행 순서 — error가 warning·info보다 위
    const rows = screen.getAllByTestId('validation-issue')
    expect(rows[0]).toHaveTextContent('FK NULL 허용 불일치')
    expect(rows[1]).toHaveTextContent('기본키 없음')
    expect(rows[2]).toHaveTextContent('FK 선두 컬럼 인덱스 없음')

    // 대상 표기 — 컬럼을 싣는 규칙은 테이블.컬럼(FK 인덱스 규칙도 선두 자식 컬럼을 싣는다),
    // 컬럼 없는 관계 규칙만 fk: 부모 → 자식
    expect(rows[0]).toHaveTextContent('orders.user_id')
    expect(rows[2]).toHaveTextContent('orders.user_id')
  })

  it('행 클릭 → 스토어 선택 반영(캔버스와 같은 선택 원천)', () => {
    renderPanel()

    fireEvent.click(screen.getAllByTestId('validation-issue')[0])
    expect(useEditorStore.getState().selectedIds).toEqual(['t-orders'])
  })
})

describe('ValidationPanel — 등급 필터', () => {
  it('error를 끄면 error 행이 사라진다', () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('validation-filter-error'))
    expect(screen.getByTestId('validation-filter-error')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('FK NULL 허용 불일치')).toBeNull()
    expect(screen.getByText('기본키 없음')).toBeInTheDocument()
  })

  it('마지막 남은 필터는 꺼지지 않는다 — 빈 목록은 필터가 아니라 문서 상태다', () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('validation-filter-error'))
    fireEvent.click(screen.getByTestId('validation-filter-warning'))
    // info만 남았다 — 끄려 해도 유지된다
    fireEvent.click(screen.getByTestId('validation-filter-info'))
    expect(screen.getByTestId('validation-filter-info')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('FK 선두 컬럼 인덱스 없음')).toBeInTheDocument()
  })
})

describe('ValidationPanel — 빈 상태·마운트 게이트', () => {
  it('issues가 없으면 문제 없음 상태를 보여준다', () => {
    renderPanel({ issues: [] })

    expect(screen.getByTestId('validation-empty')).toHaveTextContent('문제 없음')
    expect(screen.queryByTestId('validation-issue')).toBeNull()
  })

  it('open=false면 마운트하지 않는다', () => {
    renderPanel({ open: false })
    expect(screen.queryByTestId('validation-panel')).toBeNull()
  })
})

describe('ValidationPanel — 감사 전송(§5)', () => {
  it('Editor 멤버십이면 패널 열림 시 1회 POST — 열림 시점 건수를 그대로 보낸다', async () => {
    trackValidationPosts()
    renderPanel({ canReport: true })

    await waitFor(() => expect(validationPosts).toHaveLength(1))
    expect(await validationPosts[0].json()).toEqual({ errorCount: 1, warningCount: 1, infoCount: 1 })
  })

  it('재렌더(건수 변화)로 추가 전송하지 않는다 — 디바운스 재계산마다 보내지 않는다', async () => {
    trackValidationPosts()
    const doc = hydrate(issueDoc())
    const utils = renderPanel({ canReport: true, issues: validateModel(doc.model, DOC_DB) })
    await waitFor(() => expect(validationPosts).toHaveLength(1))

    utils.rerender(
      <ReactFlowProvider>
        <ValidationPanel open issues={[]} canReport workspaceId="101" modelId="501" />
      </ReactFlowProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('validation-empty')).toBeInTheDocument())
    expect(validationPosts).toHaveLength(1)
  })

  it('Viewer(canReport=false)는 열람만 하고 전송하지 않는다', async () => {
    trackValidationPosts()
    renderPanel({ canReport: false })

    await waitFor(() => expect(screen.getByTestId('validation-panel')).toBeInTheDocument())
    expect(validationPosts).toHaveLength(0)
  })
})

describe('EditorToolbar — 검증 토글 배지(§4.1)', () => {
  const renderToolbar = (errorCount: number, warningCount: number) =>
    renderWithProviders(
      <ReactFlowProvider>
        <EditorToolbar
          canEdit
          saving={false}
          onSave={() => {}}
          explorerOpen
          onToggleExplorer={() => {}}
          termsOpen={false}
          onToggleTermsPanel={() => {}}
          validationOpen={false}
          onToggleValidationPanel={() => {}}
          validationErrorCount={errorCount}
          validationWarningCount={warningCount}
          nameDisplay="both"
          onNameDisplayChange={() => {}}
          columnDisplay="all"
          onColumnDisplayChange={() => {}}
          activeAreaId={null}
          onActiveAreaChange={() => {}}
          dbmsId="mysql"
          modelName="m"
          databaseType="mysql"
          modelDescription={null}
          workspaceId="9"
          modelId="901"
          onOpenShortcuts={() => {}}
        />
      </ReactFlowProvider>,
      { wrapRoutes: false },
    )

  it('Error ≥ 1이면 error 건수 배지(destructive)가 error 건수를 보여준다', () => {
    renderToolbar(3, 2)
    expect(screen.getByTestId('validation-badge')).toHaveTextContent('3')
  })

  it('Error 0이고 Warning ≥ 1이면 warning 건수 배지', () => {
    renderToolbar(0, 2)
    expect(screen.getByTestId('validation-badge')).toHaveTextContent('2')
  })

  it('전부 0이면 배지가 없다', () => {
    renderToolbar(0, 0)
    expect(screen.queryByTestId('validation-badge')).toBeNull()
  })
})
