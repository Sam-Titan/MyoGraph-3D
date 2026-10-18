import type { MetricsResponse } from '@/api/client'
import { fixed } from '@/lib/format'
import { stabilityRows, stabilitySentence } from './performanceModel'
import { Section } from './Section'

const STEP = 0.05

/** One scale for marks and ticks: ticks are the multiples of STEP inside [lo, hi], `at` maps to %. */
function makeScale(values: number[]) {
  const lo = Math.floor((Math.min(...values) - 0.02) / STEP) * STEP
  const hi = Math.min(1, Math.ceil((Math.max(...values) + 0.02) / STEP) * STEP)
  const span = hi - lo
  const at = (v: number): string => `${((v - lo) / span) * 100}%`
  const count = Math.round(span / STEP)
  const every = Math.max(1, Math.ceil(count / 6)) // at most ~7 labels, so they never collide on a phone
  const ticks = Array.from({ length: count + 1 }, (_, i) => lo + i * STEP).filter(
    (_, i) => i % every === 0,
  )
  return { at, ticks }
}

export function StabilityPlot({ metrics }: { metrics: MetricsResponse }) {
  const rows = stabilityRows(metrics)
  if (rows.length === 0) return null
  const all = rows.flatMap((r) => [r.stat.min, r.stat.max, r.stat.official])
  const { at, ticks } = makeScale(all)

  return (
    <Section
      title="Split stability, hold-out ROC-AUC"
      caption={`Our official hold-out is one draw of ${metrics.split.n_test} patients; this shows how much a test set that size varies.`}
    >
      <div aria-hidden className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
            <span className="num text-xs font-semibold">{r.id}</span>
            <div className="relative h-7">
              <span className="absolute top-1/2 h-px w-full bg-border" />
              <span
                className="absolute top-1/2 h-px -translate-y-1/2 bg-foreground/40"
                style={{
                  left: at(r.stat.min),
                  width: `calc(${at(r.stat.max)} - ${at(r.stat.min)})`,
                }}
              />
              <span
                className="absolute inset-y-1.5 rounded-sm opacity-35"
                style={{
                  background: r.color,
                  left: at(r.stat.q25),
                  width: `calc(${at(r.stat.q75)} - ${at(r.stat.q25)})`,
                }}
              />
              <span
                className="absolute inset-y-1 w-0.5"
                style={{ background: r.color, left: at(r.stat.median) }}
              />
              <span
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-background"
                style={{ background: 'var(--foreground)', left: at(r.stat.official) }}
              />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
          <span />
          <div className="relative h-4 text-[11px] text-muted-foreground">
            {ticks.map((t) => (
              <span key={t} className="num absolute -translate-x-1/2" style={{ left: at(t) }}>
                {fixed(t)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Line is min to max, box is the interquartile range, tick is the median, ◆ is the official
        seed {metrics.stability.official_seed} hold-out.
      </p>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.id}>
            {stabilitySentence(r)}{' '}
            <span className="num text-xs text-muted-foreground">
              ({fixed(r.stat.official)} vs median {fixed(r.stat.median)}, range {fixed(r.stat.min)}–
              {fixed(r.stat.max)})
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
