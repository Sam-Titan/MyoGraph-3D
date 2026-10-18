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

  test('focus moves to the opposite arrow when the focused one disables at the end', async ({
    page,
  }) => {
    await page.goto('/')
    await waitReady(page)
    const bar = page.getByRole('toolbar', { name: '3D view controls' })
    await right(page).focus()
    for (let i = 0; i < 8 && (await right(page).isEnabled()); i++) {
      await page.keyboard.press('Enter')
      await page.waitForTimeout(450)
    }
    await expect(right(page)).toBeDisabled()
    await expect(left(page)).toBeFocused()
    // And back: Enter on "prev" until the start hands focus to "next".
    for (let i = 0; i < 8 && (await left(page).isEnabled()); i++) {
      await page.keyboard.press('Enter')
      await page.waitForTimeout(450)
    }
    await expect(left(page)).toBeDisabled()
    await expect(right(page)).toBeFocused()
    expect(await bar.evaluate((e) => e.scrollLeft)).toBeLessThanOrEqual(2)
  })
})

for (const width of [1280, 1366, 1440]) {
  test(`toolbar carousel: fits one row with no arrows and nothing cut off at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await waitReady(page)
    const bar = page.getByRole('toolbar', { name: '3D view controls' })
    await expect(bar).toBeVisible()
    const m = await bar.evaluate((e) => {
      const rects = Array.from(e.querySelectorAll('button')).map((b) => b.getBoundingClientRect())
      const box = e.getBoundingClientRect()
      return {
        rows: new Set(rects.map((r) => Math.round(r.top))).size,
        inside: rects.every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5),
        fits: e.scrollWidth <= e.clientWidth + 1,
      }
    })
    expect(m).toEqual({ rows: 1, inside: true, fits: true })
    await expect(left(page)).toHaveCount(0)
    await expect(right(page)).toHaveCount(0)
  })
}

test('toolbar carousel: no arrows on a very wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1000 })
  await page.goto('/')
  await waitReady(page)
  await expect(page.getByRole('toolbar', { name: '3D view controls' })).toBeVisible()
  await expect(left(page)).toHaveCount(0)
  await expect(right(page)).toHaveCount(0)
})
