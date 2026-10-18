import type { components } from '@/api/schema'

export type WaterfallStep = components['schemas']['WaterfallStep']

/** A step's size in whole percentage points (signed). */
export const stepPoints = (s: WaterfallStep): number => Math.round((s.to_p - s.from_p) * 100)

export interface Axis {
  min: number
  max: number
}

const TICK = 0.1

/**
 * The probability axis the waterfall is drawn on: wide enough for every step, the range and the
 * cut-off, rounded out to 10% ticks so the bars are not squeezed into a corner.
 */
export function axisFor(
  steps: WaterfallStep[],
  range: { lo: number; hi: number } | undefined,
  threshold: number | undefined,
): Axis {
  const values = [
    ...steps.flatMap((s) => [s.from_p, s.to_p]),
    ...(range ? [range.lo, range.hi] : []),
    ...(threshold === undefined ? [] : [threshold]),
  ]
  if (values.length === 0) return { min: 0, max: 1 }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const min = Math.max(0, Math.floor(lo / TICK) * TICK - TICK)
  const max = Math.min(1, Math.ceil(hi / TICK) * TICK + TICK)
  return { min, max }
}

/** Position of probability `p` on the axis, as a percentage of the track width. */
export const at = (axis: Axis, p: number): number =>
  ((Math.min(Math.max(p, axis.min), axis.max) - axis.min) / (axis.max - axis.min)) * 100

export const signOf = (points: number): '+' | '−' => (points < 0 ? '−' : '+')

/** The 100 dots as `solid` (whole range), `light` (range), `empty`; ring index is the estimate. */
export function dotStates(
  p: number,
  range: { lo: number; hi: number },
): { states: ('solid' | 'light' | 'empty')[]; ring: number } {
  const lo = Math.round(range.lo * 100)
  const hi = Math.round(range.hi * 100)
  const states = Array.from({ length: 100 }, (_, i): 'solid' | 'light' | 'empty' =>
    i < lo ? 'solid' : i < hi ? 'light' : 'empty',
  )
  return { states, ring: Math.min(99, Math.max(0, Math.round(p * 100) - 1)) }
}
