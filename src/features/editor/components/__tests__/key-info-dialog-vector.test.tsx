/**
 * 인덱스 다이얼로그 — pgvector 벡터 인덱스(HNSW·IVFFLAT)와 저장 매개변수(WITH) (05-editor/04-dbms-engineering.md §3.6)
 *
 * given: documents(id, embedding vector(1536)) 테이블
 * when:  PostgreSQL 문서에서 종류를 HNSW·IVFFLAT로 고르고 매개변수를 고친다 / MySQL 문서에서 연다
 * then:  종류의 제안 키가 채워지고, 연산자 클래스 칸이 거리 함수를 제안하며, 형식이 틀린 매개변수는 저장을 막는다
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createColumn, createTable } from '@/features/editor/model/changes'
import { KeyInfoDialog, type KeyInfoDialogProps, type KeyInfoSubmit } from '@/features/editor/components/KeyInfoDialog'
import { renderWithProviders } from '@/test/test-app'

const table = createTable('documents', {
  id: 'T-d',
  columns: [
    createColumn({ id: 'C-id', physicalName: 'id', dataType: 'BIGINT', nullable: false }),
    createColumn({ id: 'C-emb', physicalName: 'embedding', dataType: 'VECTOR', length: 1536 }),
  ],
  primaryKey: { name: 'documents_pk', columnIds: ['C-id'] },
})

function renderDialog(overrides: Partial<KeyInfoDialogProps> = {}) {
  const onConfirm = vi.fn<(values: KeyInfoSubmit) => void>()
  renderWithProviders(
    <KeyInfoDialog
      open
      onOpenChange={() => {}}
      kind="index"
      dbmsId="postgres"
      target={null}
      table={table}
      existingNames={new Set()}
      suggestName={() => 'ix_documents_embedding'}
      onConfirm={onConfirm}
      {...overrides}
    />,
    { wrapRoutes: false },
  )
  return { onConfirm }
}

const withPairs = () =>
  screen.getAllByTestId('index-with-key').map((input, i) => [
    (input as HTMLInputElement).value,
    (screen.getAllByTestId('index-with-value')[i] as HTMLInputElement).value,
  ])

describe('PostgreSQL 문서 — 벡터 인덱스', () => {
  it('HNSW를 고르면 m·ef_construction이 채워지고, 연산자 클래스와 함께 저장한다', async () => {
    const { onConfirm } = renderDialog()
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByTestId('index-type'), { target: { value: 'HNSW' } })
    expect(withPairs()).toEqual([
      ['m', '16'],
      ['ef_construction', '64'],
    ])
    expect(within(dialog).getByTestId('index-vector-hint')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: '컬럼 — embedding' }))
    const opclass = within(dialog).getByTestId('index-opclass') as HTMLInputElement
    // 거리 함수 목록을 제안한다
    const options = [...dialog.querySelectorAll(`datalist#${CSS.escape(opclass.getAttribute('list') ?? '')} option`)].map(
      (option) => (option as HTMLOptionElement).value,
    )
    expect(options).toEqual(['vector_l2_ops', 'vector_ip_ops', 'vector_cosine_ops', 'vector_l1_ops'])
    fireEvent.change(opclass, { target: { value: 'vector_cosine_ops' } })

    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      type: 'HNSW',
      columnIds: ['C-emb'],
      opclasses: { 'C-emb': 'vector_cosine_ops' },
      with: { m: '16', ef_construction: '64' },
      unique: false,
    })
  })

  it('손대지 않은 제안은 IVFFLAT로 바꿀 때 lists로 갈아 끼우고, 고친 값은 지킨다', async () => {
    renderDialog()
    const dialog = await screen.findByRole('dialog')
    const typeSelect = within(dialog).getByTestId('index-type')
    fireEvent.change(typeSelect, { target: { value: 'HNSW' } })
    fireEvent.change(typeSelect, { target: { value: 'IVFFLAT' } })
    expect(withPairs()).toEqual([['lists', '100']])

    fireEvent.change(screen.getAllByTestId('index-with-value')[0], { target: { value: '200' } })
    fireEvent.change(typeSelect, { target: { value: 'HNSW' } })
    expect(withPairs()).toEqual([['lists', '200']])
  })

  it('형식이 틀리거나 겹친 키는 저장을 막는다', async () => {
    const { onConfirm } = renderDialog({
      target: { name: 'ix_documents_embedding', columnIds: ['C-emb'], type: 'HNSW', opclasses: { 'C-emb': 'vector_l2_ops' }, with: { m: '16' } },
    })
    const dialog = await screen.findByRole('dialog')
    expect(withPairs()).toEqual([['m', '16']])
    fireEvent.click(within(dialog).getByRole('button', { name: '매개변수 추가' }))
    fireEvent.change(screen.getAllByTestId('index-with-key')[1], { target: { value: 'M; DROP' } })
    fireEvent.change(screen.getAllByTestId('index-with-value')[1], { target: { value: '1' } })
    expect(within(dialog).getByTestId('index-with-error')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onConfirm).not.toHaveBeenCalled()

    // 같은 키 두 번
    fireEvent.change(screen.getAllByTestId('index-with-key')[1], { target: { value: 'm' } })
    expect(within(dialog).getByTestId('index-with-error')).toBeInTheDocument()

    // 행을 지우면 저장된다
    fireEvent.click(within(dialog).getByRole('button', { name: '매개변수 삭제 2' }))
    expect(within(dialog).queryByTestId('index-with-error')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onConfirm.mock.calls[0][0].with).toEqual({ m: '16' })
  })
})

describe('MySQL 문서', () => {
  it('벡터 종류와 저장 매개변수 칸을 보이지 않는다', async () => {
    renderDialog({ dbmsId: 'mysql' })
    const dialog = await screen.findByRole('dialog')
    const types = [...(within(dialog).getByTestId('index-type') as HTMLSelectElement).options].map((option) => option.value)
    expect(types).not.toContain('HNSW')
    expect(types).not.toContain('IVFFLAT')
    expect(within(dialog).queryByTestId('index-with')).toBeNull()
  })

  it('이미 든 WITH 값은 지우지 않고 보여 준다(DDL에는 실리지 않는다는 안내와 함께)', async () => {
    const { onConfirm } = renderDialog({
      dbmsId: 'mysql',
      target: { name: 'ix_documents_id', columnIds: ['C-id'], type: 'BTREE', with: { fillfactor: '90' } },
    })
    const dialog = await screen.findByRole('dialog')
    expect(withPairs()).toEqual([['fillfactor', '90']])
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onConfirm.mock.calls[0][0].with).toEqual({ fillfactor: '90' })
  })
})
