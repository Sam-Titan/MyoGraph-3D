// Screenshot harness. Expects `make dev` to be running. Usage: make screenshots
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5180'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../.screenshots')
// playwright is a frontend devDependency; resolve it from there regardless of cwd.
const { chromium } = await import(
  resolve(dirname(fileURLToPath(import.meta.url)), '../frontend/node_modules/playwright/index.mjs')
)
// Phones use mobile emulation (isMobile + hasTouch + high DPR); desktops are plain contexts.
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844, mobile: true, scale: 3 },
  { width: 360, height: 800, mobile: true, scale: 2 },
]

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

// DOM click: still works when a layout bug (e.g. the disclaimer overlapping the tab bar on phones)
// makes the element unclickable by pointer, so the screenshot captures the bug instead of timing out.
const domClick = (locator) => locator.evaluate((el) => el.click())

// The results table row (the 3D label chips and legend rows share the vessel name).
const clickCard = (page, name) => () =>
  page.locator('th[scope="row"] button').filter({ hasText: new RegExp(`^${name}`) }).first().click()

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
  {
    name: 'patient-form',
    run: async (page) => {
      await page.evaluate(() => document.querySelector('#preset-select')?.scrollIntoView({ block: 'start' }))
    },
    keepScroll: true,
  },
  { name: 'hard-case', run: (page) => pickPreset(page, 'Hard case') },
  {
    name: 'performance',
    fullPage: true,
    run: async (page) => {
      await domClick(page.getByRole('tab', { name: 'Model performance' }))
      await page.waitForSelector('.recharts-surface', { timeout: 30_000 })
      await page.waitForTimeout(1500)
    },
  },
  {
    name: 'about',
    fullPage: true,
    run: async (page) => {
      await domClick(page.getByRole('tab', { name: 'About and method' }))
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

for (const vp of VIEWPORTS) {
  const { width, height } = vp
  for (const view of VIEWS) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      ...(vp.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: vp.scale } : {}),
    })
    const page = await ctx.newPage()
    await page.goto(BASE)
    await waitReady(page)
    await view.run(page)
    if (view.fullPage) {
      // The shell is h-screen with scrolling panels, so full-page = the active panel's scroll height.
      const h = await page.evaluate(() => {
        const p = [...document.querySelectorAll('[role="tabpanel"]')].find((e) => !e.hidden)
        return p ? Math.max(p.scrollHeight, p.firstElementChild?.scrollHeight ?? 0) : 0
      })
      if (h > height) await page.setViewportSize({ width, height: Math.min(h + 120, 8000) })
      await page.waitForTimeout(800)
    }
    if (!view.fullPage && !view.keepScroll) {
      // Stacked layout (<1280px) scrolls: bring the 3D viewport to the top of the scroller.
      await page.evaluate(() => document.querySelector('section[aria-label="3D heart"]')?.scrollIntoView({ block: 'start' }))
      await settle(page)
    }
    const file = `${OUT}/${view.name}-${width}x${height}.png`
    await page.screenshot({ path: file, fullPage: false })
    console.log('wrote', file)
    await ctx.close()
  }
}

// DOM probe (Phase 14.5): no page-level sideways scroll, and the disclaimer stays pinned to the top
// after scrolling to the bottom, on every tab at the two phone widths.
const TAB_NAMES = ['Patient workspace', 'Model performance', 'About and method']
const failures = []
for (const vp of VIEWPORTS.filter((v) => v.mobile)) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: vp.scale,
  })
  const page = await ctx.newPage()
  await page.goto(BASE)
  await waitReady(page)
  for (const name of TAB_NAMES) {
    await domClick(page.getByRole('tab', { name }))
    await page.waitForTimeout(800)
    const r = await page.evaluate(() => {
      // Scroll the window and every scrollable element in the active panel to the bottom.
      window.scrollTo(0, document.documentElement.scrollHeight)
      const panel = [...document.querySelectorAll('[role="tabpanel"]')].find((e) => !e.hidden)
      for (const el of [panel, ...(panel?.querySelectorAll('*') ?? [])]) {
        if (el && el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight
      }
      const banner = document.querySelector('[role="note"]')
      return {
        innerWidth: window.innerWidth,
        visualWidth: window.visualViewport?.width ?? window.innerWidth,
        docWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        bannerTop: banner ? banner.getBoundingClientRect().top : null,
      }
    })
    const where = `${vp.width}px / ${name}`
    // Mobile emulation widens the layout viewport when content overflows, so innerWidth alone would hide the
    // bug; compare against the real device width.
    const limit = Math.min(vp.width, r.visualWidth)
    if (r.innerWidth > limit || r.docWidth > limit || r.bodyWidth > limit)
      failures.push(
        `${where}: layout ${r.innerWidth}px, scrollWidth ${Math.max(r.docWidth, r.bodyWidth)}px > device ${limit}px`,
      )
    if (r.bannerTop === null || Math.abs(r.bannerTop) > 1)
      failures.push(`${where}: disclaimer top is ${r.bannerTop}, expected ~0 after scrolling to the bottom`)
  }
  await ctx.close()
}
await browser.close()
if (failures.length) {
  console.error(`screenshots: DOM probe failed:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log('DOM probe ok: no horizontal overflow, disclaimer pinned (360, 390)')
