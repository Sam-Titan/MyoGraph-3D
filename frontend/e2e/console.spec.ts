import { expect, test } from '@playwright/test'
import { CONSOLE_ALLOW, waitReady, watchConsole } from './helpers.ts'

test('no console errors or warnings at load and across tabs', async ({ page }) => {
  const c = watchConsole(page)
  await page.goto('/')
  await waitReady(page)
  for (const name of ['Model performance', 'About and method', 'Patient workspace']) {
    await page.getByRole('tab', { name }).click()
    await page.waitForTimeout(1200)
  }
  expect(c.problems).toEqual([])
  // Every allow-list entry must still be needed, otherwise delete it.
  for (const a of CONSOLE_ALLOW) expect(c.allowed.some((t) => a.pattern.test(t))).toBe(true)
})
