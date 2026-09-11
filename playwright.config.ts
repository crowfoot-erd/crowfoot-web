import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 스모크 (frontend-testing.md E)
 * - Vite dev 서버(8080) 재사용 — 이미 떠 있으면 그대로 사용
 * - API는 page.route 인터셉션으로 목킹 (실물 백엔드 미가정)
 * - channel 'chrome': Playwright 번들 chromium은 macOS 13 미지원 — 시스템 Chrome 사용
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
