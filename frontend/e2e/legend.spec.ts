import { expect, test } from '@playwright/test'
import { waitReady, watchConsole } from './helpers.ts'

test('legend: hide/show is remembered and colour keeps its meaning line', async ({ page }) => {
  const console_ = watchConsole(page)
  await page.addInitScript(() => {
    ;(window as unknown as { __trackLog: unknown[] }).__trackLog = []
  })
  await page.goto('/')
  await waitReady(page)
  const key = page.getByRole('list', { name: 'Vessel key' })
  await expect(key).toBeVisible() // default: shown

  await page.getByRole('button', { name: 'Hide legend' }).click()
  await expect(key).toBeHidden()
  await expect(page.getByText('Colour = estimated probability')).toBeVisible()
  const log = await page.evaluate(() => (window as unknown as { __trackLog: unknown[] }).__trackLog)
  expect(log).toContainEqual(['view_toggled', { control: 'legend' }])

  // Hidden, labels on or off: the live numbers stay beside the colour meaning (colour never without a number).
  const nums = page.getByRole('list', { name: 'Vessel estimates' })
  await expect(nums).toContainText(/CAD \d+%/)
  await page.getByRole('button', { name: 'Labels' }).click()
  await expect(nums).toContainText(/CAD \d+%/)
  await page.getByRole('button', { name: 'Labels' }).click()

  await page.reload()
  await waitReady(page)
  await expect(page.getByRole('list', { name: 'Vessel key' })).toBeHidden()
  await expect(page.getByText('Colour = estimated probability')).toBeVisible()

  await page.getByRole('button', { name: 'Show legend' }).click()
  await expect(page.getByRole('list', { name: 'Vessel key' })).toBeVisible()
  await page.reload()
  await waitReady(page)
  await expect(page.getByRole('list', { name: 'Vessel key' })).toBeVisible()
  expect(console_.problems).toEqual([])
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test('legend toggle: hidden line is shorter and the heart does not move', async ({ page }) => {
    await page.goto('/')
    await waitReady(page)
    const canvas = page.locator('canvas').first()
    const before = await canvas.boundingBox()
    const legend = page.locator('[aria-label="Vessel key"]').locator('xpath=..')
    const h1 = (await legend.boundingBox())?.height ?? 0
    await page.getByRole('button', { name: 'Hide legend' }).tap()
    const hidden = page.locator('[data-legend="hidden"]')
    const h2 = (await hidden.boundingBox())?.height ?? 0
    expect(h2).toBeLessThan(h1)
    expect(await canvas.boundingBox()).toEqual(before)
  })
})
