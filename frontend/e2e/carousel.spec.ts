import { expect, test } from '@playwright/test'
import { waitReady, watchConsole } from './helpers.ts'

const left = (p: import('@playwright/test').Page) =>
  p.getByRole('button', { name: 'Scroll view controls left' })
const right = (p: import('@playwright/test').Page) =>
  p.getByRole('button', { name: 'Scroll view controls right' })

test.describe('phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  })

  test('toolbar carousel: arrows page the row, disabled at the ends, 44px targets', async ({
    page,
  }) => {
    const console_ = watchConsole(page)
    await page.goto('/')
    await waitReady(page)
    const bar = page.getByRole('toolbar', { name: '3D view controls' })
    await expect(right(page)).toBeVisible()
    await expect(left(page)).toBeDisabled()
    await expect(right(page)).toBeEnabled()
    const box = await right(page).boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)

    await right(page).tap()
    await expect.poll(() => bar.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0)
    await expect(left(page)).toBeEnabled()

    // Scroll to the end: "next" disables, "prev" stays on.
    await bar.evaluate((e) => e.scrollTo({ left: e.scrollWidth }))
    await expect(right(page)).toBeDisabled()
    await expect(left(page)).toBeEnabled()

    // Keyboard focus ring of the last button is not clipped by the scroller.
    const last = bar.getByRole('button').last()
    await last.focus()
    const inside = await page.evaluate(() => {
      const bar = document.querySelector('[role="toolbar"]') as HTMLElement
      const last = document.activeElement as HTMLElement
      const b = bar.getBoundingClientRect()
      const l = last.getBoundingClientRect()
      return l.right + 3 <= b.right + 0.5 && l.left >= b.left
    })
    expect(inside).toBe(true)

    // First button likewise.
    await bar.evaluate((e) => e.scrollTo({ left: 0 }))
    await bar.getByRole('button').first().focus()
    const firstInside = await page.evaluate(() => {
      const bar = document.querySelector('[role="toolbar"]') as HTMLElement
      const f = document.activeElement as HTMLElement
      return f.getBoundingClientRect().left - 3 >= bar.getBoundingClientRect().left - 0.5
    })
    expect(firstInside).toBe(true)
    expect(console_.problems).toEqual([])
  })
})

test('toolbar carousel: one row at desktop width, arrows only when it overflows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await waitReady(page)
  const bar = page.getByRole('toolbar', { name: '3D view controls' })
  await expect(bar).toBeVisible()
  // Single row: every button shares one top edge.
  const tops = await bar
    .getByRole('button')
    .evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size)
  expect(tops).toBe(1)
  const overflows = await bar.evaluate((e) => e.scrollWidth > e.clientWidth + 2)
  await expect(right(page)).toHaveCount(overflows ? 1 : 0)
  await expect(left(page)).toHaveCount(overflows ? 1 : 0)
})

test('toolbar carousel: no arrows on a very wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1000 })
  await page.goto('/')
  await waitReady(page)
  await expect(page.getByRole('toolbar', { name: '3D view controls' })).toBeVisible()
  await expect(left(page)).toHaveCount(0)
  await expect(right(page)).toHaveCount(0)
})
