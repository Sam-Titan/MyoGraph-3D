// Screenshot harness. Expects `make dev` to be running. Usage: make screenshots
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../.screenshots')
// playwright is a frontend devDependency; resolve it from there regardless of cwd.
const { chromium } = await import(
  resolve(dirname(fileURLToPath(import.meta.url)), '../frontend/node_modules/playwright/index.mjs')
)
const WIDTHS = [1440, 1100]

async function preflight() {
  for (const path of ['/', '/api/health']) {
    try {
      const r = await fetch(BASE + path)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    } catch (e) {
      console.error(`screenshots: ${BASE}${path} is not reachable (${e.message}). Start it with \`make dev\` first.`)
      process.exit(1)
    }
  }
}

const settle = (page) => page.waitForTimeout(600)

async function waitReady(page) {
  await page.waitForSelector('[data-ready="true"]', { timeout: 60_000 })
  await settle(page)
}

async function pickPreset(page, label) {
  await page.locator('#preset-select').click()
  await page.getByRole('option', { name: label }).click()
  await page.waitForTimeout(800) // debounce + predict round trip
  await waitReady(page)
}

async function frameAdvance(page, action) {
  const before = await page.evaluate(() => Number(document.querySelector('[data-ready]')?.dataset.frame ?? 0))
  await action()
  await page.waitForFunction(
    (b) => Number(document.querySelector('[data-ready]')?.dataset.frame ?? 0) > b,
    before,
    { timeout: 30_000 },
  )
  await settle(page)
}

const clickCard = (page, name) => () =>
  page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click()

const VIEWS = [
  { name: 'workspace-default', run: async () => {} },
  {
    name: '3vessel-lad',
    run: async (page) => {
      await pickPreset(page, '3-vessel disease')
      await frameAdvance(page, clickCard(page, 'LAD'))
    },
  },
  {
    name: 'lcx-selected',
    run: async (page) => {
      await pickPreset(page, '3-vessel disease')
      await frameAdvance(page, clickCard(page, 'LCX'))
    },
  },
  {
    name: 'xray-on',
    run: async (page) => {
      await frameAdvance(page, () => page.getByRole('button', { name: 'X-ray' }).click())
    },
  },
  { name: 'hard-case', run: (page) => pickPreset(page, 'Hard case') },
  {
    name: 'performance',
    fullPage: true,
    run: async (page) => {
      await page.getByRole('tab', { name: 'Model Performance' }).click()
      await page.waitForSelector('.recharts-surface', { timeout: 30_000 })
      await page.waitForTimeout(1500)
    },
  },
  {
    name: 'about',
    fullPage: true,
    run: async (page) => {
      await page.getByRole('tab', { name: 'About & Method' }).click()
      await page.waitForTimeout(1000)
    },
  },
]

await preflight()
mkdirSync(OUT, { recursive: true })

let browser
try {
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
} catch (e) {
  console.error(`screenshots: Chromium failed to launch: ${e.message}`)
  process.exit(2)
}

for (const width of WIDTHS) {
  for (const view of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(BASE)
    await waitReady(page)
    await view.run(page)
    let target = page
    if (view.fullPage) {
      // The shell is h-screen with scrolling panels, so full-page = the active panel's scroll height.
      const h = await page.evaluate(() => {
        const p = [...document.querySelectorAll('[role="tabpanel"]')].find((e) => !e.hidden)
        return p ? Math.max(p.scrollHeight, p.firstElementChild?.scrollHeight ?? 0) : 0
      })
      if (h > 900) await page.setViewportSize({ width, height: Math.min(h + 120, 8000) })
      await page.waitForTimeout(800)
    }
    if (!view.fullPage) {
      // Stacked layout (<1280px) scrolls: bring the 3D viewport to the top of the scroller.
      await page.evaluate(() => document.querySelector('section[aria-label="3D heart"]')?.scrollIntoView({ block: 'start' }))
      await settle(page)
    }
    const file = `${OUT}/${view.name}-${width}.png`
    await target.screenshot({ path: file, fullPage: Boolean(view.fullPage) })
    console.log('wrote', file)
    await ctx.close()
  }
}
await browser.close()
