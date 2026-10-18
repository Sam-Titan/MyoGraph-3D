import type { TargetRange } from '@/api/client'
import { useDisplay } from '@/api/queries'
import { GlossaryText } from '@/components/GlossaryText'
import { pct } from '@/lib/format'

/** The one-line method detail, from the interval the API returned (config/uncertainty.yaml). */
export function rangeMethod(interval: TargetRange['interval']): string {
  return `Range: the middle ${pct(interval.level)} of ${interval.n_models} models, each trained on a different resample of the training patients.`
}

/** Always-visible explanation under the estimates (the range is never shown without it). */
export function RangeNote({ ranges }: { ranges: Record<string, TargetRange> | undefined }) {
  const { data: display } = useDisplay()
  const first = ranges ? Object.values(ranges)[0] : undefined
  return (
    <p className="t-meta px-3" data-testid="range-note">
      {display && <GlossaryText text={display.range_meaning} />}
      {first && <span className="block">{rangeMethod(first.interval)}</span>}
    </p>
  )
}
