/**
 * 매니지드 DB 섹션 테스트 (08-core/07 §3.5~3.7 — 데이터베이스 탭)
 *
 * given: /core/workspaces/101/managed-databases 응답을 MSW로 정의
 * when: 섹션 렌더·발급·철회·접속 정보
 * then: 한도 요약·발급 목록·발급 토스트·철회 확인·접속 정보 다이얼로그·한도 도달 비활성·미제공 시 숨김
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { ManagedSection } from '@/features/managed/components/managed-section'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderManagedSection(props: { canEdit?: boolean } = {}) {
  return renderWithProviders(
    <>
      <ManagedSection workspaceId="101" canEdit={props.canEdit ?? true} />
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

describe('매니지드 DB 섹션', () => {
  it('한도 요약과 발급 목록을 렌더한다 — 사용량·스키마·커넥션', async () => {
    asAuthenticated() // 내 발급 판정(me=2) — 철회 버튼 노출
    renderManagedSection()

    // 'Academy PG'는 한도 행·발급 목록 인스턴스 칸에 모두 나온다
    expect((await screen.findAllByText('Academy PG')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('1 / 5')).toBeVisible()
    expect(screen.getByText('cf_u2_d1')).toBeVisible()
    expect(screen.getByText('Academy PG #1')).toBeVisible()
    expect(screen.getByRole('button', { name: '발급받기' })).toBeEnabled()
  })

  it('발급 — POST 후 커넥션 이름을 안내하는 토스트를 띄운다', async () => {
    const user = userEvent.setup()
    renderManagedSection()

    await user.click(await screen.findByRole('button', { name: '발급받기' }))

    await waitFor(() => {
      expect(screen.getByText('발급 완료 — 커넥션 "Academy PG #2"으로 등록했습니다.')).toBeVisible()
    })
  })

  it('철회 — 확인 다이얼로그를 거쳐 DELETE하고 토스트로 안내한다', async () => {
    asAuthenticated() // me=2 — 발급자가 본인이면 철회 버튼
    const user = userEvent.setup()
    renderManagedSection()

    await user.click(await screen.findByRole('button', { name: 'cf_u2_d1 발급 철회' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/스키마와 그 안의 모든 데이터가 삭제/)).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: '철회' }))

    await waitFor(() => {
      expect(screen.getByText("'cf_u2_d1' 발급을 철회했습니다.")).toBeVisible()
    })
  })

  it('접속 정보 — 본인 발급 행에서 다이얼로그로 주소·계정·비밀번호를 확인하고 복사한다', async () => {
    const user = userEvent.setup()
    // setup()이 clipboard를 자체 스텁으로 덮어쓰므로 그 뒤에 목킹한다
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    asAuthenticated() // me=2 — 발급자 본인 행에만 접속 정보 버튼
    renderManagedSection()

    await user.click(await screen.findByRole('button', { name: 'cf_u2_d1 접속 정보' }))
    const dialog = await screen.findByRole('dialog')

    // PG 매핑 — 접속 주소·database·스키마·계정, JDBC URL까지 표시된다
    expect(within(dialog).getByText('s3.java21.net:8000')).toBeVisible()
    // database는 인스턴스 것(crowfoot) — 계정 칸에는 발급 전용 계정이 온다(루트 아님)
    expect(within(dialog).getByText('crowfoot')).toBeVisible()
    // 'cf_u2_d1'는 제목 배지·스키마 칸·계정 칸에 나온다
    expect(within(dialog).getAllByText('cf_u2_d1').length).toBeGreaterThanOrEqual(3)
    expect(
      within(dialog).getByText('jdbc:postgresql://s3.java21.net:8000/crowfoot?currentSchema=cf_u2_d1'),
    ).toBeVisible()

    // 비밀번호는 기본 가림 — 눈 토글로 드러난다
    expect(within(dialog).queryByText('Xk9!vQ2mZR7#pLw4nTaE')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '비밀번호 표시' }))
    expect(within(dialog).getByText('Xk9!vQ2mZR7#pLw4nTaE')).toBeVisible()

    // 필드 복사 — 값이 클립보드로 간다
    await user.click(within(dialog).getByRole('button', { name: '접속 주소 복사' }))
    expect(writeText).toHaveBeenCalledWith('s3.java21.net:8000')
    await waitFor(() => {
      expect(screen.getByText('복사했습니다.')).toBeVisible()
    })
  })

  it('한도 도달 — 발급 버튼이 비활성된다', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/managed-databases', () =>
        HttpResponse.json(
          ok({
            totalCount: 0,
            responses: [],
            limitSummary: [
              { instanceId: '401', displayName: 'Academy PG', isActive: true, limit: 5, used: 5, remaining: 0 },
            ],
          }),
        ),
      ),
    )
    renderManagedSection()

    const issue = await screen.findByRole('button', { name: '발급받기' })
    expect(issue).toBeDisabled()
    expect(screen.getByText('한도 도달')).toBeVisible()
  })

  it('Editor 미만은 발급받을 수 없다', async () => {
    renderManagedSection({ canEdit: false })

    expect(await screen.findByRole('button', { name: '발급받기' })).toBeDisabled()
  })

  it('인스턴스가 없으면(limitSummary 빈) 섹션을 렌더하지 않는다', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/managed-databases', () =>
        HttpResponse.json(ok({ totalCount: 0, responses: [], limitSummary: [] })),
      ),
    )
    const { container } = renderManagedSection()

    // 즉시 null — 로딩 스켈레톤도 잠깐 그려진 뒤 사라진다
    await waitFor(() => {
      expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('서비스 제공 DB')).not.toBeInTheDocument()
  })
})
