// Render docs/REPORT.md -> docs/REPORT.pdf (A4, 18 mm margins) with the frontend's Playwright Chromium.
// Usage: node scripts/report_pdf.mjs   (needs network on first run for `npx marked`)
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MD = resolve(ROOT, 'docs/REPORT.md')
const HTML = resolve(ROOT, 'docs/.REPORT.print.html') // temp file next to the md so relative images resolve
const PDF = resolve(ROOT, 'docs/REPORT.pdf')
const { chromium } = await import(resolve(ROOT, 'frontend/node_modules/playwright/index.mjs'))

const body = execFileSync('npx', ['--yes', 'marked@14.1.4', '--gfm', '-i', MD], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
})
if (/&lt;!--\/?v/.test(body)) {
  console.error('report_pdf: literal <!--v:...--> marker text would print in the PDF (marker inside code span or escaped).')
  process.exit(1)
}
const css = `
  @page { size: A4; margin: 18mm }
  html { font: 10.5pt/1.4 "Geist", system-ui, "Segoe UI", Helvetica, Arial, sans-serif; color: #111 }
  body { margin: 0 }
  h1 { font-size: 18pt; margin: 0 0 4pt }
  h2 { font-size: 13pt; margin: 14pt 0 4pt; break-after: avoid }
  p, ul, ol { margin: 4pt 0 }
  li { margin: 1pt 0 }
  table { border-collapse: collapse; width: 100%; font-size: 8.5pt; margin: 6pt 0; break-inside: avoid }
  th, td { border: 0.5pt solid #bbb; padding: 2pt 4pt; text-align: left }
  th { background: #eef1f5 }
  img { max-width: 100%; max-height: 68mm; object-fit: contain; display: block; margin: 6pt auto }
  code { font: 9pt "Geist Mono", ui-monospace, Menlo, Consolas, monospace }
  em { color: #333 }
`
writeFileSync(HTML, `<!doctype html><meta charset="utf-8"><title>MyoGraph 3D report</title><style>${css}</style>${body}`)

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' })
  await page.pdf({ path: PDF, format: 'A4', margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' }, printBackground: true, preferCSSPageSize: true })
} finally {
  await browser.close()
}
import { unlinkSync } from 'node:fs'
unlinkSync(HTML)
const pages = (readFileSync(PDF, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
console.log(`wrote docs/REPORT.pdf: ${pages} page(s)`)
