import { expect, test } from '@playwright/test'
import { SHOTS, waitReady, watchConsole } from './helpers.ts'

test.describe('pin and compare', () => {
  test('pin, edit, see the change on table, headline and chips, unpin', async ({ page }) => {
    const c = watchConsole(page)
    await page.goto('/')
    await waitReady(page)
    const pin = page.getByRole('button', { name: 'Pin this result' })
    await expect(pin).toBeEnabled({ timeout: 30_000 })
    await pin.click()
    await expect(page.getByRole('button', { name: 'Unpin' })).toBeVisible()
    await expect(page.getByTestId('pin-delta').first()).toContainText('no change')

    await page.locator('#field-age').fill('25')
    await page.locator('#field-weight').fill('120')
    const deltas = page.getByTestId('pin-delta')
    await expect(deltas.first()).toContainText(/▲|▼/, { timeout: 15_000 })
    // Headline + one line per vessel, each with a number beside the arrow.
    expect(await deltas.count()).toBeGreaterThanOrEqual(2)
    for (const t of await deltas.allInnerTexts())
      expect(t).toMatch(/\d+% → \d+% (▲|▼)\d+|no change/)
    await page.screenshot({ path: `${SHOTS}/pin-compare.png` })

    await page.getByRole('button', { name: 'Unpin' }).click()
    await expect(deltas).toHaveCount(0)
    await expect(page.getByTestId('chip-delta')).toHaveCount(0)
    expect(c.problems).toEqual([])
  })

  test('starting a story clears the pin', async ({ page }) => {
    await page.goto('/')
    await waitReady(page)
    const pin = page.getByRole('button', { name: 'Pin this result' })
    await expect(pin).toBeEnabled({ timeout: 30_000 })
    await pin.click()
    await expect(page.getByRole('button', { name: 'Unpin' })).toBeVisible()
    await page.getByRole('button', { name: 'How it works' }).click()
    await page.locator('[data-story-start]').first().click()
    await expect(page.locator('[data-story-card]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unpin' })).toHaveCount(0)
  })
})

test.describe('help text', () => {
  test('opens from the keyboard and shows plain words', async ({ page }) => {
    await page.goto('/')
    await waitReady(page)
    const ldl = page.getByRole('button', { name: 'About Weight' })
    await ldl.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Used with height to work out BMI')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/help-popover.png` })
    await page.keyboard.press('Escape')
    await expect(page.getByText('Used with height to work out BMI')).toHaveCount(0)
  })
})
