/**
 * vitest Assertion에 jest-axe 매처 타입 추가
 * (jest-axe의 공식 타입은 jest 환경 전용 — @types/jest-axe가 vitest 확장까지는 커버하지 않는다)
 */
import 'vitest'

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): Assertion<T>
  }
}
