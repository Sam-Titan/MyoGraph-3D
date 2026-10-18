import { expect, test } from '@playwright/test'
import { SHOTS, waitReady, watchConsole } from './helpers.ts'

// A 390x844 phone: coarse pointer, touch events, bottom navigation, form in a bottom sheet.
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
})

test('touch: chips, vessel mesh and the patient sheet', async ({ page }) => {
  const console_ = watchConsole(page)
  await page.goto('/')
  await waitReady(page)

  const chips = page.locator('[data-target-chip]')
  const ids = await chips.evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-target-chip') ?? ''),
  )
  expect(ids.length).toBeGreaterThan(0)

  // Every vessel chip is a touch target (>= 44 px) and selects its vessel on tap.
  for (const id of ids) {
    const chip = page.locator(`[data-target-chip="${id}"]`)
    await chip.tap()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
  }

  // Tap on the artery itself: the leader dot sits on the vessel's anchor point.
  const lines = page.locator('section[aria-label="3D heart"] svg line')
  let tapped = 0
  for (const [i, id] of ids.entries()) {
    const chip = page.locator(`[data-target-chip="${id}"]`)
    // Move the selection elsewhere first so the tap has to change it; let the camera settle.
    const other = ids.find((o) => o !== id)
    if (other) await page.locator(`[data-target-chip="${other}"]`).tap()
    await page.waitForTimeout(1800)
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    if ((await chip.getAttribute('data-hidden')) === 'true') continue // behind the heart from here
    const line = lines.nth(i)
    const svg = await page.locator('section[aria-label="3D heart"] svg').first().boundingBox()
    const x2 = Number(await line.getAttribute('x2'))
    const y2 = Number(await line.getAttribute('y2'))
    await page.touchscreen.tap((svg?.x ?? 0) + x2, (svg?.y ?? 0) + y2)
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    tapped += 1
  }
  expect(tapped).toBeGreaterThan(0)

  // Form bottom sheet: open, edit a value, close; the value survives (one form instance).
  await page.getByRole('button', { name: 'Edit patient' }).tap()
  const sheet = page.locator('[data-slot="sheet-content"]')
  await expect(sheet).toBeVisible()
  const age = sheet.locator('input[type="number"]').first()
  await age.fill('77')
  await expect(age).toHaveValue('77')
  await page.screenshot({ path: `${SHOTS}/touch-sheet-390x844.png` })
  await page.getByRole('button', { name: /^Close patient/ }).tap()
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: 'Edit patient' }).tap()
  await expect(sheet.locator('input[type="number"]').first()).toHaveValue('77')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  expect(console_.problems).toEqual([])
})
