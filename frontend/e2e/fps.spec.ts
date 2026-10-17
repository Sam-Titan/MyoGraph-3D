import { expect, test } from '@playwright/test'
import { waitReady } from './helpers.ts'

/** Frames per second while the heart spins (every frame is rendered, nothing is idle). */
async function measure(page: import('@playwright/test').Page, seconds = 6): Promise<number[]> {
  const frame = () =>
    page.evaluate(() =>
      Number(document.querySelector('[data-ready]')?.getAttribute('data-frame') ?? 0),
    )
  const perSecond: number[] = []
  let last = await frame()
  for (let i = 0; i < seconds; i++) {
    await page.waitForTimeout(1000)
    const now = await frame()
    perSecond.push(now - last)
    last = now
  }
  return perSecond
}

for (const [name, viewport] of [
  ['desktop 1440x900', { width: 1440, height: 900 }],
  ['phone 390x844', { width: 390, height: 844 }],
] as const) {
  test(`fps with --disable-gpu, ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport })
    const page = await ctx.newPage()
    await page.goto('/')
    await waitReady(page)
    await page.getByRole('button', { name: 'Spin' }).click()
    await page.waitForTimeout(1500)
    const fps = await measure(page)
    const median = [...fps].sort((a, b) => a - b)[fps.length >> 1]
    console.log(`FPS ${name}: per-second ${fps.join(', ')} | median ${median}`)
    expect(median).toBeGreaterThanOrEqual(20)
    await ctx.close()
  })
}
