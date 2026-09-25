/**
 * E2E 언어 prefix 랜딩 (storyboard 00-common §3.3 — v1.16)
 *
 * /en·/ja·/zh 진입이 각 언어 랜딩을 렌더하는지 — App 엔트리부터 라우터·i18n·랜딩까지
 * 실물 경로로 돌린다(빈화면 회귀·프로바이더 계층 결함을 잡는 최외곽 게이트).
 * API는 랜딩의 공개 2종만 목킹(갤러리·최근 릴리스) — 나머지는 게스트라 호출이 없다.
 */
import { expect, test } from '@playwright/test'

const envelope = (body: object) => ({
  header: { isSuccessful: true, resultCode: 'OK', resultMessage: 'OK' },
  ...body,
})

/** 랜딩 공개 API — 빈 목록(섹션 숨김)이면 문구 단언에 방해가 없다 */
async function mockLandingApis(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/v1/core/shares', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({ totalCount: 0, responses: [] })),
    }),
  )
  await page.route('**/api/v1/core/community/release-notes/recent', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({ totalCount: 0, responses: [] })),
    }),
  )
}

test.describe('언어 prefix 랜딩 — 실물 라우팅', () => {
  for (const { path, lang, hero } of [
    { path: '/', lang: 'ko', hero: '한 장의 ERD가' },
    { path: '/en', lang: 'en', hero: 'From one diagram' },
    { path: '/ja', lang: 'ja', hero: '1枚のダイアグラムから' },
    { path: '/zh', lang: 'zh-Hans', hero: '从一张图表' },
  ] as const) {
    test(`${path || '/(ko)'} 랜딩 — html lang=${lang}, 현지어 히어로`, async ({ page }) => {
      await page.addInitScript(() => window.localStorage.removeItem('crowfoot.lang'))
      await mockLandingApis(page)

      await page.goto(path)

      await expect(page.locator('h1').first()).toContainText(hero)
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
    })
  }

  test('언어 전환 — 랜딩에서 /en으로 바꾸면 URL·문구가 함께 바뀐다', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.removeItem('crowfoot.lang'))
    await mockLandingApis(page)

    await page.goto('/')
    await page.getByRole('button', { name: '언어' }).click()
    await page.getByRole('menuitemradio', { name: 'English' }).click()

    // Vite 디렉터리 인덱스가 /en → /en/ 로 슬래시를 붙인다 — 운영 nginx도 $uri/ 시도가 같은 응답
    await expect(page).toHaveURL(/\/en\/?$/)
    await expect(page.locator('h1').first()).toContainText('From one diagram')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})
