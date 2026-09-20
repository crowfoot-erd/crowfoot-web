/**
 * 마이그레이션 DDL 다이얼로그 — 버전 A→B·문서↔DB 두 모드, 경고 톤(DESTRUCTIVE),
 * 문장 수, 복사·다운로드, 로딩·실패 (08-core/02-model.md §1.7.1)
 *
 * 생성은 core-api 마이그레이션 API — MSW 목업(fixtures.migration)을 그려준다.
 * 실행 버튼이 없다는 것(생성 전용 계약)도 같이 고정한다.
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
    <MigrationDdlDialog open={open} onOpenChange={vi.fn()} modelName="주문 서비스 ERD" mode={mode} />,
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
  it('범위 제목·문장 수·ALTER 스크립트를 표시한다 — 배포 버튼은 없다', async () => {
    renderDialog(versionMode)

    await screen.findByTestId('migration-ddl-script')
    expect(screen.getByText('마이그레이션 DDL — v0 → v1')).toBeVisible()
    expect(screen.getByText(/문장 2개/)).toBeVisible()

    const script = screen.getByTestId('migration-ddl-script').textContent ?? ''
    expect(script).toContain('-- 주문 서비스 ERD — PostgreSQL 마이그레이션 DDL (v0 → v1)')
    expect(script).toContain('ALTER TABLE users ADD COLUMN grade VARCHAR(10);')
    expect(script).toContain('ALTER TABLE users DROP COLUMN temp_flag;')

    // 생성 전용 — 실행·배포 버튼이 없어야 한다
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
