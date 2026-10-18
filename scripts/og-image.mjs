// Renders the social preview (1200x630) and the PNG icons from the running app. Expects `make dev`.
// Usage: make og   ->  frontend/public/{og-image,icon-192,icon-512,apple-touch-icon,favicon-32}.png
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = resolve(ROOT, 'frontend/public')
const BASE = process.env.BASE_URL ?? 'http://localhost:5180'
const { chromium } = await import(resolve(ROOT, 'frontend/node_modules/playwright/index.mjs'))
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

// Icons: the favicon SVG at four sizes.
const svg = readFileSync(resolve(PUBLIC, 'favicon.svg'), 'utf8')
for (const [file, size] of [['favicon-32', 32], ['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } })
  await p.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`)
  await p.screenshot({ path: resolve(PUBLIC, `${file}.png`), omitBackground: true })
  await p.close()
}

// Social image: the real heart (returning-visitor state, toolbar and legend hidden) composed with a title card.
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 820 },
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
const page = await ctx.newPage()
await page.goto(BASE)
await page.waitForSelector('[data-ready="true"]', { timeout: 60_000 })
await page.waitForTimeout(2500) // camera + colour tweens settle
await page.addStyleTag({ content: 'section[aria-label="3D heart"] div.pointer-events-none.absolute.inset-0 { display: none !important }' })
await page.waitForTimeout(300)
const heart = page.locator('section[aria-label="3D heart"]')
const heartPng = (await heart.screenshot()).toString('base64')
// Label chips carry the numbers (never colour without the number): reuse the app's own text.
const chips = await page.locator('[data-target-chip]').evaluateAll((els) =>
  els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean),
)

const card = await ctx.newPage()
await card.setViewportSize({ width: 1200, height: 630 })
await card.setContent(`<body style="margin:0;width:1200px;height:630px;display:flex;background:#101a2b;color:#fff;
  font-family:'Geist Variable',system-ui,sans-serif;overflow:hidden">
  <div style="flex:1;padding:64px 0 64px 64px;display:flex;flex-direction:column;justify-content:center;gap:22px">
    <div style="font-size:64px;font-weight:700;letter-spacing:-1px">MyoGraph 3D</div>
    <div style="font-size:28px;line-height:1.35;opacity:.92;max-width:520px">Model estimates of coronary artery blockage from clinical data, on an interactive 3D heart.</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">${chips
      .map((c) => `<span style="font-size:22px;padding:6px 14px;border-radius:999px;background:#1d2b44">${c}</span>`)
      .join('')}</div>
    <div style="font-size:18px;opacity:.7">Research demo · model estimates, not a diagnosis</div>
  </div>
  <img style="height:630px;width:auto;max-width:640px;object-fit:cover" src="data:image/png;base64,${heartPng}">
</body>`)
await card.screenshot({ path: resolve(PUBLIC, 'og-image.png') })
await browser.close()
console.log('wrote og-image.png and icons to', PUBLIC)
