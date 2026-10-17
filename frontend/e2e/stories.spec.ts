import { expect, type Page, test } from '@playwright/test'
import { waitReady, watchConsole } from './helpers.ts'

interface Part {
  text: string
}
interface Step {
  id: string
  camera: { target: string } | null
  highlight: { target: string } | null
  reveal_truth: boolean
  parts: Part[]
}
interface Story {
  id: string
  title: string
  preset: string
  steps: Step[]
}

const pct = (p: number) => `${Math.round(p * 100)}%`

async function loadStories(page: Page): Promise<Story[]> {
  const res = await page.request.get('/api/stories')
  return (await res.json()).stories
}

/**
 * Every percentage the API gives for this hold-out patient (probabilities, thresholds and range
 * bounds), plus the
 * "label: display_value" strings of its contributions, which factor tokens print verbatim.
 */
async function allowedPercents(
  page: Page,
  presetId: string,
): Promise<{ percents: Set<string>; factors: string[] }> {
  const presets = await (await page.request.get('/api/presets')).json()
  const preset = presets.find((p: { id: string }) => p.id === presetId)
  const res = await page.request.post('/api/predict', { data: { values: preset.values } })
  const body = await res.json()
  const ranges = await (
    await page.request.post('/api/intervals', { data: { values: preset.values } })
  ).json()
  const out = new Set<string>()
  for (const r of Object.values(ranges.targets) as { interval: { lo: number; hi: number } }[]) {
    out.add(pct(r.interval.lo))
    out.add(pct(r.interval.hi))
  }
  for (const t of Object.values(body.targets) as { probability: number; threshold: number }[]) {
    out.add(pct(t.probability))
    out.add(pct(t.threshold))
  }
  const factors = new Set<string>()
  for (const e of Object.values(body.explanations) as {
    contributions: { label: string; display_value: string }[]
  }[])
    for (const c of e.contributions) factors.add(`${c.label}: ${c.display_value}`)
  return { percents: out, factors: [...factors].sort((a, b) => b.length - a.length) }
}

const card = (page: Page) => page.locator('[data-story-card]')
const text = (page: Page) => page.locator('[data-story-text]')
const presetLabel = (page: Page) => page.locator('#preset-select').innerText()

async function openAndStart(page: Page, id: string): Promise<void> {
  await page.getByRole('button', { name: 'How it works' }).click()
  await page.locator(`[data-story-start="${id}"]`).click()
  await expect(card(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __trackLog: unknown[] }).__trackLog = []
  })
})

test('plays every story end to end', async ({ page }) => {
  const c = watchConsole(page)
  await page.goto('/')
  await waitReady(page)
  const stories = await loadStories(page)
  expect(stories.length).toBeGreaterThanOrEqual(3)
  const before = await presetLabel(page)

  for (const story of stories) {
    const { percents: allowed, factors } = await allowedPercents(page, story.preset)
    await openAndStart(page, story.id)
    await expect(text(page)).not.toHaveText('Loading the estimate…', { timeout: 30_000 })
    let revealed = false

    for (const [i, step] of story.steps.entries()) {
      await expect(card(page)).toHaveAttribute('data-story-step', step.id)
      await expect(text(page)).not.toHaveText('Loading the estimate…', { timeout: 30_000 })
      const body = (await text(page).innerText()).trim()
      expect(body.length, `${story.id}/${step.id} is empty`).toBeGreaterThan(20)
      expect(body, `${story.id}/${step.id} has an unfilled token`).not.toMatch(/[{}]|undefined|NaN/)
      // Every number in the text is one the API returned for this patient (factor values are
      // checked by exact string, then removed so their own digits are not read as percentages).
      let rest = body
      for (const f of factors) rest = rest.split(f).join('')
      for (const m of rest.match(/\d+\s?%/g) ?? [])
        expect(allowed.has(m), `${story.id}/${step.id}: ${m} is not an API number`).toBe(true)

      // Camera: the step's target is the selected vessel (the overall target has no chip).
      const target = step.camera?.target ?? step.highlight?.target
      if (target) {
        const chip = page.locator(`[data-target-chip="${target}"]`)
        if ((await chip.count()) > 0) await expect(chip).toHaveAttribute('aria-pressed', 'true')
      }
      // Highlight: the factors the text names are marked in the results panel.
      if (step.highlight) await expect(page.locator('[data-highlight]').first()).toBeVisible()
      else await expect(page.locator('[data-highlight]')).toHaveCount(0)

      // The real result stays hidden until the reveal step.
      revealed = revealed || step.reveal_truth
      const table = page.locator('table').first()
      if (revealed) await expect(table).toContainText(/agrees|misses/)
      else await expect(table).not.toContainText(/agrees|misses/)
      await expect(page.locator('#preset-select')).not.toContainText(
        revealed ? /^$/ : /No CAD|disease|Hard case/,
      )

      await page.locator('[data-story-next]').click()
      if (i === story.steps.length - 1) await expect(card(page)).toHaveCount(0)
    }

    // The visitor's own patient is back.
    expect(await presetLabel(page)).toBe(before)
  }

  const log = (await page.evaluate(
    () => (window as unknown as { __trackLog: [string, Record<string, string>][] }).__trackLog,
  )) as [string, Record<string, string>][]
  for (const s of stories) {
    expect(log).toContainEqual(['story_started', { story: s.id }])
    expect(log).toContainEqual(['story_completed', { story: s.id }])
    expect(log).toContainEqual(['preset_loaded', { preset: s.preset, source: 'story' }])
  }
  expect(c.problems).toEqual([])
})

test('every story still reads fully when /api/intervals fails', async ({ page }) => {
  await page.route('**/api/intervals', (route) => route.fulfill({ status: 500, body: '{}' }))
  await page.goto('/')
  await waitReady(page)
  const stories = await loadStories(page)
  for (const story of stories) {
    await openAndStart(page, story.id)
    for (const step of story.steps) {
      await expect(card(page)).toHaveAttribute('data-story-step', step.id)
      await expect(text(page)).not.toHaveText('Loading the estimate…', { timeout: 30_000 })
      const body = (await text(page).innerText()).trim()
      expect(body.length, `${story.id}/${step.id} is empty`).toBeGreaterThan(20)
      expect(body, `${story.id}/${step.id} has an unfilled token`).not.toMatch(/[{}]|undefined|NaN/)
      expect(body, `${story.id}/${step.id} mentions a range`).not.toMatch(/range/i)
      await page.locator('[data-story-next]').click()
    }
    await expect(card(page)).toHaveCount(0)
  }
})

test('Back, keyboard and Esc; exit restores an edited patient', async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
  const age = page.getByLabel('Age', { exact: true })
  await age.fill('63')
  await age.blur()
  await page.waitForTimeout(900)
  const [story] = await loadStories(page)

  await openAndStart(page, story.id)
  await expect(text(page)).not.toHaveText('Loading the estimate…', { timeout: 30_000 })
  const first = await text(page).innerText()
  await page.keyboard.press('ArrowRight')
  await expect(card(page)).toHaveAttribute('data-story-step', story.steps[1].id)
  await page.keyboard.press('ArrowLeft')
  await expect(card(page)).toHaveAttribute('data-story-step', story.steps[0].id)
  expect(await text(page).innerText()).toBe(first)

  await page.keyboard.press('Escape')
  await expect(card(page)).toHaveCount(0)
  await expect(age).toHaveValue('63')
  const log = await page.evaluate(
    () => (window as unknown as { __trackLog: unknown[][] }).__trackLog,
  )
  expect(log.some((e) => e[0] === 'story_completed')).toBe(false) // exiting early is not completing
})

test.describe('first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test('the story is offered once and can be skipped', async ({ page }) => {
    await page.goto('/')
    await waitReady(page)
    const offer = page.getByText('See how it works · 1 min')
    await expect(offer).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(offer).toHaveCount(0)
    await page.reload()
    await waitReady(page)
    await page.waitForTimeout(1500)
    await expect(page.getByText('See how it works · 1 min')).toHaveCount(0)
    // Replay stays available from the header.
    await expect(page.getByRole('button', { name: 'How it works' })).toBeVisible()
  })
})
