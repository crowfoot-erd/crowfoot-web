import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeAll, afterAll, expect } from 'vitest'

import { server } from '@/api/mocks/server'
import i18n from '@/lib/i18n'

expect.extend(toHaveNoViolations)

// jsdom navigator는 en-US — 문구 기대값 기준 언어를 ko로 고정한다
void i18n.changeLanguage('ko')

// jsdom은 matchMedia를 제공하지 않는다 — 테마 system 모드 resolve용 스텁
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// React Flow(@xyflow/react)가 요구하는 브라우저 API — jsdom에 없어 스텁 (공식 테스트 가이드 기준)
class ResizeObserverStub {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element): void {
    // 측정값 없이도 렌더 파이프라인이 돌아가도록 즉시 1회 통지 — contentRect 포함(XYPanZoom가 읽는다)
    const entry = {
      target,
      contentRect: target.getBoundingClientRect(),
      borderBoxSize: [{ inlineSize: 0, blockSize: 0 }],
      // radix react-use-size가 contentBoxSize[0].inlineSize를 읽는다
      contentBoxSize: [{ inlineSize: 0, blockSize: 0 }],
      devicePixelContentBoxSize: [],
    } as ResizeObserverEntry
    this.callback([entry], this as unknown as ResizeObserver)
  }
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

class DOMMatrixReadOnlyStub {
  m22: number
  constructor(transform?: string) {
    const scale = transform?.match(/matrix.*\((.+)\)/)?.[1]?.split(', ').pop()
    this.m22 = scale !== undefined ? Number(scale) : 1
  }
}
globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly

// jsdom은 Pointer Capture API를 구현하지 않는다 — radix select가 포인터 이벤트에서 호출한다
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}

// jsdom은 스크롤을 구현하지 않는다 — radix select가 목록 열릴 때 선택 항목을 호출한다
Element.prototype.scrollIntoView ??= () => {}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  // 테스트 문구 기대값은 ko 기준 — 개별 테스트가 바꾼 언어를 되돌린다
  void i18n.changeLanguage('ko')
})
afterAll(() => server.close())
