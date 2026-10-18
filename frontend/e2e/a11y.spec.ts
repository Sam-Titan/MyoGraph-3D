import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { waitReady } from './helpers.ts'

// axe-core on every tab, desktop and phone. Serious and critical violations fail the test.
const TABS = ['Patient workspace', 'Model performance', 'Benchmark', 'About and method'] as const

/** Serious/critical violations on the current page, one line per rule with its first few nodes. */
async function audit(page: Page, label: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 4)
        .map(
          (n) =>
            `${n.target.join(' ')} [${n.any[0]?.message ?? n.failureSummary?.split('\n')[1] ?? ''}]`,
        )
      return `${label}: ${v.id} (${v.impact}) x${v.nodes.length}\n    ${nodes.join('\n    ')}`
    })
}

async function openTab(page: Page, name: (typeof TABS)[number]) {
  await page.getByRole('tab', { name }).evaluate((el) => (el as HTMLElement).click())
  await page.waitForTimeout(1200)
}

test('a live region announces the estimates for screen readers', async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
  await expect(page.getByTestId('announcer')).toContainText('Estimates updated', {
    timeout: 10_000,
  })
})

test.describe('axe-core', () => {
  for (const [kind, size] of [
    ['desktop', { width: 1440, height: 900 }],
    ['phone', { width: 390, height: 844 }],
  ] as const) {
    test(`${kind}: no serious violations on any tab`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({
        viewport: size,
        isMobile: kind === 'phone',
        hasTouch: kind === 'phone',
        storageState: {
          cookies: [],
          origins: [
            {
              origin: baseURL ?? 'http://localhost:5180',
              localStorage: [{ name: 'myograph.story-seen', value: '1' }],
            },
          ],
        },
      })
      const page = await context.newPage()
      await page.goto('/')
      await waitReady(page)
      const report: string[] = []
      for (const tab of TABS) {
        await openTab(page, tab)
        report.push(...(await audit(page, `${kind} / ${tab}`)))
      }
      if (kind === 'phone') {
        await openTab(page, 'Patient workspace')
        await page.getByRole('button', { name: 'Edit patient' }).tap()
        await page.locator('#preset-select').waitFor()
        report.push(...(await audit(page, 'phone / patient sheet')))
      }
      expect(report, report.join('\n')).toEqual([])
      await context.close()
    })
  }
})
