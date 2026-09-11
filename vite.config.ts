import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 8080,
    // 명시 없으면 Node DNS 순서에 따라 IPv6(::1)에만 바인딩되어
    // 브라우저의 127.0.0.1 접속이 거부된다 — IPv4로 고정
    host: '127.0.0.1',
    proxy: {
      // 로컬은 전부 Vite 프록시로 같은 오리진 유지 — CORS 설정 불필요
      // (00-environment/frontend-environment.md Section 1.1, 대상 = Gateway 8000)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // e2e는 Playwright 관할 — vitest가 수집하지 않는다
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/components/**'],
      exclude: ['src/components/ui/**', 'src/components/**/index.ts'],
      thresholds: {
        // lib/·공통 components/ 라인 커버리지 80% (00-environment/frontend-testing.md Section 7)
        lines: 80,
      },
    },
  },
})
