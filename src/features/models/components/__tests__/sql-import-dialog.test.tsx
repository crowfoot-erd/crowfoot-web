/**
 * SQL Import 다이얼로그 테스트 (05-editor/04-dbms-engineering.md SQL Import v1)
 *
 * given: database-types·SQL Import 엔드포인트 응답(MSW — 미리보기 근사·생성 고정 요약)
 * when: DDL 입력·미리보기·생성·파일 읽기
 * then: 미리보기 결과 패널(테이블 요약·skipped 경고)·요약 토스트·이름 중복 409 안내·파일 내용 반영
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { fail, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { SqlImportDialog } from '@/features/models/components/sql-import-dialog'
import { renderWithProviders } from '@/test/test-app'

const SAMPLE_DDL = 'CREATE TABLE members (id BIGINT PRIMARY KEY);\nCREATE TABLE orders (id BIGINT PRIMARY KEY, member_id BIGINT REFERENCES members (id));'

function renderSqlImportDialog() {
  return renderWithProviders(
    <>
      <SqlImportDialog open onOpenChange={() => {}} workspaceId="101" />
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

/** DDL textarea 채우기 — 파일 읽기 경로와 같은 효과 */
async function fillDdl(user: ReturnType<typeof userEvent.setup>) {
  const ddlField = screen.getByLabelText(/DDL 스크립트/)
  await user.clear(ddlField)
  await user.type(ddlField, SAMPLE_DDL)
}

describe('SQL Import 다이얼로그', () => {
  it('미리보기 — 테이블 요약·개수를 결과 패널에 그린다', async () => {
    const user = userEvent.setup()
    renderSqlImportDialog()
    await fillDdl(user)

    await user.click(screen.getByRole('button', { name: '미리보기' }))

    await waitFor(() => {
      expect(screen.getByText('테이블 2개 · 관계 1개')).toBeVisible()
    })
    expect(screen.getByText('members')).toBeVisible()
    expect(screen.getByText('orders')).toBeVisible()
  })

  it('미리보기 skipped가 있으면 경고 문단을 노출한다', async () => {
    server.use(
      http.post('/api/v1/core/workspaces/101/models/sql-import/preview', () =>
        HttpResponse.json(
          ok({
            response: {
              databaseType: 'mysql',
              tableCount: 1,
              relationshipCount: 0,
              tables: [{ name: 'members', comment: null, columnCount: 2, primaryKeyColumns: ['id'], foreignKeyCount: 0 }],
              skipped: ['CREATE INDEX idx_members_email ON members (email)'],
            },
          }),
        ),
      ),
    )
    const user = userEvent.setup()
    renderSqlImportDialog()
    await fillDdl(user)

    await user.click(screen.getByRole('button', { name: '미리보기' }))

    await waitFor(() => {
      expect(screen.getByText(/읽지 못한 문장/)).toBeVisible()
    })
    expect(screen.getByText(/CREATE INDEX idx_members_email/)).toBeVisible()
  })

  it('미리보기 CREATE TABLE 0개는 400 — 오류 토스트로 안내한다', async () => {
    server.use(
      http.post('/api/v1/core/workspaces/101/models/sql-import/preview', () =>
        fail('SQL_IMPORT_NO_TABLES', 400),
      ),
    )
    const user = userEvent.setup()
    renderSqlImportDialog()
    await fillDdl(user)

    await user.click(screen.getByRole('button', { name: '미리보기' }))

    await waitFor(() => {
      expect(screen.getByText(/CREATE TABLE 문을 찾을 수 없습니다/)).toBeVisible()
    })
  })

  it('생성 — 요약 토스트를 띄우고 폼을 초기화한다', async () => {
    const user = userEvent.setup()
    renderSqlImportDialog()
    await fillDdl(user)
    await user.type(screen.getByLabelText(/문서 이름/), '쇼핑 ERD')

    await user.click(screen.getByRole('button', { name: '문서 만들기' }))

    await waitFor(() => {
      expect(screen.getByText(/'쇼핑 ERD' 문서를 만들었습니다/)).toBeVisible()
      expect(screen.getByText(/테이블 2개/)).toBeVisible()
      expect(screen.getByText(/관계 1개/)).toBeVisible()
    })
  })

  it('생성 이름 중복 409 — 오류 토스트로 안내한다', async () => {
    server.use(
      http.post('/api/v1/core/workspaces/101/models/sql-import', () =>
        fail('DUPLICATED_NAME', 409),
      ),
    )
    const user = userEvent.setup()
    renderSqlImportDialog()
    await fillDdl(user)
    await user.type(screen.getByLabelText(/문서 이름/), '이미 있음')

    await user.click(screen.getByRole('button', { name: '문서 만들기' }))

    await waitFor(() => {
      expect(screen.getByText(/이미 존재하는/)).toBeVisible()
    })
  })

  it('.sql 파일 읽기 — 내용이 textarea에 들어가고 상한 초과는 안내만 한다', async () => {
    const user = userEvent.setup()
    renderSqlImportDialog()

    const input = screen.getByLabelText(/DDL 스크립트/) as HTMLTextAreaElement
    const file = new File([SAMPLE_DDL], 'schema.sql', { type: 'text/plain' })
    await user.upload(screen.getByLabelText('.sql 파일 읽기'), file)
    await waitFor(() => {
      expect(input.value).toContain('CREATE TABLE members')
    })

    // 1MB 초과 — 내용 반영 없이 경고 토스트
    const huge = new File([new ArrayBuffer(1_000_001)], 'huge.sql', { type: 'text/plain' })
    await user.upload(screen.getByLabelText('.sql 파일 읽기'), huge)
    await waitFor(() => {
      expect(screen.getByText(/1MB를 초과합니다/)).toBeVisible()
    })
    expect(input.value).toContain('CREATE TABLE members') // 기존 내용 유지
  })

  it('DDL이 비어 있으면 미리보기·생성 버튼이 막혀 있다', async () => {
    renderSqlImportDialog()

    // databaseTypes 로드가 끝나야 생성 버튼이 풀린다(종류 없음 방지 게이트)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '문서 만들기' })).toBeEnabled()
    })
    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled() // 폼 제출은 zod가 막는다
  })
})
