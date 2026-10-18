// Records the README / LinkedIn demo (~18 s, 1280x720): story mode -> pick an artery -> range + waterfall -> pin and compare.
// Expects `make dev`. Output: .screenshots/demo/*.webm (convert with scripts/make-demo-media.sh -> docs/media/).
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, '.screenshots/demo')
const BASE = process.env.BASE_URL ?? 'http://localhost:5180'
const { chromium } = await import(resolve(ROOT, 'frontend/node_modules/playwright/index.mjs'))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
// Returning-visitor state: no story toast, intro collapsed.
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  storageState: {
    cookies: [],
    origins: [
      {
        origin: BASE,
        localStorage: [
          { name: 'myograph.story-seen', value: '1' },
          { name: 'myograph.intro-collapsed', value: '1' },
        ],
      },
    ],
  },
})
const tCreate = Date.now()
const page = await ctx.newPage()
await page.goto(BASE)
await page.waitForSelector('[data-ready="true"]', { timeout: 90_000 })
await page.waitForTimeout(500)
const lead = (Date.now() - tCreate) / 1000 // loading screen length in the video; trimmed off

// 1. Story mode (~7 s)
await page.getByRole('button', { name: 'How it works' }).click()
await page.locator('[data-story-start]').first().click()
await page.locator('[data-story-card]').waitFor()
for (let i = 0; i < 2; i++) {
  await page.waitForTimeout(2000)
  await page.locator('[data-story-next]').click()
}
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Exit story' }).click()
await page.waitForTimeout(800)

// 2. Select an artery, then its range and waterfall (~5 s)
await page.locator('main button, [role="main"] button').filter({ hasText: /^LAD\b/ }).first().click()
await page.waitForTimeout(1800)
await page.getByTestId('waterfall').scrollIntoViewIfNeeded()
await page.waitForTimeout(2500)

// 3. Pin and compare (~5 s)
await page.getByRole('button', { name: 'Pin this result' }).click()
await page.waitForTimeout(600)
await page.locator('#field-age').fill('25')
await page.locator('#field-weight').fill('120')
await page.getByTestId('pin-delta').first().filter({ hasText: /▲|▼/ }).waitFor({ timeout: 20_000 })
await page.waitForTimeout(3000)

console.log(`TRIM_START=${lead.toFixed(1)}`)
await ctx.close() // flushes the video
await browser.close()
console.log(`video in ${OUT}`)
