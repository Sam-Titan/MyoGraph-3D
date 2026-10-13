import type { TargetInfo } from '@/api/client'
import { pct } from '@/lib/format'
import { riskCss } from '@/lib/riskColor'
import { cn } from '@/lib/utils'
import type { Probabilities } from './useProbabilities'

/** Labels closer than this (in % of the bar) go to the next lane so they don't overlap. */
const MIN_LABEL_GAP = 0.08

interface Tick {
  id: string
  threshold: number
  lane: 0 | 1
}

function thresholdTicks(targets: TargetInfo[], thresholds: Probabilities): Tick[] {
  const known = targets
    .map((t) => ({ id: t.id, threshold: thresholds[t.id] }))
    .filter((t): t is { id: string; threshold: number } => t.threshold !== undefined)
    .sort((a, b) => a.threshold - b.threshold)
  const lastInLane: [number, number] = [-1, -1]
  return known.map((t) => {
    const lane: 0 | 1 = t.threshold - lastInLane[0] >= MIN_LABEL_GAP ? 0 : 1
    lastInLane[lane] = t.threshold
    return { ...t, lane }
  })
}

const GRADIENT = `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => `${riskCss(i / 10)} ${i * 10}%`).join(', ')})`

/**
 * Probability legend plus every target's number, so the % is visible even with labels toggled off.
 * Colour is never shown without a number.
 */
export function Legend({
  targets,
  probabilities,
  thresholds,
}: {
  targets: TargetInfo[]
  probabilities: Probabilities
  thresholds: Probabilities
}) {
  const ticks = thresholdTicks(targets, thresholds)
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-slate-950/55 p-2.5 backdrop-blur-sm">
      <div>
        {/* Tuned decision threshold per target: a tick on the bar, labelled with the target id. */}
        <div className={cn('relative', ticks.some((t) => t.lane === 1) ? 'h-7' : 'h-4')}>
          {ticks.map((t) => (
            <span
              key={t.id}
              title={`${t.id} decision threshold ${pct(t.threshold)}`}
              className="num absolute bottom-0 -translate-x-1/2 text-[10px] leading-none text-viewport-foreground"
              style={{ left: `${t.threshold * 100}%`, bottom: t.lane * 12 }}
            >
              {t.id}
            </span>
          ))}
        </div>
        <div className="relative">
          <div className="h-2 rounded-full" style={{ backgroundImage: GRADIENT }} aria-hidden />
          {ticks.map((t) => (
            <span
              key={t.id}
              aria-hidden
              className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
              style={{ left: `${t.threshold * 100}%` }}
            />
          ))}
        </div>
        <div className="num mt-1 flex justify-between text-[11px] text-viewport-muted">
          <span>0%</span>
          <span>model estimate · ticks = decision threshold</span>
          <span>100%</span>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {targets.map((t) => {
          const p = probabilities[t.id]
          return (
            <li key={t.id} className="flex items-center gap-1.5 text-xs text-viewport-foreground">
              <span
                aria-hidden
                className="size-2 rounded-full border border-white/30"
                style={{ background: p === undefined ? 'transparent' : riskCss(p) }}
              />
              <span className="text-viewport-muted">{t.id}</span>
              <span className="num font-medium">{pct(p)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
