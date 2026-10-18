// Lighthouse (mobile + desktop) against the production build. Usage: make lighthouse
// Builds the frontend, serves it with `vite preview` (proxying /api to the running API on :8010,
// so `make dev` or `make dev-api` must be up), runs lighthouse through npx (not a dependency) and
// prints scores. Reports go to .lighthouse/ (gitignored). Numbers on a CPU-only machine are indicative.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = resolve(ROOT, 'frontend')
const OUT = resolve(ROOT, '.lighthouse')
const PORT = process.env.PREVIEW_PORT ?? '4180'
mkdirSync(OUT, { recursive: true })

const chrome = spawnSync('bash', ['-c', `ls -d ${homedir()}/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | tail -1`], { encoding: 'utf8' }).stdout.trim()
const env = { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) }

if (spawnSync('npm', ['run', 'build'], { cwd: FRONTEND, stdio: 'inherit' }).status !== 0) process.exit(1)
// Run vite directly (not via npx) so stopping the child really stops the server.
const preview = spawn(process.execPath, [resolve(FRONTEND, 'node_modules/vite/bin/vite.js'), 'preview'], { cwd: FRONTEND, env: { ...env, PREVIEW_PORT: PORT }, stdio: 'ignore' })
const stop = () => preview.kill()
process.on('exit', stop)
for (let i = 0; i < 40; i++) {
  if (await fetch(`http://localhost:${PORT}/api/health`).then((r) => r.ok).catch(() => false)) break
  if (i === 39) { console.error('preview/API not reachable (is `make dev` running?)'); process.exit(1) }
  await new Promise((r) => setTimeout(r, 500))
}

for (const form of ['mobile', 'desktop']) {
  const out = resolve(OUT, `${form}.report.json`)
  // Run from OUT: lighthouse's launcher can leave temp dirs in the working directory under WSL.
  const args = ['--yes', 'lighthouse@12', `http://localhost:${PORT}/`, `--output=json`, `--output=html`, `--output-path=${resolve(OUT, form)}`,
    '--only-categories=performance,accessibility', '--chrome-flags=--headless=new --no-sandbox', '--quiet']
  if (form === 'desktop') args.push('--preset=desktop')
  const r = spawnSync('npx', args, { cwd: OUT, env, stdio: 'inherit' })
  if (r.status !== 0 || !existsSync(out)) { console.error(`lighthouse ${form} failed`); continue }
  const j = JSON.parse(readFileSync(out, 'utf8'))
  const a = j.audits
  console.log(
    `${form}: performance ${Math.round(j.categories.performance.score * 100)}, accessibility ${Math.round(j.categories.accessibility.score * 100)} | ` +
      `FCP ${a['first-contentful-paint'].displayValue}, LCP ${a['largest-contentful-paint'].displayValue}, ` +
      `TBT ${a['total-blocking-time'].displayValue}, CLS ${a['cumulative-layout-shift'].displayValue}`,
  )
}
stop()
