import { expect, test } from '@playwright/test'
import { waitReady } from './helpers.ts'

// A first-time visitor: no saved choice for the intro strip.
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: process.env.BASE_URL ?? 'http://localhost:5180',
        localStorage: [{ name: 'myograph.story-seen', value: '1' }],
      },
    ],
  },
})

test('intro strip: open on a first visit, collapsible, remembered, disclaimer untouched', async ({
  page,
}) => {
  await page.goto('/')
  await waitReady(page)
  const strip = page.getByTestId('intro-strip')
  await expect(strip).toContainText('Pick or enter a patient')
  await expect(strip).toContainText('See the estimate per artery')
  await expect(strip).toContainText('See why')
  await expect(strip.getByRole('button', { name: /Guided tour/ })).toBeVisible()

  await strip.getByRole('button', { name: 'Hide the introduction' }).click()
  await expect(strip).not.toContainText('Pick or enter a patient')
  await page.reload()
  await waitReady(page)
  await expect(page.getByTestId('intro-strip')).not.toContainText('Pick or enter a patient')
  await expect(page.getByText('Decision support / educational only.').first()).toBeVisible()
})
