/**
 * 마이그레이션 DDL 다이얼로그 — 버전 A→B·문서↔DB 두 모드, 경고 톤(DESTRUCTIVE),
 * 문장 수, 복사·다운로드, 로딩·실패, DB 반영(경고 확인·문장별 결과)
 * (08-core/02-model.md §1.7.1·§1.15)
 *
 * 생성·실행 모두 core-api 마이그레이션 API — MSW 목업(fixtures.migration)을 그려준다.
 * 버전 비교 모드에는 반영 버튼이 없다는 것(실행 대상 커넥션 부재)도 같이 고정한다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { delay, http, HttpResponse } from 'msw'

import { server } from '@/api/mocks/server'
import {
  MigrationDdlDialog,
  type MigrationDdlMode,
} from '@/features/editor/components/MigrationDdlDialog'
import { renderWithProviders } from '@/test/test-app'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderDialog(mode: MigrationDdlMode, open = true) {
  return renderWithProviders(
    <MigrationDdlDialog
      open={open}
      onOpenChange={vi.fn()}
      modelName="주문 서비스 ERD"
      connectionName="개발 PG"
      mode={mode}
    />,
    { wrapRoutes: false },
  )
}

const versionMode: MigrationDdlMode = {
  kind: 'version',
  workspaceId: '101',
  modelId: '501',
  from: 0,
  to: 1,
}

const connectionMode: MigrationDdlMode = {
  kind: 'connection',
  workspaceId: '101',
  modelId: '501',
  connectionId: '301',
}

/** 성공 응답(envelope) — server.use() 덧씌움용 */
function okResponse(response: Record<string, unknown>) {
  return HttpResponse.json({
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    response,
  })
}

describe('MigrationDdlDialog — 버전 A→B', () => {
  it('범위 제목·문장 수·ALTER 스크립트를 표시한다 — 반영·배포 버튼은 없다', async () => {
    renderDialog(versionMode)

    await screen.findByTestId('migration-ddl-script')
    expect(screen.getByText('마이그레이션 DDL — v0 → v1')).toBeVisible()
    expect(screen.getByText(/문장 2개/)).toBeVisible()

    const script = screen.getByTestId('migration-ddl-script').textContent ?? ''
    expect(script).toContain('-- 주문 서비스 ERD — PostgreSQL 마이그레이션 DDL (v0 → v1)')
    expect(script).toContain('ALTER TABLE users ADD COLUMN grade VARCHAR(10);')
    expect(script).toContain('ALTER TABLE users DROP COLUMN temp_flag;')

    // 버전 비교는 생성 전용 — 실행 대상 커넥션이 없어 반영·배포 버튼이 없어야 한다
    expect(screen.queryByRole('button', { name: /반영/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /배포/ })).not.toBeInTheDocument()
  })

  it('DESTRUCTIVE 경고는 destructive 톤으로 강조한다', async () => {
    renderDialog(versionMode)

    const warnings = await screen.findByTestId('migration-ddl-warnings')
    expect(warnings).toHaveAttribute('data-destructive', 'true')
    expect(within(warnings).getByText(/경고/)).toBeVisible()
    expect(within(warnings).getByText(/DROP 문이 포함되어/)).toBeVisible()
  })
})

describe('MigrationDdlDialog — 문서↔실제 DB', () => {
  it('제목·NOT_INTROSPECTED 경고는 일반(주황) 톤으로 표시한다', async () => {
    renderDialog(connectionMode)

    expect(await screen.findByText('마이그레이션 DDL — 문서 ↔ DB')).toBeVisible()
    const warnings = await screen.findByTestId('migration-ddl-warnings')
    expect(warnings).toHaveAttribute('data-destructive', 'false')
    expect(within(warnings).getByText(/인덱스는 실제 DB에서/)).toBeVisible()
  })

  it('반영 버튼을 노출한다 — connection 모드만의 푸터(§1.15)', async () => {
    renderDialog(connectionMode)

    // 생성 결과가 있어야 누를 수 있다 — 로드 전에는 비활성
    await screen.findByTestId('migration-ddl-script')
    expect(screen.getByRole('button', { name: 'DB에 반영' })).toBeEnabled()
  })

  it('반영 버튼 누르면 경고 확인 다이얼로그 — 문장 수·커넥션을 밝힌다', async () => {
    renderDialog(connectionMode)

    await screen.findByTestId('migration-ddl-script')
    fireEvent.click(screen.getByTestId('migration-apply'))

    expect(await screen.findByText('데이터베이스에 반영')).toBeVisible()
    expect(
      screen.getByText(/커넥션 개발 PG의 데이터베이스에 마이그레이션 DDL 1문장을 실행합니다/),
    ).toBeVisible()
    expect(screen.getByText(/되돌릴 수 없습니다/)).toBeVisible()

    // 취소하면 확인창만 닫힌다 — 실행 요청은 가지 않는다
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() =>
      expect(screen.queryByText('데이터베이스에 반영')).not.toBeInTheDocument(),
    )
    expect(screen.queryByTestId('migration-apply-result')).not.toBeInTheDocument()
  })

  /** 추가 1문장과 삭제 2문장이 섞인 계획 */
  function mixedPlan() {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/connections/301/migration', () =>
        okResponse({
          sql: 'ALTER TABLE users ADD COLUMN grade VARCHAR(10);\n\nALTER TABLE users DROP COLUMN temp_flag;\nDROP TABLE legacy_logs;',
          warnings: [{ code: 'DESTRUCTIVE', message: '파괴적 연산 2건이 스크립트 마지막 블록에 모여 있습니다' }],
          statementCount: 3,
          fromLabel: 'DB',
          toLabel: '문서',
          destructiveStatements: ['ALTER TABLE users DROP COLUMN temp_flag;', 'DROP TABLE legacy_logs;'],
        }),
      ),
    )
  }

  it('삭제 문장은 기본으로 실행하지 않는다 — 추가와 변경만 보내고 건너뛴 수를 알린다', async () => {
    mixedPlan()
    let body: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/workspaces/101/models/501/connections/301/migration/execute', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return okResponse({
          executedCount: 1,
          failedCount: 0,
          statements: [{ sql: 'ALTER TABLE users ADD COLUMN grade VARCHAR(10);', ok: true, error: null }],
          warnings: [],
          skippedDestructive: 2,
        })
      }),
    )
    renderDialog(connectionMode)

    // 삭제 문장을 따로 보여 주고, 실행 여부는 꺼져 있다
    const destructive = await screen.findByTestId('migration-destructive')
    expect(within(destructive).getByText('DROP TABLE legacy_logs;')).toBeVisible()
    expect(screen.getByTestId('migration-include-destructive')).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(screen.getByTestId('migration-apply'))
    // 확인 문구의 문장 수는 삭제 문장을 뺀 수다. 확인 버튼은 위험 표시가 아니다
    expect(await screen.findByText(/마이그레이션 DDL 1문장을 실행합니다/)).toBeVisible()
    const confirm = screen.getByRole('button', { name: '반영' })
    expect(confirm.className).not.toContain('text-destructive')
    fireEvent.click(confirm)

    await screen.findByTestId('migration-apply-result')
    expect(body).toEqual({ includeDestructive: false })
    expect(screen.getByTestId('migration-skipped')).toHaveTextContent('삭제 문장 2건은 실행하지 않았습니다')
  })

  it('삭제 문장을 켜면 함께 실행한다 — 확인창이 삭제 건수를 밝히고 위험 표시가 된다', async () => {
    mixedPlan()
    let body: Record<string, unknown> | null = null
    server.use(
      http.post('/api/v1/core/workspaces/101/models/501/connections/301/migration/execute', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return okResponse({ executedCount: 3, failedCount: 0, statements: [], warnings: [], skippedDestructive: 0 })
      }),
    )
    renderDialog(connectionMode)

    fireEvent.click(await screen.findByTestId('migration-include-destructive'))
    fireEvent.click(screen.getByTestId('migration-apply'))

    expect(await screen.findByText(/마이그레이션 DDL 3문장을 실행합니다/)).toBeVisible()
    expect(screen.getByText(/삭제 문장 2건이 포함되어 있습니다/)).toBeVisible()
    const confirm = screen.getByRole('button', { name: '반영' })
    expect(confirm.className).toContain('text-destructive')
    fireEvent.click(confirm)

    await screen.findByTestId('migration-apply-result')
    expect(body).toEqual({ includeDestructive: true })
  })

  it('삭제 문장뿐이면 켜기 전에는 반영할 수 없다', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/connections/301/migration', () =>
        okResponse({
          sql: 'ALTER TABLE users DROP COLUMN temp_flag;',
          warnings: [{ code: 'DESTRUCTIVE', message: '파괴적 연산 1건' }],
          statementCount: 1,
          fromLabel: 'DB',
          toLabel: '문서',
          destructiveStatements: ['ALTER TABLE users DROP COLUMN temp_flag;'],
        }),
      ),
    )
    renderDialog(connectionMode)

    await screen.findByTestId('migration-destructive')
    expect(screen.getByTestId('migration-apply')).toBeDisabled()
    fireEvent.click(screen.getByTestId('migration-include-destructive'))
    expect(screen.getByTestId('migration-apply')).toBeEnabled()
  })

  it('확인하면 실행 요청 후 문장별 결과를 표시한다', async () => {
    renderDialog(connectionMode)

    await screen.findByTestId('migration-ddl-script')
    fireEvent.click(screen.getByTestId('migration-apply'))
    fireEvent.click(await screen.findByRole('button', { name: '반영' }))

    const result = await screen.findByTestId('migration-apply-result')
    expect(screen.getByText('1문장 실행 — 성공 1 · 실패 0')).toBeVisible()
    expect(within(result).getByText(/ALTER TABLE users ADD COLUMN grade VARCHAR\(10\);/)).toBeVisible()
  })
})

describe('MigrationDdlDialog — 복사·다운로드', () => {
  it('복사 버튼 — 스크립트 전문을 클립보드에 넣는다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderDialog(versionMode)

    await screen.findByTestId('migration-ddl-script')
    fireEvent.click(screen.getByRole('button', { name: '복사' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('ALTER TABLE users ADD COLUMN grade')
  })

  it('다운로드 버튼 — 문서명-migration.sql Blob을 내려보낸다', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    let downloadedName = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function handleClick(
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download
    })
    renderDialog(versionMode)

    await screen.findByTestId('migration-ddl-script')
    fireEvent.click(screen.getByRole('button', { name: '다운로드' }))

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))
    expect(downloadedName).toBe('주문_서비스_ERD-migration.sql')
  })
})

describe('MigrationDdlDialog — 로딩·실패', () => {
  it('응답 전에는 생성 중 안내를 표시한다', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/versions/0/migration', async () => {
        await delay(3000)
        return okResponse({ sql: '-- DDL', warnings: [], statementCount: 0, fromLabel: 'v0', toLabel: 'v1' })
      }),
    )
    renderDialog(versionMode)

    expect(await screen.findByText('마이그레이션 DDL 생성 중…')).toBeVisible()
    expect(screen.queryByTestId('migration-ddl-script')).not.toBeInTheDocument()
  })

  it('실패 응답이면 안내·다시 시도를 표시한다', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501/versions/0/migration', () =>
        HttpResponse.json(
          { header: { isSuccessful: false, resultCode: 'MODEL_VERSION_NOT_FOUND', resultMessage: 'MODEL_VERSION_NOT_FOUND' } },
          { status: 404 },
        ),
      ),
    )
    renderDialog(versionMode)

    expect(await screen.findByTestId('migration-ddl-error')).toBeVisible()
    expect(screen.getByText('마이그레이션 DDL 생성에 실패했습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible()
  })
})

describe('MigrationDdlDialog — 닫힘', () => {
  it('닫혀 있으면(open=false) 렌더하지 않는다 — enabled 게이트로 조회도 없다', () => {
    renderDialog(versionMode, false)

    expect(screen.queryByTestId('migration-ddl-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('migration-ddl-script')).not.toBeInTheDocument()
    expect(screen.queryByTestId('migration-ddl-error')).not.toBeInTheDocument()
  })
})
