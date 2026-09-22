// og-image 재생성 — scripts/og-image.html을 playwright chromium으로 캡처해 public/og-image.png로 뽑는다.
// CLI(screenshot)에는 device-scale-factor 옵션이 없어 라이브러리 API를 쓴다(@playwright/test 재사용 — 별도 설치 불필요).
// 사용: node scripts/generate-og-image.mjs (04-front/storyboard/00-common.md §3.11)
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const pageUrl = new URL('./og-image.html', import.meta.url).href
const outPath = fileURLToPath(new URL('../public/og-image.png', import.meta.url))

// channel 'chrome': 번들 chromium은 macOS 13 미지원 — 시스템 Chrome 사용(playwright.config와 동일 근거)
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2, // 2400x1260으로 캡처 — 축소 렌더에서도 선이 또렷하게
  })
  await page.goto(pageUrl)
  await page.waitForTimeout(300) // 웹폰트 없지만 안정화 여유
  await page.screenshot({ path: outPath })
  console.log(`${outPath} 생성 완료 (2400x1260 @2x)`)
} finally {
  await browser.close()
}
