/**
 * 용어 대량 등록 다이얼로그 테스트 — 붙여넣기 즉시 파싱 미리보기·순차 등록·실패 목록
 * (용어 사전 패널, 05-editor/02-ui.md)
 *
 * 실행은 POST 스파이로 검증한다 — MSW 목업이 픽스처 불변이라 목록 단언은 하지 않는다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { TermBulkImportDialog } from '@/features/editor/components/TermBulkImportDialog'
import { renderWithProviders, resetSessionState } from '@/test/test-app'

const TERMS_URL = '/api/v1/core/workspaces/101/terms'

const okItem = (term: string, label: string) =>
  HttpResponse.json(
    ok({
      response: { termId: '499', workspaceId: '101', term, label, updatedAt: '2026-09-24T00:00:00Z' },
    }),
  )

afterEach(() => {
  resetSessionState()
})

function renderDialog() {
  return renderWithProviders(
    <TermBulkImportDialog open onOpenChange={() => {}} workspaceId="101" databaseType="postgresql" />,
    { wrapRoutes: false },
  )
}

async function paste(text: string) {
  fireEvent.change(await screen.findByTestId('term-bulk-textarea'), { target: { value: text } })
}

describe('TermBulkImportDialog', () => {
  it('여러 줄을 붙여넣으면 파싱 결과(등록 N건 · 형식 오류 목록)가 즉시 보인다', async () => {
    renderDialog()
    await paste('ordr,주문\nuser_id,회원 식별자\n깨진 줄')

    const preview = screen.getByTestId('term-bulk-preview')
    expect(preview.textContent).toContain('등록 2건 · 형식 오류 1건')
    expect(preview.textContent).toContain('L3 — 구분자(쉼표·탭)가 없습니다')
    expect(screen.getByRole('button', { name: '2건 등록' })).toBeEnabled()
  })

  it('실행 → 순차 upsert 후 성공 N건 요약을 보여준다', async () => {
    const posts: Array<{ term: string; label: string; types: Record<string, string> | null }> = []
    server.use(
      http.post(TERMS_URL, async ({ request }) => {
        posts.push((await request.json()) as { term: string; label: string; types: Record<string, string> | null })
        return okItem('x', 'x')
      }),
    )
    renderDialog()
    await paste('ordr,주문\nuser_id,회원 식별자')
    fireEvent.click(screen.getByTestId('term-bulk-run'))

    await waitFor(() =>
      expect(screen.getByTestId('term-bulk-result').textContent).toContain('2건 등록 · 0건 실패'),
    )
    expect(posts).toEqual([
      { term: 'ordr', label: '주문', types: null },
      { term: 'user_id', label: '회원 식별자', types: null },
    ])
  })

  it('3열 줄은 타입을 문서 DB 종류 키의 맵으로 POST 본문에 실는다', async () => {
    const posts: Array<{ term: string; label: string; types: Record<string, string> | null }> = []
    server.use(
      http.post(TERMS_URL, async ({ request }) => {
        posts.push((await request.json()) as { term: string; label: string; types: Record<string, string> | null })
        return okItem('x', 'x')
      }),
    )
    renderDialog()
    await paste('email,이메일,VARCHAR(100)\nyn,여부,')
    fireEvent.click(screen.getByTestId('term-bulk-run'))

    await waitFor(() =>
      expect(screen.getByTestId('term-bulk-result').textContent).toContain('2건 등록 · 0건 실패'),
    )
    // 비운 타입 열은 null로 전송된다(선택 값) — 3열 타입은 문서 DB 종류(postgresql) 키 하나로
    expect(posts).toEqual([
      { term: 'email', label: '이메일', types: { postgresql: 'VARCHAR(100)' } },
      { term: 'yn', label: '여부', types: null },
    ])
  })

  it('일부 줄 실패 → 실패 목록에 줄 번호·토큰·에러 문구가 나온다', async () => {
    server.use(
      http.post(TERMS_URL, async ({ request }) => {
        const body = (await request.json()) as { term: string; label: string }
        // ordr만 실패 — 한 줄 실패가 나머지를 멈추지 않는다
        if (body.term === 'ordr') {
          return HttpResponse.json(
            { header: { isSuccessful: false, resultCode: 'INVALID_REQUEST', resultMessage: '잘못된 요청' } },
            { status: 400 },
          )
        }
        return okItem(body.term, body.label)
      }),
    )
    renderDialog()
    await paste('ordr,주문\nuser_id,회원 식별자')
    fireEvent.click(screen.getByTestId('term-bulk-run'))

    const result = await waitFor(() => screen.getByTestId('term-bulk-result'))
    expect(result.textContent).toContain('1건 등록 · 1건 실패')
    expect(result.textContent).toContain('L1 ordr —')
  })

  it('파싱된 항목이 없으면 실행 버튼이 비활성화된다', async () => {
    renderDialog()
    const run = await screen.findByTestId('term-bulk-run')
    expect(run).toBeDisabled()

    await paste('깨진 줄만 있습니다')
    expect(screen.getByTestId('term-bulk-preview').textContent).toContain('등록할 줄이 없습니다')
    expect(screen.getByRole('button', { name: '0건 등록' })).toBeDisabled()
  })
})
