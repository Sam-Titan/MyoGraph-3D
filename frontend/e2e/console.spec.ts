import { expect, test } from '@playwright/test'
import { CONSOLE_ALLOW, waitReady, watchConsole } from './helpers.ts'

test('no console errors or warnings at load, across tabs and during a story', async ({ page }) => {
  const c = watchConsole(page)
  await page.goto('/')
  await waitReady(page)
  for (const name of ['Model performance', 'Benchmark', 'About and method', 'Patient workspace']) {
    await page.getByRole('tab', { name }).click()
    await page.waitForTimeout(1200)
  }
  // One story end to end: the card, the camera flights and the results highlights add no console noise.
  await page.getByRole('button', { name: 'How it works' }).click()
  await page.locator('[data-story-start]').first().click()
  const card = page.locator('[data-story-card]')
  await expect(page.locator('[data-story-text]')).not.toHaveText('Loading the estimate…', {
    timeout: 30_000,
  })
  while ((await card.count()) > 0) {
    await page.locator('[data-story-next]').click()
    await page.waitForTimeout(500)
  }
  expect(c.problems).toEqual([])
  // Every allow-list entry must still be needed, otherwise delete it.
  for (const a of CONSOLE_ALLOW) expect(c.allowed.some((t) => a.pattern.test(t))).toBe(true)
})
