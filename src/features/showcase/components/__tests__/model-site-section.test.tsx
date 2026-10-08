/**
 * 문서 정보 다이얼로그의 "만든 사이트" 칸 테스트 (08-core/19-site-showcase.md Section 3.1~3.4·6)
 *
 * given: 문서의 사이트 조회·등록·다시 가져오기·삭제 응답을 MSW로 정의
 * when: 문서 수정 다이얼로그를 열고 사이트 칸을 조작
 * then: 저장 중 진행 문구 → 썸네일·캡처 실패 사유, 내부망 주소 거절 안내, 1분 제한(429) 안내,
 *       삭제 확인, PUT 본문(같은 주소의 설명 지우기는 ""), 이름·설명 폼은 따로 저장
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fail, ok } from '@/api/mocks/handlers'
import { server } from '@/api/mocks/server'
import type { ModelSummary } from '@/api/types'
import { Toaster } from '@/components/ui/sonner'
import { EditModelDialog } from '@/features/models/components/edit-model-dialog'
import { renderWithProviders } from '@/test/test-app'

const SITE_PATH = '/api/v1/core/workspaces/101/models/501/site'

const MODEL: ModelSummary = {
  modelId: '501',
  workspaceId: '101',
  name: '블로그 ERD',
  description: null,
  databaseType: 'mysql',
  sourceConnectionId: null,
  version: 3,
  createdBy: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
}

const SAVED = {
  siteId: '12',
  url: 'https://blog.example.com',
  title: '예제 블로그',
  description: '개발 이야기를 씁니다',
  siteName: 'Example',
  faviconUrl: 'https://blog.example.com/favicon.ico',
  thumbnailUrl: '/api/v1/core/showcase/sites/12/thumbnail?v=1791444000',
  capturedAt: '2026-10-08T07:40:00Z',
  captureError: null as string | null,
  hidden: false,
  reportCount: 0,
  createdAt: '2026-10-08T07:40:00Z',
  updatedAt: '2026-10-08T07:40:00Z',
}

function renderDialog(canEdit = true) {
  return renderWithProviders(
    <Route
      path="/"
      element={
        <>
          <EditModelDialog model={MODEL} onOpenChange={() => {}} workspaceId="101" canEdit={canEdit} />
          <Toaster />
        </>
      }
    />,
  )
}

function siteSection() {
  return screen.findByTestId('model-site-section')
}

describe('만든 사이트 칸', () => {
  it('주소를 저장하면 가져오는 동안 진행 문구를 보이고, 썸네일과 캡처 실패 사유를 보여 준다', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let body: unknown = null
    server.use(
      http.put(SITE_PATH, async ({ request }) => {
        body = await request.json()
        await gate
        return HttpResponse.json(ok({ response: { ...SAVED, captureError: 'CERTIFICATE_ERROR' } }))
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    const section = await siteSection()
    const urlInput = await within(section).findByLabelText('사이트 주소')
    await user.type(urlInput, 'https://blog.example.com')
    await user.click(within(section).getByRole('button', { name: '사이트 저장' }))

    expect(await within(section).findByText('썸네일과 정보를 가져오는 중…')).toBeInTheDocument()
    // 제목·설명을 비우면 보내지 않는다(캡처 값을 쓴다)
    await waitFor(() => expect(body).toEqual({ url: 'https://blog.example.com' }))
    release()

    const preview = await within(section).findByTestId('model-site-preview')
    expect(within(preview).getByTestId('showcase-thumbnail')).toHaveAttribute(
      'src',
      '/api/v1/core/showcase/sites/12/thumbnail?v=1791444000',
    )
    expect(preview).toHaveTextContent('예제 블로그')
    expect(preview).toHaveTextContent('Example')
    expect(within(section).getByTestId('model-site-capture-error')).toHaveTextContent('CERTIFICATE_ERROR')
    expect(await screen.findByText('사이트를 저장했지만 썸네일을 가져오지 못했습니다')).toBeInTheDocument()
    // 저장한 값으로 입력 칸을 다시 채운다
    expect(within(section).getByLabelText('제목(선택)')).toHaveValue('예제 블로그')
    expect(within(section).getByLabelText('한 줄 소개(선택)')).toHaveValue('개발 이야기를 씁니다')
    expect(screen.queryByText('썸네일과 정보를 가져오는 중…')).not.toBeInTheDocument()
  })

  it('저장된 설명을 지우고 저장하면 description ""을 보낸다(명시적 클리어)', async () => {
    let body: unknown = null
    server.use(
      http.get(SITE_PATH, () => HttpResponse.json(ok({ response: SAVED }))),
      http.put(SITE_PATH, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(ok({ response: { ...SAVED, description: null } }))
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    const section = await siteSection()
    const description = await within(section).findByLabelText('한 줄 소개(선택)')
    expect(description).toHaveValue('개발 이야기를 씁니다')
    await user.clear(description)
    await user.click(within(section).getByRole('button', { name: '사이트 저장' }))

    await waitFor(() =>
      expect(body).toEqual({ url: 'https://blog.example.com', title: '예제 블로그', description: '' }),
    )
  })

  it('내부망 주소는 주소 칸 아래에 등록할 수 없다고 알린다', async () => {
    server.use(http.put(SITE_PATH, () => fail('SITE_URL_BLOCKED', 400)))
    const user = userEvent.setup()
    renderDialog()

    const section = await siteSection()
    await user.type(await within(section).findByLabelText('사이트 주소'), 'http://10.0.0.1')
    await user.click(within(section).getByRole('button', { name: '사이트 저장' }))

    expect(await within(section).findByText(/내부망이나 사설 주소는 등록할 수 없습니다/)).toBeInTheDocument()
    expect(within(section).getByLabelText('사이트 주소')).toHaveAttribute('aria-invalid', 'true')
    expect(within(section).queryByTestId('model-site-preview')).not.toBeInTheDocument()
  })

  it('서버 입력 검증 오류(INVALID_REQUEST)는 짚은 칸에 붙인다', async () => {
    server.use(
      http.put(SITE_PATH, () =>
        fail('INVALID_REQUEST', 400, [{ field: 'title', code: 'Size', message: 'too long' }]),
      ),
    )
    const user = userEvent.setup()
    renderDialog()

    const section = await siteSection()
    await user.type(await within(section).findByLabelText('사이트 주소'), 'https://blog.example.com')
    await user.type(within(section).getByLabelText('제목(선택)'), '제목')
    await user.click(within(section).getByRole('button', { name: '사이트 저장' }))

    expect(await within(section).findByText('제목은 200자 이하로 적어 주세요.')).toBeInTheDocument()
    expect(within(section).getByLabelText('제목(선택)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('http·https가 아닌 주소는 보내지 않고 칸에 안내한다', async () => {
    let called = false
    server.use(
      http.put(SITE_PATH, () => {
        called = true
        return HttpResponse.json(ok({ response: SAVED }))
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    const section = await siteSection()
    await user.type(await within(section).findByLabelText('사이트 주소'), 'ftp://example.com')
    await user.click(within(section).getByRole('button', { name: '사이트 저장' }))

    expect(await within(section).findByText('http 또는 https로 시작하는 주소를 넣어 주세요.')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('다시 가져오기가 1분 안이면(429) 잠시 뒤에 하라고 안내한다', async () => {
    server.use(
      http.get(SITE_PATH, () => HttpResponse.json(ok({ response: SAVED }))),
      http.post(`${SITE_PATH}/capture`, () => fail('SITE_CAPTURE_TOO_SOON', 429)),
    )
    const user = userEvent.setup()
    renderDialog()

    const section = await siteSection()
    await user.click(await within(section).findByRole('button', { name: '다시 가져오기' }))
    expect(await screen.findByText('방금 가져왔습니다. 1분 뒤에 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('다시 가져오기에 성공하면 새 썸네일로 바꾼다', async () => {
    server.use(
      http.get(SITE_PATH, () => HttpResponse.json(ok({ response: { ...SAVED, captureError: 'CAPTURE_BUSY' } }))),
      http.post(`${SITE_PATH}/capture`, () =>
        HttpResponse.json(
          ok({ response: { ...SAVED, thumbnailUrl: '/api/v1/core/showcase/sites/12/thumbnail?v=1791444100' } }),
        ),
      ),
    )
    const user = userEvent.setup()
    renderDialog()

    const section = await siteSection()
    expect(await within(section).findByTestId('model-site-capture-error')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: '다시 가져오기' }))

    expect(await screen.findByText('썸네일과 정보를 다시 가져왔습니다')).toBeInTheDocument()
    expect(within(section).getByTestId('showcase-thumbnail')).toHaveAttribute(
      'src',
      '/api/v1/core/showcase/sites/12/thumbnail?v=1791444100',
    )
    expect(within(section).queryByTestId('model-site-capture-error')).not.toBeInTheDocument()
  })

  it('삭제는 확인을 거쳐 DELETE하고 빈 칸으로 돌아간다', async () => {
    let deleted = false
    server.use(
      http.get(SITE_PATH, () => HttpResponse.json(ok({ response: SAVED }))),
      http.delete(SITE_PATH, () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    const section = await siteSection()
    await user.click(await within(section).findByRole('button', { name: '삭제' }))
    const confirm = await screen.findByRole('dialog', { name: '사이트 삭제' })
    await user.click(within(confirm).getByRole('button', { name: '삭제' }))

    expect(await screen.findByText('사이트를 삭제했습니다')).toBeInTheDocument()
    expect(deleted).toBe(true)
    expect(within(section).queryByTestId('model-site-preview')).not.toBeInTheDocument()
    expect(within(section).getByLabelText('사이트 주소')).toHaveValue('')
  })

  it('편집 권한이 없으면 등록된 사이트를 읽기만 한다', async () => {
    server.use(http.get(SITE_PATH, () => HttpResponse.json(ok({ response: SAVED }))))
    renderDialog(false)

    const section = await siteSection()
    expect(await within(section).findByTestId('model-site-preview')).toHaveTextContent('예제 블로그')
    expect(within(section).queryByLabelText('사이트 주소')).not.toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: '다시 가져오기' })).not.toBeInTheDocument()
  })

  it('이름·설명 폼은 사이트와 따로 저장한다 — 문서 저장은 사이트 API를 부르지 않는다', async () => {
    let siteCalled = false
    let patched: unknown = null
    server.use(
      http.put(SITE_PATH, () => {
        siteCalled = true
        return HttpResponse.json(ok({ response: SAVED }))
      }),
      http.patch('/api/v1/core/workspaces/101/models/501', async ({ request }) => {
        patched = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    await siteSection()
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(patched).toEqual({ name: '블로그 ERD', description: null }))
    expect(siteCalled).toBe(false)
  })
})
