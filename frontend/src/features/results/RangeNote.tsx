import type { TargetRange } from '@/api/client'
import { pct } from '@/lib/format'

/** What a range means. The wording is fixed; the model count and level come from the API. */
export const RANGE_MEANING =
  'The range shows how much the estimate depends on which patients the model learned from. It is not a guarantee, and not the range of your true risk.'

/** The one-line method detail, from the interval the API returned (config/uncertainty.yaml). */
export function rangeMethod(interval: TargetRange['interval']): string {
  return `Range: the middle ${pct(interval.level)} of ${interval.n_models} models, each trained on a different resample of the training patients.`
}

/** Always-visible explanation under the estimates (the range is never shown without it). */
export function RangeNote({ ranges }: { ranges: Record<string, TargetRange> | undefined }) {
  const first = ranges ? Object.values(ranges)[0] : undefined
  return (
    <p className="t-meta px-3" data-testid="range-note">
      {RANGE_MEANING}
      {first && <span className="block">{rangeMethod(first.interval)}</span>}
    </p>
  )
}
