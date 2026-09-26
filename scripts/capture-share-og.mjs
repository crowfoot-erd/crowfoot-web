// 쇼케이스 공유 og:image 캡처 — 매니페스트(share-showcase.json) 토큰별로 로컬 공개 뷰어를
// playwright chromium으로 열고 캔버스 렌더를 기다려 스크린샷을 public/og/shares/{token}.png로 뽑는다.
// 사용: node scripts/capture-share-og.mjs (로컬 웹 8080 기동 후. BASE_URL 환경변수로 덮어쓴다)
// 원천 문서: 04-front/storyboard/00-common.md §3.11 — og PNG와 매니페스트만 커밋한다.
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8080'
const OUT_DIR = resolve(here, '../public/og/shares')

/**
 * 캡처 준비 판정 — 캔버스 노드가 그려졌고 에러 안내가 사라진 상태.
 * 게스트 부팅의 silent refresh 403이 쿼리를 잠시 리셋시키는 과도기(에러 화면 → 자동 복구)가
 * 있어, 노드 검출만으로는 그 순간을 프리즈할 수 있다. 안정 문구 부재까지 본다.
 */
async function settle(page, token) {
  await page
    .waitForFunction(
      () =>
        document.querySelector('.react-flow__node') !== null &&
        !document.body.innerText.includes('불러올 수 없습니다'),
      { timeout: 20_000 },
    )
    .catch(async () => {
      console.warn(`capture-share-og: 첫 진입 안정 실패 — 1회 재시도 (${token})`)
      await page.reload({ waitUntil: 'networkidle' })
      await page
        .waitForFunction(
          () =>
            document.querySelector('.react-flow__node') !== null &&
            !document.body.innerText.includes('불러올 수 없습니다'),
          { timeout: 20_000 },
        )
        .catch(() => console.warn(`capture-share-og: 노드 대기 시간 초과 — 현재 화면으로 캡처 (${token})`))
    })
  await page.waitForTimeout(800) // 레이아웃 안정화 여유
}

const manifest = JSON.parse(readFileSync(`${here}/share-showcase.json`, 'utf8'))
if (!Array.isArray(manifest) || manifest.length === 0) {
  console.log('capture-share-og: 매니페스트 비어 있음 — 캡처 없음')
  process.exit(0)
}

mkdirSync(OUT_DIR, { recursive: true })
// channel 'chrome': 번들 chromium은 macOS 13 미지원 — 시스템 Chrome 사용(generate-og-image.mjs와 동일 근거)
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const { token } of manifest) {
    if (!token) throw new Error('capture-share-og: 매니페스트 항목에 token이 필요하다')
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 2, // 2400x1260 — 축소 렌더에서도 선이 또렷하게
    })
    try {
      await page.goto(`${BASE_URL}/share/${token}`, { waitUntil: 'networkidle' })
      await settle(page, token)
      await page.screenshot({ path: resolve(OUT_DIR, `${token}.png`) })
      console.log(`capture-share-og: ${token}.png 생성 완료`)
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
}
