/**
 * 문서-데이터베이스 최초 연결 다이얼로그 테스트 (08-core/02-model.md §1.14)
 *
 * given: 기본 커넥션 목업(301 postgresql·302 mysql)과 미연결 문서
 * when: 다이얼로그 렌더·연결 실행
 * then: 같은 DBMS 커넥션만 노출·기본 선택, 매칭 0건 안내, 성공 닫힘, 409 안내
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'

import { server } from '@/api/mocks/server'
import { ConnectDatabaseDialog } from '@/features/models/components/connect-database-dialog'
import { renderWithProviders } from '@/test/test-app'

// jsdom에는 scrollIntoView가 없다 — radix select가 열릴 때 필요
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

function renderDialog(
  databaseType = 'postgresql',
  onOpenChange: (open: boolean) => void = vi.fn(),
) {
  return renderWithProviders(
    <ConnectDatabaseDialog
      open
      onOpenChange={onOpenChange}
      workspaceId="101"
      model={{ modelId: '502', name: '회원 서비스 ERD', databaseType }}
    />,
    { wrapRoutes: false },
  )
}

describe('ConnectDatabaseDialog — 대상 선택', () => {
  it('같은 DBMS 커넥션만 노출하고 첫 항목을 기본 선택한다', async () => {
    renderDialog('postgresql')

    const combobox = await screen.findByRole('combobox')
    await waitFor(() => expect(combobox).toHaveTextContent('개발 PG'))

    // 목록을 열어 같은 DBMS(postgresql)만 있는지 확인한다 — mysql 302는 빠진다
    fireEvent.click(combobox)
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('개발 PG')
  })

  it('같은 DBMS 커넥션이 없으면 안내하고 연결 버튼을 비활성화한다', async () => {
    renderDialog('oracle')

    expect(await screen.findByText(/같은 DBMS\(oracle\)의 커넥션이 없습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: '연결' })).toBeDisabled()
  })
})

describe('ConnectDatabaseDialog — 연결 실행', () => {
  it('연결 성공 — 다이얼로그을 닫는다', async () => {
    const onOpenChange = vi.fn()
    renderDialog('mysql', onOpenChange)

    const combobox = await screen.findByRole('combobox')
    await waitFor(() => expect(combobox).toHaveTextContent('개발 MySQL'))

    fireEvent.click(screen.getByRole('button', { name: '연결' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('409 MODEL_ALREADY_CONNECTED — 서버 가드 안내를 표시한다', async () => {
    server.use(
      http.post('/api/v1/core/workspaces/101/models/502/connections', () =>
        HttpResponse.json(
          {
            header: {
              isSuccessful: false,
              resultCode: 'MODEL_ALREADY_CONNECTED',
              resultMessage: 'MODEL_ALREADY_CONNECTED',
            },
          },
          { status: 409 },
        ),
      ),
    )
    renderDialog('postgresql')

    const combobox = await screen.findByRole('combobox')
    await waitFor(() => expect(combobox).toHaveTextContent('개발 PG'))

    fireEvent.click(screen.getByRole('button', { name: '연결' }))

    expect(await screen.findByText('이미 커넥션이 연결된 문서입니다.')).toBeVisible()
  })
})
