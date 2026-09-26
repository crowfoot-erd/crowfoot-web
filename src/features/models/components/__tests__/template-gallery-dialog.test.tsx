/**
 * 템플릿 갤러리 다이얼로그 테스트 (08-core/09-templates.md §2.2 — 워크스페이스 복제)
 *
 * given: 공개 템플릿 목록·복제 엔드포인트 응답(MSW — 토큰 있는/없는 템플릿 혼합)
 * when: 카드 선택·이름 수정·복제·미리보기
 * then: 미리보기 링크는 shareToken 있는 카드에만, 복제 성공 시 새 창 에디터 + 요약 토스트,
 *       409(이름 중복)는 다이얼로그 유지로 완화
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import { Toaster } from '@/components/ui/sonner'
import { TemplateGalleryDialog } from '@/features/models/components/template-gallery-dialog'
import { renderWithProviders } from '@/test/test-app'

function renderGalleryDialog() {
  return renderWithProviders(
    <>
      <TemplateGalleryDialog open onOpenChange={() => {}} workspaceId="101" />
      <Toaster />,
    </>,
    { wrapRoutes: false },
  )
}

describe('템플릿 갤러리 다이얼로그', () => {
  it('공개 템플릿 카드 — 이름·DBMS 배지·counts·수정일을 그린다', async () => {
    renderGalleryDialog()

    // then: fixture 템플릿 2건 — 카드 요소 일람
    expect(await screen.findByText('쇼핑몰 커머스 ERD')).toBeVisible()
    expect(screen.getByText('테이블 20개 · 관계 24개')).toBeVisible()
    // 현지화 문서(86 zh)는 카드 표기가 한국어로 내려온다 — 원문 언어는 보이지 않는다
    expect(screen.getByText('도서관 대출 ERD')).toBeVisible()
    expect(screen.queryByText('图书馆借阅 ERD')).not.toBeInTheDocument()
    expect(screen.getByText('테이블 12개 · 관계 9개')).toBeVisible()
  })

  it('미리보기 링크는 활성 공유 토큰이 있는 카드에만 있다', async () => {
    renderGalleryDialog()
    await screen.findByText('쇼핑몰 커머스 ERD')

    // then: 토큰 있는 템플릿 — 공개 뷰어 새 탭 링크
    const preview = screen.getByRole('link', { name: '미리보기' })
    expect(preview).toHaveAttribute('href', '/share/T3mplat3T0ken0fShopping1')
    expect(preview).toHaveAttribute('target', '_blank')
    // 토큰 없는 템플릿(도서관)에는 미리보기가 아예 없다 — 링크는 카드당 최대 1개
    expect(screen.getAllByRole('link', { name: '미리보기' })).toHaveLength(1)
  })

  it('카드 선택 → 이름 기본값은 원본명 → 복제하면 에디터를 새 창으로 연다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    renderGalleryDialog()
    await screen.findByText('쇼핑몰 커머스 ERD')

    // when: 카드 선택 — 푸터가 나타나고 이름은 원본명으로 프리필
    await user.click(screen.getByText('쇼핑몰 커머스 ERD'))
    expect(screen.getByLabelText('문서 이름')).toHaveValue('쇼핑몰 커머스 ERD')

    await user.click(screen.getByRole('button', { name: '이 템플릿으로 시작' }))

    // then: 성공 토스트 + 새 창 에디터(복제된 문서)
    expect(await screen.findByText("'쇼핑몰 커머스 ERD' 문서를 템플릿에서 만들었습니다")).toBeVisible()
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('/workspaces/101/models/703', '_blank', 'noopener,noreferrer'),
    )
    openSpy.mockRestore()
  })

  it('이름 중복(409)이면 에러 토스트를 띄우고 다이얼로그를 유지한다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    renderGalleryDialog()
    await screen.findByText('도서관 대출 ERD')

    // when: 현지화 템플릿(zh) 선택 — 프리필도 카드 그대로 한국어, 이후 이름을 고쳐 복제
    await user.click(screen.getByText('도서관 대출 ERD'))
    const nameInput = screen.getByLabelText('문서 이름')
    expect(nameInput).toHaveValue('도서관 대출 ERD')
    await user.clear(nameInput)
    await user.type(nameInput, '주문 서비스 ERD')
    await user.click(screen.getByRole('button', { name: '이 템플릿으로 시작' }))

    // then: 409 안내 — 이름을 고쳐 쓸 수 있게 다이얼로그가 남는다(자동 suffix 없음)
    expect(await screen.findByText('이미 존재하는 이름입니다')).toBeVisible()
    expect(await screen.findByLabelText('문서 이름')).toHaveValue('주문 서비스 ERD')
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('목록이 비어 있으면 안내 문구만 그린다', async () => {
    server.use(
      // 템플릿 응답을 빈 목록으로 — 다이얼로그는 그대로, 카드 영역이 안내로 대체
      http.get('/api/v1/core/templates', () =>
        HttpResponse.json(ok({ totalCount: 0, responses: [] })),
      ),
    )
    renderGalleryDialog()

    expect(await screen.findByText('템플릿이 없습니다')).toBeVisible()
  })
})
