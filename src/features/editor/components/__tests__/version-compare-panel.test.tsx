/**
 * 버전 비교 사이드바 테스트 (08-core/02-model.md §1.11.3) — 합성 diff로 그룹핑·개수
 * 요약·사라진 테이블 섹션·truncated 안내를 검증한다. 렌더 문구는 버전 기록
 * (history.kind·history.action) 렌더를 재사용한다.
 */
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { DocDiffItem, DocumentDiffSummary } from '@/features/editor/model/doc-diff'
import { classifyTableChanges } from '@/features/editor/model/version-compare'
import { VersionComparePanel } from '@/features/editor/components/VersionComparePanel'
import { renderWithProviders } from '@/test/test-app'

const item = (
  kind: DocDiffItem['kind'],
  action: DocDiffItem['action'],
  table: string,
  name = table,
  detail = '',
): DocDiffItem => ({ kind, action, table, name, detail })

function renderPanel(diff: DocumentDiffSummary) {
  return renderWithProviders(
    <VersionComparePanel
      baseVersion={0}
      targetVersion={1}
      diff={diff}
      classification={classifyTableChanges(diff)}
    />,
    { wrapRoutes: false },
  )
}

describe('VersionComparePanel', () => {
  it('테이블별 그룹핑 — 개수 요약과 함께 항목을 노출한다', () => {
    renderPanel({
      items: [
        item('column', 'add', 'users', 'grade', 'VARCHAR(10)'),
        item('note', 'add', '', '메모'),
        item('column', 'update', 'orders', 'status', 'defaultValue'),
      ],
      layoutOnly: false,
      truncated: false,
    })

    expect(screen.getByText('v0 → v1')).toBeVisible()
    expect(screen.getByText('추가 2 · 변경 1 · 삭제 0 · 이동 0')).toBeVisible()

    // users 그룹 — 컬럼 추가, 노트는 캔버스 외 그룹
    const users = screen.getByText('users').closest('li')!
    expect(within(users).getByText('users.grade')).toBeVisible()
    const offCanvas = screen.getByText('캔버스 외 변경').closest('li')!
    expect(within(offCanvas).getByText('메모')).toBeVisible()

    // orders 그룹 — update 항목은 상세 필드명까지
    const orders = screen.getByText('orders').closest('li')!
    expect(within(orders).getByText('— defaultValue')).toBeVisible()
  })

  it('사라진 테이블 섹션 — remove는 별도 destructive 섹션으로, 그룹핑에서는 빠진다', () => {
    renderPanel({
      items: [
        item('table', 'remove', 'orders'),
        item('column', 'add', 'users', 'grade'),
      ],
      layoutOnly: false,
      truncated: false,
    })

    const section = screen.getByText('이 버전에서 사라진 테이블').parentElement!
    expect(within(section).getByText('orders')).toBeVisible()
    // 그룹핑 목록에는 orders가 없다 — users 그룹만 남는다
    expect(screen.getByTestId('version-compare-panel').textContent).not.toContain('orders.')
  })

  it('layoutOnly 저장 — 개수 요약 대신 안내 문구', () => {
    renderPanel({
      items: [item('note', 'move', '', '메모', 'x, y')],
      layoutOnly: true,
      truncated: false,
    })

    expect(screen.getByText('레이아웃 변경만 있음')).toBeVisible()
  })

  it('truncated — 잘림 안내가 함께 렌더된다', () => {
    renderPanel({
      items: [item('column', 'add', 'users', 'grade')],
      layoutOnly: false,
      truncated: true,
    })

    expect(screen.getByText(/일부 변경 생략/)).toBeVisible()
  })

  it('변경 없음 — 빈 안내', () => {
    renderPanel({ items: [], layoutOnly: false, truncated: false })

    expect(screen.getByText('두 버전 사이 변경이 없습니다')).toBeVisible()
  })
})
