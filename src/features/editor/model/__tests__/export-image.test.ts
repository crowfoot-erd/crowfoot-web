/**
 * 이미지 내보내기 유틸 — bbox 계산·viewport 이동·원복 (05-editor/02-ui.md §1.1)
 *
 * toPng(html-to-image)는 목으로 대체 — 브라우저 렌더링이 필요한 부분은 검증 대상이 아니다.
 * 검증 대상: 전체 노드 범위 계산과 캡처 후 transform 원복 보장.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RfMeasuredNode } from '@/features/editor/model/export-image'

import { captureErdPng, nodesBoundingBox } from '@/features/editor/model/export-image'

vi.mock('html-to-image', () => ({ toPng: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
})

function node(id: string, x: number, y: number, w = 100, h = 50): RfMeasuredNode {
  return {
    id,
    type: 'table',
    position: { x, y },
    positionAbsolute: { x, y },
    measured: { width: w, height: h },
    data: {},
  } as RfMeasuredNode
}

describe('nodesBoundingBox — 전체 노드 범위', () => {
  it('여러 노드의 최소·최대를 감싼다', () => {
    const bounds = nodesBoundingBox([node('a', 100, 200), node('b', 400, 50, 120, 80)])

    expect(bounds).toEqual({ x: 100, y: 50, width: 420, height: 200 })
  })

  it('measured가 없으면 선언 폭·높이로 폴백한다', () => {
    const bare = { ...node('a', 0, 0), measured: undefined, width: 200, height: 60 } as RfMeasuredNode

    expect(nodesBoundingBox([bare])).toEqual({ x: 0, y: 0, width: 200, height: 60 })
  })

  it('노드가 없으면 null — 캡처 대상 없음', () => {
    expect(nodesBoundingBox([])).toBeNull()
  })
})

describe('captureErdPng — 캡처·원복', () => {
  function mountViewport(): HTMLElement {
    const canvas = document.createElement('div')
    canvas.className = 'react-flow'
    const viewport = document.createElement('div')
    viewport.className = 'react-flow__viewport'
    viewport.style.transform = 'translate(120px, 40px) scale(1.5)'
    canvas.appendChild(viewport)
    document.body.appendChild(canvas)
    return canvas
  }

  it('viewport를 전체 범위로 옮겨 캡처하고 원복한다', async () => {
    const canvas = mountViewport()
    const { toPng } = await import('html-to-image')
    const mockPng = vi.mocked(toPng).mockResolvedValue('data:image/png;base64,MOCK')

    const dataUrl = await captureErdPng(canvas, { x: 100, y: 50, width: 300, height: 150 }, '#ffffff')

    expect(dataUrl).toBe('data:image/png;base64,MOCK')
    const options = mockPng.mock.calls[0][1]!
    // 범위 + 여백 40×2 — 잘린 이미지·붙은 경계가 없어야 한다
    expect(options.width).toBe(380)
    expect(options.height).toBe(230)
    expect(options.style).toMatchObject({ width: '380px', height: '230px' })
    // 뷰포트 이동 = 여백 - 범위 원점 — 전체 내용이 캡처 박스 안에 들어온다
    expect(options.style!.transform).toBe('translate(-60px, -10px) scale(1)')
    // 캡처 뒤 사용자 뷰는 그대로
    const viewport = canvas.querySelector<HTMLElement>('.react-flow__viewport')!
    expect(viewport.style.transform).toBe('translate(120px, 40px) scale(1.5)')
  })

  it('캡처가 실패해도 뷰포트 transform은 원복한다', async () => {
    const canvas = mountViewport()
    const { toPng } = await import('html-to-image')
    vi.mocked(toPng).mockRejectedValue(new Error('boom'))

    await expect(
      captureErdPng(canvas, { x: 0, y: 0, width: 100, height: 100 }, '#ffffff'),
    ).rejects.toThrow('boom')

    const viewport = canvas.querySelector<HTMLElement>('.react-flow__viewport')!
    expect(viewport.style.transform).toBe('translate(120px, 40px) scale(1.5)')
  })
})
