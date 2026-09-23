/**
 * 주제 영역 편집 다이얼로그 테스트 — 멤버 체크 즉시 커밋·색 스와치·이름 확정
 * (05-editor/02-ui.md §6, v1.13)
 *
 * 색·멤버 체크는 클릭 즉시 area/patch 1커밋(테이블 정보 다이얼로그 관례),
 * 이름·설명은 저장 버튼으로 확정 커밋이다. 다이얼로그는 props로만 받는 순수
 * 컴포넌트라 스토어 시딩 없이 검증한다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AreaDialog } from '@/features/editor/components/AreaDialog'
import { createArea } from '@/features/editor/model/changes'
import { TABLE_COLORS } from '@/features/editor/model/content-schema'
import { renderWithProviders } from '@/test/test-app'

const TABLES = [
  { id: 'T-USERS', physical: 'users', logical: '회원' },
  { id: 'T-LOGS', physical: 'logs', logical: '' },
]

function renderDialog(area = createArea('회원 도메인', { id: 'A1', tableIds: [] })) {
  const onColorChange = vi.fn()
  const onCommit = vi.fn()
  const utils = renderWithProviders(
    <AreaDialog
      open
      onOpenChange={vi.fn()}
      area={area}
      tables={TABLES}
      onColorChange={onColorChange}
      onCommit={onCommit}
    />,
    { wrapRoutes: false },
  )
  const rerenderDialog = (next: typeof area) =>
    utils.rerender(
      <AreaDialog
        open
        onOpenChange={vi.fn()}
        area={next}
        tables={TABLES}
        onColorChange={onColorChange}
        onCommit={onCommit}
      />,
    )
  return { onColorChange, onCommit, rerenderDialog }
}

describe('AreaDialog — 멤버 체크·색·이름', () => {
  it('멤버 체크는 즉시 area/patch tableIds로 커밋된다 — 문서 테이블 순서를 따른다', () => {
    const { onCommit } = renderDialog(createArea('회원 도메인', { id: 'A1', tableIds: ['T-LOGS'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: /users/ }))
    expect(onCommit).toHaveBeenCalledWith('A1', { tableIds: ['T-LOGS', 'T-USERS'] })
  })

  it('멤버 해제는 목록에서 뺀다', () => {
    const { onCommit } = renderDialog(createArea('회원 도메인', { id: 'A1', tableIds: ['T-USERS', 'T-LOGS'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: /users/ }))
    expect(onCommit).toHaveBeenCalledWith('A1', { tableIds: ['T-LOGS'] })
  })

  it('색 스와치 클릭은 즉시 커밋된다 — 프리셋과 기본(무색) 모두', () => {
    const { onColorChange } = renderDialog()
    // 프리셋 첫 색(red) — '기본'은 별도 라벨이라 프리셋 그룹의 첫 원소
    fireEvent.click(screen.getAllByRole('button', { name: '강조색' })[0]!)
    expect(onColorChange).toHaveBeenCalledWith('A1', TABLE_COLORS[0])
    fireEvent.click(screen.getByRole('button', { name: '기본' }))
    expect(onColorChange).toHaveBeenLastCalledWith('A1', 'default')
  })

  it('이름 확정은 저장 버튼으로 patch되고 빈 이름은 막힌다', async () => {
    const { onCommit } = renderDialog()
    const input = screen.getByLabelText('이름')
    fireEvent.change(input, { target: { value: '회원·계정' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    // zodResolver 검증은 비동기 — 커밋을 기다린다
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('A1', { name: '회원·계정', description: '' }))

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.getByText('이름을 입력하세요')).toBeInTheDocument())
    expect(onCommit).toHaveBeenCalledTimes(1) // 빈 이름은 제출 안 됨
  })

  it('생성 직후 흐름 — 색을 먼저 고르고(즉시 커밋→area 참조 교체) 이름을 저장해도 입력이 유지된다', async () => {
    // EditorShell은 즉시 커밋마다 새 area 객체를 내려준다. reset이 이 참조 변화에 반응하면
    // 저장 전 이름이 문서값(기본 이름 '그룹')으로 되돌려진다 — 생성 다이얼로그 이름 소실 버그.
    const initial = createArea('그룹', { id: 'A1', tableIds: [] })
    const committed = { ...initial, color: TABLE_COLORS[0] as (typeof TABLE_COLORS)[number] }
    const { onCommit, rerenderDialog } = renderDialog(initial)

    // 이름 입력 → 색 즉시 커밋(부모가 area 참조를 교체해 리렌더) → 여전히 입력은 살아 있다
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '회원 도메인' } })
    rerenderDialog(committed)
    expect(screen.getByLabelText('이름')).toHaveValue('회원 도메인')

    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('A1', { name: '회원 도메인', description: '' }))
  })
})
