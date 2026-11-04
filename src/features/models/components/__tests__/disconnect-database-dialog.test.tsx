/**
 * 문서-데이터베이스 연결 해지 확인 테스트 (08-core/02-model.md §1.17)
 *
 * given: 연결된 문서
 * when: 확인 다이얼로그에서 연결 해지
 * then: 데이터베이스는 남는다는 안내, DELETE 호출 후 닫힘
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'

import { server } from '@/api/mocks/server'
import { DisconnectDatabaseDialog } from '@/features/models/components/disconnect-database-dialog'
import { renderWithProviders } from '@/test/test-app'

describe('DisconnectDatabaseDialog', () => {
  it('데이터베이스가 지워지지 않는다고 안내하고, 해지하면 DELETE를 부른 뒤 닫는다', async () => {
    const onOpenChange = vi.fn()
    const calls: string[] = []
    server.use(
      http.delete('*/api/v1/core/workspaces/101/models/502/connections', ({ request }) => {
        calls.push(request.method)
        return HttpResponse.json({
          header: { isSuccessful: true, resultCode: 'SUCCESS', resultMessage: 'SUCCESS' },
          response: { modelId: '502', sourceConnectionId: null },
        })
      }),
    )
    renderWithProviders(
      <DisconnectDatabaseDialog
        open
        onOpenChange={onOpenChange}
        workspaceId="101"
        model={{ modelId: '502', name: '회원 서비스 ERD' }}
      />,
      { wrapRoutes: false },
    )

    expect(await screen.findByText(/테이블과 데이터는 지워지지 않습니다/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '연결 해지' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(calls).toEqual(['DELETE'])
  })
})
