/**
 * ERD 문서 열기(새 창 전체 화면) 테스트 — storyboard 02-user §5
 *
 * given: /core/workspaces/101/models/501 상세 응답을 MSW로 정의
 * when: 라우트로 직접 진입
 * then: 메아(이름·DB 종류·캔버스·버전·생성자)·에디터 준비 중 안내·창 닫기
 */
import { screen } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { Route } from 'react-router-dom'

import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { ModelViewerPage } from '@/pages/model-viewer'
import { renderWithProviders } from '@/test/test-app'

function renderViewer() {
  return renderWithProviders(
    <Route path="/workspaces/:workspaceId/models/:modelId" element={<ModelViewerPage />} />,
    { route: '/workspaces/101/models/501' },
  )
}

describe('ERD 문서 열기', () => {
  it('renders document meta and the pending-editor placeholder', async () => {
    renderViewer()

    // then: fixtures 501 — 이름·DB 종류·캔버스·버전·생성자
    expect(await screen.findByRole('heading', { name: '주문 서비스 ERD' })).toBeVisible()
    expect(screen.getByText('postgresql')).toBeVisible()
    expect(screen.getByText(/1920×1080/)).toBeVisible()
    expect(screen.getByText('v3')).toBeVisible()
    expect(screen.getByText(/부트스트랩 관리자/)).toBeVisible()

    // then: 에디터 준비 중 안내 + 창 닫기
    expect(screen.getByText('에디터 준비 중')).toBeVisible()
    expect(screen.getByRole('button', { name: /창 닫기/ })).toBeVisible()
  })

  it('shows the error state with retry on failure', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models/501', () => fail('MODEL_NOT_FOUND', 404)),
    )

    renderViewer()

    // then: 에러 문구 + 재시도 버튼
    expect(await screen.findByRole('button', { name: /다시 시도/ })).toBeVisible()
  })
})
