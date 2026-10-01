/**
 * 다른 DBMS로 복제 다이얼로그 — 대상 후보·검사 결과 미리보기·2단계 생성 (05-editor/04-dbms-engineering.md §3.5)
 *
 * database-types 목록은 MSW 기본 핸들러(mysql·postgresql)를 쓰고, 생성(POST)·본체 저장(PUT)은
 * server.use()로 덧씌워 요청 본문을 확인한다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'

import { server } from '@/api/mocks/server'
import { ConvertDbmsDialog } from '@/features/editor/components/ConvertDbmsDialog'
import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import type { ErdContent } from '@/features/editor/model/content-schema'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'
import { renderWithProviders } from '@/test/test-app'

// jsdom에는 scrollIntoView가 없다 — radix select가 열릴 때 필요
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  resetEditorStore()
  vi.restoreAllMocks()
})

const OK_HEADER = { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' }

/** PostgreSQL 문서 — DATETIME(표기 변경)·GEOMETRY(맞지 않는 타입) 컬럼을 가진 테이블 1개 */
function seedStore(): void {
  const content = emptyContent()
  const table = createTable('place', {
    columns: [
      createColumn({ physicalName: 'created_at', dataType: 'DATETIME' }),
      createColumn({ physicalName: 'geo', dataType: 'GEOMETRY' }),
    ],
  })
  useEditorStore.getState().hydrate({
    modelId: '501',
    baseVersion: 1,
    document: { model: { ...content.model, tables: [table] }, diagram: content.diagram },
  })
}

function renderDialog(onOpenChange = vi.fn()) {
  renderWithProviders(
    <ConvertDbmsDialog
      open
      onOpenChange={onOpenChange}
      workspaceId="101"
      modelName="주문 서비스 ERD"
      modelDescription="결제 도메인"
      databaseType="postgresql"
    />,
    { wrapRoutes: false },
  )
  return onOpenChange
}

describe('ConvertDbmsDialog — 미리보기', () => {
  it('현재 문서와 다른 DBMS만 대상으로 삼고, 기본 이름과 검사 결과를 보여 준다', async () => {
    seedStore()
    renderDialog()

    // 대상은 MySQL 하나 — 기본 이름은 "{원본 이름} ({대상 표시명})"
    const nameInput = await screen.findByLabelText('새 문서 이름')
    await waitFor(() => expect(nameInput).toHaveValue('주문 서비스 ERD (MySQL)'))

    // PostgreSQL TIMESTAMP → MySQL DATETIME 표기 변경, GEOMETRY는 맞지 않는 타입
    const changes = screen.getByTestId('dbms-convert-type-changes')
    expect(changes).toHaveTextContent('TIMESTAMP')
    expect(changes).toHaveTextContent('DATETIME')
    const unsupported = screen.getByTestId('dbms-convert-unsupported')
    expect(unsupported).toHaveTextContent('place.geo')
    expect(unsupported).toHaveTextContent('GEOMETRY')
  })
})

describe('ConvertDbmsDialog — 생성', () => {
  it('문서 생성(POST) 뒤 변환한 본체를 저장(PUT)하고 새 창으로 연다', async () => {
    seedStore()
    const posted: unknown[] = []
    const saved: { baseVersion: number; content: string }[] = []
    server.use(
      http.post('/api/v1/core/workspaces/101/models', async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(
          { header: OK_HEADER, response: { modelId: '900', workspaceId: '101', name: '주문 서비스 ERD (MySQL)', version: 0 } },
          { status: 201 },
        )
      }),
      http.put('/api/v1/core/workspaces/101/models/900/content', async ({ request }) => {
        saved.push((await request.json()) as { baseVersion: number; content: string })
        return HttpResponse.json({ header: OK_HEADER, response: { version: 1, updatedAt: '2026-10-01T00:00:00Z' } })
      }),
    )
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const onOpenChange = renderDialog()

    const nameInput = await screen.findByLabelText('새 문서 이름')
    await waitFor(() => expect(nameInput).toHaveValue('주문 서비스 ERD (MySQL)'))
    fireEvent.click(screen.getByRole('button', { name: '새 문서로 복제' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    // 대상 DBMS·설명은 원본 설명 그대로
    expect(posted[0]).toMatchObject({
      name: '주문 서비스 ERD (MySQL)',
      description: '결제 도메인',
      databaseType: 'mysql',
    })
    // 본체는 생성 응답 버전 기준으로 저장하고, 저장 값(공용 코드)은 그대로다
    expect(saved[0].baseVersion).toBe(0)
    const content = JSON.parse(saved[0].content) as ErdContent
    expect(content.schemaVersion).toBe(1)
    expect(content.model.tables[0].columns.map((column) => column.dataType)).toEqual(['DATETIME', 'GEOMETRY'])
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(openSpy).toHaveBeenCalledWith('/workspaces/101/models/900', '_blank', 'noopener,noreferrer')
  })

  it('이름이 비면 요청하지 않고 안내한다', async () => {
    seedStore()
    let called = false
    server.use(
      http.post('/api/v1/core/workspaces/101/models', () => {
        called = true
        return HttpResponse.json({ header: OK_HEADER, response: {} }, { status: 201 })
      }),
    )
    renderDialog()

    const nameInput = await screen.findByLabelText('새 문서 이름')
    await waitFor(() => expect(nameInput).toHaveValue('주문 서비스 ERD (MySQL)'))
    fireEvent.change(nameInput, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '새 문서로 복제' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('문서 이름을 입력해 주세요')
    expect(called).toBe(false)
  })

  it('이름 중복(409)은 다이얼로그 안에서 안내하고 닫지 않는다', async () => {
    seedStore()
    server.use(
      http.post('/api/v1/core/workspaces/101/models', () =>
        HttpResponse.json(
          { header: { isSuccessful: false, resultCode: 'DUPLICATED_NAME', resultMessage: 'duplicated' } },
          { status: 409 },
        ),
      ),
    )
    const onOpenChange = renderDialog()

    const nameInput = await screen.findByLabelText('새 문서 이름')
    await waitFor(() => expect(nameInput).toHaveValue('주문 서비스 ERD (MySQL)'))
    fireEvent.click(screen.getByRole('button', { name: '새 문서로 복제' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
