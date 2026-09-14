/**
 * 리버스 엔지니어링 다이얼로그 테스트 (storyboard 02-user §7 — "DB에서 가져오기")
 *
 * given: /core/workspaces/101/connections 응답(MSW fixtures — 커넥션 1건)
 * when: 다이얼로그 열기·제출
 * then: 문서 이름 기본값({커넥션 이름} ERD)·요약 토스트·중복 이름 409 안내·빈 커넥션 차단
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { ReverseDialog } from '@/features/connections/components/reverse-dialog'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderReverseDialog(props: { presetConnectionId?: string } = {}) {
  return renderWithProviders(
    <>
      <ReverseDialog
        open
        onOpenChange={() => {}}
        workspaceId="101"
        presetConnectionId={props.presetConnectionId}
      />
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

describe('리버스 다이얼로그', () => {
  it('커넥션이 기본 선택되고 문서 이름은 {커넥션 이름} ERD로 채운다', async () => {
    renderReverseDialog()

    // then: 커넥션 첫 항목이 선택돼 문서 이름 기본값이 채워진다
    // (Radix Select의 선택 표기는 jsdom에서 렌더되지 않는다 — 폼 값으로 검증)
    await waitFor(() => {
      expect(screen.getByLabelText(/문서 이름/)).toHaveValue('개발 PG ERD')
    })
  })

  it('제출하면 요약 토스트를 띄운다 — 테이블 n·관계 m', async () => {
    const user = userEvent.setup()
    renderReverseDialog()

    await waitFor(() => {
      expect(screen.getByLabelText(/문서 이름/)).toHaveValue('개발 PG ERD')
    })
    await user.click(screen.getByRole('button', { name: '가져오기' }))

    await waitFor(() => {
      expect(screen.getByText(/문서를 만들었습니다/)).toBeVisible()
      expect(screen.getByText(/테이블 2개/)).toBeVisible()
      expect(screen.getByText(/관계 1개/)).toBeVisible()
    })
  })

  it('skipped FK가 있으면 경고 토스트를 추가로 띄운다', async () => {
    server.use(
      http.post('/api/v1/core/workspaces/101/connections/301/reverse-engineering', () =>
        HttpResponse.json(
          ok({
            response: {
              model: {
                modelId: '701',
                workspaceId: '101',
                name: '개발 PG ERD',
                description: null,
                databaseType: 'postgresql',
                content: '{}',
                version: 0,
                createdBy: { userId: '2', name: '부트스트랩 관리자' },
                createdAt: '2026-09-12T00:00:00Z',
                updatedAt: '2026-09-12T00:00:00Z',
              },
              tableCount: 1,
              relationshipCount: 0,
              skipped: ['fk_ghost'],
            },
          }),
          { status: 201 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderReverseDialog()

    await waitFor(() => {
      expect(screen.getByLabelText(/문서 이름/)).toHaveValue('개발 PG ERD')
    })
    await user.click(screen.getByRole('button', { name: '가져오기' }))

    await waitFor(() => {
      expect(screen.getByText(/가져오지 못한 외래키/)).toBeVisible()
    })
  })

  it('같은 이름의 문서가 있으면 409 안내 토스트', async () => {
    server.use(
      http.post('/api/v1/core/workspaces/101/connections/301/reverse-engineering', () =>
        fail('DUPLICATED_NAME', 409)),
    )
    const user = userEvent.setup()
    renderReverseDialog()

    await waitFor(() => {
      expect(screen.getByLabelText(/문서 이름/)).toHaveValue('개발 PG ERD')
    })
    await user.click(screen.getByRole('button', { name: '가져오기' }))

    await waitFor(() => {
      expect(screen.getByText(/DUPLICATED_NAME|이미/)).toBeVisible()
    })
  })

  it('가져온 문서는 계층 배치로 다시 저장된다 — 부모가 위, 레이어 간 여백', async () => {
    // 서버는 그리드 좌표로 내려온다 — 두 테이블이 같은 줄에 몰려 있는 상태
    const content = JSON.stringify({
      model: {
        tables: [
          { id: 't1', physicalName: 'members', logicalName: '회원', columns: [], primaryKey: null, uniques: [], indexes: [] },
          { id: 't2', physicalName: 'orders', logicalName: '주문', columns: [], primaryKey: null, uniques: [], indexes: [] },
        ],
        relationships: [{ id: 'r1', parentTableId: 't1', childTableId: 't2' }],
      },
      diagram: {
        nodes: {
          t1: { x: 80, y: 80, width: null },
          t2: { x: 480, y: 80, width: null },
        },
        notes: [],
      },
    })
    let putBody: { baseVersion?: number; content?: string } | null = null
    server.use(
      http.post('/api/v1/core/workspaces/101/connections/301/reverse-engineering', () =>
        HttpResponse.json(
          ok({
            response: {
              model: {
                modelId: '701',
                workspaceId: '101',
                name: '개발 PG ERD',
                description: null,
                databaseType: 'postgresql',
                content,
                version: 3,
                createdBy: { userId: '2', name: '부트스트랩 관리자' },
                createdAt: '2026-09-12T00:00:00Z',
                updatedAt: '2026-09-12T00:00:00Z',
              },
              tableCount: 2,
              relationshipCount: 1,
              skipped: [],
            },
          }),
          { status: 201 },
        ),
      ),
      http.put('/api/v1/core/workspaces/101/models/701/content', async ({ request }) => {
        putBody = (await request.json()) as { baseVersion?: number; content?: string }
        return HttpResponse.json(ok({ response: { version: 4, updatedAt: '2026-09-12T00:00:00Z' } }))
      }),
    )
    const user = userEvent.setup()
    renderReverseDialog()

    await waitFor(() => {
      expect(screen.getByLabelText(/문서 이름/)).toHaveValue('개발 PG ERD')
    })
    await user.click(screen.getByRole('button', { name: '가져오기' }))

    // then: 생성 직후 ELK 계층 배치 좌표로 content가 다시 저장된다
    await waitFor(() => expect(putBody).not.toBeNull(), { timeout: 10_000 })
    expect(putBody!.baseVersion).toBe(3)
    const saved = JSON.parse(putBody!.content ?? '{}')
    const parent = saved.diagram.nodes.t1
    const child = saved.diagram.nodes.t2
    expect(child.y).toBeGreaterThan(parent.y) // FK 방향 — 부모가 위 레이어
    expect(child.y - parent.y).toBeGreaterThanOrEqual(100) // 레이어 간 여백
    expect(child.y - parent.y).not.toBe(0) // 같은 줄 그리드가 아니라 계층으로
  })

  it('커넥션이 없으면 가져오기 버튼이 비활성', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/connections', () =>
        HttpResponse.json(
          ok({ totalCount: 0, responses: [] }),
        ),
      ),
    )
    renderReverseDialog()

    // then: 커넥션 없음 placeholder + 제출 비활성
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '가져오기' })).toBeDisabled()
    })
  })
})
