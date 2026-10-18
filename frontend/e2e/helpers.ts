import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'

export const SHOTS = resolve(import.meta.dirname, '../../.screenshots')
mkdirSync(SHOTS, { recursive: true })

/** Console messages that cannot be fixed in our code. Each entry needs a reason. */
export const CONSOLE_ALLOW: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /THREE\.Clock: This module has been deprecated/,
    reason:
      '@react-three/fiber 9.8.x (latest 9.x) creates `new THREE.Clock()` in its own store; three 0.186 warns. Not ours; fixed only in R3F v10 (alpha).',
  },
]

/** Collects console errors/warnings and page errors that are not on the allow-list. */
export function watchConsole(page: Page): { problems: string[]; allowed: string[] } {
  const out = { problems: [] as string[], allowed: [] as string[] }
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    const text = m.text()
    if (CONSOLE_ALLOW.some((a) => a.pattern.test(text))) out.allowed.push(text)
    else out.problems.push(`${m.type()}: ${text}`)
  })
  page.on('pageerror', (e) => out.problems.push(`pageerror: ${e.message}`))
  return out
}

export async function waitReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-ready="true"]', { timeout: 60_000 })
  await page.waitForTimeout(700)
}

/** Below 1280 px the patient form lives in a bottom sheet; returns true if it had to be opened. */
export async function openPatientSheet(page: Page): Promise<boolean> {
  const edit = page.getByRole('button', { name: 'Edit patient' })
  if (!(await edit.isVisible())) return false
  await edit.click()
  await page.locator('#preset-select').waitFor()
  return true
}

export async function pickPreset(page: Page, label: string): Promise<void> {
  const sheet = await openPatientSheet(page)
  await page.locator('#preset-select').click()
  await page.getByRole('option', { name: label }).click()
  if (sheet) await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  await waitReady(page)
}

export async function frameAdvance(page: Page, action: () => Promise<void>): Promise<void> {
  const frame = () =>
    page.evaluate(() =>
      Number(document.querySelector('[data-ready]')?.getAttribute('data-frame') ?? 0),
    )
  const before = await frame()
  await action()
  await expect.poll(frame, { timeout: 30_000 }).toBeGreaterThan(before)
  await page.waitForTimeout(700)
}

/** Rewrites /api/predict so the three vessels have nearly the same probability (distinguishability test). */
export async function equalizeVessels(page: Page, p = 0.55): Promise<void> {
  await page.route('**/api/predict', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    const vessels = Object.entries(body.targets).filter(([id]) => id !== 'CAD')
    vessels.forEach(([, t], i) => {
      ;(t as { probability: number }).probability = p + (i - 1) * 0.005
    })
    await route.fulfill({ response: res, json: body })
  })
}
