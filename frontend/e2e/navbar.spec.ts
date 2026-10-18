import { expect, test } from '@playwright/test'
import { waitReady } from './helpers.ts'

const tabs = (p: import('@playwright/test').Page) => p.getByRole('tablist', { name: 'Sections' })

for (const width of [1024, 1100, 1280, 1366, 1440]) {
  test(`navbar: tab row fits with no scrollbar gutter at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await waitReady(page)
    const m = await tabs(page).evaluate((el) => {
      const e = el as HTMLElement
      return {
        sbw: getComputedStyle(e).scrollbarWidth,
        gutterX: e.offsetWidth - e.clientWidth,
        gutterY: e.offsetHeight - e.clientHeight,
        slack: e.clientWidth - e.scrollWidth,
      }
    })
    expect(m.sbw).toBe('none')
    expect(m.gutterX).toBe(0)
    expect(m.gutterY).toBe(0)
    expect(m.slack).toBeGreaterThanOrEqual(0)
  })
}

test('navbar: if it ever overflows it stays scrollable with a fade edge and no scrollbar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await waitReady(page)
  const list = tabs(page)
  await list.evaluate((e) => {
    e.style.width = '300px'
  })
  await expect.poll(() => list.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true)
  await expect.poll(() => list.evaluate((e) => getComputedStyle(e).maskImage)).toContain('gradient')
  await list.evaluate((e) => e.scrollTo({ left: 9999 }))
  expect(await list.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0)
  expect(await list.evaluate((e) => (e as HTMLElement).offsetHeight - e.clientHeight)).toBe(0)
})
