/**
 * 포워드 엔지니어링 배포 다이얼로그 — 같은 DBMS 커넥션 노출·실행·문장별 결과 (05-editor/04-dbms-engineering.md §3.1)
 *
 * 배포 API(§1.8)는 문장별 성공/실패를 200으로 보고한다 — 부분 실패 UI가 핵심.
 * 커넥션 목록은 MSW 기본 핸들러(301 postgresql)를 쓰고 필터 검증은 server.use()로 덧씌운다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'

import { server } from '@/api/mocks/server'
import { ModelDeployDialog } from '@/features/editor/components/ModelDeployDialog'
import { emptyContent } from '@/features/editor/model/content-io'
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

function seedStore(): void {
  const content = emptyContent()
  useEditorStore.getState().hydrate({
    modelId: '501',
    baseVersion: 1,
    document: { model: content.model, diagram: content.diagram },
  })
}

function renderDialog(databaseType = 'postgresql') {
  return renderWithProviders(
    <ModelDeployDialog
      open
      onOpenChange={vi.fn()}
      workspaceId="101"
      modelName="주문 서비스 ERD"
      databaseType={databaseType}
    />,
    { wrapRoutes: false },
  )
}

describe('ModelDeployDialog — 대상 선택', () => {
  it('같은 DBMS 커넥션만 노출하고 첫 항목을 기본 선택한다', async () => {
    seedStore()
    server.use(
      http.get('/api/v1/core/workspaces/101/connections', () =>
        HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
          totalCount: 2,
          responses: [
            {
              connectionId: '301',
              workspaceId: '101',
              name: '개발 PG',
              dbmsType: 'postgresql',
              host: 'db.dev.example.com',
              port: 5432,
              databaseName: 'orders',
              username: 'app',
              createdBy: { userId: '2', name: '부트스트랩 관리자' },
              createdAt: '2026-09-10T00:00:00Z',
            },
            {
              connectionId: '302',
              workspaceId: '101',
              name: '로컬 MySQL',
              dbmsType: 'mysql',
              host: 'localhost',
              port: 3306,
              databaseName: 'orders',
              username: 'root',
              createdBy: { userId: '2', name: '부트스트랩 관리자' },
              createdAt: '2026-09-11T00:00:00Z',
            },
          ],
        }),
      ),
    )
    renderDialog()

    const combobox = await screen.findByRole('combobox')
    await waitFor(() => expect(combobox).toHaveTextContent('개발 PG'))

    // 목록을 열어 같은 DBMS(postgresql)만 있는지 확인한다
    fireEvent.click(combobox)
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('개발 PG')
  })

  it('같은 DBMS 커넥션이 없으면 안내한다', async () => {
    seedStore()
    renderDialog('mysql')

    expect(await screen.findByText(/같은 DBMS\(mysql\)의 커넥션이 없습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: '배포' })).toBeDisabled()
  })
})

describe('ModelDeployDialog — 실행·결과', () => {
  /** 커넥션이 선택돼 배포 버튼이 활성화되는 시점까지 기다린다 */
  async function waitForReady(): Promise<void> {
    const combobox = await screen.findByRole('combobox')
    await waitFor(() => expect(combobox).toHaveTextContent('개발 PG'))
  }

  it('배포 실행 — 문장별 결과와 요약을 표시한다', async () => {
    seedStore()
    renderDialog()

    await waitForReady()
    fireEvent.click(screen.getByRole('button', { name: '배포' }))

    const result = await screen.findByTestId('deploy-result')
    expect(within(result).getByText('2문장 실행 — 성공 2 · 실패 0')).toBeVisible()
    // 첫 줄만 보인다 — 나머지 줄은 접는다
    expect(within(result).getByText(/CREATE TABLE member \( …/)).toBeVisible()
    expect(within(result).queryByText(/id BIGINT/)).not.toBeInTheDocument()
  })

  it('부분 실패 — 실패 문장에 서버 오류 문구를 붙인다', async () => {
    seedStore()
    server.use(
      http.post('/api/v1/core/workspaces/101/models/501/deploy', () =>
        HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
          response: {
            executedCount: 1,
            failedCount: 1,
            statements: [
              { sql: 'CREATE TABLE member (…);', ok: true, error: null },
              {
                sql: 'CREATE TABLE orders (…);',
                ok: false,
                error: 'ERROR: relation "orders" already exists',
              },
            ],
            warnings: [],
          },
        }),
      ),
    )
    renderDialog()

    await waitForReady()
    fireEvent.click(screen.getByRole('button', { name: '배포' }))

    const result = await screen.findByTestId('deploy-result')
    expect(within(result).getByText('2문장 실행 — 성공 1 · 실패 1')).toBeVisible()
    expect(within(result).getByText('ERROR: relation "orders" already exists')).toBeVisible()
  })

  it('배포 실패(오류 응답) — 안내를 표시한다', async () => {
    seedStore()
    server.use(
      http.post('/api/v1/core/workspaces/101/models/501/deploy', () =>
        HttpResponse.json(
          {
            header: {
              isSuccessful: false,
              resultCode: 'CONNECTION_UNREACHABLE',
              resultMessage: 'CONNECTION_UNREACHABLE',
            },
          },
          { status: 502 },
        ),
      ),
    )
    renderDialog()

    await waitForReady()
    fireEvent.click(screen.getByRole('button', { name: '배포' }))

    expect(await screen.findByText(/접속할 수 없습니다/)).toBeVisible()
  })
})
