/**
 * 1:1 관계 생성 UK 프로브 (미커밋) — 캔버스 점→1:1·비식별→대상 클릭 플로우에서
 * 커밋된 PUT content의 자식 테이블 uniques를 검증한다.
 * 실행: npx playwright test e2e/_uk-probe.spec.ts
 */
import { expect, test, type Page } from '@playwright/test'

import { MODEL, WS, mockBoot, mockEditorModel } from './_screenshots.spec'

const puts: { baseVersion: number; content: string }[] = []

async function recordPuts(page: Page) {
  await page.route(`**/api/v1/core/workspaces/${WS}/models/${MODEL}/content`, (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { baseVersion: number; content: string }
      puts.push(body)
    }
    return route.fallback()
  })
}

test('1:1 비식별 관계 생성 → 자식 FK 컬럼에 UK', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await context.newPage()
  await mockBoot(page)
  await mockEditorModel(page)
  await recordPuts(page)
  await page.goto(`/workspaces/${WS}/models/${MODEL}`)
  await page.waitForSelector('.react-flow__node')
  await page.waitForTimeout(3000)

  // members(부모) 우측 점 클릭 → 오버레이
  const parent = page.locator('.react-flow__node').filter({ hasText: 'members' }).first()
  await parent.locator('[data-relation-band="right"]').first().click()
  const overlay = page.getByRole('dialog', { name: '관계 시작' })
  await overlay.waitFor()
  await overlay.getByRole('button', { name: '1:1' }).click()
  await overlay.getByRole('button', { name: '비식별 관계' }).click()
  await page.waitForTimeout(300)

  // 대상(자식) = payments 클릭 — 아직 members와 무관계
  await page.locator('.react-flow__node').filter({ hasText: 'payments' }).first().click()
  await page.waitForTimeout(2500) // 자동저장 디바운스

  // DOM — payments 테이블에 UK 행이 그려지는가
  const ukRow = page.locator('.react-flow__node').filter({ hasText: 'payments' }).first().getByText('UK')
  console.log('[DOM] payments UK 행 노출:', await ukRow.count())

  // 커밋 content — payments.uniques 검증
  const last = puts[puts.length - 1]
  expect(last, 'PUT content 발생').toBeTruthy()
  const doc = JSON.parse(last.content)
  const payments = doc.model.tables.find((t: { physicalName: string }) => t.physicalName === 'payments')
  console.log('[PUT] payments.uniques =', JSON.stringify(payments.uniques))
  console.log('[PUT] payments FK 컬럼 =', payments.columns.filter((c: { physicalName: string }) => c.physicalName.includes('members')).map((c: { physicalName: string }) => c.physicalName))
  console.log('[PUT] 신규 관계 =', doc.model.relationships.filter((r: { parentTableId: string }) => r.parentTableId === 't_members').map((r: { type: string; identifying: boolean }) => `${r.type} identifying=${r.identifying}`))
  expect(payments.uniques.length).toBeGreaterThan(0)

  await context.close()
})
