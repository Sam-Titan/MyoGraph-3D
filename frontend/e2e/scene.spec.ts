import { expect, type Page, test } from '@playwright/test'
import { equalizeVessels, SHOTS, waitReady, watchConsole } from './helpers.ts'

const chips = (page: Page) => page.locator('[data-target-chip]')
const ids = async (page: Page) =>
  chips(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-target-chip') ?? ''))

async function select(page: Page, id: string): Promise<void> {
  await page.locator(`[data-target-chip="${id}"]`).click()
  await page.waitForTimeout(1600) // camera flight + focus tween under software GL
}

test.describe('vessels stay distinguishable at equal probability', () => {
  test('chips, outline and selection', async ({ page }) => {
    const c = watchConsole(page)
    await equalizeVessels(page)
    await page.goto('/')
    await waitReady(page)
    await page.waitForTimeout(800)
    const all = await ids(page)
    expect(all.length).toBeGreaterThanOrEqual(3)
    await page.screenshot({ path: `${SHOTS}/equal-default.png` })

    // Chips are fully visible and never overlap each other.
    const boxes = await chips(page).evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      }),
    )
    for (const b of boxes) expect(b.w).toBeGreaterThan(0)
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap, `chips ${i} and ${j} overlap`).toBe(false)
      }

    for (const id of all) {
      await select(page, id)
      await expect(page.locator(`[data-target-chip="${id}"]`)).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await page.screenshot({ path: `${SHOTS}/equal-select-${id}.png` })
    }
    expect(c.problems).toEqual([])
  })
})

test('view presets and supply regions', async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
  await page.getByRole('button', { name: 'Reset' }).click()
  await page.waitForTimeout(1500)
  for (const name of ['Front', 'Left side', 'Underside']) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${SHOTS}/view-${name.toLowerCase().replace(' ', '-')}.png` })
  }
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  const all = await ids(page)
  for (const id of all) {
    await select(page, id)
    await page.screenshot({ path: `${SHOTS}/supply-${id}.png` })
  }
  // Supply toggle off removes the caption.
  await page.getByRole('button', { name: 'Supply area' }).click()
  await expect(page.getByText(/Shaded area/)).toHaveCount(0)
})

test('Esc resets the selection', async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
  const [first] = await ids(page)
  await select(page, first)
  await expect(page.locator(`[data-target-chip="${first}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(page.locator(`[data-target-chip="${first}"]`)).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test.describe('phone width', () => {
  test.use({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  })
  test('chips stay inside the 3D view at 360 px', async ({ page }) => {
    await page.goto('/')
    await waitReady(page)
    await page.evaluate(() =>
      document.querySelector('section[aria-label="3D heart"]')?.scrollIntoView({ block: 'start' }),
    )
    await page.waitForTimeout(800)
    const view = await page.locator('section[aria-label="3D heart"]').boundingBox()
    for (const b of await chips(page).evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().toJSON()),
    )) {
      expect(b.x).toBeGreaterThanOrEqual((view?.x ?? 0) - 1)
      expect(b.x + b.width).toBeLessThanOrEqual((view?.x ?? 0) + (view?.width ?? 0) + 1)
    }
    await page.screenshot({ path: `${SHOTS}/chips-360x800.png` })
  })
})
