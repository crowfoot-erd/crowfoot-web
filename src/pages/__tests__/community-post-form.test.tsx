/**
 * 커뮤니티 게시글 작성·수정 폼 테스트 (08-core/08-community.md)
 *
 * lazy MarkdownEditor는 stub textarea로 대체(onChange 파이프만 검증).
 * 제목/본문 검증·생성 페이로드(board 포함)·수정 초기값 시딩을 검증한다.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { server } from '@/api/mocks/server'
import { CommunityPostFormPage } from '@/pages/community/post-form'
import { asAuthenticated, renderWithProviders } from '@/test/test-app'

vi.mock('@/features/community/components/markdown-editor', () => ({
  // 실제 에디터처럼 비제어 — 초기값은 마운트 시 1회, 이후는 onChange로만 수집
  default: ({
    initialValue,
    onChange,
  }: {
    initialValue: string
    onChange: (markdown: string) => void
  }) => (
    <textarea
      data-testid="markdown-editor"
      defaultValue={initialValue}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

function ok(body: object) {
  return {
    header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
    ...body,
  }
}

function renderCreate(route = '/community/posts/new?board=FEEDBACK') {
  asAuthenticated() // me 쿼리 활성화 — 수정 권한(editForbidden) 판정
  return renderWithProviders(
    <>
      <Route path="/community/posts/new" element={<CommunityPostFormPage mode="create" />} />
      <Route path="/community/posts/:postId" element={<div>POST DETAIL</div>} />
      <Route path="/community/posts/:postId/edit" element={<CommunityPostFormPage mode="edit" />} />
      <Route path="/community/feedback" element={<div>FEEDBACK BOARD</div>} />
      <Route path="/community/release-notes" element={<div>RELEASE BOARD</div>} />
    </>,
    { route },
  )
}

describe('커뮤니티 게시글 폼 — 생성', () => {
  it('validates the title before submitting', async () => {
    const user = userEvent.setup()
    renderCreate()

    // when: 제목 없이 등록 시도
    await user.click(await screen.findByRole('button', { name: '등록' }))

    // then: 제목 필수 문구
    expect(await screen.findByText('제목을 입력하세요.')).toBeVisible()
    expect(screen.queryByText('POST DETAIL')).not.toBeInTheDocument()
  })

  it('validates the content before submitting', async () => {
    const user = userEvent.setup()
    renderCreate()

    // when: 제목만 채우고 본문은 빈 칸으로 두고 등록
    await user.type(await screen.findByLabelText('제목'), '새 제안')
    await user.click(screen.getByRole('button', { name: '등록' }))

    // then: 본문 필수 문구(stub 에디터가 onChange를 발화하지 않았다)
    expect(await screen.findByText('본문을 입력하세요.')).toBeVisible()
  })

  it('submits the board, title and content then navigates to the detail', async () => {
    const user = userEvent.setup()
    const bodies: object[] = []
    server.use(
      http.post('/api/v1/core/community/posts', async ({ request }) => {
        bodies.push((await request.json()) as object)
        return HttpResponse.json(
          ok({
            response: {
              postId: '1001',
              board: 'FEEDBACK',
              title: '새 제안',
              content: '본문입니다',
              author: { userId: '2', name: '부트스트랩 관리자' },
              createdAt: '2026-09-17T00:00:00Z',
              updatedAt: '2026-09-17T00:00:00Z',
            },
          }),
          { status: 201 },
        )
      }),
    )
    renderCreate()

    // when: 제목 + 본문(stub 에디터 경유) 작성 후 등록
    await user.type(await screen.findByLabelText('제목'), '새 제안')
    await user.type(screen.getByTestId('markdown-editor'), '본문입니다')
    await user.click(screen.getByRole('button', { name: '등록' }))

    // then: 페이로드에 board·title·content, 상세로 이동
    expect(await screen.findByText('POST DETAIL')).toBeVisible()
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ board: 'FEEDBACK', title: '새 제안', content: '본문입니다' })
  })
})

describe('커뮤니티 게시글 폼 — 수정', () => {
  it('seeds the title and content from the existing post and patches on submit', async () => {
    const user = userEvent.setup()
    const patches: object[] = []
    server.use(
      http.patch('/api/v1/core/community/posts/802', async ({ request }) => {
        patches.push((await request.json()) as object)
        return HttpResponse.json(
          ok({
            response: {
              postId: '802',
              board: 'FEEDBACK',
              title: '수정된 제목',
              content: '수정된 본문',
              author: { userId: '3', name: 'kim' },
              createdAt: '2026-09-15T14:00:00Z',
              updatedAt: '2026-09-17T00:00:00Z',
            },
          }),
        )
      }),
    )
    asAuthenticated() // me=admin — kim의 글도 관리자는 수정 가능
    renderWithProviders(
      <>
        <Route path="/community/posts/:postId/edit" element={<CommunityPostFormPage mode="edit" />} />
        <Route path="/community/posts/:postId" element={<div>POST DETAIL</div>} />
      </>,
      { route: '/community/posts/802/edit' },
    )

    // then: 로드된 글의 제목·본문이 시딩된다(fixtures 802) — reset effect 반영 대기
    const title = await screen.findByLabelText('제목')
    await waitFor(() => expect(title).toHaveValue('ERD 내보내기 포맷 제안'))
    expect((screen.getByTestId('markdown-editor') as HTMLTextAreaElement).value).toContain('## 제안 배경')

    // when: 제목·본문 수정 후 저장
    await user.clear(title)
    await user.type(title, '수정된 제목')
    await user.clear(screen.getByTestId('markdown-editor'))
    await user.type(screen.getByTestId('markdown-editor'), '수정된 본문')
    await user.click(screen.getByRole('button', { name: '저장' }))

    // then: PATCH 페이로드(board 미포함 — 이동 불가 계약) + 상세로 이동
    expect(await screen.findByText('POST DETAIL')).toBeVisible()
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toEqual({ title: '수정된 제목', content: '수정된 본문' })
  })
})

describe('커뮤니티 게시글 폼 — RELEASE_NOTE 4언어 탭', () => {
  it('언어별 탭으로 입력해 값 있는 언어만 객체로 전송한다', async () => {
    const user = userEvent.setup()
    const bodies: object[] = []
    server.use(
      http.post('/api/v1/core/community/posts', async ({ request }) => {
        bodies.push((await request.json()) as object)
        return HttpResponse.json(
          ok({
            response: {
              postId: '1004',
              board: 'RELEASE_NOTE',
              title: 'v1.5.0 — 다국어',
              content: '# 새 기능',
              availableLangs: ['ko', 'en'],
              author: { userId: '2', name: '부트스트랩 관리자' },
              createdAt: '2026-09-17T00:00:00Z',
              updatedAt: '2026-09-17T00:00:00Z',
            },
          }),
          { status: 201 },
        )
      }),
    )
    renderCreate('/community/posts/new?board=RELEASE_NOTE')

    // when: ko 탭(기본) 제목·본문 → en 탭 전환 후 제목·본문 (ja·zh는 미입력)
    await user.type(await screen.findByLabelText('제목'), 'v1.5.0 — 다국어')
    await user.type(screen.getByTestId('markdown-editor'), '# 새 기능')
    await user.click(screen.getByRole('tab', { name: 'English' }))
    await user.type(await screen.findByLabelText('제목'), 'v1.5.0 — Global')
    await user.type(screen.getByTestId('markdown-editor'), '# New feature')
    await user.click(screen.getByRole('button', { name: '등록' }))

    // then: 값 있는 언어만 담긴 객체 페이로드 + 상세로 이동
    expect(await screen.findByText('POST DETAIL')).toBeVisible()
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({
      board: 'RELEASE_NOTE',
      title: { ko: 'v1.5.0 — 다국어', en: 'v1.5.0 — Global' },
      content: { ko: '# 새 기능', en: '# New feature' },
    })
  })

  it('전부 비어 있으면 최소 1개 언어 검증 문구를 띄운다', async () => {
    const user = userEvent.setup()
    renderCreate('/community/posts/new?board=RELEASE_NOTE')

    // when: 아무것도 쓰지 않고 등록
    await user.click(await screen.findByRole('button', { name: '등록' }))

    // then: 제목·본문 각각 최소 1개 언어 문구
    expect(await screen.findByText('제목은 최소 1개 언어로 입력하세요.')).toBeVisible()
    expect(screen.getByText('본문은 최소 1개 언어로 입력하세요.')).toBeVisible()
  })

  it('수정 — availableLangs(제목 기준)로 시드하고 미작성 언어는 빈 칸 + 배지, 시드 언어만 PATCH', async () => {
    const user = userEvent.setup()
    const patches: object[] = []
    server.use(
      http.patch('/api/v1/core/community/posts/902', async ({ request }) => {
        patches.push((await request.json()) as object)
        return HttpResponse.json(
          ok({
            response: {
              postId: '902',
              board: 'RELEASE_NOTE',
              title: 'v1.4.0 — 커뮤니티 게시판',
              content: '# 개요',
              availableLangs: ['ko', 'en'],
              author: { userId: '2', name: '부트스트랩 관리자' },
              createdAt: '2026-09-16T10:00:00Z',
              updatedAt: '2026-09-17T00:00:00Z',
            },
          }),
        )
      }),
    )
    asAuthenticated() // me=admin(userId 2) — 902 작성자 본인
    renderWithProviders(
      <>
        <Route path="/community/posts/:postId/edit" element={<CommunityPostFormPage mode="edit" />} />
        <Route path="/community/posts/:postId" element={<div>POST DETAIL</div>} />
      </>,
      { route: '/community/posts/902/edit' },
    )

    // then: 4개 언어 병렬 조회 완료 후 시드 — ko는 원문, en은 영어 원문(fixtures 902 ko/en 2벌)
    const title = await screen.findByLabelText('제목')
    await waitFor(() => expect(title).toHaveValue('v1.4.0 — 커뮤니티 게시판'))
    expect((screen.getByTestId('markdown-editor') as HTMLTextAreaElement).value).toContain('# 개요')

    // when: ja 탭(작성 안 된 언어) — 미작성 배지 + 빈 초안(폴백 원문 오염 방지)
    await user.click(screen.getByRole('tab', { name: /일본어/ }))
    expect(screen.getAllByText('미작성')).toHaveLength(2) // ja·zh 탭 — en은 시드돼 없다
    expect(screen.getByLabelText('제목')).toHaveValue('')
    expect((screen.getByTestId('markdown-editor') as HTMLTextAreaElement).value).toBe('')

    // when: 저장 — 시드된 ko·en만 전송(미입력 ja·zh는 제외)
    await user.click(screen.getByRole('button', { name: '저장' }))

    // then: 값 있는 언어만 병합 페이로드 + 상세로 이동
    expect(await screen.findByText('POST DETAIL')).toBeVisible()
    await waitFor(() => expect(patches).toHaveLength(1))
    const patch = patches[0] as { title: Record<string, string>; content: Record<string, string> }
    expect(patch.title).toEqual({ ko: 'v1.4.0 — 커뮤니티 게시판', en: 'v1.4.0 — Community board' })
    expect(Object.keys(patch.content)).toEqual(['ko', 'en'])
    expect(patch.content.ko).toContain('# 개요')
    expect(patch.content.en).toContain('# Overview')
  })
})
