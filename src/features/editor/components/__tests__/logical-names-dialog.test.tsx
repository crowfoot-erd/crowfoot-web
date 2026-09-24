/**
 * 논리명 자동 추론 다이얼로그 테스트 — 미리보기(커스텀 사전 우선)·체크 해제·적용 commitAll·undo
 * (05-editor/04-dbms-engineering.md §3.2)
 *
 * 사전은 MSW 목업(fixtures.terms: member→회원, user→사용자). 문서는 스토어에 직접 시딩한다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/api/mocks/server'
import { LogicalNamesDialog } from '@/features/editor/components/LogicalNamesDialog'
import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { renderWithProviders } from '@/test/test-app'

// 적용 성공 토스트 단언용
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

afterEach(() => {
  resetEditorStore()
  vi.restoreAllMocks()
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  toastMock.info.mockClear()
})

/** 리버스 직후 형태 — 코멘트 없는 객체는 논리명이 물리명과 같다(ReverseContentAssembler 복제) */
function seedInferableDoc(): void {
  const content = emptyContent()
  const table = createTable('user', {
    logicalName: 'user', // 물리명과 같다 → 추론 대상
    columns: [
      createColumn({ physicalName: 'user_id', logicalName: 'user_id' }), // 같다 → 대상
      createColumn({ physicalName: 'email', logicalName: 'DB 코멘트' }), // 채워짐 → 제외
    ],
  })
  content.model.tables = [table]
  useEditorStore.getState().hydrate({
    modelId: '501',
    baseVersion: 1,
    document: { model: content.model, diagram: content.diagram },
  })
}

function renderDialog(onManageDictionary = vi.fn()) {
  return renderWithProviders(
    <LogicalNamesDialog
      open
      onOpenChange={vi.fn()}
      workspaceId="101"
      onManageDictionary={onManageDictionary}
    />,
    { wrapRoutes: false },
  )
}

async function termsLoaded() {
  await screen.findByText('user_id')
}

describe('LogicalNamesDialog — 미리보기·적용', () => {
  it('후보를 물리명 → 추론 논리명으로 보여주고 커스텀 사전(user→사용자)이 반영된다', async () => {
    seedInferableDoc()
    renderDialog()
    await termsLoaded()

    // 테이블 user → 사용자(커스텀), 컬럼 user_id → 사용자 ID / email은 DB 코멘트가 있어 제외
    expect(screen.getByText('사용자 ID')).toBeVisible()
    expect(screen.queryByText('DB 코멘트')).toBeNull()
    expect(screen.getByRole('button', { name: '2건 적용' })).toBeEnabled()
  })

  it('체크 해제한 행은 적용에서 빠진다 — 적용은 commitAll 한 덩어리(undo 1회 복구)', async () => {
    seedInferableDoc()
    renderDialog()
    await termsLoaded()

    // 테이블 행(user) 해제 — 체크박스의 접근 이름은 물리명
    fireEvent.click(screen.getByRole('checkbox', { name: 'user' }))
    expect(screen.getByRole('button', { name: '1건 적용' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '1건 적용' }))

    await waitFor(() => {
      const table = useEditorStore.getState().present.model.tables[0]
      expect(table.logicalName).toBe('user') // 해제한 테이블은 그대로
      expect(table.columns[0].logicalName).toBe('사용자 ID') // 컬럼만 적용
    })
    expect(toastMock.success).toHaveBeenCalledTimes(1)

    useEditorStore.getState().undo()
    const restored = useEditorStore.getState().present.model.tables[0]
    expect(restored.logicalName).toBe('user')
    expect(restored.columns[0].logicalName).toBe('user_id')
  })

  it('채워진 논리명만 있으면 빈 상태를 보여준다', async () => {
    const content = emptyContent()
    content.model.tables = [
      createTable('user', {
        logicalName: '회원',
        columns: [createColumn({ physicalName: 'user_id', logicalName: '회원 식별자' })],
      }),
    ]
    useEditorStore.getState().hydrate({
      modelId: '501',
      baseVersion: 1,
      document: { model: content.model, diagram: content.diagram },
    })
    renderDialog()

    expect(await screen.findByText('추론할 논리명이 없습니다 — 이미 채워져 있거나 사전에 등록된 토큰이 없습니다')).toBeVisible()
  })

  it('사전 조회 실패 시 내장 사전만으로 계산하고 안내를 띄운다', async () => {
    seedInferableDoc()
    server.use(
      http.get('/api/v1/core/workspaces/101/terms', () =>
        HttpResponse.json({ header: { isSuccessful: false, resultCode: 'INTERNAL_ERROR', resultMessage: 'err' } }, { status: 500 }),
      ),
    )
    renderDialog()

    // 내장 사전에도 user→사용자가 있어 계산은 된다 — 사전 의존이 아닌 기능 보존
    expect(
      await screen.findByText('워크스페이스 표준 사전을 불러오지 못했습니다 — 시스템 사전만으로 계산합니다'),
    ).toBeVisible()
    expect(screen.getByText('사용자 ID')).toBeVisible()
  })

  it("'사전 관리' 클릭 → 다이얼로그를 닫고 패널 열기 액션을 호출한다", async () => {
    seedInferableDoc()
    const onManageDictionary = vi.fn()
    const onOpenChange = vi.fn()
    renderWithProviders(
      <LogicalNamesDialog
        open
        onOpenChange={onOpenChange}
        workspaceId="101"
        onManageDictionary={onManageDictionary}
      />,
      { wrapRoutes: false },
    )
    await termsLoaded()

    fireEvent.click(screen.getByRole('button', { name: '사전 관리' }))
    expect(onManageDictionary).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false) // 중첩 다이얼로그 폐지 — 패널으로 갈아탄다
  })
})
