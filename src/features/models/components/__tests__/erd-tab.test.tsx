/**
 * ERD 탭 테스트 (storyboard 02-user §5 — 워크스페이스 상태 첫 번째 탭)
 *
 * given: /core/workspaces/101/models·/core/database-types 응답을 MSW로 정의
 * when: 탭 렌더
 * then: 목록(DB 종류·버전·생성자)·검색·빈 상태·생성 다이얼로그·권한별 버튼 노출
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { fail } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { ErdTab } from '@/features/models/components/erd-tab'
import { createColumn, createTable } from '@/features/editor/model/changes'
import { emptyContent } from '@/features/editor/model/content-io'
import { buildCrownFile } from '@/features/editor/model/crown-io'
import { renderWithProviders } from '@/test/test-app'

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderErdTab(props: { canCreate?: boolean; isOwner?: boolean } = {}) {
  // ErdTab은 라우트 컨텍스트를 쓰지 않는다 — Route 없이 그대로 렌더.
  // Toaster는 App에만 마운트되므로 토스트 단언용으로 함께 렌더한다
  return renderWithProviders(
    <>
      <ErdTab workspaceId="101" canCreate={props.canCreate ?? true} isOwner={props.isOwner ?? true} />
      <Toaster />
    </>,
    { wrapRoutes: false },
  )
}

describe('ERD 탭', () => {
  it('renders documents with database type and version', async () => {
    renderErdTab()

    // then: fixtures의 문서 2건 — 이름·DB 종류·버전·생성자
    expect(await screen.findByText('주문 서비스 ERD')).toBeVisible()
    expect(screen.getByText('회원 서비스 ERD')).toBeVisible()
    expect(screen.getByText('postgresql')).toBeVisible()
    expect(screen.getByText('mysql')).toBeVisible()
    expect(screen.getByText('v3')).toBeVisible()
    expect(screen.getByText('v1')).toBeVisible()
    expect(screen.getByText('결제 도메인 1차')).toBeVisible()
  })

  it('filters documents by keyword after debounce', async () => {
    renderErdTab()
    await screen.findByText('주문 서비스 ERD')

    // when: 키워드 입력 → 300ms 디바운스 후 재조회
    await userEvent.type(screen.getByLabelText('문서 이름·설명 검색'), '회원')

    // then: 새 키워드 쿼리가 pending → 도착 후 필터된 행
    await waitFor(() => expect(screen.queryByText('주문 서비스 ERD')).not.toBeInTheDocument())
    expect(await screen.findByText('회원 서비스 ERD')).toBeVisible()
  })

  it('opens the create dialog, submits and closes on success', async () => {
    renderErdTab()
    await screen.findByText('주문 서비스 ERD')

    // when: 새 문서 버튼 → 다이얼로그
    await userEvent.click(screen.getByRole('button', { name: /새 ERD 문서/ }))
    const nameInput = await screen.findByLabelText(/^이름$/)
    expect(screen.getByRole('dialog')).toBeVisible() // 다이얼로그 본체

    // then: DB 종류 기본 선택(mysql — 코드 목록 code asc 첫 항목)
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveTextContent('MySQL'),
    )

    // when: 이름 입력 후 생성
    await userEvent.type(nameInput, '정산 서비스 ERD')
    await userEvent.click(screen.getByRole('button', { name: /^생성$/ }))

    // then: 다이얼로그 닫힘
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^생성$/ })).not.toBeInTheDocument(),
    )
  })

  it('shows the duplicate name error toast on 409', async () => {
    renderErdTab()
    await screen.findByText('주문 서비스 ERD')

    await userEvent.click(screen.getByRole('button', { name: /새 ERD 문서/ }))
    const nameInput = await screen.findByLabelText(/^이름$/)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('MySQL'))

    // when: 중복 이름 제출 → 409
    await userEvent.type(nameInput, '주문 서비스 ERD')
    await userEvent.click(screen.getByRole('button', { name: /^생성$/ }))

    // then: 다이얼로그 유지 + 에러 토스트
    await waitFor(() => expect(screen.getByText('이미 존재하는 이름입니다')).toBeVisible())
    expect(await screen.findByLabelText(/^이름$/)).toBeVisible()
  })

  it('hides the create button when the role is below Editor', async () => {
    renderErdTab({ canCreate: false })

    await screen.findByText('주문 서비스 ERD')

    // then: Viewer는 생성 버튼 없음
    expect(screen.queryByRole('button', { name: /새 ERD 문서/ })).not.toBeInTheDocument()
  })

  it('edits a document name and description via the row action', async () => {
    renderErdTab()
    await screen.findByText('주문 서비스 ERD')

    // when: 행 수정 버튼 → 다이얼로그에 기존 값 프리필
    await userEvent.click(screen.getByRole('button', { name: '주문 서비스 ERD 문서 수정' }))
    const nameInput = await screen.findByLabelText(/^이름$/)
    expect(nameInput).toHaveValue('주문 서비스 ERD')

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, '주문 서비스 ERD v2')
    await userEvent.click(screen.getByRole('button', { name: /^저장$/ }))

    // then: 다이얼로그 닫힘 + 목록 갱신(갱신된 이름)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^저장$/ })).not.toBeInTheDocument(),
    )
  })

  it('deletes a document after confirmation when owner', async () => {
    renderErdTab()
    await screen.findByText('주문 서비스 ERD')

    // when: 행 삭제 버튼 → 확인 다이얼로그 → 확인
    await userEvent.click(screen.getByRole('button', { name: '주문 서비스 ERD 문서 삭제' }))
    await userEvent.click(await screen.findByRole('button', { name: /^삭제$/ }))

    // then: 확인 다이얼로그 닫힘
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^삭제$/ })).not.toBeInTheDocument(),
    )
  })

  it('hides the delete button for non-owner editors', async () => {
    renderErdTab({ isOwner: false })
    await screen.findByText('주문 서비스 ERD')

    // then: Editor는 수정만 가능 — 삭제 버튼 없음
    expect(screen.getByRole('button', { name: '주문 서비스 ERD 문서 수정' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '주문 서비스 ERD 문서 삭제' })).not.toBeInTheDocument()
  })

  it('opens the document in a new window from the view action and the name', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderErdTab()
    await screen.findByText('주문 서비스 ERD')

    // when: 행 돋보기 버튼 → 새 창 전체 화면 경로
    await userEvent.click(screen.getByRole('button', { name: '주문 서비스 ERD 문서 열기' }))
    expect(openSpy).toHaveBeenCalledWith('/workspaces/101/models/501', '_blank', 'noopener,noreferrer')

    // when: 문서 이름 클릭도 동일하게 연다
    await userEvent.click(screen.getByText('주문 서비스 ERD'))
    expect(openSpy).toHaveBeenCalledTimes(2)
    openSpy.mockRestore()
  })

  it('shows the empty state with CTA when no documents', async () => {
    server.use(
      http.get('/api/v1/core/workspaces/101/models', () =>
        HttpResponse.json(ok({ page: 1, size: 100, totalPages: 0, totalCount: 0, responses: [] })),
      ),
    )

    renderErdTab()

    // then: 빈 문구 + CTA(헤더 생성 버튼과 빈 상태 CTA 2곳)
    expect(await screen.findByText('ERD 문서가 없습니다')).toBeVisible()
    expect(screen.getAllByRole('button', { name: /새 ERD 문서/ })).toHaveLength(2)
  })

  it('shows the error state with retry on failure', async () => {
    server.use(http.get('/api/v1/core/workspaces/101/models', () => fail('SERVICE_UNAVAILABLE', 503)))

    renderErdTab()

    // then: 에러 문구 + 재시도 버튼
    expect(await screen.findByRole('button', { name: /다시 시도/ })).toBeVisible()
  })
})

describe('ERD 탭 — .crown 문서 파일 가져오기', () => {
  /** 봉투 유효한 파일 — 테이블 1개(컬럼 1·PK). content는 헬퍼로 조립해 스키마 정합을 보장한다 */
  function crownFile(name = '가져온 문서'): File {
    const content = emptyContent()
    content.model.tables.push(
      createTable('member', {
        id: 'T1',
        columns: [createColumn({ id: 'c1', physicalName: 'id', dataType: 'BIGINT', nullable: false })],
        primaryKey: { name: 'pk_member', columnIds: ['c1'] },
      }),
    )
    const envelope = buildCrownFile(
      { name, description: '봉투 설명', databaseType: 'mysql' },
      content,
      '2026-09-14T00:00:00Z',
    )
    return new File([envelope], `${name}.crown`, { type: 'application/json' })
  }

  function stubCreateAndSave() {
    const created: { name?: string; description?: string; databaseType?: string }[] = []
    const saved: { baseVersion?: number; content?: string }[] = []
    server.use(
      http.post('/api/v1/core/workspaces/101/models', async ({ request }) => {
        created.push((await request.json()) as { name?: string })
        return HttpResponse.json(
          ok({
            response: {
              modelId: '509',
              workspaceId: '101',
              name: '가져온 문서',
              description: null,
              databaseType: 'mysql',
              content: '{}',
              version: 0,
              createdBy: { userId: '2', name: '부트스트랩 관리자' },
              createdAt: '2026-09-14T00:00:00Z',
              updatedAt: '2026-09-14T00:00:00Z',
            },
          }),
          { status: 201 },
        )
      }),
      http.put('/api/v1/core/workspaces/101/models/509/content', async ({ request }) => {
        saved.push((await request.json()) as { baseVersion?: number; content?: string })
        return HttpResponse.json(ok({ response: { version: 1, updatedAt: '2026-09-14T00:00:00Z' } }))
      }),
    )
    return { created, saved }
  }

  it('파일 선택 → 문서 생성(메타) + 본체 저장(content) 2단계 호출', async () => {
    const { created, saved } = stubCreateAndSave()
    renderErdTab()
    await screen.findByText('주문 서비스 ERD')

    // when: 숨은 input에 파일 업로드
    await userEvent.upload(screen.getByLabelText('.crown 가져오기'), crownFile())

    // then: 메타는 봉투 메타, 본체는 봉투 content(직렬화)
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({ name: '가져온 문서', description: '봉투 설명', databaseType: 'mysql' })
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]?.baseVersion).toBe(0)
    expect(saved[0]?.content).toContain('"physicalName":"member"')

    // then: 성공 토스트 — 봉투 문서명으로
    expect(await screen.findByText('가져온 문서 문서를 가져왔습니다')).toBeVisible()
  })

  it('봉투가 아니면 생성 요청 없이 안내만', async () => {
    const { created } = stubCreateAndSave()
    renderErdTab()
    await screen.findByText('주문 서비스 ERD')

    const notCrown = new File([JSON.stringify({ hello: 'world' })], 'x.crown', { type: 'application/json' })
    await userEvent.upload(screen.getByLabelText('.crown 가져오기'), notCrown)

    expect(await screen.findByText('.crown 문서 파일이 아닙니다')).toBeVisible()
    expect(created).toHaveLength(0)
  })

  it('편집 권한 없으면 가져오기 버튼이 없다', async () => {
    renderErdTab({ canCreate: false })
    await screen.findByText('주문 서비스 ERD')

    expect(screen.queryByLabelText('.crown 가져오기')).not.toBeInTheDocument()
  })
})
