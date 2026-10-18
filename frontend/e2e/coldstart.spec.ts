import { expect, test } from '@playwright/test'
import { waitReady } from './helpers.ts'

// Render's free plan sleeps the API: every /api call fails with 503 for a while, then works.
test('cold start: neutral heart and a calm status, no toast, then real numbers', async ({
  page,
}) => {
  const wakesAt = Date.now() + 4000
  // Only the API: `/src/api/*.ts` modules in dev are not part of the sleeping server.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) =>
      Date.now() < wakesAt ? route.fulfill({ status: 503, body: 'sleeping' }) : route.continue(),
  )
  await page.goto('/')

  const notice = page.getByTestId('wake-notice')
  await expect(notice).toContainText('Starting the prediction server', { timeout: 10_000 })
  await expect(page.getByTestId('results-skeleton')).toBeVisible()
  // The heart is on screen while the server wakes (a canvas, in neutral colours).
  await expect(page.locator('section[aria-label="3D heart"] canvas')).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)

  await waitReady(page)
  await expect(notice).toHaveCount(0)
  await expect(page.getByTestId('results-skeleton')).toHaveCount(0)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})
