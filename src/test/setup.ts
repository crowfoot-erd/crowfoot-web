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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  // 테스트 문구 기대값은 ko 기준 — 개별 테스트가 바꾼 언어를 되돌린다
  void i18n.changeLanguage('ko')
})
afterAll(() => server.close())
