import type {
  IntervalsResponse,
  PredictResponse,
  StoryPart,
  StoryStep,
  TargetInfo,
} from '@/api/client'
import { joinList, pct, pctRange } from '@/lib/format'

/** "Well above / below" the decision threshold means at least this far (in probability) beyond it. */
export const WELL_MARGIN = 0.25

export interface StoryContext {
  targets: TargetInfo[]
  response: PredictResponse
  /** Ranges, side and uncertain flag for the same patient (POST /api/intervals). */
  ranges: IntervalsResponse['targets']
  /** The preset's real catheterisation result; only read once the step reveals it. */
  truth: Record<string, boolean> | null
  /** stories.yaml `factor_note`: closes every step that lists factors. */
  factorNote: string
  /** Whole dataset size (train + hold-out), for `{n_patients}`. */
  patients: number
}

const TOKEN = /\{(\w+)(?::(\w+))?\}/g
const FACTOR_TOKEN = /\{factors_(up|down):/

const target = (ctx: StoryContext, id: string): TargetInfo | undefined =>
  ctx.targets.find((t) => t.id === id)

/** `kind:TARGET` or a bare kind. Every outcome sentence in stories.yaml hangs off one of these. */
export function evalCondition(cond: string, ctx: StoryContext): boolean {
  const [kind, id] = cond.split(':')
  const pred = id ? ctx.response.targets[id] : undefined
  const real = id ? ctx.truth?.[id] : undefined
  switch (kind) {
    case 'above_threshold':
      return pred !== undefined && pred.probability >= pred.threshold
    case 'below_threshold':
      return pred !== undefined && pred.probability < pred.threshold
    case 'well_above_threshold':
      return pred !== undefined && pred.probability >= pred.threshold + WELL_MARGIN
    case 'well_below_threshold':
      return pred !== undefined && pred.probability <= pred.threshold - WELL_MARGIN
    case 'has_range':
      return ctx.ranges[id ?? ''] !== undefined
    case 'range_crosses_threshold':
      return ctx.ranges[id ?? '']?.uncertain === true
    case 'range_clear_of_threshold':
      return ctx.ranges[id ?? '']?.uncertain === false
    case 'agrees':
      return pred !== undefined && real !== undefined && Boolean(pred.positive) === real
    case 'disagrees':
      return pred !== undefined && real !== undefined && Boolean(pred.positive) !== real
    case 'all_agree':
    case 'any_disagrees': {
      const pairs = Object.entries(ctx.response.targets).flatMap(([tid, p]) => {
        const r = ctx.truth?.[tid]
        return r === undefined ? [] : [Boolean(p.positive) === r]
      })
      if (pairs.length === 0) return false
      return kind === 'all_agree' ? pairs.every(Boolean) : pairs.some((ok) => !ok)
    }
    default:
      return false
  }
}

export interface HighlightedFactor {
  id: string
  label: string
  display_value: string
}

/**
 * Waterfall steps of the step's highlight target that moved the estimate in the highlight direction,
 * largest first. The aggregated "N other factors" step is never listed.
 */
export function highlightedFactors(
  step: StoryStep,
  ctx: StoryContext,
  limit?: number,
): HighlightedFactor[] {
  const hl = step.highlight
  if (!hl) return []
  const steps = ctx.response.explanations[hl.target]?.waterfall ?? []
  return steps
    .flatMap((s) => {
      const up = s.to_p > s.from_p
      const wanted = hl.direction === 'up' ? up : s.to_p < s.from_p
      return s.feature !== null && wanted
        ? [{ id: s.feature, label: s.label, display_value: s.value_display }]
        : []
    })
    .slice(0, limit ?? hl.top)
}

/** Text for one token, or null when it cannot be filled (a factor list that is empty). */
function fill(name: string, arg: string | undefined, step: StoryStep, ctx: StoryContext) {
  const id = arg ?? ''
  const pred = ctx.response.targets[id]
  switch (name) {
    case 'p':
      return pred ? pct(pred.probability) : null
    case 'range': {
      const r = ctx.ranges[id]?.interval
      return r ? pctRange(r.lo, r.hi) : null
    }
    case 'thr':
      return pred ? pct(pred.threshold) : null
    case 'truth': {
      const real = ctx.truth?.[id]
      if (real === undefined) return null
      return real ? 'narrowing (stenosis) found' : 'no narrowing found'
    }
    case 'n_patients':
      return String(ctx.patients)
    case 'name':
      return target(ctx, id)?.id ?? null
    case 'plain':
      return target(ctx, id)?.plain_label ?? null
    case 'where':
      return target(ctx, id)?.where ?? null
    case 'factors_up':
    case 'factors_down': {
      const labels = highlightedFactors(step, ctx, Number(arg)).map(
        (c) => `${c.label}: ${c.display_value}`,
      )
      return labels.length > 0 ? joinList(labels) : null
    }
    default:
      return null
  }
}

/** One part rendered, or null when its condition fails or a token has nothing to say. */
export function renderPart(part: StoryPart, step: StoryStep, ctx: StoryContext): string | null {
  if (!part.when.every((c) => evalCondition(c, ctx))) return null
  let missing = false
  const text = part.text.replace(TOKEN, (_all, name: string, arg?: string) => {
    const value = fill(name, arg, step, ctx)
    if (value === null) missing = true
    return value ?? ''
  })
  return missing ? null : text
}

/** The step's sentences, in order, for the current prediction. Never empty for a valid story. */
export function renderStep(step: StoryStep, ctx: StoryContext): string[] {
  let listsFactors = false
  const sentences = step.parts.flatMap((p) => {
    const text = renderPart(p, step, ctx)
    if (text !== null && FACTOR_TOKEN.test(p.text)) listsFactors = true
    return text === null ? [] : [text]
  })
  if (listsFactors)
    sentences.push(
      ctx.factorNote.replace(TOKEN, (_all, name: string) => fill(name, undefined, step, ctx) ?? ''),
    )
  return sentences
}
