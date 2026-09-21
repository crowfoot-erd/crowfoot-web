/**
 * 관계 다이얼로그 테스트 — 생성(FK 미리보기·스왑)·부모 PK 없음 차단·중복 차단·편집(삭제·식별 안내)
 */
import { fireEvent, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Toaster가 테스트 셋업에 없어 토스트 렌더 대신 호출을 단정한다
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

// jsdom에는 scrollIntoView가 없다 — radix select가 열릴 때 필요
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

import { RelationshipDialog } from '@/features/editor/components/RelationshipDialog'
import { createColumn, createTable } from '@/features/editor/model/changes'
import type { ErdTable } from '@/features/editor/model/content-schema'
import { renderWithProviders } from '@/test/test-app'

function tableWithPk(physicalName: string): ErdTable {
  const id = createColumn({ physicalName: 'id', dataType: 'BIGINT', nullable: false })
  return createTable(physicalName, { columns: [id], primaryKey: { name: `${physicalName}_pk`, columnIds: [id.id] } })
}

function renderCreateDialog(parent: ErdTable, child: ErdTable) {
  const onConfirmCreate = vi.fn()
  renderWithProviders(
    <RelationshipDialog
      open
      onOpenChange={() => {}}
      parent={parent}
      child={child}
      relationship={null}
      onConfirmCreate={onConfirmCreate}
      onConfirmPatch={vi.fn()}
    />,
    { wrapRoutes: false },
  )
  return { onConfirmCreate }
}

describe('RelationshipDialog — 생성', () => {
  it('부모 PK 기반 FK 미리보기 노출 후 확인 → 관계+FK 컬럼 확정', () => {
    const parent = tableWithPk('members')
    const child = tableWithPk('orders')
    const { onConfirmCreate } = renderCreateDialog(parent, child)

    // FK 이름 규칙: {부모테이블}_{부모컬럼} 소문자
    expect(screen.getByText('members_id')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '생성' }))

    expect(onConfirmCreate).toHaveBeenCalledTimes(1)
    const payload = onConfirmCreate.mock.calls[0][0]
    expect(payload.relationship.parentTableId).toBe(parent.id)
    expect(payload.relationship.childTableId).toBe(child.id)
    expect(payload.relationship.columnMappings).toHaveLength(1)
    expect(payload.fkColumns[0].physicalName).toBe('members_id')
    expect(payload.fkColumns[0].dataType).toBe('BIGINT') // 부모 타입 복사
  })

  it('스왑 → 부모/자식 역할 교체(FK는 새 부모 PK 기준)', () => {
    const parent = tableWithPk('members')
    const child = tableWithPk('orders')
    const { onConfirmCreate } = renderCreateDialog(parent, child)

    fireEvent.click(screen.getByRole('button', { name: '부모/자식 바꾸기' }))

    expect(screen.getByText('orders_id')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '생성' }))
    const payload = onConfirmCreate.mock.calls[0][0]
    expect(payload.relationship.parentTableId).toBe(child.id) // orders가 부모로
    expect(payload.fkColumns[0].physicalName).toBe('orders_id')
  })

  it('부모에 PK가 없으면 경고·확인 비활성화', () => {
    const noPk = createTable('members') // PK 없음
    const child = tableWithPk('orders')
    renderCreateDialog(noPk, child)

    expect(screen.getByText('부모 테이블에 기본 키가 없어 FK를 만들 수 없습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: '생성' })).toBeDisabled()
  })

  it('같은 부모→자식 관계가 이미 있으면 확인이 차단된다 — 스왑으로 방향이 바뀌어도', async () => {
    const parent = tableWithPk('members')
    const child = tableWithPk('orders')
    const onConfirmCreate = vi.fn()
    renderWithProviders(
      <RelationshipDialog
        open
        onOpenChange={() => {}}
        parent={parent}
        child={child}
        relationship={null}
        onConfirmCreate={onConfirmCreate}
        onConfirmPatch={vi.fn()}
        isDuplicate={(parentId, childId) => parentId === child.id && childId === parent.id}
      />,
      { wrapRoutes: false },
    )

    // 스왑하면 members→orders가 아니라 orders→members — 이 방향이 중복이라고 가정
    fireEvent.click(screen.getByRole('button', { name: '부모/자식 바꾸기' }))
    fireEvent.click(screen.getByRole('button', { name: '생성' }))
    expect(onConfirmCreate).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(
      '두 테이블 사이에는 관계가 하나만 있을 수 있습니다: orders → members',
    )
  })

  it('비식별 1:1은 UK 자동 생성 안내가 함께 보인다', async () => {
    const parent = tableWithPk('members')
    const child = tableWithPk('orders')
    renderCreateDialog(parent, child)

    // 기본값 = 1:N 비식별 → UK 힌트 없음
    expect(screen.queryByText(/유니크 키를 자동 생성/)).toBeNull()
    // radix select는 pointerdown으로 열린다 — 관계 유형 콤보박스를 특정해 연다
    const trigger = screen.getByRole('combobox', { name: '관계 유형' })
    fireEvent.pointerDown(trigger, { button: 0 })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('option', { name: '1:1' }))
    expect(screen.getByText(/유니크 키를 자동 생성/)).toBeVisible()
  })

  it('부모 기수를 0 또는 하나(○|)로 바꾸면 FK 미리보기에서 NOT NULL이 빠진다', async () => {
    const parent = tableWithPk('members')
    const child = tableWithPk('orders')
    renderCreateDialog(parent, child)

    // 기본(하나 |) → FK 미리보기에 NOT NULL 표기
    expect(screen.getByText('BIGINT · NOT NULL')).toBeVisible()
    const trigger = screen.getByRole('combobox', { name: '부모(1) 기수' })
    fireEvent.pointerDown(trigger, { button: 0 })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('option', { name: '0 또는 하나 (○|)' }))
    expect(screen.queryByText('BIGINT · NOT NULL')).toBeNull()
  })
})

describe('RelationshipDialog — 편집', () => {
  function relationshipFixture() {
    const parent = tableWithPk('members')
    const child = tableWithPk('orders')
    const fk = createColumn({ physicalName: 'members_id', dataType: 'BIGINT', nullable: false })
    child.columns.push(fk)
    return {
      parent,
      child,
      relationship: {
        id: 'rel-1',
        name: 'fk_orders_members',
        parentTableId: parent.id,
        childTableId: child.id,
        type: 'ONE_TO_MANY' as const,
        identifying: false,
        parentMultiplicity: 'EXACTLY_ONE' as const,
        childMultiplicity: 'ONE_OR_MORE' as const,
        fkName: 'fk_orders_members',
        columnMappings: [{ parentColumnId: parent.columns[0].id, childColumnId: fk.id }],
        onDelete: 'NO_ACTION' as const,
        onUpdate: 'NO_ACTION' as const,
      },
    }
  }

  it('관계 삭제 버튼이 onRemove를 부르고 다이얼로그를 닫는다', () => {
    const { relationship } = relationshipFixture()
    const onRemove = vi.fn()
    const onOpenChange = vi.fn()
    renderWithProviders(
      <RelationshipDialog
        open
        onOpenChange={onOpenChange}
        parent={null}
        child={null}
        relationship={relationship}
        onConfirmCreate={vi.fn()}
        onConfirmPatch={vi.fn()}
        onRemove={onRemove}
      />,
      { wrapRoutes: false },
    )

    fireEvent.click(screen.getByRole('button', { name: '관계 삭제' }))
    expect(onRemove).toHaveBeenCalledWith('rel-1')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('편집에서 식별로 전환하면 PK 편입 안내가 보인다 — 속성 전환은 제약 동기화된다', () => {
    const { relationship } = relationshipFixture()
    renderWithProviders(
      <RelationshipDialog
        open
        onOpenChange={() => {}}
        parent={null}
        child={null}
        relationship={relationship}
        onConfirmCreate={vi.fn()}
        onConfirmPatch={vi.fn()}
      />,
      { wrapRoutes: false },
    )

    expect(screen.queryByText(/자식 테이블 기본 키에 포함/)).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: /식별 관계/ }))
    expect(screen.getByText(/자식 테이블 기본 키에 포함/)).toBeVisible()
  })

  it('편집 모드에서 부모/자식 테이블 정보를 보여준다 — 논리명이 다르면 병기, 스왑은 없다', () => {
    const { parent, child, relationship } = relationshipFixture()
    parent.logicalName = '회원'
    renderWithProviders(
      <RelationshipDialog
        open
        onOpenChange={() => {}}
        parent={parent}
        child={child}
        relationship={relationship}
        onConfirmCreate={vi.fn()}
        onConfirmPatch={vi.fn()}
      />,
      { wrapRoutes: false },
    )

    // 어떤 테이블 ↔ 어떤 테이블인지 정보 박스
    expect(screen.getByText('members')).toBeVisible()
    expect(screen.getByText('(회원)')).toBeVisible()
    expect(screen.getByText('orders')).toBeVisible()
    // 편집은 방향 전환 제공 안 함
    expect(screen.queryByRole('button', { name: '부모/자식 바꾸기' })).toBeNull()
  })

  it('아주 긴 fkName도 설명 줄이 다이얼로그 폭을 밀어내지 않는다 — truncate + title', () => {
    const longFkName = 'FK_NOTIFICATION_CHANNEL_PREFERENCES_ORGANIZATION_MEMBERS'
    const { relationship } = relationshipFixture()
    relationship.fkName = longFkName
    renderWithProviders(
      <RelationshipDialog
        open
        onOpenChange={() => {}}
        parent={null}
        child={null}
        relationship={relationship}
        onConfirmCreate={vi.fn()}
        onConfirmPatch={vi.fn()}
      />,
      { wrapRoutes: false },
    )

    // 줄바꿈 기회가 없는 54자 이름: 텍스트는 truncate로 잘리고 전체 이름은 title에 남는다
    const description = screen.getByTitle(longFkName)
    expect(description).toHaveTextContent(longFkName)
    expect(description).toHaveClass('truncate')
  })

  it('FK 이름이 길면 값이 입력칸(2열 절반 폭)에 통째로 보이도록 폭을 넓힌다', () => {
    // jsdom엔 캔버스가 없다 — 측정 스텁: 글자수×7px
    const measureStub = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      { font: '', measureText: (text: string) => ({ width: text.length * 7 }) } as unknown as CanvasRenderingContext2D,
    )
    // 설명 줄은 짧게(120) — FK 요구 폭만 지배하는 상황
    const scrollWidth = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(120)
    const { relationship } = relationshipFixture()
    relationship.fkName = 'fk_report_environment_door_stats_reports_id' // 43자
    renderWithProviders(
      <RelationshipDialog
        open
        onOpenChange={() => {}}
        parent={null}
        child={null}
        relationship={relationship}
        onConfirmCreate={vi.fn()}
        onConfirmPatch={vi.fn()}
      />,
      { wrapRoutes: false },
    )

    // FK 요구 폭 = (측정값 + 칸 장식 + 여유 2)×2 + 44 — 칸 장식(패딩·테두리)은 계산값 그대로
    const input = document.querySelector('#relationship-fk-name') as HTMLInputElement
    const cs = getComputedStyle(input)
    const chrome = [cs.paddingLeft, cs.paddingRight, cs.borderLeftWidth, cs.borderRightWidth].reduce(
      (sum, value) => sum + (parseFloat(value) || 0),
      0,
    )
    const expected = (43 * 7 + chrome + 2) * 2 + 44
    const content = document.querySelector('[data-slot="dialog-content"]') as HTMLElement
    expect(content.style.maxWidth).toBe(`${expected}px`)
    scrollWidth.mockRestore()
    measureStub.mockRestore()
  })

  it('극단적으로 긴 값은 상한에 막힌다 — min(1280, 뷰포트-32)', () => {
    const measureStub = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      { font: '', measureText: (text: string) => ({ width: text.length * 7 }) } as unknown as CanvasRenderingContext2D,
    )
    // 설명 줄이 880px — FK 요구(짧은 이름 286)보다 크고 상한 안쪽
    const scrollWidth = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(880)
    const { relationship } = relationshipFixture()
    renderWithProviders(
      <RelationshipDialog
        open
        onOpenChange={() => {}}
        parent={null}
        child={null}
        relationship={relationship}
        onConfirmCreate={vi.fn()}
        onConfirmPatch={vi.fn()}
      />,
      { wrapRoutes: false },
    )

    // 880 + 좌우 패딩 32 = 912 (jsdom innerWidth 1024 → 상한 min(1280, 992) = 992 안쪽)
    const content = document.querySelector('[data-slot="dialog-content"]') as HTMLElement
    expect(content.style.maxWidth).toBe('912px')
    scrollWidth.mockRestore()
    measureStub.mockRestore()
  })

  it('설명이 짧으면 기본 폭(sm:max-w-md)을 유지한다 — 인라인 maxWidth 없음', () => {
    const scrollWidth = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(120)
    const { relationship } = relationshipFixture()
    renderWithProviders(
      <RelationshipDialog
        open
        onOpenChange={() => {}}
        parent={null}
        child={null}
        relationship={relationship}
        onConfirmCreate={vi.fn()}
        onConfirmPatch={vi.fn()}
      />,
      { wrapRoutes: false },
    )

    // 설명 120+32=152 (jsdom 캔버스 불가 → FK 기여 없음) — 448 바닥 미만 → 클래스 기본 폭에 맡긴다
    const content = document.querySelector('[data-slot="dialog-content"]') as HTMLElement
    expect(content.style.maxWidth).toBe('')
    scrollWidth.mockRestore()
  })
})
