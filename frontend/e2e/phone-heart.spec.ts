import { expect, type Page, test } from '@playwright/test'
import { SHOTS, waitReady, watchConsole } from './helpers.ts'

// The heart card on phones: a hero canvas with the toolbar and legend outside it, chips clear of the
// heart, pinch zoom, and the estimate's headline above the bottom nav. The dev build exposes the camera
// distance and the heart's projected box on the <canvas> (TestProbe).
const CANVAS = 'section[aria-label="3D heart"] canvas'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function probe(page: Page) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    const [x0, y0, x1, y1] = (el?.dataset.heartBox ?? '0,0,0,0').split(',').map(Number)
    return {
      dist: Number(el?.dataset.camDist),
      box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    }
  }, CANVAS)
}

/** A two-finger spread/pinch around (cx, cy), as real touch events through CDP. */
async function pinch(page: Page, cx: number, cy: number, from: number, to: number) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
    })
  await send('touchStart', [
    [cx - from, cy],
    [cx + from, cy],
  ])
  for (let i = 1; i <= 12; i++) {
    const d = from + ((to - from) * i) / 12
    await send('touchMove', [
      [cx - d, cy],
      [cx + d, cy],
    ])
    await page.waitForTimeout(30)
  }
  await send('touchEnd', [])
  await page.waitForTimeout(1200)
  await cdp.detach()
}

for (const [width, height] of [
  [390, 844],
  [360, 800],
] as const) {
  test.describe(`phone heart card ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })

    test('size, clearance, chips, pinch and fold', async ({ page }) => {
      const console_ = watchConsole(page)
      await page.goto('/')
      await waitReady(page)
      const canvas = (await page.locator(CANVAS).boundingBox()) as Rect

      // The canvas is the hero: >= 28% of the screen height (249 px of 844, 230 px of 800 today).
      expect(canvas.height).toBeGreaterThanOrEqual(height * 0.28)
      const { dist, box } = await probe(page)
      // (a) the heart fills >= 60% of the canvas height in the default view.
      expect(box.height / canvas.height).toBeGreaterThanOrEqual(0.6)

      // (b) nothing laid over the card (toolbar, legend, chips, orientation marker) touches the heart.
      const heart: Rect = { ...box, x: box.x + canvas.x, y: box.y + canvas.y }
      const overlays = await page
        .locator(
          'section[aria-label="3D heart"] button, section[aria-label="3D heart"] [data-pinned-strip]',
        )
        .evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect()
            return {
              name: e.getAttribute('aria-label') ?? e.textContent?.slice(0, 12) ?? '',
              rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            }
          }),
        )
      expect(overlays.length).toBeGreaterThan(3)
      for (const o of overlays) {
        if (o.rect.width === 0 || o.rect.x > width) continue // scrolled-away carousel items
        expect(intersects(o.rect, heart), `${o.name} overlaps the heart`).toBe(false)
      }
      // Chips never overlap each other.
      const chips = await page.locator('[data-target-chip]').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect()
          return { x: r.x, y: r.y, width: r.width, height: r.height }
        }),
      )
      for (const [i, a] of chips.entries())
        for (const b of chips.slice(i + 1)) expect(intersects(a, b)).toBe(false)

      // (d) every chip tap selects its vessel.
      for (const id of await page
        .locator('[data-target-chip]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-target-chip') ?? ''))) {
        const chip = page.locator(`[data-target-chip="${id}"]`)
        await chip.tap()
        await expect(chip).toHaveAttribute('aria-pressed', 'true')
      }
      await page.getByRole('button', { name: /^(Reset|Reset view)/ }).tap()
      await page.waitForTimeout(1500)

      // (c) pinch changes the camera distance: spread zooms in, pinch zooms out; ~proportional.
      const cx = canvas.x + canvas.width / 2
      const cy = canvas.y + canvas.height / 2
      const before = (await probe(page)).dist
      expect(before).toBeCloseTo(dist, 0)
      await pinch(page, cx, cy, 15, 60) // 4x spread
      const zoomed = (await probe(page)).dist
      expect(before / zoomed).toBeGreaterThan(2)
      await pinch(page, cx, cy, 60, 15)
      expect((await probe(page)).dist).toBeGreaterThan(zoomed * 1.5)

      // Reset restores the default view.
      await page.getByRole('button', { name: /^(Reset|Reset view)/ }).tap()
      await expect
        .poll(async () => (await probe(page)).dist, { timeout: 5000 })
        .toBeCloseTo(dist, 0)

      // The estimate's headline numeral and its label sit fully above the bottom nav.
      await page.reload()
      await waitReady(page)
      const navTop = await page
        .getByRole('tablist', { name: 'Sections' })
        .evaluate((e) => e.getBoundingClientRect().top)
      const numeral = await page
        .getByText(/^\d+%$/)
        .first()
        .boundingBox()
      const label = await page.getByText(/^Probability of coronary artery disease/).boundingBox()
      expect((numeral?.y ?? 0) + (numeral?.height ?? 0)).toBeLessThan(navTop)
      expect((label?.y ?? 0) + (label?.height ?? 0)).toBeLessThan(navTop)
      await page.screenshot({ path: `${SHOTS}/phone-heart-${width}x${height}.png` })
      expect(console_.problems).toEqual([])
    })
  })
}

test.describe('phone heart card landscape 844x390', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })

  test('the canvas is usable and nothing overflows', async ({ page }) => {
    await page.goto('/')
    await waitReady(page)
    const canvas = (await page.locator(CANVAS).boundingBox()) as Rect
    expect(canvas.height).toBeGreaterThan(150)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844)
    await page.screenshot({ path: `${SHOTS}/phone-heart-844x390.png` })
  })
})
