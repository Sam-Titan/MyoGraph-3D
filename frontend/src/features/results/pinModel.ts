import type { TargetRange } from '@/api/client'
import { pct } from '@/lib/format'

/** One target's estimate when the visitor pinned it. The range is absent if it hadn't loaded. */
export interface PinnedEstimate {
  p: number
  range: { lo: number; hi: number } | null
}
export type Pin = Readonly<Record<string, PinnedEstimate>>

export interface Delta {
  from: number
  to: number
  /** Percentage points, from the displayed (rounded) values, so "81% → 64% ▼17" adds up. */
  points: number
  /** The new point estimate lies inside the pinned range. */
  withinUncertainty: boolean
}

export const WITHIN_UNCERTAINTY = 'within the model’s uncertainty'

const percent = (p: number): number => Math.round(p * 100)

/** Snapshot of the current point estimates and ranges, for "Pin this result". */
export function makePin(
  probabilities: Readonly<Record<string, number | undefined>>,
  ranges: Readonly<Record<string, Pick<TargetRange, 'interval'> | undefined>> | undefined,
): Pin {
  const pin: Record<string, PinnedEstimate> = {}
  for (const [id, p] of Object.entries(probabilities)) {
    if (p === undefined) continue
    const r = ranges?.[id]?.interval
    pin[id] = { p, range: r ? { lo: r.lo, hi: r.hi } : null }
  }
  return pin
}

/** Deltas use the point estimates; the pinned range only decides the "within uncertainty" note. */
export function pinDeltas(
  pin: Pin | null,
  probabilities: Readonly<Record<string, number | undefined>>,
): Record<string, Delta> {
  const out: Record<string, Delta> = {}
  if (!pin) return out
  for (const [id, was] of Object.entries(pin)) {
    const p = probabilities[id]
    if (p === undefined) continue
    out[id] = {
      from: was.p,
      to: p,
      points: percent(p) - percent(was.p),
      withinUncertainty: was.range !== null && p >= was.range.lo && p <= was.range.hi,
    }
  }
  return out
}

/** `▼17`, `▲5` or `no change`: the number always accompanies the arrow. */
export const deltaMark = (d: Delta): string =>
  d.points === 0 ? 'no change' : `${d.points > 0 ? '▲' : '▼'}${Math.abs(d.points)}`

/** `81% → 64% ▼17`. */
export const deltaText = (d: Delta): string => `${pct(d.from)} → ${pct(d.to)} ${deltaMark(d)}`
