import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** 빌드 식별자 — 배포마다 달라진다. 열려 있는 화면이 새 배포를 알아채는 데 쓴다(src/lib/app-update.ts) */
const APP_BUILD = process.env.NODE_ENV === 'production' ? String(Date.now()) : 'dev'

/** dist/version.json — 화면이 주기적으로 읽어 자기 빌드 식별자와 견준다 */
const emitVersionFile = (): Plugin => ({
  name: 'crowfoot-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: APP_BUILD }) })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), emitVersionFile()],
  define: {
    __APP_BUILD__: JSON.stringify(APP_BUILD),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Toast UI Editor는 CJS 번들 — 개발 서버 사전 번들링 대상에 명시적으로 포함
  optimizeDeps: {
    include: ['@toast-ui/editor'],
  },
  build: {
    rollupOptions: {
      output: {
        // 마크다운 에디터/뷰어는 React.lazy로만 로드 — lazy 청크가 메인 번들로 새는 것을 차단해
        // 이미 1.2MB+인 메인 청크 비열화를 방지한다
        manualChunks(id: string) {
          return id.includes('@toast-ui/editor') ? 'toast-ui' : undefined
        },
      },
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
      // 협업 2차 — 실시간 채널(crowfoot-collab 8083, STOMP over WebSocket)
      '/ws': {
        target: 'ws://localhost:8083',
        ws: true,
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
