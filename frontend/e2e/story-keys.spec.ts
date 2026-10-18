import { expect, test } from '@playwright/test'
import { waitReady, watchConsole } from './helpers.ts'

const card = (page: import('@playwright/test').Page) => page.locator('[data-story-card]')

async function startFirstStory(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'How it works' }).click()
  await page.locator('[data-story-start]').first().click()
  await expect(card(page)).toBeVisible()
  await expect(page.locator('[data-story-text]')).not.toHaveText('Loading the estimate…', {
    timeout: 30_000,
  })
}

test('story keys: Escape and arrows inside a popover do not exit or move the story', async ({
  page,
}) => {
  const c = watchConsole(page)
  await page.goto('/')
  await waitReady(page)
  await startFirstStory(page)
  const step = await card(page).getAttribute('data-story-step')

  const help = page.getByRole('button', { name: 'About Weight' })
  await help.click()
  await expect(help).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await expect(card(page)).toHaveAttribute('data-story-step', step ?? '')
  await page.keyboard.press('Escape') // closes the popover only
  await expect(help).toHaveAttribute('aria-expanded', 'false')
  await expect(card(page)).toBeVisible()
  await expect(card(page)).toHaveAttribute('data-story-step', step ?? '')

  // With nothing open, the story keys work again.
  await page.locator('[data-story-text]').click()
  await page.keyboard.press('ArrowRight')
  await expect(card(page)).not.toHaveAttribute('data-story-step', step ?? '')
  await page.keyboard.press('Escape')
  await expect(card(page)).toHaveCount(0)
  expect(c.problems).toEqual([])
})

test('story keys: Escape still exits after a tab was clicked', async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
  await startFirstStory(page)
  await page.getByRole('tab', { name: 'Patient workspace' }).click()
  await page.keyboard.press('Escape')
  await expect(card(page)).toHaveCount(0)
})

test('story exit restores the previous tab and pin', async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
  await page.getByRole('button', { name: 'Pin this result' }).click({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Unpin' })).toBeVisible()
  await page.getByRole('tab', { name: 'Model performance' }).click()
  await startFirstStory(page)
  // The story moves to the workspace with the pin cleared…
  await expect(page.getByRole('tab', { name: 'Patient workspace' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Unpin' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Exit story' }).click()
  await expect(card(page)).toHaveCount(0)
  // …and exit brings back the tab and the pin.
  await expect(page.getByRole('tab', { name: 'Model performance' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('tab', { name: 'Patient workspace' }).click()
  await expect(page.getByRole('button', { name: 'Unpin' })).toBeVisible()
})

test('pin button says "Waiting for ranges…" while new ranges load', async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
  await expect(page.getByRole('button', { name: 'Pin this result' })).toBeEnabled({
    timeout: 30_000,
  })
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => {
    release = r
  })
  await page.route(
    (url) => url.pathname === '/api/intervals',
    async (route) => {
      await gate
      await route.continue()
    },
  )
  await page.locator('#field-age').fill('61')
  const waiting = page.getByRole('button', { name: 'Waiting for ranges…' })
  await expect(waiting).toBeDisabled({ timeout: 15_000 })
  release()
  await expect(page.getByRole('button', { name: 'Pin this result' })).toBeEnabled({
    timeout: 30_000,
  })
})
