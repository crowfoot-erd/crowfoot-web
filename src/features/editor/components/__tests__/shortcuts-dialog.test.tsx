/**
 * 단축키 치트시트 다이얼로그 — §9 요약 표시·읽기 전용 흐림·닫기 (05-editor/02-ui.md §9)
 *
 * 정적 도움말이라 스토어·API 없이 렌더만 검증한다. Ctrl+/ 바인딩은 editor-shell.test.tsx §9가 담당.
 */
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ShortcutsDialog } from '@/features/editor/components/ShortcutsDialog'
import { renderWithProviders } from '@/test/test-app'

function renderDialog(canEdit: boolean) {
  return renderWithProviders(
    <ShortcutsDialog open onOpenChange={vi.fn()} canEdit={canEdit} />,
    { wrapRoutes: false },
  )
}

describe('ShortcutsDialog — 치트시트', () => {
  it('그룹 4개와 §9 행을 표시한다', () => {
    renderDialog(true)

    for (const group of ['편집', '선택·탐색', '이동', '캔버스']) {
      expect(screen.getByText(group)).toBeVisible()
    }
    // 각 그룹에서 대표 행 하나씩 — §9 v1 구현 블록과 1:1
    expect(screen.getByText('실행 취소')).toBeVisible()
    expect(screen.getByText('검색 (익스플로러)')).toBeVisible()
    expect(screen.getByText('선택 객체 이동 (10px)')).toBeVisible()
    expect(screen.getByText('캔버스 이동')).toBeVisible()
    expect(screen.getByText('마우스 우클릭')).toBeVisible()
    // 읽기 전용 각주는 편집 가능에서는 없다
    expect(screen.queryByText('편집 권한이 없으면 편집·이동·삭제 단축키는 동작하지 않습니다')).toBeNull()
  })

  it('읽기 전용이면 편집 권한 행을 흐리게 하고 각주를 표시한다', () => {
    renderDialog(false)

    const undo = screen.getByText('실행 취소').closest('li')
    expect(undo?.className).toContain('opacity-50')
    // 보기 동작 행은 흐려지지 않는다
    const search = screen.getByText('검색 (익스플로러)').closest('li')
    expect(search?.className).not.toContain('opacity-50')

    expect(screen.getByText('편집 권한이 없으면 편집·이동·삭제 단축키는 동작하지 않습니다')).toBeVisible()
  })

  it('닫기 버튼이 onOpenChange(false)를 부른다', () => {
    const onOpenChange = vi.fn()
    renderWithProviders(
      <ShortcutsDialog open onOpenChange={onOpenChange} canEdit />,
      { wrapRoutes: false },
    )

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
